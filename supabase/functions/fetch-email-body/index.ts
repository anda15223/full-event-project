import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import PostalMime from "npm:postal-mime@2.4.1";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({ email_id: z.string().uuid() });

/* ── HTML → clean text for AI ── */
function htmlToCleanText(html: string): string {
  return html
    // Remove tracking pixels / invisible images
    .replace(/<img[^>]*width\s*=\s*["']?1["']?[^>]*>/gi, "")
    .replace(/<img[^>]*height\s*=\s*["']?1["']?[^>]*>/gi, "")
    // Remove style/script blocks
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    // Convert structure to newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/td>/gi, " | ")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aelig;/gi, "æ")
    .replace(/&oslash;/gi, "ø")
    .replace(/&aring;/gi, "å")
    // Remove tracking URLs (common patterns)
    .replace(/https?:\/\/[^\s]*click[^\s]*/gi, "[link]")
    .replace(/https?:\/\/[^\s]*track[^\s]*/gi, "[link]")
    .replace(/https?:\/\/[^\s]*unsubscribe[^\s]*/gi, "[unsubscribe]")
    // Clean up whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── IMAP helpers ── */
async function readResponseRaw(conn: Deno.Conn, isComplete: (r: Uint8Array) => boolean, maxBytes = 1024000): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const buf = new Uint8Array(65536);
  
  for (let i = 0; i < 1000; i++) {
    const n = await conn.read(buf);
    if (n === null) break;
    const chunk = buf.slice(0, n);
    chunks.push(chunk);
    totalBytes += n;
    
    // Check completion using ASCII-safe string conversion
    const combined = concatUint8Arrays(chunks, totalBytes);
    if (isComplete(combined)) break;
    if (totalBytes > maxBytes) break;
  }
  
  return concatUint8Arrays(chunks, totalBytes);
}

function concatUint8Arrays(arrays: Uint8Array[], totalLength: number): Uint8Array {
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function uint8Contains(data: Uint8Array, searchStr: string): boolean {
  const searchBytes = new TextEncoder().encode(searchStr);
  outer: for (let i = 0; i <= data.length - searchBytes.length; i++) {
    for (let j = 0; j < searchBytes.length; j++) {
      if (data[i + j] !== searchBytes[j]) continue outer;
    }
    return true;
  }
  return false;
}

async function sendCommandRaw(conn: Deno.Conn, tag: string, command: string, maxBytes = 1024000): Promise<Uint8Array> {
  const enc = new TextEncoder();
  await conn.write(enc.encode(`${tag} ${command}\r\n`));
  return readResponseRaw(conn, (data) => {
    return uint8Contains(data, `${tag} OK`) || uint8Contains(data, `${tag} NO`) || uint8Contains(data, `${tag} BAD`);
  }, maxBytes);
}

// ASCII-safe string for IMAP protocol parsing (does NOT decode email content)
function bytesToAscii(data: Uint8Array): string {
  return new TextDecoder("iso-8859-1").decode(data);
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

    const { data: email, error: dbErr } = await supabase
      .from("emails")
      .select("message_id, body_text, body_html, parse_status")
      .eq("id", parsed.data.email_id)
      .single();

    if (dbErr || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If already parsed, return cached data
    if (email.parse_status === "parsed" && (email.body_html || (email.body_text && email.body_text.length > 20))) {
      return new Response(JSON.stringify({
        body_text: email.body_text,
        body_html: email.body_html,
        parse_status: "parsed",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const IMAP_EMAIL = Deno.env.get("IMAP_EMAIL");
    const IMAP_PASSWORD = Deno.env.get("IMAP_PASSWORD");
    const IMAP_HOST = Deno.env.get("IMAP_HOST") || "imap.one.com";
    const IMAP_PORT = parseInt(Deno.env.get("IMAP_PORT") || "993", 10);

    if (!IMAP_EMAIL || !IMAP_PASSWORD) {
      return new Response(JSON.stringify({ error: "IMAP credentials not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Connect to IMAP
    conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });
    
    // Read greeting
    await readResponseRaw(conn, (d) => uint8Contains(d, "\r\n"), 8192);

    // Login
    const loginRes = await sendCommandRaw(conn, "A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`, 4096);
    if (!uint8Contains(loginRes, "A1 OK")) {
      return new Response(JSON.stringify({ error: "IMAP login failed" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Select INBOX
    await sendCommandRaw(conn, "A2", "SELECT INBOX", 4096);

    // Find UID
    let uid: string | null = null;
    const messageId = email.message_id || "";
    if (messageId.startsWith("imap-uid-")) {
      uid = messageId.replace("imap-uid-", "");
    } else if (messageId.startsWith("<") || messageId.includes("@")) {
      const searchRes = bytesToAscii(await sendCommandRaw(conn, "A3", `UID SEARCH HEADER Message-ID "${messageId}"`, 4096));
      const searchLine = searchRes.split("\r\n").find(l => l.startsWith("* SEARCH"));
      const uids = searchLine ? searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean) : [];
      uid = uids[0] || null;
    }

    if (!uid) {
      await sendCommandRaw(conn, "A99", "LOGOUT", 1024);
      conn.close(); conn = null;
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Email not found on server" }).eq("id", parsed.data.email_id);
      return new Response(JSON.stringify({ error: "Could not find email on server" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch full RFC822 message as raw bytes
    const fetchResBytes = await sendCommandRaw(conn, "F1", `UID FETCH ${uid} (BODY.PEEK[])`, 1024000);
    
    // Logout
    await sendCommandRaw(conn, "A99", "LOGOUT", 1024);
    conn.close(); conn = null;

    // Extract the literal from IMAP response
    const fetchResAscii = bytesToAscii(fetchResBytes);
    const literalMatch = fetchResAscii.match(/\{(\d+)\}\r\n/);
    
    if (!literalMatch) {
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Could not extract message from IMAP response" }).eq("id", parsed.data.email_id);
      return new Response(JSON.stringify({ error: "Failed to extract message" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const literalSize = parseInt(literalMatch[1], 10);
    // Find the byte position of the literal start
    const headerStr = fetchResAscii.substring(0, fetchResAscii.indexOf(literalMatch[0]) + literalMatch[0].length);
    const headerBytes = new TextEncoder().encode(headerStr).length;
    // The raw email bytes start right after the literal header
    // But since we used iso-8859-1 for ASCII parsing, byte positions match char positions
    const startPos = fetchResAscii.indexOf(literalMatch[0]) + literalMatch[0].length;
    const rawEmailBytes = fetchResBytes.slice(startPos, startPos + literalSize);

    console.log(`Raw email size: ${rawEmailBytes.length} bytes (expected ${literalSize})`);

    // Parse with postal-mime (handles all MIME, charset, encoding automatically)
    const parsedEmail = await PostalMime.parse(rawEmailBytes);

    const bodyText = parsedEmail.text || "";
    const bodyHtml = parsedEmail.html || "";
    const bodyCleanText = bodyHtml ? htmlToCleanText(bodyHtml) : bodyText;
    const detectedCharset = "auto"; // postal-mime handles charset internally

    // Process attachments
    const attachments = parsedEmail.attachments || [];
    const hasAttachments = attachments.length > 0;
    const attachmentRecords: Array<{
      email_id: string;
      filename: string | null;
      mime_type: string | null;
      size: number;
      content_disposition: string | null;
      is_inline: boolean;
      cid: string | null;
      storage_path: string | null;
      parse_status: string;
    }> = [];

    for (const att of attachments) {
      const filename = att.filename || `attachment_${Date.now()}`;
      const mimeType = att.mimeType || "application/octet-stream";
      const isInline = att.disposition === "inline";
      const cid = att.contentId || null;
      const content = att.content; // Uint8Array

      let storagePath: string | null = null;
      
      if (content && content.byteLength > 0) {
        // Upload to storage
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        storagePath = `${parsed.data.email_id}/${safeName}`;
        
        try {
          const { error: uploadError } = await supabase.storage
            .from("email-attachments")
            .upload(storagePath, content, {
              contentType: mimeType,
              upsert: true,
            });
          
          if (uploadError) {
            console.error(`Failed to upload attachment ${filename}:`, uploadError);
            storagePath = null;
          }
        } catch (e) {
          console.error(`Storage upload error for ${filename}:`, e);
          storagePath = null;
        }
      }

      attachmentRecords.push({
        email_id: parsed.data.email_id,
        filename,
        mime_type: mimeType,
        size: content?.byteLength || 0,
        content_disposition: att.disposition || null,
        is_inline: isInline,
        cid,
        storage_path: storagePath,
        parse_status: storagePath ? "stored" : "failed",
      });
    }

    // Save attachments to DB
    if (attachmentRecords.length > 0) {
      const { error: attError } = await supabase.from("email_attachments").insert(attachmentRecords);
      if (attError) console.error("Failed to save attachment records:", attError);
    }

    // Update email record with parsed content
    const updateData: Record<string, unknown> = {
      body_text: bodyText || bodyCleanText || null,
      body_html: bodyHtml || null,
      body_clean_text: bodyCleanText || null,
      charset: detectedCharset,
      parse_status: "parsed",
      parse_error: null,
      has_attachments: hasAttachments,
    };

    await supabase.from("emails").update(updateData).eq("id", parsed.data.email_id);

    return new Response(JSON.stringify({
      body_text: bodyText || bodyCleanText,
      body_html: bodyHtml,
      body_clean_text: bodyCleanText,
      parse_status: "parsed",
      has_attachments: hasAttachments,
      attachment_count: attachmentRecords.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Fetch email body error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } finally {
    if (conn) { try { conn.close(); } catch { /* */ } }
  }
});
