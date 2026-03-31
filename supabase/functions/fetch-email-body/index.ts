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
const MAX_ATTACHMENT_TEXT_BYTES = 6 * 1024 * 1024;
const MAX_SUMMARY_INPUT = 6000;

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
    .replace(/https?:\/\/[^\s]*unsubscribe[^\s]*/gi, "[unsubscribe]")
    .replace(/https?:\/\/[^\s]*track[^\s]*/gi, "[tracking-link]")
    .replace(/https?:\/\/[^\s]*click[^\s]*/gi, "[tracked-link]")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value || "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksBrokenContent(bodyText?: string | null, bodyHtml?: string | null): boolean {
  const sample = (bodyHtml || bodyText || "").trim();
  if (!sample) return true;
  if (/^[A-Za-z0-9+/=\r\n\s]{180,}$/.test(sample) && !/[<>]/.test(sample)) return true;
  const questionMarks = (sample.match(/\?/g) || []).length;
  if (sample.length > 80 && questionMarks > Math.max(12, Math.floor(sample.length * 0.18))) return true;
  if (!bodyHtml && /content-type:|mime-version:|content-transfer-encoding:/i.test(sample)) return true;
  return false;
}

function concatU8(arrays: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of arrays) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function u8Contains(data: Uint8Array, text: string): boolean {
  const needle = new TextEncoder().encode(text);
  outer: for (let i = 0; i <= data.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (data[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

async function readRaw(conn: Deno.Conn, isDone: (data: Uint8Array) => boolean, max = MAX_RFC822_BYTES): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const buf = new Uint8Array(65536);

  for (let i = 0; i < 1200; i++) {
    const n = await conn.read(buf);
    if (n === null) break;
    const chunk = buf.slice(0, n);
    chunks.push(chunk);
    total += n;
    const merged = concatU8(chunks, total);
    if (isDone(merged) || total > max) break;
  }

  return concatU8(chunks, total);
}

async function imapCmd(conn: Deno.Conn, tag: string, cmd: string, max = MAX_RFC822_BYTES): Promise<Uint8Array> {
  await conn.write(new TextEncoder().encode(`${tag} ${cmd}\r\n`));
  return readRaw(
    conn,
    (data) => u8Contains(data, `${tag} OK`) || u8Contains(data, `${tag} NO`) || u8Contains(data, `${tag} BAD`),
    max,
  );
}

function latin1(data: Uint8Array): string {
  return new TextDecoder("iso-8859-1").decode(data);
}

function extractBinaryLiteral(rawBytes: Uint8Array, ascii: string): Uint8Array | null {
  const match = ascii.match(/\{(\d+)\}\r\n/);
  if (!match) return null;
  const size = parseInt(match[1], 10);
  const start = ascii.indexOf(match[0]) + match[0].length;
  return rawBytes.slice(start, start + size);
}

function decodeWithCharset(bytes: Uint8Array, charset?: string | null): string {
  const normalized = (charset || "utf-8").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const map: Record<string, string> = {
    utf8: "utf-8",
    iso88591: "iso-8859-1",
    latin1: "iso-8859-1",
    windows1252: "windows-1252",
    cp1252: "windows-1252",
    usascii: "utf-8",
    ascii: "utf-8",
  };
  const resolved = map[normalized.replace(/-/g, "")] || normalized || "utf-8";

  try {
    return new TextDecoder(resolved, { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return new TextDecoder("iso-8859-1").decode(bytes);
    }
  }
}

function extractCharsetFromRawEmail(rawEmail: Uint8Array): string {
  const preview = latin1(rawEmail.slice(0, Math.min(rawEmail.length, 16384)));
  const match = preview.match(/charset\s*=\s*["']?([^"';\r\n]+)/i);
  return match?.[1] || "utf-8";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function bytesFromUnknown(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  if (typeof input === "string") {
    try {
      const binary = atob(input.replace(/[\r\n\s]/g, ""));
      return Uint8Array.from(Array.from(binary, (char) => char.charCodeAt(0)));
    } catch {
      return new TextEncoder().encode(input);
    }
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

async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const pdfjs = await import("npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    });
    const pdf = await task.promise;
    const pages: string[] = [];

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (pageText) pages.push(pageText);
    }

    return pages.join("\n\n").trim() || null;
  } catch (error) {
    console.error("PDF extraction failed:", error);
    return null;
  }
}

async function extractDocxText(bytes: Uint8Array): Promise<string | null> {
  try {
    const mammoth = await import("npm:mammoth@1.8.0");
    const result = await mammoth.extractRawText({ arrayBuffer: toArrayBuffer(bytes) });
    return normalizeWhitespace(result.value) || null;
  } catch (error) {
    console.error("DOCX extraction failed:", error);
    return null;
  }
}

async function extractSpreadsheetText(bytes: Uint8Array): Promise<string | null> {
  try {
    const XLSX = await import("npm:xlsx@0.18.5");
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheets = workbook.SheetNames.map((sheetName: string) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
      return csv ? `Sheet: ${sheetName}\n${csv}` : "";
    }).filter(Boolean);
    return normalizeWhitespace(sheets.join("\n\n")) || null;
  } catch (error) {
    console.error("Spreadsheet extraction failed:", error);
    return null;
  }
}

async function extractAttachmentText(bytes: Uint8Array, mimeType: string, filename: string): Promise<string | null> {
  if (!bytes.length || bytes.length > MAX_ATTACHMENT_TEXT_BYTES) return null;

  const lowerMime = mimeType.toLowerCase();
  const lowerName = filename.toLowerCase();

  if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) {
    return extractPdfText(bytes);
  }

  if (lowerMime.includes("wordprocessingml") || lowerName.endsWith(".docx")) {
    return extractDocxText(bytes);
  }

  if (
    lowerMime.includes("spreadsheetml") ||
    lowerMime.includes("excel") ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".csv")
  ) {
    return extractSpreadsheetText(bytes);
  }

  if (lowerMime.startsWith("text/") || lowerMime.includes("json") || lowerMime.includes("xml")) {
    const charsetMatch = mimeType.match(/charset=([^;]+)/i);
    return normalizeWhitespace(decodeWithCharset(bytes, charsetMatch?.[1] || "utf-8")) || null;
  }

  return null;
}

async function summarizeAttachment(
  apiKey: string | null,
  filename: string,
  mimeType: string,
  extractedText: string | null,
): Promise<{ extracted_summary: string | null; document_type: string | null }> {
  const fallbackType = detectDocumentType(mimeType, filename);
  if (!apiKey || !extractedText) {
    return { extracted_summary: null, document_type: fallbackType };
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Return only valid JSON with keys document_type and extracted_summary. document_type should be one of: invoice, contract, report, spreadsheet, statement, receipt, letter, image, other. extracted_summary must be concise business English.",
          },
          {
            role: "user",
            content: `Filename: ${filename}\nMIME type: ${mimeType}\n\nAttachment text:\n${extractedText.slice(0, MAX_SUMMARY_INPUT)}`,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`AI ${response.status}`);
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      extracted_summary: typeof parsed.extracted_summary === "string" ? parsed.extracted_summary.trim() : null,
      document_type: typeof parsed.document_type === "string" ? parsed.document_type.trim() : fallbackType,
    };
  } catch (error) {
    console.error("Attachment summarization failed:", error);
    return { extracted_summary: null, document_type: fallbackType };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let conn: Deno.Conn | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email_id, force = false } = parsed.data;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: email, error: emailError } = await supabase
      .from("emails")
      .select("id, message_id, body_text, body_html, body_clean_text, parse_status, has_attachments")
      .eq("id", email_id)
      .single();

    if (emailError || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let existingAttachmentCount = 0;
    if (email.has_attachments) {
      const { count } = await supabase
        .from("email_attachments")
        .select("id", { count: "exact", head: true })
        .eq("email_id", email_id);
      existingAttachmentCount = count || 0;
    }

    const hasUsableCache =
      !force &&
      email.parse_status === "parsed" &&
      !looksBrokenContent(email.body_text, email.body_html) &&
      (!email.has_attachments || existingAttachmentCount > 0);

    if (hasUsableCache) {
      return new Response(
        JSON.stringify({
          body_text: email.body_text,
          body_html: email.body_html,
          body_clean_text: email.body_clean_text,
          parse_status: "parsed",
          has_attachments: email.has_attachments,
          attachment_count: existingAttachmentCount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const messageId = email.message_id;
    if (!messageId) {
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Missing message_id" }).eq("id", email_id);
      return new Response(JSON.stringify({ error: "Email has no message id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const IMAP_EMAIL = Deno.env.get("IMAP_EMAIL");
    const IMAP_PASSWORD = Deno.env.get("IMAP_PASSWORD");
    const IMAP_HOST = Deno.env.get("IMAP_HOST") || "imap.one.com";
    const IMAP_PORT = parseInt(Deno.env.get("IMAP_PORT") || "993", 10);

    if (!IMAP_EMAIL || !IMAP_PASSWORD) {
      return new Response(JSON.stringify({ error: "IMAP credentials not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });
    await readRaw(conn, (data) => u8Contains(data, "\r\n"), 4096);

    const loginRes = await imapCmd(conn, "A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`, 4096);
    if (!u8Contains(loginRes, "A1 OK")) {
      return new Response(JSON.stringify({ error: "IMAP login failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      conn.close();
      conn = null;
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Email not found on server" }).eq("id", email_id);
      return new Response(JSON.stringify({ error: "Could not find email on server" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawFetchBytes = await imapCmd(conn, "R1", `UID FETCH ${uid} (RFC822)`, MAX_RFC822_BYTES);
    await imapCmd(conn, "A99", "LOGOUT", 1024);
    conn.close();
    conn = null;

    const rawAscii = latin1(rawFetchBytes);
    const rawEmail = extractBinaryLiteral(rawFetchBytes, rawAscii);

    if (!rawEmail || rawEmail.length === 0) {
      await supabase.from("emails").update({ parse_status: "failed", parse_error: "Could not extract RFC822 message" }).eq("id", email_id);
      return new Response(JSON.stringify({ error: "Could not extract raw email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const charset = extractCharsetFromRawEmail(rawEmail);
    const { default: PostalMime } = await import("npm:postal-mime");
    const parsedEmail = await PostalMime.parse(rawEmail, {
      attachmentEncoding: "arraybuffer",
      rfc822Attachments: true,
      forceRfc822Attachments: false,
    }) as any;

    let bodyText = normalizeWhitespace(parsedEmail.text || "");
    let bodyHtml = typeof parsedEmail.html === "string" ? parsedEmail.html : parsedEmail.html ? String(parsedEmail.html) : "";
    const attachments = Array.isArray(parsedEmail.attachments) ? parsedEmail.attachments : [];

    await supabase.from("email_attachments").delete().eq("email_id", email_id);

    const cidMap = new Map<string, string>();
    const attachmentRecords: Array<Record<string, unknown>> = [];

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
      let extractedText: string | null = null;
      let extractedSummary: string | null = null;
      let documentType: string | null = detectDocumentType(mimeType, filename);

      const { error: uploadError } = await supabase.storage
        .from("email-attachments")
        .upload(storagePath, fileBytes, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        parseStatus = "failed";
        parseError = uploadError.message;
      } else {
        extractedText = await extractAttachmentText(fileBytes, mimeType, filename);
        const summary = await summarizeAttachment(lovableApiKey, filename, mimeType, extractedText);
        extractedSummary = summary.extracted_summary;
        documentType = summary.document_type || documentType;

        if (cid) cidMap.set(cid, publicUrl);
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
        extracted_text: extractedText,
        extracted_summary: extractedSummary,
        document_type: documentType,
        parse_status: parseStatus,
        parse_error: parseError,
      });
    }

    if (bodyHtml && cidMap.size > 0) {
      bodyHtml = replaceCidSources(bodyHtml, cidMap);
    }

    const bodyCleanText = normalizeWhitespace(bodyHtml ? htmlToCleanText(bodyHtml) : bodyText);
    const parseSucceeded = Boolean(bodyText || bodyHtml || attachmentRecords.length > 0);

    if (attachmentRecords.length > 0) {
      const { error: attachmentInsertError } = await supabase.from("email_attachments").insert(attachmentRecords as any);
      if (attachmentInsertError) {
        console.error("Failed to save attachment records:", attachmentInsertError);
      }
    }

    await supabase.from("emails").update({
      body_text: bodyText || bodyCleanText || null,
      body_html: bodyHtml || null,
      body_clean_text: bodyCleanText || null,
      charset,
      parse_status: parseSucceeded ? "parsed" : "failed",
      parse_error: parseSucceeded ? null : "Could not parse MIME content",
      has_attachments: attachmentRecords.length > 0,
    }).eq("id", email_id);

    return new Response(JSON.stringify({
      body_text: bodyText || bodyCleanText || null,
      body_html: bodyHtml || null,
      body_clean_text: bodyCleanText || null,
      parse_status: parseSucceeded ? "parsed" : "failed",
      has_attachments: attachmentRecords.length > 0,
      attachment_count: attachmentRecords.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Fetch email body error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (conn) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
  }
});