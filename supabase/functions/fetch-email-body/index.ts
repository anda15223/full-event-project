import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";
import PostalMime from "npm:postal-mime@2.7.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  email_id: z.string().uuid(),
  force: z.boolean().optional(),
});

const MAX_RFC822_BYTES = 3 * 1024 * 1024;
const PARTIAL_FETCH_BYTES = 512000;

/* ── Charset decoding ──────────────────────────────────────── */

function decodeWithCharset(rawBytes: Uint8Array, charsetHint: string | null): string {
  const charsets = [
    charsetHint,
    "utf-8",
    "iso-8859-1",
    "windows-1252",
    "latin1",
  ].filter(Boolean) as string[];

  for (const charset of charsets) {
    try {
      const normalizedCharset = charset.toLowerCase().replace(/^(x-|cs)/, "");
      const decoded = new TextDecoder(normalizedCharset, { fatal: false }).decode(rawBytes);
      // If less than 2% replacement chars, accept this charset
      const replacementCount = (decoded.match(/\uFFFD/g) || []).length;
      if (decoded.length > 0 && replacementCount / decoded.length < 0.02) {
        return decoded;
      }
    } catch {
      continue;
    }
  }
  // Last resort: latin1 never fails
  return new TextDecoder("latin1").decode(rawBytes);
}

/* ── HTML to clean text ────────────────────────────────────── */

function htmlToCleanText(html: string): string {
  if (!html) return "";
  return html
    // Remove script and style blocks entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    // Remove tracking pixels
    .replace(/<img[^>]*width\s*=\s*["']?1["']?[^>]*>/gi, "")
    .replace(/<img[^>]*height\s*=\s*["']?1["']?[^>]*>/gi, "")
    // Replace block elements with newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(h[1-6])>/gi, "\n\n")
    .replace(/<\/?(table|tbody|thead|tfoot)\b[^>]*>/gi, "\n")
    .replace(/<\/?td\b[^>]*>/gi, " | ")
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, " ")
    // Decode HTML entities (including Danish/Romanian)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&aelig;/gi, "æ")
    .replace(/&oslash;/gi, "ø")
    .replace(/&aring;/gi, "å")
    .replace(/&AElig;/g, "Æ")
    .replace(/&Oslash;/g, "Ø")
    .replace(/&Aring;/g, "Å")
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCharCode(parseInt(code, 10)); } catch { return " "; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCharCode(parseInt(hex, 16)); } catch { return " "; }
    })
    .replace(/&[a-zA-Z]+;/g, " ")
    // Clean tracking links
    .replace(/https?:\/\/[^\s]*unsubscribe[^\s]*/gi, "[unsubscribe]")
    .replace(/https?:\/\/[^\s]*track[^\s]*/gi, "[tracking-link]")
    .replace(/https?:\/\/[^\s]*click[^\s]*/gi, "[tracked-link]")
    // Normalize whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value || "").replace(/\u0000/g, "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/* ── Binary/base64 detection ───────────────────────────────── */

function looksLikeBinary(text: string): boolean {
  if (!text || text.length < 100) return false;
  const trimmed = text.trim();
  // Long base64 blob check
  if (/^[A-Za-z0-9+/=\r\n\s]{200,}$/.test(trimmed)) return true;
  const base64Chars = (trimmed.match(/[A-Za-z0-9+/=]/g) || []).length;
  if (base64Chars / trimmed.length > 0.95 && trimmed.length > 500) return true;
  return false;
}

function isBase64BinaryContent(content: string, mimeType?: string): boolean {
  const binaryTypes = ["application/pdf", "application/octet-stream", "image/", "audio/", "video/"];
  if (mimeType && binaryTypes.some(t => mimeType.toLowerCase().startsWith(t))) return true;
  return looksLikeBinary(content);
}

function looksBrokenContent(bodyText?: string | null, bodyHtml?: string | null): boolean {
  const sample = (bodyHtml || bodyText || "").trim();
  if (!sample) return true;
  if (looksLikeBinary(sample)) return true;
  const questionMarks = (sample.match(/\?/g) || []).length;
  if (sample.length > 80 && questionMarks > Math.max(12, Math.floor(sample.length * 0.18))) return true;
  if (!bodyHtml && /content-type:|mime-version:|content-transfer-encoding:/i.test(sample)) return true;
  return false;
}

/* ── Language detection heuristic ──────────────────────────── */

function detectLanguage(text: string | null | undefined): string {
  if (!text || text.trim().length < 20) return "unknown";

  const cleaned = text.trim().substring(0, 500).toLowerCase();

  // Danish signals
  const danishSignals = [
    "faktura", "betaling", "vedr", "venlig hilsen", "bestilling", "levering",
    "tak for", "med venlig", "kære", "hermed", "fremsendes", "dato",
    "tilbud", "ordre", "forsikring", "aftale", "virksomhed", "selskab",
    "indkøb", "varenr", "moms", "beløb", "antal", "pris",
  ];
  const romanianSignals = [
    "factura", "plata", "termen", "societate", "societatea", "furnizor",
    "client", "suma", "total", "deviz", "comanda", "livrare",
    "chitanta", "bon fiscal", "scadent", "platit",
  ];

  const danishScore = danishSignals.filter(s => cleaned.includes(s)).length;
  const romanianScore = romanianSignals.filter(s => cleaned.includes(s)).length;

  const hasDanishChars = /[æøåÆØÅ]/.test(text.substring(0, 500));
  const hasRomanianChars = /[ăâîșțĂÂÎȘȚ]/.test(text.substring(0, 500));

  if (hasDanishChars || danishScore >= 2) return "da";
  if (hasRomanianChars || romanianScore >= 2) return "ro";

  // English as default for readable latin text with no special signals
  if (cleaned.length >= 20 && /^[\x20-\x7E\r\n]+$/.test(cleaned.substring(0, 200))) {
    return "en";
  }

  return "unknown";
}

/* ── IMAP low-level ─────────────────────────────────────────── */

function concatU8(arrays: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of arrays) { result.set(part, offset); offset += part.length; }
  return result;
}

function appendTail(tail: string, chunk: Uint8Array, decoder: TextDecoder, maxChars = 8192): string {
  const next = tail + decoder.decode(chunk, { stream: true });
  return next.length > maxChars ? next.slice(-maxChars) : next;
}

async function readRaw(conn: Deno.Conn, isDone: (tail: string) => boolean, max = MAX_RFC822_BYTES): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const buf = new Uint8Array(32768);
  const decoder = new TextDecoder("iso-8859-1");
  let tail = "";
  for (let i = 0; i < 800; i++) {
    const n = await conn.read(buf);
    if (n === null) break;
    const chunk = buf.slice(0, n);
    chunks.push(chunk);
    total += n;
    tail = appendTail(tail, chunk, decoder);
    if (isDone(tail) || total > max) break;
  }
  decoder.decode();
  return concatU8(chunks, total);
}

async function imapCmd(conn: Deno.Conn, tag: string, cmd: string, max = MAX_RFC822_BYTES): Promise<Uint8Array> {
  await conn.write(new TextEncoder().encode(`${tag} ${cmd}\r\n`));
  return readRaw(conn, (tail) => tail.includes(`${tag} OK`) || tail.includes(`${tag} NO`) || tail.includes(`${tag} BAD`), max);
}

function latin1(data: Uint8Array): string { return new TextDecoder("iso-8859-1").decode(data); }

function extractBinaryLiteral(rawBytes: Uint8Array, ascii: string): Uint8Array | null {
  const match = ascii.match(/\{(\d+)\}\r\n/);
  if (!match) return null;
  const size = parseInt(match[1], 10);
  const start = ascii.indexOf(match[0]) + match[0].length;
  return rawBytes.slice(start, start + size);
}

function extractAllCharsets(rawEmail: Uint8Array): string[] {
  const preview = latin1(rawEmail.slice(0, Math.min(rawEmail.length, 32768)));
  const charsets: string[] = [];
  const regex = /charset\s*=\s*["']?([^"';\r\n\s]+)/gi;
  let m;
  while ((m = regex.exec(preview)) !== null) {
    const cs = m[1].toLowerCase().replace(/^(x-|cs)/, "");
    if (!charsets.includes(cs)) charsets.push(cs);
  }
  return charsets.length > 0 ? charsets : ["utf-8"];
}

function normalizeContentId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/[<>]/g, "").trim() || null;
}

function safeFilename(filename: string | null | undefined, fallback: string): string {
  return (filename || fallback).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceCidSources(html: string, cidMap: Map<string, string>): string {
  let output = html;
  for (const [cid, url] of cidMap.entries()) {
    const escaped = escapeRegex(cid);
    output = output.replace(new RegExp(`cid:<${escaped}>`, "gi"), url);
    output = output.replace(new RegExp(`cid:${escaped}`, "gi"), url);
  }
  return output;
}

function buildStoragePath(emailId: string, filename: string, index: number, isInline: boolean): string {
  const folder = isInline ? "inline" : "files";
  return `${emailId}/${folder}/${index}-${safeFilename(filename, `attachment-${index}`)}`;
}

function detectDocumentType(mimeType: string, filename: string): string {
  const lowerName = filename.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.includes("pdf")) return "pdf";
  if (lowerMime.includes("wordprocessingml") || lowerName.endsWith(".docx")) return "docx";
  if (lowerMime.includes("spreadsheetml") || lowerMime.includes("excel") || lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || lowerName.endsWith(".csv")) return "spreadsheet";
  if (lowerMime.startsWith("image/")) return "image";
  if (lowerMime.startsWith("text/")) return "text";
  return "file";
}

/* ── Main handler ───────────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let conn: Deno.Conn | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email_id, force = false } = parsed.data;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: email, error: emailError } = await supabase
      .from("emails")
      .select("id, message_id, body_text, body_html, body_clean_text, parse_status, has_attachments")
      .eq("id", email_id)
      .single();

    if (emailError || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let existingAttachmentCount = 0;
    if (email.has_attachments) {
      const { count } = await supabase.from("email_attachments").select("id", { count: "exact", head: true }).eq("email_id", email_id);
      existingAttachmentCount = count || 0;
    }

    const hasUsableCache =
      !force &&
      email.parse_status === "parsed" &&
      !looksBrokenContent(email.body_text, email.body_html) &&
      (!email.has_attachments || existingAttachmentCount > 0);

    if (hasUsableCache) {
      return new Response(JSON.stringify({
        body_text: email.body_text,
        body_html: email.body_html,
        body_clean_text: email.body_clean_text,
        parse_status: "parsed",
        has_attachments: email.has_attachments,
        attachment_count: existingAttachmentCount,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const messageId = email.message_id;
    if (!messageId) {
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Missing message_id" }).eq("id", email_id);
      return new Response(JSON.stringify({ error: "Email has no message id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── IMAP connect & fetch ────────────────────────────────── */
    const IMAP_EMAIL = Deno.env.get("IMAP_EMAIL");
    const IMAP_PASSWORD = Deno.env.get("IMAP_PASSWORD");
    const IMAP_HOST = Deno.env.get("IMAP_HOST") || "imap.one.com";
    const IMAP_PORT = parseInt(Deno.env.get("IMAP_PORT") || "993", 10);

    if (!IMAP_EMAIL || !IMAP_PASSWORD) {
      return new Response(JSON.stringify({ error: "IMAP credentials not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });
    await readRaw(conn, (tail) => tail.includes("\r\n"), 4096);

    const loginRes = await imapCmd(conn, "A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`, 4096);
    if (!latin1(loginRes).includes("A1 OK")) {
      return new Response(JSON.stringify({ error: "IMAP login failed" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await imapCmd(conn, "A2", "SELECT INBOX", 4096);

    let uid: string | null = null;
    if (messageId.startsWith("imap-uid-")) {
      uid = messageId.replace("imap-uid-", "");
    } else if (messageId.startsWith("<") || messageId.includes("@")) {
      const searchRes = latin1(await imapCmd(conn, "A3", `UID SEARCH HEADER Message-ID "${messageId}"`, 8192));
      const searchLine = searchRes.split("\r\n").find((line) => line.startsWith("* SEARCH"));
      const uids = searchLine ? searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean) : [];
      uid = uids[0] || null;
    }

    if (!uid) {
      await imapCmd(conn, "A99", "LOGOUT", 1024);
      conn.close(); conn = null;
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Email not found on server" }).eq("id", email_id);
      return new Response(JSON.stringify({ error: "Could not find email on server" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── Fetch size then content ─────────────────────────────── */
    const structRes = latin1(await imapCmd(conn, "S1", `UID FETCH ${uid} (RFC822.SIZE)`, 4096));
    const sizeMatch = structRes.match(/RFC822\.SIZE\s+(\d+)/i);
    const rfc822Size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
    const isLargeEmail = rfc822Size > MAX_RFC822_BYTES;

    let rawEmail: Uint8Array | null = null;
    let fetchedPartially = false;

    if (isLargeEmail) {
      console.log(`Large email (${rfc822Size} bytes), fetching partial (${PARTIAL_FETCH_BYTES} bytes)`);
      const partialBytes = await imapCmd(conn, "R1", `UID FETCH ${uid} (BODY.PEEK[]<0.${PARTIAL_FETCH_BYTES}>)`, PARTIAL_FETCH_BYTES + 20000);
      rawEmail = extractBinaryLiteral(partialBytes, latin1(partialBytes));
      fetchedPartially = true;
    } else {
      const rawFetchBytes = await imapCmd(conn, "R1", `UID FETCH ${uid} (RFC822)`, MAX_RFC822_BYTES);
      rawEmail = extractBinaryLiteral(rawFetchBytes, latin1(rawFetchBytes));
    }

    await imapCmd(conn, "A99", "LOGOUT", 1024);
    conn.close(); conn = null;

    if (!rawEmail || rawEmail.length === 0) {
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Could not extract RFC822 message" }).eq("id", email_id);
      return new Response(JSON.stringify({ error: "Could not extract raw email" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── Parse MIME with PostalMime ──────────────────────────── */
    const detectedCharsets = extractAllCharsets(rawEmail);
    const primaryCharset = detectedCharsets[0] || "utf-8";
    const parsedEmail = await PostalMime.parse(rawEmail) as any;

    // Extract body text — PostalMime handles MIME tree, QP, base64 decoding
    let bodyText = normalizeWhitespace(parsedEmail.text || "");
    let bodyHtml = typeof parsedEmail.html === "string" ? parsedEmail.html : parsedEmail.html ? String(parsedEmail.html) : "";
    const rawAttachments = Array.isArray(parsedEmail.attachments) ? parsedEmail.attachments : [];

    // Fix 1: If bodyText looks garbled (high replacement chars), re-decode with detected charset
    if (bodyText && bodyText.length > 0) {
      const replacementCount = (bodyText.match(/\uFFFD/g) || []).length;
      if (bodyText.length > 20 && replacementCount / bodyText.length > 0.02) {
        // Try re-decoding the raw bytes with detected charsets
        const rawTextBytes = new TextEncoder().encode(bodyText);
        bodyText = decodeWithCharset(rawTextBytes, primaryCharset);
      }
    }

    // Fix 2: Filter out base64/binary content that leaked into body fields
    if (isBase64BinaryContent(bodyText)) bodyText = "";
    if (isBase64BinaryContent(bodyHtml)) bodyHtml = "";

    // Fix 3: If bodyText is empty but bodyHtml exists, extract clean text from HTML
    // This handles HTML-only emails
    let bodyCleanText = "";
    if (bodyText && bodyText.length > 10 && !looksLikeBinary(bodyText)) {
      bodyCleanText = normalizeWhitespace(bodyText);
    }
    if (!bodyCleanText && bodyHtml && bodyHtml.length > 10) {
      bodyCleanText = htmlToCleanText(bodyHtml);
    }
    if (!bodyCleanText && bodyText) {
      bodyCleanText = normalizeWhitespace(bodyText);
    }

    // Fix 4: If clean text still looks broken, try re-extracting from HTML with charset fix
    if (bodyCleanText && looksBrokenContent(bodyCleanText, null)) {
      if (bodyHtml) {
        const reExtracted = htmlToCleanText(bodyHtml);
        if (reExtracted && reExtracted.length > 10 && !looksBrokenContent(reExtracted, null)) {
          bodyCleanText = reExtracted;
        }
      }
    }

    // Fix 5: Final fallback message
    if (!bodyCleanText || bodyCleanText.length < 5) {
      if (rawAttachments.length > 0) {
        const attNames = rawAttachments.map((a: any) => a.filename).filter(Boolean).join(", ");
        bodyCleanText = `No readable body text — see attachments: ${attNames || "attached files"}`;
      } else {
        bodyCleanText = "No readable body text found.";
      }
    }

    // Fix 6: Detect language locally using heuristic
    const detectedLang = detectLanguage(bodyCleanText);

    /* ── Filter & deduplicate attachments ─────────────────────── */
    const seen = new Set<string>();
    const validAttachments: any[] = [];
    for (const att of rawAttachments) {
      const mimeType = (att.mimeType || "application/octet-stream").toLowerCase();
      const filename = att.filename || "";

      if (mimeType.startsWith("multipart/")) continue;
      if (filename.toLowerCase().includes("boundary")) continue;

      // Never treat attachment-disposition parts as body text
      let fileSize = 0;
      if (att.content) {
        if (att.content instanceof Uint8Array) fileSize = att.content.byteLength;
        else if (att.content instanceof ArrayBuffer) fileSize = att.content.byteLength;
        else if (typeof att.content === "string") fileSize = att.content.length;
      }
      if (att.size) fileSize = att.size;

      if (fileSize === 0 && !fetchedPartially) continue;

      const dedupeKey = `${filename}|${fileSize}`;
      if (seen.has(dedupeKey) && filename) continue;
      seen.add(dedupeKey);

      validAttachments.push(att);
    }

    if (!fetchedPartially || validAttachments.length > 0) {
      await supabase.from("email_attachments").delete().eq("email_id", email_id);
    }

    const cidMap = new Map<string, string>();
    const attachmentRecords: Array<Record<string, unknown>> = [];

    for (let index = 0; index < validAttachments.length; index++) {
      const attachment = validAttachments[index];
      const filename = safeFilename(attachment.filename, `attachment-${index + 1}`);
      const mimeType = attachment.mimeType || "application/octet-stream";
      const isInline = attachment.disposition === "inline" || attachment.related === true;
      const cid = normalizeContentId(attachment.contentId);
      const storagePath = buildStoragePath(email_id, filename, index + 1, isInline);
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/email-attachments/${storagePath}`;
      const documentType = detectDocumentType(mimeType, filename);

      let fileSize = 0;
      if (attachment.content) {
        if (attachment.content instanceof Uint8Array) fileSize = attachment.content.byteLength;
        else if (attachment.content instanceof ArrayBuffer) fileSize = attachment.content.byteLength;
      }
      if (attachment.size) fileSize = attachment.size;

      if (cid) cidMap.set(cid, publicUrl);

      attachmentRecords.push({
        email_id,
        filename,
        mime_type: mimeType,
        size: fileSize,
        content_disposition: attachment.disposition || (isInline ? "inline" : "attachment"),
        is_inline: isInline,
        cid,
        part_number: null,
        storage_path: storagePath,
        extracted_text: null,
        extracted_summary: null,
        document_type: documentType,
        parse_status: fetchedPartially ? "pending_upload" : "pending",
        parse_error: null,
      });
    }

    if (bodyHtml && cidMap.size > 0) {
      bodyHtml = replaceCidSources(bodyHtml, cidMap);
    }

    const parseSucceeded = Boolean(bodyText || bodyHtml || attachmentRecords.length > 0);

    if (attachmentRecords.length > 0) {
      const { error: attachInsErr } = await supabase.from("email_attachments").insert(attachmentRecords as any);
      if (attachInsErr) console.error("Failed to save attachment records:", attachInsErr);
    }

    await supabase.from("emails").update({
      body_text: bodyText || null,
      body_html: bodyHtml || null,
      body_clean_text: bodyCleanText || null,
      charset: primaryCharset,
      language: detectedLang,
      parse_status: parseSucceeded ? "parsed" : "failed",
      parse_error: parseSucceeded ? null : "Could not parse MIME content",
      has_attachments: attachmentRecords.length > 0,
    }).eq("id", email_id);

    // Background: upload small attachment blobs
    if (!fetchedPartially && validAttachments.length > 0) {
      const bgWork = (async () => {
        for (let i = 0; i < validAttachments.length; i++) {
          const att = validAttachments[i];
          const rec = attachmentRecords[i] as any;
          if (!att.content) continue;
          try {
            let bytes: Uint8Array;
            if (att.content instanceof Uint8Array) bytes = att.content;
            else if (att.content instanceof ArrayBuffer) bytes = new Uint8Array(att.content);
            else continue;
            if (bytes.byteLength === 0) continue;
            const { error: upErr } = await supabase.storage
              .from("email-attachments")
              .upload(rec.storage_path, bytes, { contentType: rec.mime_type, upsert: true });
            const status = upErr ? "failed" : "stored";
            await supabase.from("email_attachments")
              .update({ parse_status: status, parse_error: upErr?.message || null })
              .eq("email_id", email_id)
              .eq("filename", rec.filename);
          } catch (e) {
            console.error("BG upload error:", e);
          }
        }
      })();
      try { (globalThis as any).EdgeRuntime?.waitUntil(bgWork); } catch { bgWork.catch(() => {}); }
    }

    return new Response(JSON.stringify({
      body_text: bodyText || null,
      body_html: bodyHtml || null,
      body_clean_text: bodyCleanText || null,
      parse_status: parseSucceeded ? "parsed" : "failed",
      has_attachments: attachmentRecords.length > 0,
      attachment_count: attachmentRecords.length,
      language: detectedLang,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Fetch email body error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (conn) { try { conn.close(); } catch { /* ignore */ } }
  }
});
