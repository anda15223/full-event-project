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

// Cap at 3 MB for full fetch — enough for most emails with small attachments
const MAX_RFC822_BYTES = 3 * 1024 * 1024;
// Partial fetch limit for very large emails — 500KB captures headers + text body
const PARTIAL_FETCH_BYTES = 512000;

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

function looksLikeBinary(text: string): boolean {
  if (!text || text.length < 100) return false;
  if (/^[A-Za-z0-9+/=\r\n\s]{200,}$/.test(text.trim())) return true;
  const base64Chars = (text.match(/[A-Za-z0-9+/=]/g) || []).length;
  if (base64Chars / text.length > 0.95 && text.length > 500) return true;
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

function extractCharsetFromRawEmail(rawEmail: Uint8Array): string {
  const preview = latin1(rawEmail.slice(0, Math.min(rawEmail.length, 16384)));
  const match = preview.match(/charset\s*=\s*["']?([^"';\r\n]+)/i);
  return match?.[1] || "utf-8";
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

    /* ── Step 1: Fetch BODYSTRUCTURE to know size before downloading ── */
    const structRes = latin1(await imapCmd(conn, "S1", `UID FETCH ${uid} (RFC822.SIZE)`, 4096));
    const sizeMatch = structRes.match(/RFC822\.SIZE\s+(\d+)/i);
    const rfc822Size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

    // For very large emails (>2MB), only fetch headers + text parts, skip attachment binary
    const isLargeEmail = rfc822Size > MAX_RFC822_BYTES;

    let rawEmail: Uint8Array | null = null;
    let fetchedPartially = false;

    if (isLargeEmail) {
      // Fetch only the first 200KB which should contain headers + text body
      // Attachments will be fetched on-demand via fetch-email-attachment
      console.log(`Large email (${rfc822Size} bytes), fetching partial (headers+text only)`);
      const partialBytes = await imapCmd(conn, "R1", `UID FETCH ${uid} (BODY.PEEK[]<0.204800>)`, 220000);
      const partialAscii = latin1(partialBytes);
      rawEmail = extractBinaryLiteral(partialBytes, partialAscii);
      fetchedPartially = true;
    } else {
      const rawFetchBytes = await imapCmd(conn, "R1", `UID FETCH ${uid} (RFC822)`, MAX_RFC822_BYTES);
      const rawAscii = latin1(rawFetchBytes);
      rawEmail = extractBinaryLiteral(rawFetchBytes, rawAscii);
    }

    await imapCmd(conn, "A99", "LOGOUT", 1024);
    conn.close(); conn = null;

    if (!rawEmail || rawEmail.length === 0) {
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Could not extract RFC822 message" }).eq("id", email_id);
      return new Response(JSON.stringify({ error: "Could not extract raw email" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── Parse MIME ──────────────────────────────────────────── */
    const charset = extractCharsetFromRawEmail(rawEmail);
    const parsedEmail = await PostalMime.parse(rawEmail) as any;

    // Body extraction
    let bodyText = normalizeWhitespace(parsedEmail.text || "");
    let bodyHtml = typeof parsedEmail.html === "string" ? parsedEmail.html : parsedEmail.html ? String(parsedEmail.html) : "";
    const rawAttachments = Array.isArray(parsedEmail.attachments) ? parsedEmail.attachments : [];

    // Filter out base64/binary content that leaked into body fields
    if (looksLikeBinary(bodyText)) bodyText = "";
    if (looksLikeBinary(bodyHtml)) bodyHtml = "";

    /* ── Filter & deduplicate attachments (metadata only for large emails) ── */
    const seen = new Set<string>();
    const validAttachments: any[] = [];
    for (const att of rawAttachments) {
      const mimeType = (att.mimeType || "application/octet-stream").toLowerCase();
      const filename = att.filename || "";

      // Skip multipart boundaries and invalid parts
      if (mimeType.startsWith("multipart/")) continue;
      if (filename.toLowerCase().includes("boundary")) continue;

      // For large emails, we may not have full attachment content
      // but we still record metadata
      let fileSize = 0;
      if (att.content) {
        if (att.content instanceof Uint8Array) fileSize = att.content.byteLength;
        else if (att.content instanceof ArrayBuffer) fileSize = att.content.byteLength;
        else if (typeof att.content === "string") fileSize = att.content.length;
      }
      if (att.size) fileSize = att.size;

      // Skip truly empty parts (but allow 0-size metadata for large email partial fetches)
      if (fileSize === 0 && !fetchedPartially) continue;

      // Deduplicate by filename+size
      const dedupeKey = `${filename}|${fileSize}`;
      if (seen.has(dedupeKey) && filename) continue;
      seen.add(dedupeKey);

      validAttachments.push(att);
    }

    // Delete old attachment records
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

    // Replace CID references in HTML
    if (bodyHtml && cidMap.size > 0) {
      bodyHtml = replaceCidSources(bodyHtml, cidMap);
    }

    // Generate clean text for AI
    let bodyCleanText = normalizeWhitespace(bodyHtml ? htmlToCleanText(bodyHtml) : bodyText);
    if (!bodyCleanText && attachmentRecords.length > 0) {
      const attachNames = attachmentRecords.map(a => a.filename).join(", ");
      bodyCleanText = `No body content. See attachments: ${attachNames}`;
    }

    const parseSucceeded = Boolean(bodyText || bodyHtml || attachmentRecords.length > 0);

    // Insert attachment records
    if (attachmentRecords.length > 0) {
      const { error: attachInsErr } = await supabase.from("email_attachments").insert(attachmentRecords as any);
      if (attachInsErr) console.error("Failed to save attachment records:", attachInsErr);
    }

    // Update the email row
    await supabase.from("emails").update({
      body_text: bodyText || null,
      body_html: bodyHtml || null,
      body_clean_text: bodyCleanText || null,
      charset,
      parse_status: parseSucceeded ? "parsed" : "failed",
      parse_error: parseSucceeded ? null : "Could not parse MIME content",
      has_attachments: attachmentRecords.length > 0,
    }).eq("id", email_id);

    // ── Background: upload small attachment blobs (skip for large/partial) ──
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
              .upload(rec.storage_path, bytes, {
                contentType: rec.mime_type,
                upsert: true,
              });
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
