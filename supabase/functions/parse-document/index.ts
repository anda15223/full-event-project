// Parse arbitrary festival documents (PDF, Excel, Word, image, email) into structured JSON via Claude.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import * as XLSX from "npm:xlsx@0.18.5";
import mammoth from "npm:mammoth@1.8.0";
import PostalMime from "npm:postal-mime@2.2.7";
import { getSystemPrompt } from "./prompts.ts";

const ALLOWED_TYPES = new Set([
  "contract", "electricity", "cooling", "facade",
  "prices", "accommodation", "setup", "staff_roster", "festival_order", "generic",
]);


const MODEL = "claude-sonnet-4-20250514";
const MAX_TEXT_CHARS = 100_000;

type Format = "pdf" | "excel" | "image" | "email" | "docx" | "text" | "unknown";

function detectFormat(url: string, contentType: string): Format {
  const u = url.toLowerCase();
  const ct = contentType.toLowerCase();
  if (u.endsWith(".pdf") || ct.includes("pdf")) return "pdf";
  if (u.endsWith(".xlsx") || u.endsWith(".xls") || u.endsWith(".csv") ||
      ct.includes("spreadsheet") || ct.includes("excel") || ct.includes("csv")) return "excel";
  if (u.endsWith(".docx") || ct.includes("wordprocessingml")) return "docx";
  if (u.endsWith(".eml") || ct.includes("message/rfc822") || ct.includes("eml")) return "email";
  if (/\.(jpg|jpeg|png|webp|heic|gif)$/.test(u) || ct.startsWith("image/")) return "image";
  if (ct.startsWith("text/")) return "text";
  return "unknown";
}

function imageMediaType(url: string, contentType: string): string {
  if (contentType && contentType.startsWith("image/")) return contentType;
  const u = url.toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function extractPdf(buf: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

function extractExcel(buf: ArrayBuffer): string {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const tsv = rows
      .map((row, idx) => `R${idx + 1}\t${row.map((cell) => String(cell ?? "").trim()).join("\t")}`)
      .join("\n");
    parts.push(`=== Sheet: ${name} ===\n${tsv}`);
  }
  return parts.join("\n\n");
}

type FestivalOrderItem = {
  category?: string | null;
  item_name?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unit_price?: number | string | null;
  total_price?: number | string | null;
  currency?: string | null;
  notes?: string | null;
};

function parseLocaleNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  let s = value
    .replace(/\b(DKK|EUR|USD|SEK|NOK)\b/gi, "")
    .replace(/[€$£]|kr\.?/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) {
    const [, after = ""] = s.split(",");
    s = after.length === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    const [, after = ""] = s.split(".");
    if (after.length === 3) s = s.replace(/\./g, "");
  }
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function splitTableLine(line: string): string[] {
  const clean = line.replace(/^R\d+\t/, "");
  if (clean.includes("\t")) return clean.split("\t").map((x) => x.trim());
  if (clean.includes(";")) return clean.split(";").map((x) => x.trim());
  if ((clean.match(/,/g) ?? []).length >= 2) return clean.split(",").map((x) => x.trim());
  return clean.split(/\s{2,}/).map((x) => x.trim()).filter(Boolean);
}

function findHeaderIndexes(cells: string[]) {
  const keys = cells.map(normalizeKey);
  const find = (aliases: string[]) => keys.findIndex((k) => aliases.some((a) => k === a || k.includes(a)));
  return {
    item: find(["item", "product", "produkt", "vare", "ydelse", "description", "beskrivelse", "equipment", "navn", "type"]),
    qty: find(["antal", "stk", "qty", "quantity", "mangde", "number", "no", "terminal", "terminaler", "stik", "udtag"]),
    unit: find(["unit", "enhed"]),
    unitPrice: find(["unit price", "enhedspris", "stk pris", "pris stk", "a pris", "apris", "each"]),
    totalPrice: find(["total", "belob", "sum", "i alt", "amount", "line total"]),
    genericPrice: find(["pris", "price", "cost", "omkostning"]),
    currency: find(["currency", "valuta"]),
    notes: find(["note", "notes", "bemark", "comment", "kommentar"]),
  };
}

function currencyFromText(text: string): string | null {
  if (/\bDKK\b|\bkr\.?\b/i.test(text)) return "DKK";
  if (/€|\bEUR\b/i.test(text)) return "EUR";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  return null;
}

function extractFestivalOrderCandidates(text: string): FestivalOrderItem[] {
  const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const candidates: FestivalOrderItem[] = [];
  let header: ReturnType<typeof findHeaderIndexes> | null = null;
  let width = 0;

  for (const line of lines) {
    const cells = splitTableLine(line);
    if (cells.length < 2) continue;
    const keyLine = normalizeKey(cells.join(" "));
    const looksLikeHeader = /(antal|qty|quantity|stk|pris|price|total|belob|item|produkt|vare|description|beskrivelse|terminal)/.test(keyLine)
      && /(item|produkt|vare|description|beskrivelse|terminal|stik|udtag)/.test(keyLine);
    if (looksLikeHeader) {
      header = findHeaderIndexes(cells);
      width = cells.length;
      continue;
    }
    if (!header || cells.length < Math.max(2, Math.min(width, 3))) continue;

    const itemCell = header.item >= 0 ? cells[header.item] : cells.find((c) => /[A-Za-zÆØÅæøå]/.test(c));
    if (!itemCell || itemCell.length < 2) continue;
    const qty = header.qty >= 0 ? parseLocaleNumber(cells[header.qty]) : null;
    let unitPrice = header.unitPrice >= 0 ? parseLocaleNumber(cells[header.unitPrice]) : null;
    let totalPrice = header.totalPrice >= 0 ? parseLocaleNumber(cells[header.totalPrice]) : null;
    const genericPrice = header.genericPrice >= 0 ? parseLocaleNumber(cells[header.genericPrice]) : null;
    if (genericPrice != null && unitPrice == null && totalPrice == null) {
      if (qty != null && qty > 1) totalPrice = genericPrice;
      else { unitPrice = genericPrice; totalPrice = genericPrice; }
    }
    candidates.push({
      item_name: itemCell,
      quantity: qty,
      unit: header.unit >= 0 ? cells[header.unit] || null : null,
      unit_price: unitPrice,
      total_price: totalPrice,
      currency: (header.currency >= 0 ? cells[header.currency] : null) || currencyFromText(line),
      notes: header.notes >= 0 ? cells[header.notes] || null : null,
    });
  }
  return candidates;
}

function itemsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const aa = normalizeKey(a ?? "");
  const bb = normalizeKey(b ?? "");
  if (!aa || !bb) return false;
  if (aa.includes(bb) || bb.includes(aa)) return true;
  const aTokens = new Set(aa.split(" ").filter((t) => t.length > 2));
  const bTokens = bb.split(" ").filter((t) => t.length > 2);
  if (!aTokens.size || !bTokens.length) return false;
  const overlap = bTokens.filter((t) => aTokens.has(t)).length;
  return overlap / Math.min(aTokens.size, bTokens.length) >= 0.5;
}

function normalizeFestivalOrderParsed(parsed: unknown, sourceText: string): unknown {
  if (!parsed || typeof parsed !== "object" || !("items" in parsed) || !Array.isArray((parsed as { items?: unknown[] }).items)) return parsed;
  const result = parsed as { items: FestivalOrderItem[] };
  const candidates = extractFestivalOrderCandidates(sourceText);
  const used = new Set<number>();
  result.items = result.items.map((item) => {
    const matchIndex = candidates.findIndex((candidate, idx) => !used.has(idx) && itemsMatch(item.item_name, candidate.item_name));
    const candidate = matchIndex >= 0 ? candidates[matchIndex] : null;
    if (matchIndex >= 0) used.add(matchIndex);
    const quantity = parseLocaleNumber(item.quantity) ?? (candidate ? parseLocaleNumber(candidate.quantity) : null) ?? 1;
    const unitPrice = parseLocaleNumber(item.unit_price) ?? (candidate ? parseLocaleNumber(candidate.unit_price) : null);
    const totalPrice = parseLocaleNumber(item.total_price) ?? (candidate ? parseLocaleNumber(candidate.total_price) : null);
    return {
      ...item,
      quantity,
      unit: item.unit ?? candidate?.unit ?? null,
      unit_price: unitPrice ?? (totalPrice != null && quantity > 0 ? Number((totalPrice / quantity).toFixed(2)) : null),
      total_price: totalPrice ?? (unitPrice != null ? Number((unitPrice * quantity).toFixed(2)) : null),
      currency: item.currency ?? candidate?.currency ?? currencyFromText(sourceText) ?? "DKK",
      notes: item.notes ?? candidate?.notes ?? null,
    };
  });
  return result;
}

async function extractDocx(buf: ArrayBuffer): Promise<string> {
  const result = await (mammoth as any).convertToMarkdown({ arrayBuffer: buf });
  return result.value || "";
}

async function extractEml(buf: ArrayBuffer): Promise<string> {
  const parser = new PostalMime();
  const email = await parser.parse(new Uint8Array(buf));
  const parts = [
    `Subject: ${email.subject ?? ""}`,
    `From: ${email.from?.address ?? ""}`,
    `To: ${(email.to ?? []).map((t) => t.address).join(", ")}`,
    `Date: ${email.date ?? ""}`,
    "",
    email.text || email.html || "",
  ];
  for (const att of email.attachments ?? []) {
    if (att.mimeType?.includes("pdf")) {
      try {
        const text = await extractPdf(att.content as ArrayBuffer);
        parts.push(`\n=== Attached PDF: ${att.filename} ===\n${text}`);
      } catch (_e) { /* skip */ }
    } else if (att.mimeType?.startsWith("text/")) {
      parts.push(`\n=== Attached text: ${att.filename} ===\n${new TextDecoder().decode(att.content as ArrayBuffer)}`);
    }
  }
  return parts.join("\n");
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(bin);
}

async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userContent: unknown[],
  maxTokens = 4000,
): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number }; stopReason: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "pdfs-2024-09-25",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 500)}`);
  }
  const json = await res.json();
  const text = (json.content ?? [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("\n");
  return { text, usage: json.usage ?? { input_tokens: 0, output_tokens: 0 }, stopReason: json.stop_reason ?? "" };
}

function tryParseJson(s: string): unknown | null {
  let t = (s ?? "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  // Find outermost JSON (object or array)
  const objStart = t.indexOf("{");
  const arrStart = t.indexOf("[");
  let start = -1;
  let isArr = false;
  if (objStart === -1 && arrStart === -1) return null;
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) { start = arrStart; isArr = true; }
  else { start = objStart; }
  const end = isArr ? t.lastIndexOf("]") : t.lastIndexOf("}");
  if (end > start) t = t.slice(start, end + 1);
  else t = t.slice(start);
  try { return JSON.parse(t); } catch { /* fall through */ }
  // Attempt to repair truncated JSON by closing brackets
  const repaired = repairTruncatedJson(t);
  if (repaired) {
    try { return JSON.parse(repaired); } catch { /* ignore */ }
  }
  return null;
}

function repairTruncatedJson(s: string): string | null {
  let t = s.replace(/,\s*$/, "");
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }
  if (inStr) t += '"';
  // Trim trailing partial token after last complete value
  t = t.replace(/,\s*("[^"]*"\s*:\s*)?$/, "");
  while (stack.length) {
    const open = stack.pop();
    t += open === "{" ? "}" : "]";
  }
  return t;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const start = Date.now();
  let rawTextExcerpt: string | null = null;

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? Deno.env.get("AIAGENTS");
    if (!apiKey) {
      return jsonResponse({
        ok: false,
        error: "MISSING_ANTHROPIC_KEY",
        message: "Set ANTHROPIC_API_KEY in Supabase Edge Function secrets.",
        rawTextExcerpt: null,
      }, 500);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.fileUrl !== "string" || typeof body.documentType !== "string") {
      return jsonResponse({
        ok: false, error: "INVALID_INPUT",
        message: "Required: fileUrl (string), documentType (string).", rawTextExcerpt: null,
      }, 400);
    }
    const { fileUrl, documentType, context } = body as {
      fileUrl: string;
      documentType: string;
      context?: { festival_name?: string; festival_start?: string; festival_end?: string };
    };
    if (!ALLOWED_TYPES.has(documentType)) {
      return jsonResponse({
        ok: false, error: "INVALID_DOCUMENT_TYPE",
        message: `documentType must be one of: ${[...ALLOWED_TYPES].join(", ")}`,
        rawTextExcerpt: null,
      }, 400);
    }

    // Fetch file
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return jsonResponse({
        ok: false, error: "FETCH_FAILED",
        message: `Could not fetch fileUrl (${fileRes.status})`, rawTextExcerpt: null,
      }, 502);
    }
    const contentType = fileRes.headers.get("content-type") ?? "";
    const buf = await fileRes.arrayBuffer();
    const format = detectFormat(fileUrl, contentType);

    let systemPrompt = getSystemPrompt(documentType);
    if (context && (context.festival_start || context.festival_end || context.festival_name)) {
      const ctxLines = [
        "",
        "**FESTIVAL CONTEXT (use this to resolve ambiguous dates):**",
        context.festival_name ? `- Festival: ${context.festival_name}` : "",
        context.festival_start ? `- Festival starts: ${context.festival_start}` : "",
        context.festival_end ? `- Festival ends: ${context.festival_end}` : "",
        "If the document shows dates without a year (e.g. 'Sat 18 May'), assume the year that places the dates ON or NEAR the festival window above. NEVER default to a past year.",
      ].filter(Boolean).join("\n");
      systemPrompt = systemPrompt + "\n" + ctxLines;
    }
    let userContent: unknown[];
    let extractedText = "";

    let visionFallbackUsed = false;

    if (format === "image") {
      const base64 = arrayBufferToBase64(buf);
      userContent = [
        {
          type: "image",
          source: { type: "base64", media_type: imageMediaType(fileUrl, contentType), data: base64 },
        },
        { type: "text", text: "Extract structured data per system prompt." },
      ];
    } else {
      try {
        if (format === "pdf") extractedText = await extractPdf(buf);
        else if (format === "excel") extractedText = extractExcel(buf);
        else if (format === "docx") extractedText = await extractDocx(buf);
        else if (format === "email") extractedText = await extractEml(buf);
        else if (format === "text") extractedText = new TextDecoder().decode(buf);
        else {
          return jsonResponse({
            ok: false, error: "UNSUPPORTED_FORMAT",
            message: `Could not detect a supported format from ${fileUrl}`, rawTextExcerpt: null,
          }, 415);
        }
      } catch (e) {
        const code = format === "pdf" ? "PDF_PARSE_FAILED"
          : format === "excel" ? "EXCEL_PARSE_FAILED"
          : format === "docx" ? "DOCX_PARSE_FAILED"
          : format === "email" ? "EML_PARSE_FAILED"
          : "EXTRACT_FAILED";
        return jsonResponse({
          ok: false, error: code,
          message: e instanceof Error ? e.message : "Failed to extract text",
          rawTextExcerpt: null,
        }, 422);
      }

      const textIsUsable = !!extractedText &&
        extractedText.replace(/\s/g, "").length > 20;

      if (!textIsUsable) {
        if (format === "pdf") {
          // Vision fallback: send raw PDF to Claude as a document content block
          // (Anthropic natively supports PDF document inputs — internally rendered as images + text).
          const base64 = arrayBufferToBase64(buf);
          userContent = [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            {
              type: "text",
              text: "This PDF has no extractable text layer. Read the page images and extract structured data per the system prompt.",
            },
          ];
          rawTextExcerpt = "[image-only PDF — vision fallback]";
          visionFallbackUsed = true;
        } else {
          return jsonResponse({
            ok: false,
            error: "EMPTY_DOCUMENT",
            message: "The uploaded file appears to contain no extractable text or images. If this is a PDF, try a different file or ensure it isn't password-protected.",
            format,
            rawTextExcerpt: null,
          }, 200);
        }
      } else {
        if (extractedText.length > MAX_TEXT_CHARS) {
          extractedText = extractedText.slice(0, MAX_TEXT_CHARS) +
            `\n\n[TRUNCATED: original was ${extractedText.length} chars; cut to ${MAX_TEXT_CHARS}]`;
        }
        rawTextExcerpt = extractedText.slice(0, 500);
        userContent = [{ type: "text", text: extractedText }];
      }
    }

    // First Claude call — bigger budget for staff_roster (large tabular extraction)
    const maxTokens = (documentType === "staff_roster" || documentType === "festival_order") ? 16000 : 4000;
    let { text: claudeText, usage, stopReason } = await callClaude(apiKey, systemPrompt, userContent, maxTokens);
    let parsed = tryParseJson(claudeText);

    // Retry once with stricter nudge
    if (!parsed) {
      const nudge = systemPrompt + "\n\nIMPORTANT: Return ONLY valid JSON, no markdown fences, no prose. Keep the response compact and complete — do not truncate.";
      const retry = await callClaude(apiKey, nudge, userContent, maxTokens);
      claudeText = retry.text;
      stopReason = retry.stopReason;
      usage = {
        input_tokens: usage.input_tokens + retry.usage.input_tokens,
        output_tokens: usage.output_tokens + retry.usage.output_tokens,
      };
      parsed = tryParseJson(claudeText);
    }

    if (!parsed) {
      return jsonResponse({
        ok: false, error: "JSON_PARSE_FAILED",
        message: stopReason === "max_tokens"
          ? "Claude response was truncated (hit max_tokens). Try a smaller document or increase max_tokens."
          : "Claude did not return valid JSON after retry.",
        stopReason,
        claudeOutputExcerpt: (claudeText ?? "").slice(0, 800),
        rawTextExcerpt: rawTextExcerpt ?? "",
      }, 502);
    }

    if (documentType === "festival_order" && extractedText) {
      parsed = normalizeFestivalOrderParsed(parsed, extractedText);
    }

    return jsonResponse({
      ok: true,
      documentType,
      parsed,
      rawTextExcerpt: rawTextExcerpt ?? "",
      format,
      model: MODEL,
      latencyMs: Date.now() - start,
      tokensInput: usage.input_tokens,
      tokensOutput: usage.output_tokens,
      visionFallbackUsed,
    });
  } catch (e) {
    console.error("parse-document error:", e);
    return jsonResponse({
      ok: false, error: "INTERNAL_ERROR",
      message: e instanceof Error ? e.message : "Unknown error",
      rawTextExcerpt,
    }, 500);
  }
});
