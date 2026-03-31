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

const EXTRACTION_PROMPT = `You are a document analysis expert specializing in invoice extraction.
You receive text extracted from a PDF/document attachment from a business email.

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
    const results: Array<{ email_id: string; attachment_id: string; status: string; error?: string }> = [];

    // Determine which attachments to process
    let attachmentsToProcess: any[] = [];

    if (parsed.data.attachment_id) {
      // Single attachment
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
      attachmentsToProcess = [att];
    } else if (parsed.data.email_id) {
      // All attachments for an email
      const { data: atts } = await supabase
        .from("email_attachments")
        .select("*")
        .eq("email_id", parsed.data.email_id)
        .eq("is_inline", false)
        .eq("parse_status", "stored");
      attachmentsToProcess = atts || [];
    } else if (parsed.data.batch) {
      // Batch: find invoice emails with stored attachments that haven't been extracted yet
      const { data: invoiceEmails } = await supabase
        .from("emails")
        .select("id")
        .eq("classification", "invoice")
        .eq("has_attachments", true)
        .gte("received_at", "2026-02-01T00:00:00.000Z")
        .limit(5);

      if (invoiceEmails && invoiceEmails.length > 0) {
        const emailIds = invoiceEmails.map(e => e.id);
        const { data: atts } = await supabase
          .from("email_attachments")
          .select("*")
          .in("email_id", emailIds)
          .eq("is_inline", false)
          .eq("parse_status", "stored")
          .is("extracted_text", null);
        attachmentsToProcess = atts || [];
      }
    }

    if (attachmentsToProcess.length === 0) {
      return new Response(JSON.stringify({ message: "No attachments to process", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter to document types only
    const docAttachments = attachmentsToProcess.filter((att: any) => {
      const mt = (att.mime_type || "").toLowerCase();
      const fn = (att.filename || "").toLowerCase();
      return mt.includes("pdf") || mt.includes("word") || mt.includes("spreadsheet") ||
             mt.includes("excel") || fn.endsWith(".pdf") || fn.endsWith(".docx") ||
             fn.endsWith(".xlsx") || fn.endsWith(".xls");
    });

    if (docAttachments.length === 0) {
      return new Response(JSON.stringify({ message: "No document attachments found", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const att of docAttachments) {
      try {
        // Step 1: Download file from storage
        if (!att.storage_path) {
          results.push({ email_id: att.email_id, attachment_id: att.id, status: "skipped", error: "No storage path" });
          continue;
        }

        const { data: fileData, error: dlError } = await supabase.storage
          .from("email-attachments")
          .download(att.storage_path);

        if (dlError || !fileData) {
          results.push({ email_id: att.email_id, attachment_id: att.id, status: "error", error: "Download failed" });
          continue;
        }

        // Step 2: Extract text from PDF
        let extractedText = "";
        const mt = (att.mime_type || "").toLowerCase();

        if (mt.includes("pdf")) {
          // Convert PDF to base64 for AI vision processing
          const arrayBuffer = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          // Try text extraction from PDF structure first
          // For scanned PDFs, we'll use AI vision
          const textContent = await tryExtractPdfText(bytes);

          if (textContent && textContent.trim().length > 50) {
            extractedText = textContent;
          } else {
            // Use AI vision to read the PDF (send as base64 image)
            // Chunk the conversion to avoid stack overflow on large files
            let base64 = "";
            const chunkSize = 32768;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
              base64 += String.fromCharCode.apply(null, Array.from(chunk));
            }
            base64 = btoa(base64);
            const visionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: "Extract ALL text from this PDF document. Return the complete text content, preserving structure (tables, line items, totals). Include all numbers, dates, names, and amounts." },
                      {
                        type: "image_url",
                        image_url: { url: `data:application/pdf;base64,${base64}` },
                      },
                    ],
                  },
                ],
              }),
            });

            if (visionResponse.ok) {
              const visionData = await visionResponse.json();
              extractedText = visionData.choices?.[0]?.message?.content || "";
            } else {
              console.error("Vision API error:", visionResponse.status);
              extractedText = textContent || "";
            }
          }
        } else {
          // For non-PDF documents, try reading as text
          try {
            extractedText = await fileData.text();
          } catch {
            extractedText = "";
          }
        }

        if (!extractedText || extractedText.trim().length < 10) {
          await supabase.from("email_attachments").update({
            extracted_text: "(empty)",
            parse_error: "Could not extract text from document",
            document_type: "invoice",
          }).eq("id", att.id);
          results.push({ email_id: att.email_id, attachment_id: att.id, status: "empty", error: "No text extracted" });
          continue;
        }

        // Step 3: Save extracted text
        await supabase.from("email_attachments").update({
          extracted_text: extractedText.substring(0, 50000),
          document_type: "invoice",
        }).eq("id", att.id);

        // Step 4: AI structured extraction using tool calling
        const emailContext = await getEmailContext(supabase, att.email_id);

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [
              { role: "system", content: EXTRACTION_PROMPT },
              {
                role: "user",
                content: `Extract invoice data from this document.\n\nEmail context:\n${emailContext}\n\nDocument text:\n${extractedText.substring(0, 15000)}`,
              },
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

          if (aiResponse.status === 429) {
            results.push({ email_id: att.email_id, attachment_id: att.id, status: "rate_limited" });
            break; // Stop processing more to avoid rate limits
          }

          results.push({ email_id: att.email_id, attachment_id: att.id, status: "error", error: `AI ${aiResponse.status}` });
          continue;
        }

        const aiData = await aiResponse.json();
        let invoiceData: any = null;

        // Parse tool call response
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          try {
            invoiceData = JSON.parse(toolCall.function.arguments);
          } catch {
            console.error("Failed to parse tool call args:", toolCall.function.arguments);
          }
        }

        if (!invoiceData) {
          // Fallback: try parsing content as JSON
          const content = aiData.choices?.[0]?.message?.content || "";
          try {
            invoiceData = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
          } catch {
            results.push({ email_id: att.email_id, attachment_id: att.id, status: "error", error: "Could not parse AI response" });
            continue;
          }
        }

        // Step 5: Save to email_attachments (summary)
        await supabase.from("email_attachments").update({
          extracted_summary: invoiceData.summary || `Invoice from ${invoiceData.supplier_name}${invoiceData.amount ? ` - ${invoiceData.amount} ${invoiceData.currency || ""}` : ""}`,
          parse_error: null,
        }).eq("id", att.id);

        // Step 6: Upsert to email_invoices
        // Check if invoice already exists for this email
        const { data: existing } = await supabase
          .from("email_invoices")
          .select("id")
          .eq("email_id", att.email_id)
          .limit(1);

        const invoiceRecord = {
          email_id: att.email_id,
          supplier_name: invoiceData.supplier_name || null,
          invoice_number: invoiceData.invoice_number || null,
          invoice_date: invoiceData.invoice_date || null,
          due_date: invoiceData.due_date || null,
          amount: invoiceData.amount || null,
          currency: invoiceData.currency || "DKK",
          vat: invoiceData.vat || null,
          attachment_present: true,
        };

        // Also get company from parent email
        const { data: parentEmail } = await supabase
          .from("emails")
          .select("company")
          .eq("id", att.email_id)
          .single();

        if (parentEmail?.company) {
          (invoiceRecord as any).company = parentEmail.company;
        }

        if (existing && existing.length > 0) {
          await supabase.from("email_invoices").update(invoiceRecord).eq("id", existing[0].id);
        } else {
          await supabase.from("email_invoices").insert(invoiceRecord);
        }

        results.push({ email_id: att.email_id, attachment_id: att.id, status: "extracted" });
        console.log(`Extracted invoice from ${att.filename}: ${invoiceData.supplier_name}, ${invoiceData.amount} ${invoiceData.currency}`);

      } catch (err) {
        console.error(`Error processing attachment ${att.id}:`, err);
        results.push({
          email_id: att.email_id,
          attachment_id: att.id,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
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

/* Helper: get email context for better extraction */
async function getEmailContext(supabase: any, emailId: string): Promise<string> {
  const { data: email } = await supabase
    .from("emails")
    .select("subject, sender, company, body_clean_text")
    .eq("id", emailId)
    .single();

  if (!email) return "";
  return [
    `Subject: ${email.subject || ""}`,
    `From: ${email.sender || ""}`,
    `Company: ${email.company || "Unknown"}`,
    email.body_clean_text ? `Email body excerpt: ${email.body_clean_text.substring(0, 500)}` : "",
  ].filter(Boolean).join("\n");
}

/* Helper: try to extract text from PDF bytes (basic text extraction) */
function tryExtractPdfText(bytes: Uint8Array): string {
  try {
    // Basic PDF text extraction - look for text streams
    const text = new TextDecoder("latin1").decode(bytes);
    const textParts: string[] = [];

    // Extract text between BT and ET markers (PDF text objects)
    const btEtRegex = /BT\s([\s\S]*?)ET/g;
    let match;
    while ((match = btEtRegex.exec(text)) !== null) {
      const block = match[1];
      // Extract text from Tj and TJ operators
      const tjRegex = /\((.*?)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        textParts.push(tjMatch[1]);
      }
      // TJ array operator
      const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
      let tjArrMatch;
      while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
        const items = tjArrMatch[1];
        const strRegex = /\((.*?)\)/g;
        let strMatch;
        while ((strMatch = strRegex.exec(items)) !== null) {
          textParts.push(strMatch[1]);
        }
      }
    }

    return textParts.join(" ").replace(/\\n/g, "\n").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}
