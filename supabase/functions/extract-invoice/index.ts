import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  email_id: z.string().uuid().optional(),
  attachment_id: z.string().uuid().optional(),
  batch: z.boolean().optional(),
});

/* ── Company mapping rules ── */
const LOCATION_COMPANY_MAP: Record<string, string> = {
  "reffen": "Blue Fish ApS",
  "helsingør": "The Fish Project ApS",
  "helsingör": "The Fish Project ApS",
  "aarhus": "The Fish Project ApS",
  "søborg": "The Fish Project ApS",
  "gentofte": "Aegean ApS",
  "fish bistro": "Aegean ApS",
  "gaia": "Aegean ApS",
};

const SUPPLIER_COMPANY_OVERRIDES: Record<string, { company: string; location: string | null }> = {
  "jeka": { company: "MCA Trading ApS", location: null },
  "jeka fish": { company: "MCA Trading ApS", location: null },
  "inco": { company: "The Fish Project ApS", location: "Central Storage — The Fish Project" },
  "inco danmark": { company: "The Fish Project ApS", location: "Central Storage — The Fish Project" },
  "inco københavn": { company: "The Fish Project ApS", location: "Central Storage — The Fish Project" },
  "sepio": { company: "The Fish Project ApS", location: null },
  "kavsman": { company: "The Fish Project ApS", location: null },
  "odin": { company: "The Fish Project ApS", location: null },
  "odin seafood": { company: "The Fish Project ApS", location: null },
  "odin seafoods": { company: "The Fish Project ApS", location: null },
  "kollek": { company: "The Fish Project ApS", location: null },
  "team kollek": { company: "The Fish Project ApS", location: null },
  "h.w. larsen": { company: "The Fish Project ApS", location: null },
  "hw larsen": { company: "The Fish Project ApS", location: null },
};

/* ── Suppliers/content to ALWAYS ignore (never create invoices) ── */
const IGNORE_KEYWORDS = /kontoudtog|kontoopgørelse|account\s*statement/i;

/* ── KPI Platform detection — route to kpi_ledger, NOT invoices ── */
const KPI_PLATFORMS = [
  { keywords: ["wolt"], platform: "wolt" },
  { keywords: ["livet på øen", "livet paa øen", "livet paa oen", "livetpaoen"], platform: "livet_paa_oen" },
];

function detectKpiPlatform(sender: string | null, subject: string | null, supplierName: string | null): string | null {
  const combined = `${(sender || "").toLowerCase()} ${(subject || "").toLowerCase()} ${(supplierName || "").toLowerCase()}`;
  for (const p of KPI_PLATFORMS) {
    if (p.keywords.some(k => combined.includes(k))) return p.platform;
  }
  return null;
}

function shouldIgnore(supplierName: string | null, subject: string | null, bodyText: string | null): boolean {
  // KPI platforms are NOT ignored — they go to kpi_ledger
  const platform = detectKpiPlatform(null, subject, supplierName);
  if (platform) return false;

  const combined = `${subject || ""} ${bodyText || ""}`;
  return IGNORE_KEYWORDS.test(combined);
}

/* ── Rykker (payment reminder) detection ── */
const RYKKER_PATTERN = /rykker|rykke|betalingspåmindelse|påmindelse/i;

function isRykker(subject: string | null, bodyText: string | null): boolean {
  return RYKKER_PATTERN.test(subject || "") || RYKKER_PATTERN.test((bodyText || "").substring(0, 2000));
}

function resolveCompany(supplierName: string | null, location: string | null, emailCompany: string | null): { company: string | null; location: string | null } {
  const sn = (supplierName || "").toLowerCase();
  for (const [key, val] of Object.entries(SUPPLIER_COMPANY_OVERRIDES)) {
    if (sn.includes(key)) {
      if (key.includes("jeka")) {
        const loc = (location || "").toLowerCase();
        const resolvedLocation = (loc.includes("aarhus") || loc.includes("århus"))
          ? "The Fish Project Aarhus"
          : "Copenhagen Storage";
        return { company: "MCA Trading ApS", location: resolvedLocation };
      }
      return val;
    }
  }
  const loc = (location || "").toLowerCase();
  for (const [key, company] of Object.entries(LOCATION_COMPANY_MAP)) {
    if (loc.includes(key)) return { company, location };
  }
  return { company: emailCompany || null, location };
}

/* ── Category assignment ── */
function assignCategory(invoiceData: any): string {
  const supplier = (invoiceData.supplier_name || "").toLowerCase();
  const bought = (invoiceData.what_was_bought || "").toLowerCase();
  if (["lebara", "tdc", "telenor", "yousee", "3 denmark", "one.com"].some(s => supplier.includes(s))) {
    invoiceData.what_was_bought = invoiceData.what_was_bought || "Phone/Communication bill";
    return "operating_expense";
  }
  if (supplier.includes("larsen") || bought.includes("equipment") || bought.includes("udstyr")) return "equipment";
  if (["esmiley", "subscription", "abonnement"].some(s => supplier.includes(s) || bought.includes(s))) return "operating_expense";
  if (invoiceData.extraction_notes?.toLowerCase().includes("rykker") || invoiceData.status === "overdue") return "rykker";
  if (["pbs", "direct debit"].some(s => (invoiceData.payment_method || "").toLowerCase().includes(s))) return "cashflow_pbs";
  return "supplier_invoice";
}

/* ── Invoice-like content detection ── */
const INVOICE_KEYWORDS = /faktura|invoice|betaling|nota|kvittering|ordre|levering|regning|payment|bill|receipt|factură|plată|bilag|kreditnota|debitnota|tilbud|overførsel/i;
const AMOUNT_PATTERN = /(?:DKK|kr\.?|EUR|€|RON|USD|\$|SEK|NOK)\s*[\d.,]+|[\d.,]+\s*(?:DKK|kr\.?|EUR|€|RON)/i;
const DATE_PATTERN = /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}/;

function looksLikeInvoiceContent(text: string): boolean {
  if (!text || text.length < 20) return false;
  const hasKeyword = INVOICE_KEYWORDS.test(text);
  const hasAmount = AMOUNT_PATTERN.test(text);
  const hasDate = DATE_PATTERN.test(text);
  return (hasKeyword && hasAmount) || (hasKeyword && hasDate) || (hasAmount && hasDate);
}

/* ── Error categorization ── */
type ErrorCategory = "pdf_too_large" | "json_parse" | "attachment_download" | "claude_timeout" | "rate_limit" | "no_content" | "other";

function categorizeError(error: string): ErrorCategory {
  const e = (error || "").toLowerCase();
  if (e.includes("timeout") || e.includes("timed out") || e.includes("deadline")) return "claude_timeout";
  if (e.includes("rate") || e.includes("429") || e.includes("too many")) return "rate_limit";
  if (e.includes("parse") || e.includes("json") || e.includes("unexpected token")) return "json_parse";
  if (e.includes("download") || e.includes("storage") || e.includes("no data")) return "attachment_download";
  if (e.includes("too large") || e.includes("token") || e.includes("maximum")) return "pdf_too_large";
  if (e.includes("no body") || e.includes("no text") || e.includes("empty") || e.includes("no invoice")) return "no_content";
  return "other";
}

const CLAUDE_EXTRACTION_PROMPT = `Extract invoice data from the text. Return ONLY valid JSON, no markdown.

COMPANY RULES:
- Reffen → Blue Fish ApS
- Helsingør → The Fish Project ApS
- Aarhus → The Fish Project ApS
- Søborg → The Fish Project ApS
- Fish Bistro/Gaia/Gentofte → Aegean ApS
- Inco Danmark → The Fish Project ApS
- BC Catering Roskilde (bccs.dk) → web order +25% VAT
- BC Catering Skanderborg (bccr.dk) → PBS cashflow, Aegean ApS
- Sepio/Kavsman/Odin/Kollek/HW Larsen → The Fish Project ApS
- Livet på Øen/kontoudtog → is_invoice: false

Return:
{"is_invoice":true,"supplier_name":"","invoice_number":"","invoice_date":"YYYY-MM-DD","due_date":"YYYY-MM-DD","amount":0,"vat_amount":0,"total_with_vat":0,"currency":"DKK","company":"","location":"","what_was_bought":"","payment_account":"","payment_reference":"","confidence":0.0,"extraction_notes":""}

If NOT an invoice: {"is_invoice":false,"confidence":0,"extraction_notes":"reason"}`;

/* ── Robust JSON parsing (handles markdown, trailing commas, etc) ── */
function parseClaudeJson(text: string): any {
  let cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const jsonStart = cleaned.search(/[\{\[]/);
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }
  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, "");
  return JSON.parse(cleaned);
}

/* ── Call Claude with timeout ── */
const CLAUDE_TIMEOUT_MS = 25000;
const MAX_PDF_CHARS = 8000;
const MAX_BODY_CHARS = 3000;

async function callClaude(apiKey: string, messages: Array<{ role: string; content: any }>, maxTokens = 500): Promise<any> {
  console.log("Calling Claude API with model claude-sonnet-4-20250514...");
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        messages,
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      if (response.status === 429) throw new Error("Rate limit (429)");
      console.error("Claude API HTTP error:", response.status, responseText.substring(0, 300));
      throw new Error(`Claude API error ${response.status}: ${responseText.substring(0, 200)}`);
    }

    try {
      return JSON.parse(responseText);
    } catch {
      console.error("Claude response not JSON:", responseText.substring(0, 300));
      throw new Error("Claude returned non-JSON response");
    }
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const claudeKey = Deno.env.get("aiagents") || Deno.env.get("AIAGENTS");
    if (!claudeKey) {
      return new Response(JSON.stringify({ error: "Claude API key (aiagents) not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const results: Array<{ email_id: string; attachment_id?: string; status: string; error?: string; error_category?: ErrorCategory; [key: string]: any }> = [];

    if (parsed.data.attachment_id) {
      const { data: att, error } = await supabase
        .from("email_attachments").select("*").eq("id", parsed.data.attachment_id).single();
      if (error || !att) {
        return new Response(JSON.stringify({ error: "Attachment not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await processAttachment(supabase, att, supabaseUrl, claudeKey);
      results.push(result);
    } else if (parsed.data.email_id) {
      const result = await processEmail(supabase, parsed.data.email_id, supabaseUrl, claudeKey);
      results.push(...result);
    } else if (parsed.data.batch) {
      const { data: invoiceEmails } = await supabase
        .from("emails").select("id")
        .eq("classification", "invoice")
        .gte("received_at", "2026-01-01T00:00:00.000Z")
        .order("received_at", { ascending: false }).limit(20);

      if (invoiceEmails && invoiceEmails.length > 0) {
        const emailIds = invoiceEmails.map(e => e.id);
        const { data: existingInvoices } = await supabase
          .from("invoices").select("email_id").in("email_id", emailIds);
        const existingIds = new Set((existingInvoices || []).map(i => i.email_id));
        const toProcess = emailIds.filter(id => !existingIds.has(id)).slice(0, 5);

        for (const emailId of toProcess) {
          try {
            const result = await processEmail(supabase, emailId, supabaseUrl, claudeKey);
            results.push(...result);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown";
            results.push({ email_id: emailId, status: "error", error: errMsg, error_category: categorizeError(errMsg) });
          }
        }
      }
    }

    if (results.length === 0) {
      return new Response(JSON.stringify({ message: "No items to process", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add error_category to all error results
    for (const r of results) {
      if (r.status === "error" && r.error && !r.error_category) {
        r.error_category = categorizeError(r.error);
      }
    }

    const extracted = results.filter(r => r.status === "extracted").length;
    const errors = results.filter(r => r.status === "error").length;
    return new Response(JSON.stringify({ extracted, errors, total: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Extract invoice top-level error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* ── Process a full email ── */
async function processEmail(
  supabase: any, emailId: string, supabaseUrl: string, claudeKey: string
): Promise<Array<{ email_id: string; attachment_id?: string; status: string; error?: string; error_category?: ErrorCategory; [key: string]: any }>> {
  const results: Array<{ email_id: string; attachment_id?: string; status: string; error?: string; error_category?: ErrorCategory; [key: string]: any }> = [];

  // Check if this is a KPI platform email — route to kpi_ledger instead of invoices
  const { data: email } = await supabase
    .from("emails")
    .select("subject, sender, company, body_clean_text, body_text, received_at")
    .eq("id", emailId).single();

  if (email) {
    const kpiPlatform = detectKpiPlatform(email.sender, email.subject, null);
    if (kpiPlatform) {
      console.log(`📊 KPI platform detected: ${kpiPlatform} for email ${emailId}`);
      const result = await processKpiEmail(supabase, emailId, email, kpiPlatform, claudeKey);
      results.push(result);
      return results;
    }
  }

  const { data: atts } = await supabase
    .from("email_attachments").select("*").eq("email_id", emailId).eq("is_inline", false);

  const docAtts = (atts || []).filter((att: any) => {
    const mt = (att.mime_type || "").toLowerCase();
    const fn = (att.filename || "").toLowerCase();
    return mt.includes("pdf") || mt.includes("word") || mt.includes("spreadsheet") ||
           mt.includes("excel") || fn.endsWith(".pdf") || fn.endsWith(".docx") ||
           fn.endsWith(".xlsx") || fn.endsWith(".xls");
  });

  let extractedFromAttachment = false;
  for (const att of docAtts) {
    if (att.storage_path) {
      try {
        const result = await processAttachment(supabase, att, supabaseUrl, claudeKey);
        results.push(result);
        if (result.status === "extracted") extractedFromAttachment = true;
      } catch (attachError) {
        const errMsg = attachError instanceof Error ? attachError.message : "Attachment processing failed";
        console.warn(`⚠ Attachment ${att.id} failed, falling back to body: ${errMsg}`);
        results.push({ email_id: att.email_id, attachment_id: att.id, status: "error", error: errMsg, error_category: categorizeError(errMsg) });
      }
    }
  }

  // Fall back to email body if no attachment extracted
  if (!extractedFromAttachment) {
    const result = await processEmailBody(supabase, emailId, claudeKey);
    results.push(result);
  }

  return results;
}

/* ── Extract from email body ── */
async function processEmailBody(
  supabase: any, emailId: string, claudeKey: string
): Promise<{ email_id: string; status: string; error?: string; error_category?: ErrorCategory; [key: string]: any }> {
  const { data: email } = await supabase
    .from("emails")
    .select("subject, sender, company, body_clean_text, body_text, received_at")
    .eq("id", emailId).single();

  if (!email) return { email_id: emailId, status: "error", error: "Email not found", error_category: "other" };

  if (shouldIgnore(email.sender, email.subject, email.body_clean_text || email.body_text)) {
    return { email_id: emailId, status: "ignored", error: "Matched ignore rule" };
  }

  const bodyText = email.body_clean_text || email.body_text || "";
  if (!bodyText || bodyText.trim().length < 20) {
    return { email_id: emailId, status: "skipped", error: "No body text", error_category: "no_content" };
  }

  const fullText = `${email.subject || ""} ${bodyText}`;
  if (!looksLikeInvoiceContent(fullText)) {
    return { email_id: emailId, status: "skipped", error: "No invoice-like content in body", error_category: "no_content" };
  }

  const emailContext = [
    `Subject: ${email.subject || ""}`,
    `From: ${email.sender || ""}`,
    `Company: ${email.company || "Unknown"}`,
    `Date: ${email.received_at || ""}`,
  ].join("\n");

  // Error A — Truncate body text
  return await callClaudeExtraction(
    supabase, emailId, null, null,
    bodyText.substring(0, MAX_BODY_CHARS), emailContext,
    email.company, claudeKey
  );
}

/* ── Process a single attachment ── */
async function processAttachment(
  supabase: any, att: any, supabaseUrl: string, claudeKey: string
): Promise<{ email_id: string; attachment_id: string; status: string; error?: string; error_category?: ErrorCategory; [key: string]: any }> {
  if (!att.storage_path) {
    return { email_id: att.email_id, attachment_id: att.id, status: "skipped", error: "No storage path", error_category: "attachment_download" };
  }

  // Check if PDF text was already extracted — use cached text
  if (att.extracted_text && att.extracted_text.length > 100) {
    console.log(`Using cached extracted text for ${att.id} (${att.extracted_text.length} chars)`);
    const pdfUrl = `${supabaseUrl}/storage/v1/object/public/email-attachments/${att.storage_path}`;
    const emailContext = await getEmailContext(supabase, att.email_id);
    const { data: parentEmail } = await supabase.from("emails").select("company").eq("id", att.email_id).single();
    return await callClaudeExtraction(
      supabase, att.email_id, att.id, pdfUrl,
      att.extracted_text.substring(0, MAX_PDF_CHARS), emailContext,
      parentEmail?.company, claudeKey
    );
  }

  // Error C — Graceful attachment download
  console.log(`Downloading attachment ${att.id} from ${att.storage_path}`);
  let fileData: any;
  try {
    const result = await supabase.storage.from("email-attachments").download(att.storage_path);
    if (result.error || !result.data) {
      throw new Error(`Download failed: ${result.error?.message || "no data"}`);
    }
    fileData = result.data;
  } catch (dlErr) {
    const errMsg = dlErr instanceof Error ? dlErr.message : "Download failed";
    console.warn(`⚠ PDF download failed for ${att.id}: ${errMsg}`);
    return { email_id: att.email_id, attachment_id: att.id, status: "error", error: errMsg, error_category: "attachment_download" };
  }

  const mt = (att.mime_type || "").toLowerCase();
  const pdfUrl = `${supabaseUrl}/storage/v1/object/public/email-attachments/${att.storage_path}`;
  const emailContext = await getEmailContext(supabase, att.email_id);
  const { data: parentEmail } = await supabase.from("emails").select("company").eq("id", att.email_id).single();

  if (mt.includes("pdf")) {
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    console.log(`PDF attachment ${att.id}: ${bytes.length} bytes`);

    // Error A — Check PDF size limit (5MB max for base64 to Claude)
    if (bytes.length > 5 * 1024 * 1024) {
      console.warn(`⚠ PDF too large for Claude: ${att.id} (${bytes.length} bytes)`);
      // Try basic text extraction as fallback
      const basicText = tryExtractPdfText(bytes);
      if (basicText && basicText.trim().length > 100) {
        return await callClaudeExtraction(
          supabase, att.email_id, att.id, pdfUrl,
          basicText.substring(0, MAX_PDF_CHARS), emailContext,
          parentEmail?.company, claudeKey
        );
      }
      return { email_id: att.email_id, attachment_id: att.id, status: "error", error: "PDF too large for Claude API", error_category: "pdf_too_large" };
    }

    // Step 1: Try basic regex text extraction
    let basicText = tryExtractPdfText(bytes);
    console.log(`Basic PDF extraction for ${att.id}: ${basicText.length} chars`);

    // Step 2: If basic extraction got decent text, use it
    if (basicText && basicText.trim().length > 100) {
      console.log(`Using basic extracted text for ${att.id}`);
      await supabase.from("email_attachments").update({
        extracted_text: basicText.substring(0, 50000), document_type: "invoice", parse_status: "extracted",
      }).eq("id", att.id);

      return await callClaudeExtraction(
        supabase, att.email_id, att.id, pdfUrl,
        basicText.substring(0, MAX_PDF_CHARS), emailContext,
        parentEmail?.company, claudeKey
      );
    }

    // Step 3: Send PDF directly to Claude as a document
    console.log(`Basic extraction insufficient for ${att.id}, sending PDF to Claude document API`);
    try {
      let base64 = "";
      const chunkSize = 32768;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        base64 += String.fromCharCode.apply(null, Array.from(chunk));
      }
      base64 = btoa(base64);

      const claudeResponse = await callClaude(claudeKey, [{
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          {
            type: "text",
            text: `${CLAUDE_EXTRACTION_PROMPT}\n\n--- EMAIL CONTEXT ---\n${emailContext}\n\nExtract the invoice data from this PDF document. Return ONLY the JSON object.`,
          },
        ],
      }], 2048);

      const responseText = claudeResponse.content?.[0]?.text || "";
      console.log(`Claude PDF response for ${att.id}:`, responseText.substring(0, 500));

      await supabase.from("email_attachments").update({
        extracted_text: responseText.substring(0, 50000),
        document_type: "invoice", parse_status: "extracted", parse_error: null,
      }).eq("id", att.id);

      // Error B — Robust JSON parsing
      let invoiceData: any = null;
      try {
        invoiceData = parseClaudeJson(responseText);
      } catch (parseErr) {
        console.error(`Failed to parse Claude PDF response for ${att.id}:`, parseErr instanceof Error ? parseErr.message : parseErr);
        // Fallback: try extraction from the text Claude returned
        return await callClaudeExtraction(
          supabase, att.email_id, att.id, pdfUrl,
          responseText.substring(0, MAX_PDF_CHARS), emailContext,
          parentEmail?.company, claudeKey
        );
      }

      const isNotInvoice = invoiceData.is_invoice === false || invoiceData.is_invoice === "false";
      if (!invoiceData || isNotInvoice) {
        return { email_id: att.email_id, attachment_id: att.id, status: "skipped", error: invoiceData?.extraction_notes || "Not an invoice" };
      }

      // Apply company mapping and save
      const mapped = resolveCompany(invoiceData.supplier_name, invoiceData.location || invoiceData.company, parentEmail?.company);
      const category = assignCategory(invoiceData);
      const confidence = invoiceData.confidence ?? (invoiceData.amount ? 0.85 : 0.5);
      const status = confidence >= 0.7 ? "pending" : "needs_review";

      await supabase.from("email_attachments").update({
        extracted_summary: invoiceData.what_was_bought || `Invoice from ${invoiceData.supplier_name || "unknown"}`,
      }).eq("id", att.id);

      // Upsert email_invoices + invoices
      await upsertInvoice(supabase, att.email_id, att.id, invoiceData, mapped, category, status, confidence, pdfUrl);

      console.log(`✅ PDF extracted: ${invoiceData.supplier_name}, ${invoiceData.amount} ${invoiceData.currency}`);
      return { email_id: att.email_id, attachment_id: att.id, status: "extracted", supplier_name: invoiceData.supplier_name, amount: invoiceData.total_with_vat || invoiceData.amount, currency: invoiceData.currency || "DKK", company: mapped.company, location: mapped.location || invoiceData.location, invoice_number: invoiceData.invoice_number, confidence };

    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "unknown";
      const cat = errMsg.includes("abort") ? "claude_timeout" as ErrorCategory : categorizeError(errMsg);
      console.error(`Claude document API error for ${att.id}:`, errMsg);
      return { email_id: att.email_id, attachment_id: att.id, status: "error", error: `Claude PDF error: ${errMsg}`, error_category: cat };
    }
  }

  // Non-PDF attachments
  let extractedText = "";
  try { extractedText = await fileData.text(); } catch { extractedText = ""; }

  if (!extractedText || extractedText.trim().length < 10) {
    await supabase.from("email_attachments").update({
      extracted_text: "(empty)", parse_error: "Could not extract text", document_type: "invoice",
    }).eq("id", att.id);
    return { email_id: att.email_id, attachment_id: att.id, status: "empty", error: "No text extracted", error_category: "no_content" };
  }

  await supabase.from("email_attachments").update({
    extracted_text: extractedText.substring(0, 50000), document_type: "invoice", parse_status: "extracted",
  }).eq("id", att.id);

  return await callClaudeExtraction(
    supabase, att.email_id, att.id, pdfUrl,
    extractedText.substring(0, MAX_PDF_CHARS), emailContext,
    parentEmail?.company, claudeKey
  );
}

/* ── Claude structured extraction ── */
async function callClaudeExtraction(
  supabase: any, emailId: string, attachmentId: string | null, pdfUrl: string | null,
  text: string, emailContext: string, emailCompany: string | null,
  claudeKey: string
): Promise<{ email_id: string; attachment_id?: string; status: string; error?: string; error_category?: ErrorCategory; [key: string]: any }> {
  const id = { email_id: emailId, ...(attachmentId ? { attachment_id: attachmentId } : {}) };

  try {
    const claudeData = await callClaude(claudeKey, [
      {
        role: "user",
        content: `${CLAUDE_EXTRACTION_PROMPT}\n\n--- EMAIL CONTEXT ---\n${emailContext}\n\n--- DOCUMENT TEXT ---\n${text}`,
      },
    ]);

    const responseText = claudeData.content?.[0]?.text || "";
    console.log(`Claude response for ${emailId}:`, responseText.substring(0, 500));

    // Error B — Robust JSON parsing
    let invoiceData: any = null;
    try {
      invoiceData = parseClaudeJson(responseText);
    } catch (parseErr) {
      console.error("Failed to parse Claude response as JSON:", responseText.substring(0, 300));
      return { ...id, status: "error", error: "JSON parse failed: " + (parseErr instanceof Error ? parseErr.message : "invalid"), error_category: "json_parse" };
    }

    const isNotInvoice = invoiceData.is_invoice === false || invoiceData.is_invoice === "false";
    if (!invoiceData || isNotInvoice) {
      return { ...id, status: "skipped", error: invoiceData?.extraction_notes || "Not an invoice" };
    }

    if (shouldIgnore(invoiceData.supplier_name, null, text)) {
      return { ...id, status: "ignored", error: "Supplier matched ignore rule" };
    }

    const mapped = resolveCompany(invoiceData.supplier_name, invoiceData.location || invoiceData.company, emailCompany);
    const category = assignCategory(invoiceData);
    const confidence = invoiceData.confidence ?? (invoiceData.amount ? 0.8 : 0.5);
    const rykkerDetected = isRykker(emailContext, text);
    const finalCategory = rykkerDetected ? "rykker" : category;
    const status = rykkerDetected ? "overdue" : (confidence >= 0.7 ? "pending" : "needs_review");
    const notes = rykkerDetected ? "RYKKER — payment reminder received" : (invoiceData.extraction_notes || null);

    if (attachmentId) {
      await supabase.from("email_attachments").update({
        extracted_summary: invoiceData.what_was_bought || `Invoice from ${invoiceData.supplier_name || "unknown"}`,
        parse_error: null,
      }).eq("id", attachmentId);
    }

    await upsertInvoice(supabase, emailId, attachmentId, invoiceData, mapped, finalCategory, status, confidence, pdfUrl, notes, rykkerDetected);

    console.log(`✅ Extracted: ${invoiceData.supplier_name}, ${invoiceData.amount} ${invoiceData.currency}, confidence=${confidence}, status=${status}`);
    return { ...id, status: "extracted", supplier_name: invoiceData.supplier_name, amount: invoiceData.total_with_vat || invoiceData.amount, currency: invoiceData.currency || "DKK", company: mapped.company, location: mapped.location || invoiceData.location, invoice_number: invoiceData.invoice_number, confidence };

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Claude API error";
    const cat = errMsg.includes("abort") ? "claude_timeout" as ErrorCategory : categorizeError(errMsg);
    console.error("Claude extraction error for", emailId, ":", errMsg);
    return { ...id, status: "error", error: errMsg, error_category: cat };
  }
}

/* ── Shared upsert helper ── */
async function upsertInvoice(
  supabase: any, emailId: string, attachmentId: string | null,
  invoiceData: any, mapped: { company: string | null; location: string | null },
  category: string, status: string, confidence: number, pdfUrl: string | null,
  notes?: string | null, rykkerDetected?: boolean
) {
  // Upsert email_invoices
  const { data: existing } = await supabase.from("email_invoices").select("id").eq("email_id", emailId).limit(1);
  const emailInvoiceRecord = {
    email_id: emailId,
    supplier_name: invoiceData.supplier_name || null,
    invoice_number: invoiceData.invoice_number || null,
    invoice_date: invoiceData.invoice_date || null,
    due_date: invoiceData.due_date || null,
    amount: invoiceData.amount || null,
    currency: invoiceData.currency || "DKK",
    vat: invoiceData.vat_amount || null,
    attachment_present: !!attachmentId,
    company: mapped.company,
  };
  if (existing && existing.length > 0) {
    await supabase.from("email_invoices").update(emailInvoiceRecord).eq("id", existing[0].id);
  } else {
    await supabase.from("email_invoices").insert(emailInvoiceRecord);
  }

  // Upsert invoices
  const { data: existingInvoice } = await supabase.from("invoices").select("id").eq("email_id", emailId).limit(1);
  const invoiceRecord = {
    email_id: emailId,
    supplier_name: invoiceData.supplier_name || null,
    invoice_number: invoiceData.invoice_number || null,
    invoice_date: invoiceData.invoice_date || null,
    due_date: invoiceData.due_date || null,
    amount: invoiceData.amount || null,
    total_with_vat: invoiceData.total_with_vat || invoiceData.amount || null,
    vat_amount: invoiceData.vat_amount || null,
    currency: invoiceData.currency || "DKK",
    what_was_bought: invoiceData.what_was_bought || null,
    company: mapped.company,
    location: mapped.location || invoiceData.location || null,
    source_type: invoiceData.source_type || "email",
    status,
    confidence,
    overdue_flag: rykkerDetected || false,
    pdf_url: pdfUrl,
    payment_account: invoiceData.payment_account || null,
    payment_reference: invoiceData.payment_reference || null,
    notes: notes || null,
    category,
  };
  if (existingInvoice && existingInvoice.length > 0) {
    await supabase.from("invoices").update(invoiceRecord).eq("id", existingInvoice[0].id);
  } else {
    await supabase.from("invoices").insert(invoiceRecord);
  }
}

/* ── Helpers ── */
async function getEmailContext(supabase: any, emailId: string): Promise<string> {
  const { data: email } = await supabase
    .from("emails")
    .select("subject, sender, company, body_clean_text, received_at")
    .eq("id", emailId).single();
  if (!email) return "";
  return [
    `Subject: ${email.subject || ""}`,
    `From: ${email.sender || ""}`,
    `Company: ${email.company || "Unknown"}`,
    `Date: ${email.received_at || ""}`,
    email.body_clean_text ? `Email body excerpt: ${email.body_clean_text.substring(0, 500)}` : "",
  ].filter(Boolean).join("\n");
}

function tryExtractPdfText(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder("latin1").decode(bytes);
    const textParts: string[] = [];
    const btEtRegex = /BT\s([\s\S]*?)ET/g;
    let match;
    while ((match = btEtRegex.exec(text)) !== null) {
      const block = match[1];
      const tjRegex = /\((.*?)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(block)) !== null) textParts.push(tjMatch[1]);
      const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
      let tjArrMatch;
      while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
        const strRegex = /\((.*?)\)/g;
        let strMatch;
        while ((strMatch = strRegex.exec(tjArrMatch[1])) !== null) textParts.push(strMatch[1]);
      }
    }
    return textParts.join(" ").replace(/\\n/g, "\n").replace(/\s+/g, " ").trim();
  } catch { return ""; }
}
