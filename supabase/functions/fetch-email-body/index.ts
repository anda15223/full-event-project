import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  email_id: z.string().uuid(),
});

function decodeMimeWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g,
    (_match, _charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === "B") {
          const bytes = Uint8Array.from(Array.from(atob(text), (c: string) => c.charCodeAt(0)));
          return new TextDecoder("utf-8").decode(bytes);
        }
        const qp = text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_m: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
        return new TextDecoder("utf-8").decode(Uint8Array.from(Array.from(qp, (c: string) => c.charCodeAt(0))));
      } catch { return _match; }
    },
  );
}

/* Extract plain-text body from a raw IMAP TEXT response */
function extractPlainText(raw: string): string {
  // Try to find a text/plain part in multipart emails
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = raw.split("--" + boundary);
    for (const part of parts) {
      if (/content-type:\s*text\/plain/i.test(part)) {
        const bodyStart = part.indexOf("\r\n\r\n");
        if (bodyStart === -1) continue;
        let body = part.substring(bodyStart + 4);
        // Remove trailing boundary marker
        const endIdx = body.indexOf("--" + boundary);
        if (endIdx !== -1) body = body.substring(0, endIdx);
        return decodeBody(body, part);
      }
    }
    // Fallback: try text/html and strip tags
    for (const part of parts) {
      if (/content-type:\s*text\/html/i.test(part)) {
        const bodyStart = part.indexOf("\r\n\r\n");
        if (bodyStart === -1) continue;
        let body = part.substring(bodyStart + 4);
        const endIdx = body.indexOf("--" + boundary);
        if (endIdx !== -1) body = body.substring(0, endIdx);
        body = decodeBody(body, part);
        return stripHtml(body);
      }
    }
  }

  // Non-multipart: just take everything after the headers
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd !== -1) {
    const body = raw.substring(headerEnd + 4);
    if (/content-type:\s*text\/html/i.test(raw.substring(0, headerEnd))) {
      return stripHtml(decodeBody(body, raw.substring(0, headerEnd)));
    }
    return decodeBody(body, raw.substring(0, headerEnd));
  }
  return raw;
}

function decodeBody(body: string, headers: string): string {
  const isQP = /content-transfer-encoding:\s*quoted-printable/i.test(headers);
  const isBase64 = /content-transfer-encoding:\s*base64/i.test(headers);
  if (isQP) {
    return body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  if (isBase64) {
    try {
      const cleaned = body.replace(/\s/g, "");
      const bytes = Uint8Array.from(Array.from(atob(cleaned), (c) => c.charCodeAt(0)));
      return new TextDecoder("utf-8").decode(bytes);
    } catch { return body; }
  }
  return body;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* IMAP helpers */
async function readResponse(conn: Deno.Conn, decoder: TextDecoder, isComplete: (r: string) => boolean, maxChunks = 200): Promise<string> {
  const buf = new Uint8Array(32768);
  let response = "";
  for (let i = 0; i < maxChunks; i++) {
    const n = await conn.read(buf);
    if (n === null) break;
    response += decoder.decode(buf.subarray(0, n));
    if (isComplete(response)) break;
  }
  return response;
}

async function sendCommand(conn: Deno.Conn, enc: TextEncoder, dec: TextDecoder, tag: string, command: string): Promise<string> {
  await conn.write(enc.encode(`${tag} ${command}\r\n`));
  return readResponse(conn, dec, (r) => r.includes(`${tag} OK`) || r.includes(`${tag} NO`) || r.includes(`${tag} BAD`), 200);
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

    // Get the email's message_id from DB
    const { data: email, error: dbErr } = await supabase.from("emails").select("message_id, body_text").eq("id", parsed.data.email_id).single();
    if (dbErr || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If body already exists, return it
    if (email.body_text && email.body_text.length > 10) {
      return new Response(JSON.stringify({ body_text: email.body_text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const IMAP_EMAIL = Deno.env.get("IMAP_EMAIL");
    const IMAP_PASSWORD = Deno.env.get("IMAP_PASSWORD");
    const IMAP_HOST = Deno.env.get("IMAP_HOST") || "imap.one.com";
    const IMAP_PORT = parseInt(Deno.env.get("IMAP_PORT") || "993", 10);

    if (!IMAP_EMAIL || !IMAP_PASSWORD) {
      return new Response(JSON.stringify({ error: "IMAP credentials not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    await readResponse(conn, dec, (r) => r.includes("\r\n"), 10);

    const loginRes = await sendCommand(conn, enc, dec, "A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`);
    if (!loginRes.includes("A1 OK")) {
      return new Response(JSON.stringify({ error: "IMAP login failed" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await sendCommand(conn, enc, dec, "A2", "SELECT INBOX");

    // Search for the message by Message-ID header
    let uid: string | null = null;
    const messageId = email.message_id || "";

    if (messageId.startsWith("imap-uid-")) {
      uid = messageId.replace("imap-uid-", "");
    } else if (messageId.startsWith("<") || messageId.includes("@")) {
      const searchRes = await sendCommand(conn, enc, dec, "A3", `UID SEARCH HEADER Message-ID "${messageId}"`);
      const searchLine = searchRes.split("\r\n").find((l) => l.startsWith("* SEARCH"));
      const uids = searchLine ? searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean) : [];
      uid = uids[0] || null;
    }

    if (!uid) {
      await sendCommand(conn, enc, dec, "A99", "LOGOUT");
      return new Response(JSON.stringify({ error: "Could not find email on server", body_text: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch the full body text (limit to 50KB to stay within worker limits)
    const fetchRes = await sendCommand(conn, enc, dec, "F1", `UID FETCH ${uid} (BODY.PEEK[TEXT]<0.51200>)`);

    await sendCommand(conn, enc, dec, "A99", "LOGOUT");
    conn.close();
    conn = null;

    // Extract body from IMAP response
    const literalMatch = fetchRes.match(/\{(\d+)\}\r\n/);
    let bodyText = "";
    if (literalMatch) {
      const size = parseInt(literalMatch[1], 10);
      const start = fetchRes.indexOf(literalMatch[0]) + literalMatch[0].length;
      const rawBody = fetchRes.substring(start, start + size);
      bodyText = extractPlainText(rawBody);
    }

    // Clean up
    bodyText = decodeMimeWords(bodyText)
      .replace(/\u0000/g, "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Save to DB for future use
    if (bodyText) {
      await supabase.from("emails").update({ body_text: bodyText }).eq("id", parsed.data.email_id);
    }

    return new Response(JSON.stringify({ body_text: bodyText || "(empty email body)" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Fetch email body error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } finally {
    if (conn) { try { conn.close(); } catch { /* */ } }
  }
});
