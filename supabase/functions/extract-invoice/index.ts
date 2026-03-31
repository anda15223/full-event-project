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

const SUPPLIER_COMPANY_OVERRIDES: Record<string, { company: string; location: string }> = {
  "inco": { company: "The Fish Project ApS", location: "Central Storage — The Fish Project" },
  "inco danmark": { company: "The Fish Project ApS", location: "Central Storage — The Fish Project" },
  "inco københavn": { company: "The Fish Project ApS", location: "Central Storage — The Fish Project" },
};

function resolveCompany(supplierName: string | null, location: string | null, emailCompany: string | null): { company: string | null; location: string | null } {
  const sn = (supplierName || "").toLowerCase();
  // Supplier overrides first
  for (const [key, val] of Object.entries(SUPPLIER_COMPANY_OVERRIDES)) {
    if (sn.includes(key)) return val;
  }
  // Location-based mapping
  const loc = (location || "").toLowerCase();
  for (const [key, company] of Object.entries(LOCATION_COMPANY_MAP)) {
    if (loc.includes(key)) return { company, location };
  }
  return { company: emailCompany || null, location };
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
  // At least keyword + amount, or keyword + date, or amount + date
  return (hasKeyword && hasAmount) || (hasKeyword && hasDate) || (hasAmount && hasDate);
}

const EXTRACTION_PROMPT = `You are a document analysis expert specializing in invoice extraction.
You receive text from a PDF document OR an email body that may contain invoice information.

Your task: Extract structured invoice data from this text.

IMPORTANT RULES:
- The document may be in Danish, Romanian, or English
- ALL output must be in English
- Extract exact numbers, dates, and identifiers as they appear
- If a field is not found, return null
- Currency: detect from context (DKK for Danish, RON for Romanian, EUR if European)
- VAT: look for "moms" (Danish), "TVA" (Romanian), "VAT" (English)
- Dates: convert to YYYY-MM-DD format
- Amount: extract the TOTAL amount (including VAT if shown)
- Be PERMISSIVE: if there's any invoice-like data, extract it
- Look for: faktura, invoice, betaling, nota, kvittering, ordre, levering, regning, payment, bill, receipt, factură, bilag

CRITICAL COMPANY MAPPING RULES:
- Inco Danmark / inco København → company MUST be "The Fish Project ApS", location = "Central Storage — The Fish Project"
- Location contains "Reffen" → company = "Blue Fish ApS"
- Location contains "Helsingør" → company = "The Fish Project ApS"
- Fish Bistro → company = "Aegean ApS"
- Gaia → company = "Aegean ApS"

You MUST use the extract_invoice tool to return your results.`;

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const results: Array<{ email_id: string; attachment_id?: string; status: string; error?: string }> = [];

    // ── Determine what to process ──
    if (parsed.data.attachment_id) {
      // Single attachment mode
      const { data: att, error } = await supabase
        .from("email_attachments")
        .select("*")
        .eq("id", parsed.data.attachment_id)
        .single();
      if (error || !att) {
        return new Response(JSON.stringify({ error: "Attachment not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await processAttachment(supabase, att, supabaseUrl, LOVABLE_API_KEY);
      results.push(result);

    } else if (parsed.data.email_id) {
      // Single email mode — try attachments first, fall back to body
      const result = await processEmail(supabase, parsed.data.email_id, supabaseUrl, LOVABLE_API_KEY);
      results.push(...result);

    } else if (parsed.data.batch) {
      // Batch mode — find invoice-classified emails that don't have an invoice record yet
      const { data: invoiceEmails } = await supabase
        .from("emails")
        .select("id")
        .eq("classification", "invoice")
        .gte("received_at", "2026-01-01T00:00:00.000Z")
        .order("received_at", { ascending: false })
        .limit(20);

      if (invoiceEmails && invoiceEmails.length > 0) {
        // Filter to those without an invoice record
        const emailIds = invoiceEmails.map(e => e.id);
        const { data: existingInvoices } = await supabase
          .from("invoices")
          .select("email_id")
          .in("email_id", emailIds);
        const existingIds = new Set((existingInvoices || []).map(i => i.email_id));
        const toProcess = emailIds.filter(id => !existingIds.has(id)).slice(0, 5);

        for (const emailId of toProcess) {
          try {
            const result = await processEmail(supabase, emailId, supabaseUrl, LOVABLE_API_KEY);
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
    console.error("Extract invoice error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* ── Process a full email: try attachments, then fall back to body extraction ── */
async function processEmail(
  supabase: any, emailId: string, supabaseUrl: string, apiKey: string
): Promise<Array<{ email_id: string; attachment_id?: string; status: string; error?: string }>> {
  const results: Array<{ email_id: string; attachment_id?: string; status: string; error?: string }> = [];

  // Try document attachments first
  const { data: atts } = await supabase
    .from("email_attachments")
    .select("*")
    .eq("email_id", emailId)
    .eq("is_inline", false);

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
      const result = await processAttachment(supabase, att, supabaseUrl, apiKey);
      results.push(result);
      if (result.status === "extracted") extractedFromAttachment = true;
    }
  }

  // If no attachment extraction succeeded, try extracting from email body
  if (!extractedFromAttachment) {
    const result = await processEmailBody(supabase, emailId, supabaseUrl, apiKey);
    results.push(result);
  }

  return results;
}

/* ── Extract invoice from email body text (no PDF needed) ── */
async function processEmailBody(
  supabase: any, emailId: string, supabaseUrl: string, apiKey: string
): Promise<{ email_id: string; status: string; error?: string }> {
  const { data: email } = await supabase
    .from("emails")
    .select("subject, sender, company, body_clean_text, body_text, received_at")
    .eq("id", emailId)
    .single();

  if (!email) return { email_id: emailId, status: "error", error: "Email not found" };

  const bodyText = email.body_clean_text || email.body_text || "";
  if (!bodyText || bodyText.trim().length < 20) {
    return { email_id: emailId, status: "skipped", error: "No body text" };
  }

  // Check if content looks invoice-like
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

  return await callAiExtraction(
    supabase, emailId, null, null,
    bodyText.substring(0, 15000), emailContext,
    email.company, supabaseUrl, apiKey
  );
}

/* ── Process a single attachment ── */
async function processAttachment(
  supabase: any, att: any, supabaseUrl: string, apiKey: string
): Promise<{ email_id: string; attachment_id: string; status: string; error?: string }> {
  if (!att.storage_path) {
    return { email_id: att.email_id, attachment_id: att.id, status: "skipped", error: "No storage path" };
  }

  const { data: fileData, error: dlError } = await supabase.storage
    .from("email-attachments")
    .download(att.storage_path);

  if (dlError || !fileData) {
    return { email_id: att.email_id, attachment_id: att.id, status: "error", error: "Download failed" };
  }

  let extractedText = "";
  const mt = (att.mime_type || "").toLowerCase();

  if (mt.includes("pdf")) {
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const textContent = tryExtractPdfText(bytes);

    if (textContent && textContent.trim().length > 50) {
      extractedText = textContent;
    } else {
      // AI vision fallback for scanned PDFs
      let base64 = "";
      const chunkSize = 32768;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        base64 += String.fromCharCode.apply(null, Array.from(chunk));
      }
      base64 = btoa(base64);
      try {
        const visionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: "Extract ALL text from this PDF document. Return the complete text content, preserving structure (tables, line items, totals). Include all numbers, dates, names, and amounts." },
                { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
              ],
            }],
          }),
        });
        if (visionResponse.ok) {
          const visionData = await visionResponse.json();
          extractedText = visionData.choices?.[0]?.message?.content || "";
        } else {
          extractedText = textContent || "";
        }
      } catch {
        extractedText = textContent || "";
      }
    }
  } else {
    try { extractedText = await fileData.text(); } catch { extractedText = ""; }
  }

  if (!extractedText || extractedText.trim().length < 10) {
    await supabase.from("email_attachments").update({
      extracted_text: "(empty)", parse_error: "Could not extract text", document_type: "invoice",
    }).eq("id", att.id);
    return { email_id: att.email_id, attachment_id: att.id, status: "empty", error: "No text extracted" };
  }

  // Save extracted text
  await supabase.from("email_attachments").update({
    extracted_text: extractedText.substring(0, 50000), document_type: "invoice",
  }).eq("id", att.id);

  const pdfUrl = `${supabaseUrl}/storage/v1/object/public/email-attachments/${att.storage_path}`;
  const emailContext = await getEmailContext(supabase, att.email_id);
  const { data: parentEmail } = await supabase.from("emails").select("company").eq("id", att.email_id).single();

  return await callAiExtraction(
    supabase, att.email_id, att.id, pdfUrl,
    extractedText.substring(0, 15000), emailContext,
    parentEmail?.company, supabaseUrl, apiKey
  );
}

/* ── AI structured extraction ── */
async function callAiExtraction(
  supabase: any, emailId: string, attachmentId: string | null, pdfUrl: string | null,
  text: string, emailContext: string, emailCompany: string | null,
  supabaseUrl: string, apiKey: string
): Promise<{ email_id: string; attachment_id?: string; status: string; error?: string }> {
  const id = { email_id: emailId, ...(attachmentId ? { attachment_id: attachmentId } : {}) };

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: `Extract invoice data from this document.\n\nEmail context:\n${emailContext}\n\nDocument text:\n${text}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_invoice",
          description: "Extract structured invoice data from document text",
          parameters: {
            type: "object",
            properties: {
              supplier_name: { type: "string", description: "Name of the supplier/vendor" },
              invoice_number: { type: "string", description: "Invoice number/reference" },
              invoice_date: { type: "string", description: "Invoice date in YYYY-MM-DD format" },
              due_date: { type: "string", description: "Payment due date in YYYY-MM-DD format" },
              amount: { type: "number", description: "Total amount including VAT" },
              currency: { type: "string", enum: ["DKK", "EUR", "RON", "USD", "GBP", "SEK", "NOK"] },
              vat: { type: "number", description: "VAT/moms/TVA amount" },
              summary: { type: "string", description: "Brief summary of what the invoice is for, in English" },
              location: { type: "string", description: "Location/branch this invoice relates to" },
            },
            required: ["supplier_name"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_invoice" } },
    }),
  });

  if (!aiResponse.ok) {
    const errText = await aiResponse.text();
    console.error("AI extraction error:", aiResponse.status, errText);
    if (aiResponse.status === 429) return { ...id, status: "rate_limited" };
    return { ...id, status: "error", error: `AI ${aiResponse.status}` };
  }

  const aiData = await aiResponse.json();
  let invoiceData: any = null;

  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try { invoiceData = JSON.parse(toolCall.function.arguments); } catch {}
  }
  if (!invoiceData) {
    const content = aiData.choices?.[0]?.message?.content || "";
    try { invoiceData = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch {}
  }
  if (!invoiceData) {
    return { ...id, status: "error", error: "Could not parse AI response" };
  }

  // Apply company mapping rules
  const mapped = resolveCompany(invoiceData.supplier_name, invoiceData.location, emailCompany);

  // Determine confidence — permissive: save everything
  const hasAmount = invoiceData.amount != null;
  const hasSupplier = !!invoiceData.supplier_name;
  const confidence = hasAmount && hasSupplier ? 0.9 : hasSupplier ? 0.7 : 0.5;
  const status = confidence >= 0.7 ? "pending" : "needs_review";

  // Save attachment summary if applicable
  if (attachmentId) {
    await supabase.from("email_attachments").update({
      extracted_summary: invoiceData.summary || `Invoice from ${invoiceData.supplier_name}${invoiceData.amount ? ` - ${invoiceData.amount} ${invoiceData.currency || ""}` : ""}`,
      parse_error: null,
    }).eq("id", attachmentId);
  }

  // Upsert to email_invoices
  const { data: existing } = await supabase.from("email_invoices").select("id").eq("email_id", emailId).limit(1);
  const emailInvoiceRecord = {
    email_id: emailId,
    supplier_name: invoiceData.supplier_name || null,
    invoice_number: invoiceData.invoice_number || null,
    invoice_date: invoiceData.invoice_date || null,
    due_date: invoiceData.due_date || null,
    amount: invoiceData.amount || null,
    currency: invoiceData.currency || "DKK",
    vat: invoiceData.vat || null,
    attachment_present: !!attachmentId,
    company: mapped.company,
  };
  if (existing && existing.length > 0) {
    await supabase.from("email_invoices").update(emailInvoiceRecord).eq("id", existing[0].id);
  } else {
    await supabase.from("email_invoices").insert(emailInvoiceRecord);
  }

  // Upsert to invoices table
  const { data: existingInvoice } = await supabase.from("invoices").select("id").eq("email_id", emailId).limit(1);
  const invoiceRecord = {
    email_id: emailId,
    supplier_name: invoiceData.supplier_name || null,
    invoice_number: invoiceData.invoice_number || null,
    invoice_date: invoiceData.invoice_date || null,
    due_date: invoiceData.due_date || null,
    amount: invoiceData.amount || null,
    total_with_vat: invoiceData.amount || null,
    vat_amount: invoiceData.vat || null,
    currency: invoiceData.currency || "DKK",
    what_was_bought: invoiceData.summary || null,
    company: mapped.company,
    location: mapped.location,
    source_type: "email",
    status,
    confidence,
    pdf_url: pdfUrl,
  };
  if (existingInvoice && existingInvoice.length > 0) {
    await supabase.from("invoices").update(invoiceRecord).eq("id", existingInvoice[0].id);
  } else {
    await supabase.from("invoices").insert(invoiceRecord);
  }

  console.log(`Extracted invoice: ${invoiceData.supplier_name}, ${invoiceData.amount} ${invoiceData.currency}, confidence=${confidence}, status=${status}, pdf=${pdfUrl ? "YES" : "BODY"}`);
  return { ...id, status: "extracted" };
}

/* ── Helpers ── */
async function getEmailContext(supabase: any, emailId: string): Promise<string> {
  const { data: email } = await supabase
    .from("emails")
    .select("subject, sender, company, body_clean_text, received_at")
    .eq("id", emailId)
    .single();
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
