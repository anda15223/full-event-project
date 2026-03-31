import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    .replace(/<img[^>]*width\s*=\s*["']?1["']?[^>]*>/gi, "")
    .replace(/<img[^>]*height\s*=\s*["']?1["']?[^>]*>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aelig;/gi, "æ")
    .replace(/&oslash;/gi, "ø")
    .replace(/&aring;/gi, "å")
    .replace(/https?:\/\/[^\s]*click[^\s]*/gi, "[link]")
    .replace(/https?:\/\/[^\s]*track[^\s]*/gi, "[link]")
    .replace(/https?:\/\/[^\s]*unsubscribe[^\s]*/gi, "[unsubscribe]")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Decode helpers ── */
function decodeQuotedPrintable(input: string): Uint8Array {
  const lines = input.replace(/=\r?\n/g, "").split(/\r?\n/);
  const bytes: number[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "=" && i + 2 < line.length) {
        const hex = line.substring(i + 1, i + 3);
        const val = parseInt(hex, 16);
        if (!isNaN(val)) { bytes.push(val); i += 2; continue; }
      }
      bytes.push(line.charCodeAt(i));
    }
    bytes.push(13, 10); // CRLF
  }
  return new Uint8Array(bytes);
}

function decodeBase64Bytes(input: string): Uint8Array {
  const clean = input.replace(/[\r\n\s]/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeWithCharset(bytes: Uint8Array, charset: string): string {
  const cs = (charset || "utf-8").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const map: Record<string, string> = {
    "utf8": "utf-8", "iso88591": "iso-8859-1", "latin1": "iso-8859-1",
    "windows1252": "windows-1252", "cp1252": "windows-1252",
    "iso885915": "iso-8859-15", "usascii": "utf-8", "ascii": "utf-8",
  };
  const resolved = map[cs.replace(/-/g, "")] || cs || "utf-8";
  try {
    return new TextDecoder(resolved, { fatal: true }).decode(bytes);
  } catch {
    try { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
    catch { return new TextDecoder("iso-8859-1").decode(bytes); }
  }
}

/* ── IMAP helpers (binary-safe) ── */
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

async function readRaw(conn: Deno.Conn, isDone: (d: Uint8Array) => boolean, max = 512000): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []; let total = 0;
  const buf = new Uint8Array(32768);
  for (let i = 0; i < 500; i++) {
    const n = await conn.read(buf);
    if (n === null) break;
    const c = buf.slice(0, n); chunks.push(c); total += n;
    if (isDone(concatU8(chunks, total)) || total > max) break;
  }
  return concatU8(chunks, total);
}

async function imapCmd(conn: Deno.Conn, tag: string, cmd: string, max = 512000): Promise<Uint8Array> {
  await conn.write(new TextEncoder().encode(`${tag} ${cmd}\r\n`));
  return readRaw(conn, d => u8Contains(d, `${tag} OK`) || u8Contains(d, `${tag} NO`) || u8Contains(d, `${tag} BAD`), max);
}

function latin1(data: Uint8Array): string {
  return new TextDecoder("iso-8859-1").decode(data);
}

/* ── Parse BODYSTRUCTURE to find text part numbers ── */
interface MimePart { partNum: string; type: string; subtype: string; charset: string; encoding: string; size: number; }

function parseBodyStructure(bs: string): MimePart[] {
  // Simple heuristic parser for BODYSTRUCTURE to find text/plain and text/html parts
  const parts: MimePart[] = [];
  // Look for text parts in the structure
  const textPartRegex = /\("TEXT"\s+"(PLAIN|HTML)"\s+\((?:[^)]*"CHARSET"\s+"([^"]*)"[^)]*|[^)]*)\)\s+(?:NIL|"[^"]*")\s+(?:NIL|"[^"]*")\s+"(7BIT|8BIT|QUOTED-PRINTABLE|BASE64)"\s+(\d+)/gi;
  let match;
  while ((match = textPartRegex.exec(bs)) !== null) {
    parts.push({
      partNum: "", // Will be determined by position
      type: "text",
      subtype: match[1].toLowerCase(),
      charset: match[2] || "utf-8",
      encoding: match[3].toLowerCase(),
      size: parseInt(match[4], 10),
    });
  }
  return parts;
}

/* ── Parse a fetched MIME part body ── */
function decodeMimePart(raw: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase();
  let bytes: Uint8Array;
  if (enc === "base64") {
    bytes = decodeBase64Bytes(raw);
  } else if (enc === "quoted-printable") {
    bytes = decodeQuotedPrintable(raw);
  } else {
    // 7bit/8bit - use latin1 to preserve bytes, then decode charset
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  }
  return decodeWithCharset(bytes, charset);
}

/* ── Extract literal content from IMAP FETCH response ── */
function extractLiteral(ascii: string): string | null {
  const m = ascii.match(/\{(\d+)\}\r\n/);
  if (!m) return null;
  const size = parseInt(m[1], 10);
  const start = ascii.indexOf(m[0]) + m[0].length;
  return ascii.substring(start, start + size);
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

    // If already parsed, return cached
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
    await readRaw(conn, d => u8Contains(d, "\r\n"), 4096);

    // Login
    const loginRes = await imapCmd(conn, "A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`, 4096);
    if (!u8Contains(loginRes, "A1 OK")) {
      return new Response(JSON.stringify({ error: "IMAP login failed" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await imapCmd(conn, "A2", "SELECT INBOX", 4096);

    // Find UID
    let uid: string | null = null;
    const messageId = email.message_id || "";
    if (messageId.startsWith("imap-uid-")) {
      uid = messageId.replace("imap-uid-", "");
    } else if (messageId.startsWith("<") || messageId.includes("@")) {
      const searchRes = latin1(await imapCmd(conn, "A3", `UID SEARCH HEADER Message-ID "${messageId}"`, 4096));
      const searchLine = searchRes.split("\r\n").find(l => l.startsWith("* SEARCH"));
      const uids = searchLine ? searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean) : [];
      uid = uids[0] || null;
    }

    if (!uid) {
      await imapCmd(conn, "A99", "LOGOUT", 1024);
      conn.close(); conn = null;
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Email not found on server" }).eq("id", parsed.data.email_id);
      return new Response(JSON.stringify({ error: "Could not find email on server" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 1: Fetch BODYSTRUCTURE to understand MIME layout (lightweight)
    const bsRes = latin1(await imapCmd(conn, "B1", `UID FETCH ${uid} (BODYSTRUCTURE)`, 16384));
    console.log("BODYSTRUCTURE length:", bsRes.length);

    // Step 2: Determine which parts to fetch (only text/plain and text/html, NOT attachments)
    // Strategy: Try common part numbers for multipart emails
    // For simple emails: BODY[1] or BODY[TEXT]
    // For multipart/alternative: BODY[1.1] (text/plain), BODY[1.2] (text/html)
    // For multipart/mixed with multipart/alternative: BODY[1.1] and BODY[1.2]

    let bodyText = "";
    let bodyHtml = "";
    let charset = "utf-8";
    let encoding = "7bit";

    // Parse BODYSTRUCTURE to detect structure type
    const bsUpper = bsRes.toUpperCase();
    const isMultipart = bsUpper.includes('"ALTERNATIVE"') || bsUpper.includes('"MIXED"') || bsUpper.includes('"RELATED"');
    const hasAttachments = bsUpper.includes('"ATTACHMENT"') || bsUpper.includes('"MIXED"');

    // Extract charset and encoding from BODYSTRUCTURE
    const charsetMatch = bsRes.match(/"CHARSET"\s+"([^"]+)"/i);
    if (charsetMatch) charset = charsetMatch[1];
    
    if (isMultipart) {
      // Try fetching text parts by common part numbers
      // Fetch parts 1.1 (usually text/plain) and 1.2 (usually text/html) for multipart/alternative inside multipart/mixed
      // Or parts 1 and 2 for simple multipart/alternative

      // Check if it's multipart/mixed containing multipart/alternative
      const hasMixed = bsUpper.includes('"MIXED"');
      const hasAlternative = bsUpper.includes('"ALTERNATIVE"');

      const textPartNum = hasMixed && hasAlternative ? "1.1" : "1";
      const htmlPartNum = hasMixed && hasAlternative ? "1.2" : "2";

      // Fetch text/plain part
      try {
        const textRes = await imapCmd(conn, "T1", `UID FETCH ${uid} (BODY.PEEK[${textPartNum}])`, 256000);
        const textAscii = latin1(textRes);
        const textContent = extractLiteral(textAscii);
        
        if (textContent) {
          // Find encoding for this part from BODYSTRUCTURE
          const encMatch = bsUpper.match(/"TEXT"\s+"PLAIN"[^)]*\)\s+(?:NIL|"[^"]*")\s+(?:NIL|"[^"]*")\s+"(7BIT|8BIT|QUOTED-PRINTABLE|BASE64)"/i);
          const partEnc = encMatch ? encMatch[1].toLowerCase() : "7bit";
          bodyText = decodeMimePart(textContent, partEnc, charset);
        }
      } catch (e) {
        console.log("Could not fetch text part:", e);
      }

      // Fetch text/html part
      try {
        const htmlRes = await imapCmd(conn, "T2", `UID FETCH ${uid} (BODY.PEEK[${htmlPartNum}])`, 256000);
        const htmlAscii = latin1(htmlRes);
        const htmlContent = extractLiteral(htmlAscii);
        
        if (htmlContent) {
          const encMatch = bsUpper.match(/"TEXT"\s+"HTML"[^)]*\)\s+(?:NIL|"[^"]*")\s+(?:NIL|"[^"]*")\s+"(7BIT|8BIT|QUOTED-PRINTABLE|BASE64)"/i);
          const partEnc = encMatch ? encMatch[1].toLowerCase() : "7bit";
          bodyHtml = decodeMimePart(htmlContent, partEnc, charset);
        }
      } catch (e) {
        console.log("Could not fetch HTML part:", e);
      }

      // If neither worked, try BODY[1] as fallback (simple multipart)
      if (!bodyText && !bodyHtml) {
        try {
          const fallbackRes = await imapCmd(conn, "T3", `UID FETCH ${uid} (BODY.PEEK[1])`, 256000);
          const fallbackAscii = latin1(fallbackRes);
          const fallbackContent = extractLiteral(fallbackAscii);
          if (fallbackContent) {
            const encMatch = bsUpper.match(/"(QUOTED-PRINTABLE|BASE64)"/i);
            const partEnc = encMatch ? encMatch[1].toLowerCase() : "7bit";
            const decoded = decodeMimePart(fallbackContent, partEnc, charset);
            if (decoded.includes("<") && decoded.includes(">")) {
              bodyHtml = decoded;
            } else {
              bodyText = decoded;
            }
          }
        } catch (e) {
          console.log("Fallback fetch failed:", e);
        }
      }
    } else {
      // Simple single-part email - fetch BODY[TEXT]
      const textRes = await imapCmd(conn, "T1", `UID FETCH ${uid} (BODY.PEEK[TEXT])`, 256000);
      const textAscii = latin1(textRes);
      const textContent = extractLiteral(textAscii);
      
      if (textContent) {
        const encMatch = bsUpper.match(/"(QUOTED-PRINTABLE|BASE64)"/i);
        const partEnc = encMatch ? encMatch[1].toLowerCase() : "7bit";
        const decoded = decodeMimePart(textContent, partEnc, charset);
        
        // Detect if it's HTML
        if (bsUpper.includes('"HTML"')) {
          bodyHtml = decoded;
        } else {
          bodyText = decoded;
        }
      }
    }

    // Logout
    await imapCmd(conn, "A99", "LOGOUT", 1024);
    conn.close(); conn = null;

    // Generate clean text for AI
    const bodyCleanText = bodyHtml ? htmlToCleanText(bodyHtml) : bodyText;

    // Update email record
    const updateData: Record<string, unknown> = {
      body_text: bodyText || bodyCleanText || null,
      body_html: bodyHtml || null,
      body_clean_text: bodyCleanText || null,
      charset,
      parse_status: (bodyText || bodyHtml) ? "parsed" : "failed",
      parse_error: (bodyText || bodyHtml) ? null : "Could not extract body content",
      has_attachments: hasAttachments,
    };

    await supabase.from("emails").update(updateData).eq("id", parsed.data.email_id);

    return new Response(JSON.stringify({
      body_text: bodyText || bodyCleanText,
      body_html: bodyHtml,
      body_clean_text: bodyCleanText,
      parse_status: updateData.parse_status,
      has_attachments: hasAttachments,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Fetch email body error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } finally {
    if (conn) { try { conn.close(); } catch { /* */ } }
  }
});
