import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({ email_id: z.string().uuid() });

/* ── MIME helpers ── */

function decodeQuotedPrintable(text: string, charset = "utf-8"): string {
  const decoded = text
    .replace(/=\r?\n/g, "") // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  if (charset.toLowerCase() === "utf-8" || charset.toLowerCase() === "us-ascii") return decoded;
  try {
    const bytes = Uint8Array.from(Array.from(decoded, c => c.charCodeAt(0)));
    return new TextDecoder(charset).decode(bytes);
  } catch { return decoded; }
}

function decodeBase64(text: string, charset = "utf-8"): string {
  try {
    const cleaned = text.replace(/\s/g, "");
    const bytes = Uint8Array.from(Array.from(atob(cleaned), c => c.charCodeAt(0)));
    return new TextDecoder(charset).decode(bytes);
  } catch { return text; }
}

function getHeader(headers: string, name: string): string {
  // Unfold continuation lines first
  const unfolded = headers.replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const m = unfolded.match(re);
  return m ? m[1].trim() : "";
}

function getCharset(contentType: string): string {
  const m = contentType.match(/charset="?([^";\s]+)"?/i);
  return m ? m[1] : "utf-8";
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

/** Decode a single MIME part body given its headers */
function decodePart(body: string, partHeaders: string): string {
  const ct = getHeader(partHeaders, "Content-Type");
  const cte = getHeader(partHeaders, "Content-Transfer-Encoding").toLowerCase();
  const charset = getCharset(ct);

  if (cte === "quoted-printable") return decodeQuotedPrintable(body, charset);
  if (cte === "base64") return decodeBase64(body, charset);
  if (charset.toLowerCase() !== "utf-8" && charset.toLowerCase() !== "us-ascii") {
    try {
      const bytes = Uint8Array.from(Array.from(body, c => c.charCodeAt(0)));
      return new TextDecoder(charset).decode(bytes);
    } catch { /* fall through */ }
  }
  return body;
}

/**
 * Recursively extract text from a MIME message.
 * Returns { plain, html } — prefer plain, fallback to stripped html.
 */
function extractTextFromMime(raw: string): { plain: string; html: string } {
  // Split headers and body
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    const altEnd = raw.indexOf("\n\n");
    if (altEnd === -1) return { plain: raw, html: "" };
    const headers = raw.substring(0, altEnd);
    const body = raw.substring(altEnd + 2);
    return extractFromHeaders(headers, body);
  }
  const headers = raw.substring(0, headerEnd);
  const body = raw.substring(headerEnd + 4);
  return extractFromHeaders(headers, body);
}

function extractFromHeaders(headers: string, body: string): { plain: string; html: string } {
  const ct = getHeader(headers, "Content-Type");

  // Check for multipart
  const boundaryMatch = ct.match(/boundary="?([^";\s]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    return extractFromMultipart(body, boundary);
  }

  // Single part
  const decoded = decodePart(body, headers);
  if (/text\/html/i.test(ct)) {
    return { plain: "", html: decoded };
  }
  return { plain: decoded, html: "" };
}

function extractFromMultipart(body: string, boundary: string): { plain: string; html: string } {
  const parts = body.split("--" + boundary);
  let plain = "";
  let html = "";

  for (const part of parts) {
    if (part.startsWith("--") || part.trim() === "") continue;

    const partHeaderEnd = part.indexOf("\r\n\r\n");
    const altEnd = part.indexOf("\n\n");
    let partHeaders: string;
    let partBody: string;

    if (partHeaderEnd !== -1) {
      partHeaders = part.substring(0, partHeaderEnd);
      partBody = part.substring(partHeaderEnd + 4);
    } else if (altEnd !== -1) {
      partHeaders = part.substring(0, altEnd);
      partBody = part.substring(altEnd + 2);
    } else {
      continue;
    }

    // Remove trailing boundary markers
    const trailingBoundary = partBody.lastIndexOf("\r\n--" + boundary);
    if (trailingBoundary !== -1) partBody = partBody.substring(0, trailingBoundary);

    const partCt = getHeader(partHeaders, "Content-Type");

    // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
    const nestedBoundary = partCt.match(/boundary="?([^";\s]+)"?/i);
    if (nestedBoundary) {
      const nested = extractFromMultipart(partBody, nestedBoundary[1]);
      if (nested.plain) plain = nested.plain;
      if (nested.html) html = nested.html;
      continue;
    }

    if (/text\/plain/i.test(partCt) || (!partCt && !plain)) {
      plain = decodePart(partBody, partHeaders);
    } else if (/text\/html/i.test(partCt)) {
      html = decodePart(partBody, partHeaders);
    }
  }

  return { plain, html };
}

/* ── IMAP helpers ── */

async function readResponse(conn: Deno.Conn, decoder: TextDecoder, isComplete: (r: string) => boolean, maxBytes = 512000): Promise<string> {
  const buf = new Uint8Array(65536);
  let response = "";
  let totalBytes = 0;
  for (let i = 0; i < 500; i++) {
    const n = await conn.read(buf);
    if (n === null) break;
    totalBytes += n;
    response += decoder.decode(buf.subarray(0, n));
    if (isComplete(response)) break;
    if (totalBytes > maxBytes) break; // safety limit
  }
  return response;
}

async function sendCommand(conn: Deno.Conn, enc: TextEncoder, dec: TextDecoder, tag: string, command: string, maxBytes = 512000): Promise<string> {
  await conn.write(enc.encode(`${tag} ${command}\r\n`));
  return readResponse(conn, dec, r => r.includes(`${tag} OK`) || r.includes(`${tag} NO`) || r.includes(`${tag} BAD`), maxBytes);
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

    const { data: email, error: dbErr } = await supabase.from("emails").select("message_id, body_text").eq("id", parsed.data.email_id).single();
    if (dbErr || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If body already cached, return it
    if (email.body_text && email.body_text.length > 20) {
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

    await readResponse(conn, dec, r => r.includes("\r\n"), 8192);
    const loginRes = await sendCommand(conn, enc, dec, "A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`, 4096);
    if (!loginRes.includes("A1 OK")) {
      return new Response(JSON.stringify({ error: "IMAP login failed" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await sendCommand(conn, enc, dec, "A2", "SELECT INBOX", 4096);

    // Find UID
    let uid: string | null = null;
    const messageId = email.message_id || "";
    if (messageId.startsWith("imap-uid-")) {
      uid = messageId.replace("imap-uid-", "");
    } else if (messageId.startsWith("<") || messageId.includes("@")) {
      const searchRes = await sendCommand(conn, enc, dec, "A3", `UID SEARCH HEADER Message-ID "${messageId}"`, 4096);
      const searchLine = searchRes.split("\r\n").find(l => l.startsWith("* SEARCH"));
      const uids = searchLine ? searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean) : [];
      uid = uids[0] || null;
    }

    if (!uid) {
      await sendCommand(conn, enc, dec, "A99", "LOGOUT", 1024);
      conn.close(); conn = null;
      return new Response(JSON.stringify({ error: "Could not find email on server", body_text: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch the FULL message (RFC822) — up to 500KB to handle real-world emails
    const fetchRes = await sendCommand(conn, enc, dec, "F1", `UID FETCH ${uid} (BODY.PEEK[])`, 512000);

    await sendCommand(conn, enc, dec, "A99", "LOGOUT", 1024);
    conn.close(); conn = null;

    // Extract the literal from IMAP response
    const literalMatch = fetchRes.match(/\{(\d+)\}\r\n/);
    let bodyText = "";
    if (literalMatch) {
      const size = parseInt(literalMatch[1], 10);
      const start = fetchRes.indexOf(literalMatch[0]) + literalMatch[0].length;
      const rawMessage = fetchRes.substring(start, start + size);

      // Full MIME parse
      const { plain, html } = extractTextFromMime(rawMessage);
      bodyText = plain || (html ? stripHtml(html) : "");
    }

    // Clean up
    bodyText = bodyText
      .replace(/\u0000/g, "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Truncate for DB storage (200KB max)
    if (bodyText.length > 200000) bodyText = bodyText.substring(0, 200000);

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
