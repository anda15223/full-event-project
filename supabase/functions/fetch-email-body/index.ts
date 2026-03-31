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
  force: z.boolean().optional(),
});

const MAX_RFC822_BYTES = 12 * 1024 * 1024;

/* ── Helpers ────────────────────────────────────────────────── */

function htmlToCleanText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, " ")
    .replace(/<img[^>]*width\s*=\s*["']?1["']?[^>]*>/gi, " ")
    .replace(/<img[^>]*height\s*=\s*["']?1["']?[^>]*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<\/?(table|tbody|thead|tfoot)\b[^>]*>/gi, "\n")
    .replace(/<\/?td\b[^>]*>/gi, " | ")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "$2")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&aelig;/gi, "æ").replace(/&oslash;/gi, "ø").replace(/&aring;/gi, "å")
    .replace(/&AElig;/g, "Æ").replace(/&Oslash;/g, "Ø").replace(/&Aring;/g, "Å")
    .replace(/https?:\/\/[^\s]*unsubscribe[^\s]*/gi, "[unsubscribe]")
    .replace(/https?:\/\/[^\s]*track[^\s]*/gi, "[tracking-link]")
    .replace(/https?:\/\/[^\s]*click[^\s]*/gi, "[tracked-link]")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value || "").replace(/\u0000/g, "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Detect if content looks like base64 / binary data instead of readable text */
function looksLikeBinary(text: string): boolean {
  if (!text || text.length < 100) return false;
  // Long lines of base64 chars
  if (/^[A-Za-z0-9+/=\r\n\s]{200,}$/.test(text.trim())) return true;
  // Count ratio of base64 chars vs readable
  const base64Chars = (text.match(/[A-Za-z0-9+/=]/g) || []).length;
  const ratio = base64Chars / text.length;
  if (ratio > 0.95 && text.length > 500) return true;
  return false;
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
  const buf = new Uint8Array(65536);
  const decoder = new TextDecoder("iso-8859-1");
  let tail = "";
  for (let i = 0; i < 1200; i++) {
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

function extractCharsetFromRawEmail(rawEmail: Uint8Array): string {
  const preview = latin1(rawEmail.slice(0, Math.min(rawEmail.length, 16384)));
  const match = preview.match(/charset\s*=\s*["']?([^"';\r\n]+)/i);
  return match?.[1] || "utf-8";
}

function bytesFromUnknown(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  if (typeof input === "string") {
    try {
      const binary = atob(input.replace(/[\r\n\s]/g, ""));
      return Uint8Array.from(Array.from(binary, (char) => char.charCodeAt(0)));
    } catch { return new TextEncoder().encode(input); }
  }
  return new Uint8Array();
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

    /* ── IMAP connect & fetch RFC822 ─────────────────────────── */
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

    const rawFetchBytes = await imapCmd(conn, "R1", `UID FETCH ${uid} (RFC822)`, MAX_RFC822_BYTES);
    await imapCmd(conn, "A99", "LOGOUT", 1024);
    conn.close(); conn = null;

    const rawAscii = latin1(rawFetchBytes);
    const rawEmail = extractBinaryLiteral(rawFetchBytes, rawAscii);

    if (!rawEmail || rawEmail.length === 0) {
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Could not extract RFC822 message" }).eq("id", email_id);
      return new Response(JSON.stringify({ error: "Could not extract raw email" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── Parse MIME with postal-mime ─────────────────────────── */
    const charset = extractCharsetFromRawEmail(rawEmail);
    const { default: PostalMime } = await import("npm:postal-mime");
    const parsedEmail = await PostalMime.parse(rawEmail, {
      attachmentEncoding: "arraybuffer",
      rfc822Attachments: true,
      forceRfc822Attachments: false,
    }) as any;

    // CRITICAL: Only take text/html and text/plain from parsed output
    // postal-mime correctly separates body from attachments
    let bodyText = normalizeWhitespace(parsedEmail.text || "");
    let bodyHtml = typeof parsedEmail.html === "string" ? parsedEmail.html : parsedEmail.html ? String(parsedEmail.html) : "";
    const attachments = Array.isArray(parsedEmail.attachments) ? parsedEmail.attachments : [];

    // CRITICAL: Filter out base64/binary content that leaked into body fields
    if (looksLikeBinary(bodyText)) {
      console.warn("body_text looks like binary data, clearing it");
      bodyText = "";
    }
    if (looksLikeBinary(bodyHtml)) {
      console.warn("body_html looks like binary data, clearing it");
      bodyHtml = "";
    }

    // Delete old attachment records
    await supabase.from("email_attachments").delete().eq("email_id", email_id);

    const cidMap = new Map<string, string>();
    const attachmentRecords: Array<Record<string, unknown>> = [];

    // Process attachments: upload to storage but NO text extraction (saves CPU)
    for (let index = 0; index < attachments.length; index++) {
      const attachment = attachments[index] as any;
      const fileBytes = bytesFromUnknown(attachment.content);
      const filename = safeFilename(attachment.filename, `attachment-${index + 1}`);
      const mimeType = attachment.mimeType || "application/octet-stream";
      const isInline = attachment.disposition === "inline" || attachment.related === true;
      const cid = normalizeContentId(attachment.contentId);
      const storagePath = buildStoragePath(email_id, filename, index + 1, isInline);
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/email-attachments/${storagePath}`;

      let parseStatus = "stored";
      let parseError: string | null = null;
      const documentType = detectDocumentType(mimeType, filename);

      const { error: uploadError } = await supabase.storage
        .from("email-attachments")
        .upload(storagePath, fileBytes, { contentType: mimeType, upsert: true });

      if (uploadError) {
        parseStatus = "failed";
        parseError = uploadError.message;
      } else if (cid) {
        cidMap.set(cid, publicUrl);
      }

      attachmentRecords.push({
        email_id,
        filename,
        mime_type: mimeType,
        size: fileBytes.byteLength,
        content_disposition: attachment.disposition || (isInline ? "inline" : "attachment"),
        is_inline: isInline,
        cid,
        part_number: null,
        storage_path: uploadError ? null : storagePath,
        extracted_text: null,       // deferred – done on-demand
        extracted_summary: null,    // deferred – done on-demand
        document_type: documentType,
        parse_status: parseStatus,
        parse_error: parseError,
      });
    }

    // Replace CID references in HTML with public URLs
    if (bodyHtml && cidMap.size > 0) {
      bodyHtml = replaceCidSources(bodyHtml, cidMap);
    }

    // Generate clean text for AI
    let bodyCleanText = normalizeWhitespace(bodyHtml ? htmlToCleanText(bodyHtml) : bodyText);

    // For emails with no readable body but with attachments, set a helpful message
    if (!bodyCleanText && attachmentRecords.length > 0) {
      const attachNames = attachmentRecords.map(a => a.filename).join(", ");
      bodyCleanText = `No body content. See attachments: ${attachNames}`;
    }

    const parseSucceeded = Boolean(bodyText || bodyHtml || attachmentRecords.length > 0);

    if (attachmentRecords.length > 0) {
      const { error: attachmentInsertError } = await supabase.from("email_attachments").insert(attachmentRecords as any);
      if (attachmentInsertError) console.error("Failed to save attachment records:", attachmentInsertError);
    }

    await supabase.from("emails").update({
      body_text: bodyText || null,
      body_html: bodyHtml || null,
      body_clean_text: bodyCleanText || null,
      charset,
      parse_status: parseSucceeded ? "parsed" : "failed",
      parse_error: parseSucceeded ? null : "Could not parse MIME content",
      has_attachments: attachmentRecords.length > 0,
    }).eq("id", email_id);

    return new Response(JSON.stringify({
      body_text: bodyText || null,
      body_html: bodyHtml || null,
      body_clean_text: bodyCleanText || null,
      parse_status: parseSucceeded ? "parsed" : "failed",
      has_attachments: attachmentRecords.length > 0,
      attachment_count: attachmentRecords.length,
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
