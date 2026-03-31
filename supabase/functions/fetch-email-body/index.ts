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
    bytes.push(13, 10);
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
  try { return new TextDecoder(resolved, { fatal: true }).decode(bytes); }
  catch { try { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
  catch { return new TextDecoder("iso-8859-1").decode(bytes); } }
}

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

function decodeMimePart(raw: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase();
  let bytes: Uint8Array;
  if (enc === "base64") bytes = decodeBase64Bytes(raw);
  else if (enc === "quoted-printable") bytes = decodeQuotedPrintable(raw);
  else {
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  }
  return decodeWithCharset(bytes, charset);
}

function extractLiteral(ascii: string): string | null {
  const m = ascii.match(/\{(\d+)\}\r\n/);
  if (!m) return null;
  const size = parseInt(m[1], 10);
  const start = ascii.indexOf(m[0]) + m[0].length;
  return ascii.substring(start, start + size);
}

/* Auto-detect encoding from content if BODYSTRUCTURE regex fails */
function detectEncoding(content: string): string {
  const trimmed = content.trim();
  // Base64: lines of alphanumeric+/+= chars, typically 76 chars wide
  if (/^[A-Za-z0-9+/=\r\n\s]+$/.test(trimmed) && trimmed.length > 40) {
    // Check if most lines are ~76 chars (base64 hallmark)
    const lines = trimmed.split(/\r?\n/).filter(l => l.trim().length > 0);
    const longLines = lines.filter(l => l.trim().length >= 60);
    if (longLines.length > lines.length * 0.5) return "base64";
  }
  // Quoted-printable: contains =XX sequences
  if (/=[0-9A-F]{2}/i.test(trimmed) && (trimmed.includes("=\r\n") || trimmed.includes("=\n") || (trimmed.match(/=[0-9A-F]{2}/gi) || []).length > 3)) {
    return "quoted-printable";
  }
  return "7bit";
}

/* Extract encoding for a specific MIME type from BODYSTRUCTURE */
function findPartEncoding(bs: string, mimeType: "PLAIN" | "HTML"): string {
  // BODYSTRUCTURE part format: ("TEXT" "PLAIN" ("CHARSET" "...") NIL NIL "BASE64" size)
  // We need to find the encoding field which comes after: type subtype params id description encoding
  const pattern = new RegExp(
    `"TEXT"\\s+"${mimeType}"\\s+` +     // type subtype
    `(?:\\([^)]*\\)|NIL)\\s+` +          // params
    `(?:"[^"]*"|NIL)\\s+` +             // id
    `(?:"[^"]*"|NIL)\\s+` +             // description
    `"(7BIT|8BIT|QUOTED-PRINTABLE|BASE64)"`, // encoding
    "i"
  );
  const m = bs.match(pattern);
  return m ? m[1].toLowerCase() : "";
}

/* ── Parse BODYSTRUCTURE for attachment metadata ── */
interface AttachmentMeta {
  partNum: string;
  filename: string;
  mimeType: string;
  size: number;
  disposition: string;
  isInline: boolean;
  cid: string | null;
}

function parseAttachmentsFromBS(bs: string): AttachmentMeta[] {
  const attachments: AttachmentMeta[] = [];
  const upper = bs.toUpperCase();
  
  // Find attachment parts by looking for "ATTACHMENT" or non-text parts with filenames
  // Match patterns like ("APPLICATION" "PDF" ... "ATTACHMENT" ("FILENAME" "invoice.pdf"))
  // or ("IMAGE" "JPEG" ... )
  
  // Strategy: find all non-text MIME type declarations and extract info
  // Pattern for basic part: ("TYPE" "SUBTYPE" (params) ID DESC ENCODING SIZE)
  const partRegex = /\("([A-Z]+)"\s+"([A-Z0-9._+-]+)"/gi;
  let match;
  let partIndex = 0;
  
  while ((match = partRegex.exec(bs)) !== null) {
    const type = match[1].toLowerCase();
    const subtype = match[2].toLowerCase();
    
    if (type === "text" || type === "multipart") continue;
    
    partIndex++;
    const afterMatch = bs.substring(match.index);
    
    // Try to extract filename
    let filename = `attachment_${partIndex}`;
    const fnMatch = afterMatch.match(/"(?:FILENAME|NAME)"\s+"([^"]+)"/i);
    if (fnMatch) filename = fnMatch[1];
    
    // Try to extract size
    let size = 0;
    const sizeMatch = afterMatch.match(/"(?:BASE64|QUOTED-PRINTABLE|7BIT|8BIT)"\s+(\d+)/i);
    if (sizeMatch) size = parseInt(sizeMatch[1], 10);
    
    // Check disposition
    const isInline = /\bINLINE\b/i.test(afterMatch.substring(0, 200));
    const disposition = isInline ? "inline" : "attachment";
    
    // Check CID
    let cid: string | null = null;
    const cidMatch = afterMatch.match(/<([^>]+)>/);
    if (cidMatch && isInline) cid = cidMatch[1];
    
    // Determine part number heuristically
    // For multipart/mixed: attachments are usually part 2, 3, etc.
    // We'll assign based on order found
    const partNum = String(partIndex + 1); // text is usually 1, attachments start at 2
    
    attachments.push({
      partNum,
      filename,
      mimeType: `${type}/${subtype}`,
      size,
      disposition,
      isInline,
      cid,
    });
  }
  
  return attachments;
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

    conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });
    await readRaw(conn, d => u8Contains(d, "\r\n"), 4096);

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

    // Fetch BODYSTRUCTURE (lightweight - no content downloaded)
    const bsRes = latin1(await imapCmd(conn, "B1", `UID FETCH ${uid} (BODYSTRUCTURE)`, 16384));
    console.log("BODYSTRUCTURE length:", bsRes.length);

    const bsUpper = bsRes.toUpperCase();
    const isMultipart = bsUpper.includes('"ALTERNATIVE"') || bsUpper.includes('"MIXED"') || bsUpper.includes('"RELATED"');
    const hasAttachments = bsUpper.includes('"ATTACHMENT"') || (bsUpper.includes('"MIXED"') && (bsUpper.includes('"APPLICATION"') || bsUpper.includes('"IMAGE"')));
    
    // Extract charset
    let charset = "utf-8";
    const charsetMatch = bsRes.match(/"CHARSET"\s+"([^"]+)"/i);
    if (charsetMatch) charset = charsetMatch[1];

    // Parse attachment metadata from BODYSTRUCTURE
    const attachmentMetas = hasAttachments ? parseAttachmentsFromBS(bsRes) : [];
    console.log(`Found ${attachmentMetas.length} attachments in BODYSTRUCTURE`);

    // Fetch text parts only (no attachments - they're fetched on demand)
    let bodyText = "";
    let bodyHtml = "";

    if (isMultipart) {
      const hasMixed = bsUpper.includes('"MIXED"');
      const hasAlternative = bsUpper.includes('"ALTERNATIVE"');
      const textPartNum = hasMixed && hasAlternative ? "1.1" : "1";
      const htmlPartNum = hasMixed && hasAlternative ? "1.2" : "2";

      // Fetch text/plain
      try {
        const textRes = await imapCmd(conn, "T1", `UID FETCH ${uid} (BODY.PEEK[${textPartNum}])`, 256000);
        const textContent = extractLiteral(latin1(textRes));
        if (textContent) {
          const encMatch = bsUpper.match(/"TEXT"\s+"PLAIN"[^)]*\)\s+(?:NIL|"[^"]*")\s+(?:NIL|"[^"]*")\s+"(7BIT|8BIT|QUOTED-PRINTABLE|BASE64)"/i);
          bodyText = decodeMimePart(textContent, encMatch?.[1]?.toLowerCase() || "7bit", charset);
        }
      } catch (e) { console.log("Text part fetch error:", e); }

      // Fetch text/html
      try {
        const htmlRes = await imapCmd(conn, "T2", `UID FETCH ${uid} (BODY.PEEK[${htmlPartNum}])`, 256000);
        const htmlContent = extractLiteral(latin1(htmlRes));
        if (htmlContent) {
          const encMatch = bsUpper.match(/"TEXT"\s+"HTML"[^)]*\)\s+(?:NIL|"[^"]*")\s+(?:NIL|"[^"]*")\s+"(7BIT|8BIT|QUOTED-PRINTABLE|BASE64)"/i);
          bodyHtml = decodeMimePart(htmlContent, encMatch?.[1]?.toLowerCase() || "7bit", charset);
        }
      } catch (e) { console.log("HTML part fetch error:", e); }

      // Fallback
      if (!bodyText && !bodyHtml) {
        try {
          const fbRes = await imapCmd(conn, "T3", `UID FETCH ${uid} (BODY.PEEK[1])`, 256000);
          const fbContent = extractLiteral(latin1(fbRes));
          if (fbContent) {
            const encMatch = bsUpper.match(/"(QUOTED-PRINTABLE|BASE64)"/i);
            const decoded = decodeMimePart(fbContent, encMatch?.[1]?.toLowerCase() || "7bit", charset);
            if (decoded.includes("<") && decoded.includes(">")) bodyHtml = decoded;
            else bodyText = decoded;
          }
        } catch (e) { console.log("Fallback fetch error:", e); }
      }
    } else {
      const textRes = await imapCmd(conn, "T1", `UID FETCH ${uid} (BODY.PEEK[TEXT])`, 256000);
      const textContent = extractLiteral(latin1(textRes));
      if (textContent) {
        const encMatch = bsUpper.match(/"(QUOTED-PRINTABLE|BASE64)"/i);
        const decoded = decodeMimePart(textContent, encMatch?.[1]?.toLowerCase() || "7bit", charset);
        if (bsUpper.includes('"HTML"')) bodyHtml = decoded;
        else bodyText = decoded;
      }
    }

    // Logout
    await imapCmd(conn, "A99", "LOGOUT", 1024);
    conn.close(); conn = null;

    const bodyCleanText = bodyHtml ? htmlToCleanText(bodyHtml) : bodyText;

    // Save attachment metadata to DB (content NOT downloaded yet)
    if (attachmentMetas.length > 0) {
      // Delete old attachment records for this email
      await supabase.from("email_attachments").delete().eq("email_id", parsed.data.email_id);
      
      const records = attachmentMetas.map(att => ({
        email_id: parsed.data.email_id,
        filename: att.filename,
        mime_type: att.mimeType,
        size: att.size,
        content_disposition: att.disposition,
        is_inline: att.isInline,
        cid: att.cid,
        part_number: att.partNum,
        storage_path: null, // Not downloaded yet
        parse_status: "pending", // Will be fetched on demand
      }));

      const { error: attErr } = await supabase.from("email_attachments").insert(records);
      if (attErr) console.error("Failed to save attachment metadata:", attErr);
    }

    // Update email record
    await supabase.from("emails").update({
      body_text: bodyText || bodyCleanText || null,
      body_html: bodyHtml || null,
      body_clean_text: bodyCleanText || null,
      charset,
      parse_status: (bodyText || bodyHtml) ? "parsed" : "failed",
      parse_error: (bodyText || bodyHtml) ? null : "Could not extract body content",
      has_attachments: attachmentMetas.length > 0,
    }).eq("id", parsed.data.email_id);

    return new Response(JSON.stringify({
      body_text: bodyText || bodyCleanText,
      body_html: bodyHtml,
      body_clean_text: bodyCleanText,
      parse_status: (bodyText || bodyHtml) ? "parsed" : "failed",
      has_attachments: attachmentMetas.length > 0,
      attachment_count: attachmentMetas.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Fetch email body error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } finally {
    if (conn) { try { conn.close(); } catch { /* */ } }
  }
});
