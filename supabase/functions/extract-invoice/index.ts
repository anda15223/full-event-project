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
  "fish bistro": "Aegean ApS",
  "gaia": "Aegean ApS",
};

const SUPPLIER_COMPANY_OVERRIDES: Record<string, { company: string; location: string | null }> = {
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
const IGNORE_SUPPLIERS = ["livet på øen", "livet paa øen", "livet paa oen"];
const IGNORE_KEYWORDS = /kontoudtog|kontoopgørelse|account\s*statement/i;

function shouldIgnore(supplierName: string | null, subject: string | null, bodyText: string | null): boolean {
  const sn = (supplierName || "").toLowerCase();
  for (const ign of IGNORE_SUPPLIERS) {
    if (sn.includes(ign)) return true;
  }
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
    if (sn.includes(key)) return val;
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

  // Phone bills
  if (["lebara", "tdc", "telenor", "yousee", "3 denmark", "one.com"].some(s => supplier.includes(s))) {
    invoiceData.what_was_bought = invoiceData.what_was_bought || "Phone/Communication bill";
    return "operating_expense";
  }
  // Equipment
  if (supplier.includes("larsen") || bought.includes("equipment") || bought.includes("udstyr")) {
    return "equipment";
  }
  // Subscriptions
  if (["esmiley", "subscription", "abonnement"].some(s => supplier.includes(s) || bought.includes(s))) {
    return "operating_expense";
  }
  // Rykker
  if (invoiceData.extraction_notes?.toLowerCase().includes("rykker") || invoiceData.status === "overdue") {
    return "rykker";
  }
  // PBS
  if (["pbs", "direct debit"].some(s => (invoiceData.payment_method || "").toLowerCase().includes(s))) {
    return "cashflow_pbs";
  }
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

const CLAUDE_EXTRACTION_PROMPT = `Extract invoice data from the text. Return ONLY valid JSON, no markdown.

COMPANY RULES:
- Reffen → Blue Fish ApS
- Helsingør → The Fish Project ApS
- Fish Bistro/Gaia → Aegean ApS
- Inco Danmark → The Fish Project ApS
- BC Catering Roskilde (bccs.dk) → web order +25% VAT
- BC Catering Skanderborg (bccr.dk) → PBS cashflow, Aegean ApS
- Sepio/Kavsman/Odin/Kollek/HW Larsen → The Fish Project ApS
- Livet på Øen/kontoudtog → is_invoice: false

Return:
{"is_invoice":true,"supplier_name":"","invoice_number":"","invoice_date":"YYYY-MM-DD","due_date":"YYYY-MM-DD","amount":0,"vat_amount":0,"total_with_vat":0,"currency":"DKK","company":"","location":"","what_was_bought":"","payment_account":"","payment_reference":"","confidence":0.0,"extraction_notes":""}

If NOT an invoice: {"is_invoice":false,"confidence":0,"extraction_notes":"reason"}`;

/* ── Call Claude via direct fetch (no SDK needed) ── */
async function callClaude(apiKey: string, messages: Array<{ role: string; content: any }>, maxTokens = 500): Promise<any> {
  console.log("Calling Claude API with model claude-sonnet-4-20250514...");
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
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    console.error("Claude API HTTP error:", response.status, responseText);
    throw new Error(`Claude API error ${response.status}: ${responseText.substring(0, 500)}`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    console.error("Claude response not JSON:", responseText.substring(0, 500));
    throw new Error("Claude returned non-JSON response");
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
      console.error("aiagents/AIAGENTS secret not found in environment");
      return new Response(JSON.stringify({ error: "Claude API key (aiagents) not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("Claude API key found, length:", claudeKey.length);

    const supabase = createClient(supabaseUrl, supabaseKey);
    const results: Array<{ email_id: string; attachment_id?: string; status: string; error?: string }> = [];

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
            results.push({ email_id: emailId, status: "error", error: err instanceof Error ? err.message : "Unknown" });
          }
        }
      }
    }

    if (results.length === 0) {
      return new Response(JSON.stringify({ message: "No items to process", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
): Promise<Array<{ email_id: string; attachment_id?: string; status: string; error?: string }>> {
  const results: Array<{ email_id: string; attachment_id?: string; status: string; error?: string }> = [];

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
      const result = await processAttachment(supabase, att, supabaseUrl, claudeKey);
      results.push(result);
      if (result.status === "extracted") extractedFromAttachment = true;
    }
  }

  if (!extractedFromAttachment) {
    const result = await processEmailBody(supabase, emailId, claudeKey);
    results.push(result);
  }

  return results;
}

/* ── Extract from email body ── */
async function processEmailBody(
  supabase: any, emailId: string, claudeKey: string
): Promise<{ email_id: string; status: string; error?: string }> {
  const { data: email } = await supabase
    .from("emails")
    .select("subject, sender, company, body_clean_text, body_text, received_at")
    .eq("id", emailId).single();

  if (!email) return { email_id: emailId, status: "error", error: "Email not found" };

  // Check ignore rules
  if (shouldIgnore(email.sender, email.subject, email.body_clean_text || email.body_text)) {
    console.log(`Ignoring email ${emailId}: matches ignore rule (Livet på Øen / kontoudtog)`);
    return { email_id: emailId, status: "ignored", error: "Matched ignore rule" };
  }

  const bodyText = email.body_clean_text || email.body_text || "";
  if (!bodyText || bodyText.trim().length < 20) {
    return { email_id: emailId, status: "skipped", error: "No body text" };
  }

  const fullText = `${email.subject || ""} ${bodyText}`;
  if (!looksLikeInvoiceContent(fullText)) {
    return { email_id: emailId, status: "skipped", error: "No invoice-like content in body" };
  }

  const emailContext = [
    `Subject: ${email.subject || ""}`,
    `From: ${email.sender || ""}`,
    `Company: ${email.company || "Unknown"}`,
    `Date: ${email.received_at || ""}`,
  ].join("\n");

  return await callClaudeExtraction(
    supabase, emailId, null, null,
    bodyText.substring(0, 15000), emailContext,
    email.company, claudeKey
  );
}

/* ── Process a single attachment ── */
async function processAttachment(
  supabase: any, att: any, supabaseUrl: string, claudeKey: string
): Promise<{ email_id: string; attachment_id: string; status: string; error?: string }> {
  if (!att.storage_path) {
    console.log(`Attachment ${att.id}: no storage_path, skipping`);
    return { email_id: att.email_id, attachment_id: att.id, status: "skipped", error: "No storage path" };
  }

  // Check if PDF text was already extracted — use cached text
  if (att.extracted_text && att.extracted_text.length > 100) {
    console.log(`Using cached extracted text for ${att.id} (${att.extracted_text.length} chars)`);
    const mt = (att.mime_type || "").toLowerCase();
    const pdfUrl = `${supabaseUrl}/storage/v1/object/public/email-attachments/${att.storage_path}`;
    const emailContext = await getEmailContext(supabase, att.email_id);
    const { data: parentEmail } = await supabase.from("emails").select("company").eq("id", att.email_id).single();
    return await callClaudeExtraction(
      supabase, att.email_id, att.id, pdfUrl,
      att.extracted_text.substring(0, 15000), emailContext,
      parentEmail?.company, claudeKey
    );
  }

  console.log(`Downloading attachment ${att.id} from ${att.storage_path}`);
  const { data: fileData, error: dlError } = await supabase.storage
    .from("email-attachments").download(att.storage_path);

  if (dlError || !fileData) {
    console.error(`Download failed for ${att.id}:`, dlError);
    return { email_id: att.email_id, attachment_id: att.id, status: "error", error: `Download failed: ${dlError?.message || "no data"}` };
  }

  const mt = (att.mime_type || "").toLowerCase();
  const pdfUrl = `${supabaseUrl}/storage/v1/object/public/email-attachments/${att.storage_path}`;
  const emailContext = await getEmailContext(supabase, att.email_id);
  const { data: parentEmail } = await supabase.from("emails").select("company").eq("id", att.email_id).single();

  if (mt.includes("pdf")) {
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    console.log(`PDF attachment ${att.id}: ${bytes.length} bytes`);

    // Step 1: Try basic regex text extraction
    let basicText = tryExtractPdfText(bytes);
    console.log(`Basic PDF extraction for ${att.id}: ${basicText.length} chars`);

    // Step 2: If basic extraction got decent text, use it for Claude structured extraction
    if (basicText && basicText.trim().length > 100) {
      console.log(`Using basic extracted text for ${att.id}`);
      await supabase.from("email_attachments").update({
        extracted_text: basicText.substring(0, 50000), document_type: "invoice", parse_status: "extracted",
      }).eq("id", att.id);

      return await callClaudeExtraction(
        supabase, att.email_id, att.id, pdfUrl,
        basicText.substring(0, 15000), emailContext,
        parentEmail?.company, claudeKey
      );
    }

    // Step 3: Send PDF directly to Claude as a document (handles scanned + digital PDFs)
    console.log(`Basic extraction insufficient for ${att.id}, sending PDF to Claude document API`);
    try {
      let base64 = "";
      const chunkSize = 32768;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        base64 += String.fromCharCode.apply(null, Array.from(chunk));
      }
      base64 = btoa(base64);

      // Use Claude's document type for native PDF reading
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

      // Save extracted text from Claude
      await supabase.from("email_attachments").update({
        extracted_text: responseText.substring(0, 50000),
        document_type: "invoice",
        parse_status: "extracted",
        parse_error: null,
      }).eq("id", att.id);

      // Parse Claude's JSON response with robust extraction
      let invoiceData: any = null;
      try {
        let cleaned = responseText
          .replace(/```json\s*/gi, "")
          .replace(/```\s*/g, "")
          .trim();
        const jsonStart = cleaned.search(/[\{\[]/);
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
        }
        cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
        invoiceData = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error(`Failed to parse Claude PDF response for ${att.id}:`, parseErr instanceof Error ? parseErr.message : parseErr);
        return await callClaudeExtraction(
          supabase, att.email_id, att.id, pdfUrl,
          responseText.substring(0, 15000), emailContext,
          parentEmail?.company, claudeKey
        );
      }

      // Debug logging
      console.log(`=== PDF PARSED KEYS for ${att.id} ===`, Object.keys(invoiceData));
      console.log(`=== PDF is_invoice ===`, typeof invoiceData.is_invoice, invoiceData.is_invoice);

      // Handle is_invoice as string OR boolean
      const isNotInvoice = invoiceData.is_invoice === false || invoiceData.is_invoice === "false";

      if (!invoiceData || isNotInvoice) {
        console.log(`⏭ PDF not invoice: ${att.id} — ${invoiceData?.extraction_notes || "no notes"}`);
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

      // Upsert email_invoices
      const { data: existing } = await supabase.from("email_invoices").select("id").eq("email_id", att.email_id).limit(1);
      const emailInvoiceRecord = {
        email_id: att.email_id,
        supplier_name: invoiceData.supplier_name || null,
        invoice_number: invoiceData.invoice_number || null,
        invoice_date: invoiceData.invoice_date || null,
        due_date: invoiceData.due_date || null,
        amount: invoiceData.amount || null,
        currency: invoiceData.currency || "DKK",
        vat: invoiceData.vat_amount || null,
        attachment_present: true,
        company: mapped.company,
      };
      if (existing && existing.length > 0) {
        await supabase.from("email_invoices").update(emailInvoiceRecord).eq("id", existing[0].id);
      } else {
        await supabase.from("email_invoices").insert(emailInvoiceRecord);
      }

      // Upsert invoices
      const { data: existingInvoice } = await supabase.from("invoices").select("id").eq("email_id", att.email_id).limit(1);
      const invoiceRecord = {
        email_id: att.email_id,
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
        pdf_url: pdfUrl,
        payment_account: invoiceData.payment_account || null,
        payment_reference: invoiceData.payment_reference || null,
      };
      if (existingInvoice && existingInvoice.length > 0) {
        await supabase.from("invoices").update(invoiceRecord).eq("id", existingInvoice[0].id);
      } else {
        await supabase.from("invoices").insert(invoiceRecord);
      }

      console.log(`✅ PDF extracted: ${invoiceData.supplier_name}, ${invoiceData.amount} ${invoiceData.currency}`);
      return { email_id: att.email_id, attachment_id: att.id, status: "extracted", supplier_name: invoiceData.supplier_name, amount: invoiceData.total_with_vat || invoiceData.amount, currency: invoiceData.currency || "DKK", company: mapped.company, location: mapped.location || invoiceData.location, invoice_number: invoiceData.invoice_number, confidence };

    } catch (e) {
      console.error(`Claude document API error for ${att.id}:`, e instanceof Error ? e.message : JSON.stringify(e));
      return { email_id: att.email_id, attachment_id: att.id, status: "error", error: `Claude PDF error: ${e instanceof Error ? e.message : "unknown"}` };
    }
  }

  // Non-PDF attachments
  let extractedText = "";
  try { extractedText = await fileData.text(); } catch { extractedText = ""; }

  if (!extractedText || extractedText.trim().length < 10) {
    await supabase.from("email_attachments").update({
      extracted_text: "(empty)", parse_error: "Could not extract text", document_type: "invoice",
    }).eq("id", att.id);
    return { email_id: att.email_id, attachment_id: att.id, status: "empty", error: "No text extracted" };
  }

  await supabase.from("email_attachments").update({
    extracted_text: extractedText.substring(0, 50000), document_type: "invoice", parse_status: "extracted",
  }).eq("id", att.id);

  return await callClaudeExtraction(
    supabase, att.email_id, att.id, pdfUrl,
    extractedText.substring(0, 15000), emailContext,
    parentEmail?.company, claudeKey
  );
}

/* ── Claude structured extraction ── */
async function callClaudeExtraction(
  supabase: any, emailId: string, attachmentId: string | null, pdfUrl: string | null,
  text: string, emailContext: string, emailCompany: string | null,
  claudeKey: string
): Promise<{ email_id: string; attachment_id?: string; status: string; error?: string }> {
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

    let invoiceData: any = null;
    try {
      // Strip markdown code blocks if present (Bug B)
      let cleaned = responseText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      // Find JSON boundaries
      const jsonStart = cleaned.search(/[\{\[]/);
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
      // Fix common JSON issues
      cleaned = cleaned
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/[\x00-\x1F\x7F]/g, "");
      invoiceData = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse Claude response as JSON:", responseText.substring(0, 300));
      console.error("Parse error:", parseErr instanceof Error ? parseErr.message : parseErr);
      return { ...id, status: "error", error: "Could not parse Claude response" };
    }

    // Debug logging for is_invoice check (Bug A + Bug C)
    console.log(`=== PARSED JSON KEYS for ${emailId} ===`, Object.keys(invoiceData));
    console.log(`=== is_invoice ===`, typeof invoiceData.is_invoice, invoiceData.is_invoice);
    console.log(`=== confidence ===`, typeof invoiceData.confidence, invoiceData.confidence);

    // Handle is_invoice as string OR boolean (Bug A)
    const isInvoice = invoiceData.is_invoice === true || invoiceData.is_invoice === "true";
    const isNotInvoice = invoiceData.is_invoice === false || invoiceData.is_invoice === "false";

    if (!invoiceData || isNotInvoice) {
      console.log(`⏭ Not an invoice: ${emailId} — ${invoiceData?.extraction_notes || "no notes"}`);
      return { ...id, status: "skipped", error: invoiceData?.extraction_notes || "Not an invoice" };
    }

    // Check ignore rules on extracted supplier
    if (shouldIgnore(invoiceData.supplier_name, null, text)) {
      console.log(`Ignoring extraction for ${emailId}: supplier matched ignore rule`);
      return { ...id, status: "ignored", error: "Supplier matched ignore rule" };
    }

    // Apply company mapping rules
    const mapped = resolveCompany(invoiceData.supplier_name, invoiceData.location || invoiceData.company, emailCompany);

    const confidence = invoiceData.confidence ?? (invoiceData.amount ? 0.8 : 0.5);
    // Check for rykker (payment reminder) → force overdue
    const rykkerDetected = isRykker(emailContext, text);
    const status = rykkerDetected ? "overdue" : (confidence >= 0.7 ? "pending" : "needs_review");
    const notes = rykkerDetected ? "RYKKER — payment reminder received" : (invoiceData.extraction_notes || null);

    if (attachmentId) {
      await supabase.from("email_attachments").update({
        extracted_summary: invoiceData.what_was_bought || `Invoice from ${invoiceData.supplier_name || "unknown"}`,
        parse_error: null,
      }).eq("id", attachmentId);
    }

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
      notes,
    };
    if (existingInvoice && existingInvoice.length > 0) {
      await supabase.from("invoices").update(invoiceRecord).eq("id", existingInvoice[0].id);
    } else {
      await supabase.from("invoices").insert(invoiceRecord);
    }

    console.log(`✅ Extracted: ${invoiceData.supplier_name}, ${invoiceData.amount} ${invoiceData.currency}, confidence=${confidence}, status=${status}`);
    return { ...id, status: "extracted", supplier_name: invoiceData.supplier_name, amount: invoiceData.total_with_vat || invoiceData.amount, currency: invoiceData.currency || "DKK", company: mapped.company, location: mapped.location || invoiceData.location, invoice_number: invoiceData.invoice_number, confidence };

  } catch (err) {
    console.error("Claude extraction error for", emailId, ":", err instanceof Error ? err.message : JSON.stringify(err));
    return { ...id, status: "error", error: err instanceof Error ? err.message : "Claude API error" };
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
