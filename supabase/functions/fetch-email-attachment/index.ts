import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({ attachment_id: z.string().uuid() });

/* ── IMAP helpers ── */
function concatU8(arrays: Uint8Array[], total: number): Uint8Array {
  const r = new Uint8Array(total); let o = 0;
  for (const a of arrays) { r.set(a, o); o += a.length; }
  return r;
}

function u8Contains(data: Uint8Array, s: string): boolean {
  const sb = new TextEncoder().encode(s);
  outer: for (let i = 0; i <= data.length - sb.length; i++) {
    for (let j = 0; j < sb.length; j++) if (data[i + j] !== sb[j]) continue outer;
    return true;
  }
  return false;
}

async function readRaw(conn: Deno.Conn, isDone: (d: Uint8Array) => boolean, max = 2097152): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []; let total = 0;
  const buf = new Uint8Array(65536);
  for (let i = 0; i < 1000; i++) {
    const n = await conn.read(buf);
    if (n === null) break;
    const c = buf.slice(0, n); chunks.push(c); total += n;
    if (isDone(concatU8(chunks, total)) || total > max) break;
  }
  return concatU8(chunks, total);
}

async function imapCmd(conn: Deno.Conn, tag: string, cmd: string, max = 2097152): Promise<Uint8Array> {
  await conn.write(new TextEncoder().encode(`${tag} ${cmd}\r\n`));
  return readRaw(conn, d => u8Contains(d, `${tag} OK`) || u8Contains(d, `${tag} NO`) || u8Contains(d, `${tag} BAD`), max);
}

function latin1(data: Uint8Array): string {
  return new TextDecoder("iso-8859-1").decode(data);
}

/* Extract binary literal from IMAP FETCH response */
function extractBinaryLiteral(rawBytes: Uint8Array, asciiStr: string): Uint8Array | null {
  const m = asciiStr.match(/\{(\d+)\}\r\n/);
  if (!m) return null;
  const size = parseInt(m[1], 10);
  const startPos = asciiStr.indexOf(m[0]) + m[0].length;
  return rawBytes.slice(startPos, startPos + size);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let conn: Deno.Conn | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get attachment record with email info
    const { data: att, error: attErr } = await supabase
      .from("email_attachments")
      .select("*, emails(message_id)")
      .eq("id", parsed.data.attachment_id)
      .single();

    if (attErr || !att) {
      return new Response(JSON.stringify({ error: "Attachment not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If already stored, return URL
    if (att.storage_path && att.parse_status === "stored") {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/email-attachments/${att.storage_path}`;
      return new Response(JSON.stringify({ 
        storage_path: att.storage_path, 
        url: publicUrl,
        parse_status: "stored",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const partNumber = att.part_number;
    if (!partNumber) {
      return new Response(JSON.stringify({ error: "No MIME part number for this attachment" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const messageId = (att as any).emails?.message_id;
    if (!messageId) {
      return new Response(JSON.stringify({ error: "Cannot find parent email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const IMAP_EMAIL = Deno.env.get("IMAP_EMAIL");
    const IMAP_PASSWORD = Deno.env.get("IMAP_PASSWORD");
    const IMAP_HOST = Deno.env.get("IMAP_HOST") || "imap.one.com";
    const IMAP_PORT = parseInt(Deno.env.get("IMAP_PORT") || "993", 10);

    if (!IMAP_EMAIL || !IMAP_PASSWORD) {
      return new Response(JSON.stringify({ error: "IMAP not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Connect to IMAP
    conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });
    await readRaw(conn, d => u8Contains(d, "\r\n"), 4096);

    const loginRes = await imapCmd(conn, "A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`, 4096);
    if (!u8Contains(loginRes, "A1 OK")) {
      return new Response(JSON.stringify({ error: "IMAP login failed" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await imapCmd(conn, "A2", "SELECT INBOX", 4096);

    // Find UID
    let uid: string | null = null;
    if (messageId.startsWith("imap-uid-")) {
      uid = messageId.replace("imap-uid-", "");
    } else {
      const searchRes = latin1(await imapCmd(conn, "A3", `UID SEARCH HEADER Message-ID "${messageId}"`, 4096));
      const searchLine = searchRes.split("\r\n").find(l => l.startsWith("* SEARCH"));
      const uids = searchLine ? searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean) : [];
      uid = uids[0] || null;
    }

    if (!uid) {
      await imapCmd(conn, "A99", "LOGOUT", 1024);
      conn.close(); conn = null;
      await supabase.from("email_attachments").update({ parse_status: "failed", parse_error: "Email not found on server" }).eq("id", parsed.data.attachment_id);
      return new Response(JSON.stringify({ error: "Email not found on server" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch the specific MIME part (attachment content only)
    console.log(`Fetching MIME part ${partNumber} for UID ${uid}`);
    const fetchResBytes = await imapCmd(conn, "F1", `UID FETCH ${uid} (BODY.PEEK[${partNumber}])`, 5242880); // 5MB max

    // Logout immediately
    await imapCmd(conn, "A99", "LOGOUT", 1024);
    conn.close(); conn = null;

    const fetchAscii = latin1(fetchResBytes);
    const rawContent = extractBinaryLiteral(fetchResBytes, fetchAscii);

    if (!rawContent || rawContent.length === 0) {
      await supabase.from("email_attachments").update({ parse_status: "failed", parse_error: "Could not extract attachment content" }).eq("id", parsed.data.attachment_id);
      return new Response(JSON.stringify({ error: "Could not extract attachment content" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // The content is typically base64-encoded in the MIME part
    // Decode base64 to get the actual file bytes
    let fileBytes: Uint8Array;
    try {
      const base64Str = new TextDecoder("ascii").decode(rawContent).replace(/[\r\n\s]/g, "");
      const binary = atob(base64Str);
      fileBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) fileBytes[i] = binary.charCodeAt(i);
    } catch {
      // If not base64, use raw content
      fileBytes = rawContent;
    }

    console.log(`Attachment decoded: ${fileBytes.length} bytes`);

    // Upload to storage
    const safeName = (att.filename || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${att.email_id}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("email-attachments")
      .upload(storagePath, fileBytes, {
        contentType: att.mime_type || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      await supabase.from("email_attachments").update({ parse_status: "failed", parse_error: uploadError.message }).eq("id", parsed.data.attachment_id);
      return new Response(JSON.stringify({ error: "Failed to upload attachment" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Update attachment record
    await supabase.from("email_attachments").update({
      storage_path: storagePath,
      size: fileBytes.length,
      parse_status: "stored",
      parse_error: null,
    }).eq("id", parsed.data.attachment_id);

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/email-attachments/${storagePath}`;

    return new Response(JSON.stringify({
      storage_path: storagePath,
      url: publicUrl,
      size: fileBytes.length,
      parse_status: "stored",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Fetch attachment error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } finally {
    if (conn) { try { conn.close(); } catch { /* */ } }
  }
});
