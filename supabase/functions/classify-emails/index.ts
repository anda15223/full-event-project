import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  email_ids: z.array(z.string().uuid()).optional(),
  batch_size: z.number().int().min(1).max(20).optional(),
});

const COMPANIES = [
  "M.C.A. Holding ApS",
  "MCA Trading ApS",
  "The Fish Project ApS",
  "Blue Fish ApS",
  "Aegean ApS",
  "Athos ApS",
  "Romania",
];

const SYSTEM_PROMPT = `You are an AI email classification agent for a Danish business group with multiple companies.
You MUST support emails in English, Danish, and Romanian natively.

Your job is to analyze each email and return structured JSON. ALL output text (summary, task titles, notes, review reasons) MUST be in clear business English regardless of the original email language.

LANGUAGE DETECTION:
- Detect the email language: "en" (English), "da" (Danish), "ro" (Romanian), "unknown" if unclear

KEYWORD AWARENESS (multi-language):
- Invoice: invoice, payment, bill (EN) | faktura, betaling (DA) | factură, plată (RO)
- Task: please confirm, action required (EN) | venligst bekræft, handling nødvendig (DA) | te rog confirmă, necesar (RO)

COMPANIES (assign exactly one):
- M.C.A. Holding ApS
- MCA Trading ApS
- The Fish Project ApS
- Blue Fish ApS
- Aegean ApS
- Athos ApS
- Romania (all Romanian entities grouped here)
- Unknown (when unsure)

CLASSIFICATION categories:
- invoice: Contains invoice, faktura, factură, payment request, billing notice, supplier/utility/rent invoice
- task: Requires action (reply, approval, missing document, deadline, follow-up, booking change, supplier/legal/admin request)
- waiting: Next step depends on another person/supplier/authority
- information: Useful but no immediate action needed
- irrelevant: Spam, newsletters, promotions, non-business

COMPANY ASSIGNMENT RULES:
- Use company name in body/header, CVR, sender identity, context, signature, language, known supplier relationships
- If Romanian company/supplier/accountant/authority/property/holding/legal → assign "Romania"
- If uncertain → assign "Unknown" and set needs_review=true

PRIORITY RULES:
- urgent: deadline within 48h or money/legal risk
- high: important action required soon
- normal: standard operational follow-up
- low: useful but non-urgent

Return ONLY valid JSON matching this schema:
{
  "language": "en|da|ro|unknown",
  "classification": "invoice|task|waiting|information|irrelevant",
  "company": "one of the companies above",
  "confidence": 0.0-1.0,
  "summary": "brief summary IN ENGLISH",
  "action_required": true/false,
  "needs_review": true/false,
  "review_reason": "reason or empty (IN ENGLISH)",
  "task": null or {
    "title": "task title IN ENGLISH",
    "priority": "urgent|high|normal|low",
    "status": "urgent|to_do|waiting|done",
    "due_date": "YYYY-MM-DD or null",
    "owner": "Alexandra",
    "notes": "context IN ENGLISH"
  },
  "invoice": null or {
    "supplier_name": "name",
    "invoice_number": "number or null",
    "invoice_date": "YYYY-MM-DD or null",
    "due_date": "YYYY-MM-DD or null",
    "amount": number or null,
    "currency": "DKK/EUR/RON etc",
    "vat": number or null,
    "attachment_present": true/false
  }
}`;

/* ── AI Router: choose the right model per email ─────────── */

function chooseModel(email: any, attachments: any[]): string {
  const body = (email.body_clean_text || email.body_text || "").toLowerCase();
  const subject = (email.subject || "").toLowerCase();
  const hasAttachments = email.has_attachments || attachments.length > 0;
  const hasPdfOrDoc = attachments.some((a: any) => {
    const mt = (a.mime_type || "").toLowerCase();
    const fn = (a.filename || "").toLowerCase();
    return mt.includes("pdf") || mt.includes("word") || fn.endsWith(".pdf") || fn.endsWith(".docx");
  });
  const bodyLength = body.length;
  const lang = (email.language || "").toLowerCase();

  // Invoice keywords in 3 languages
  const invoiceKeywords = /faktura|factură|factura|invoice|payment due|betaling|plată/;
  const looksLikeInvoice = invoiceKeywords.test(body) || invoiceKeywords.test(subject);

  // DEEP MODEL: Claude-equivalent (gemini-2.5-pro) for complex cases
  if (hasPdfOrDoc) return "google/gemini-2.5-pro";
  if (looksLikeInvoice && hasAttachments) return "google/gemini-2.5-pro";
  if (bodyLength > 3000) return "google/gemini-2.5-pro";
  if ((lang === "da" || lang === "ro") && bodyLength > 800) return "google/gemini-2.5-pro";

  // FAST MODEL: GPT-equivalent (gemini-3-flash) for simple cases
  return "google/gemini-3-flash-preview";
}

/* ── Agent Assignment: route email to the right specialized agent ── */
function deriveAssignedAgent(classification: any, company: string): string {
  // Romania agent takes priority for Romanian operations
  if (company === "Romania") return "romania_agent";
  
  // Route by classification
  switch (classification.classification) {
    case "invoice": return "invoice_agent";
    case "task": {
      // Sub-route tasks to accounting/system vs operational vs general task
      const summary = (classification.summary || "").toLowerCase();
      const taskNotes = (classification.task?.notes || "").toLowerCase();
      const combined = summary + " " + taskNotes;
      if (/renew|system|integration|e-conomic|bank|accounting|finance|admin/.test(combined)) {
        return "accounting_agent";
      }
      if (/event|festival|zoo|partner|logistics|booking|venue|supplier coordination/.test(combined)) {
        return "operational_agent";
      }
      return "task_agent";
    }
    case "waiting": return classification.action_required ? "task_agent" : "fyi_agent";
    case "information": return "fyi_agent";
    case "irrelevant": return "ignore_agent";
    default: return "task_agent";
  }
}

function looksBrokenContent(bodyText?: string | null, bodyHtml?: string | null): boolean {
  const sample = (bodyHtml || bodyText || "").trim();
  if (!sample) return true;
  if (/^[A-Za-z0-9+/=\r\n\s]{180,}$/.test(sample) && !/[<>]/.test(sample)) return true;
  const questionMarks = (sample.match(/\?/g) || []).length;
  if (sample.length > 80 && questionMarks > Math.max(12, Math.floor(sample.length * 0.18))) return true;
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = RequestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email_ids, batch_size = 5 } = parsed.data;
    const safeBatchSize = Math.min(batch_size, 5);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from("emails")
      .select("*")
      .eq("processed", false)
      .order("received_at", { ascending: false })
      .limit(safeBatchSize);

    if (email_ids && email_ids.length > 0) {
      query = supabase.from("emails").select("*").in("id", email_ids);
    }

    const { data: emails, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ message: "No unprocessed emails found", processed: 0, errors: 0, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ email_id: string; status: string; error?: string }> = [];

    for (const email of emails) {
      try {
        let bodyText = email.body_text as string | null;
        let bodyHtml = email.body_html as string | null;
        let bodyCleanText = email.body_clean_text as string | null;
        let parseStatus = email.parse_status as string | null;

        const needsParse =
          parseStatus !== "parsed" ||
          looksBrokenContent(bodyText, bodyHtml) ||
          !(bodyCleanText || bodyText || bodyHtml);

        if (needsParse) {
          const { data: parsedBody, error: parseError } = await supabase.functions.invoke("fetch-email-body", {
            body: { email_id: email.id, force: true },
          });

          if (parseError) {
            results.push({ email_id: email.id, status: "error", error: `Parse failed: ${parseError.message}` });
            continue;
          }

          bodyText = parsedBody?.body_text || null;
          bodyHtml = parsedBody?.body_html || null;
          bodyCleanText = parsedBody?.body_clean_text || null;
          parseStatus = parsedBody?.parse_status || null;
        }

        if (parseStatus !== "parsed" && !(bodyCleanText || bodyText || bodyHtml)) {
          results.push({ email_id: email.id, status: "error", error: "Email body parsing incomplete" });
          continue;
        }

        const { data: attachments } = await supabase
          .from("email_attachments")
          .select("filename, mime_type, extracted_text, extracted_summary, document_type, is_inline")
          .eq("email_id", email.id)
          .eq("is_inline", false)
          .limit(5);

        const attachmentContext = (attachments || [])
          .map((attachment) => {
            const detail = attachment.extracted_summary || attachment.extracted_text || "";
            return [
              `Filename: ${attachment.filename || "Unnamed"}`,
              `MIME type: ${attachment.mime_type || "unknown"}`,
              attachment.document_type ? `Document type: ${attachment.document_type}` : null,
              detail ? `Content:\n${detail.slice(0, 1500)}` : null,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .filter(Boolean)
          .join("\n\n---\n\n");

        const bodySource = (bodyCleanText || bodyText || "").substring(0, 5000);
        const emailContent = [
          `Subject: ${email.subject || "(no subject)"}`,
          `From: ${email.sender || "unknown"}`,
          `Date: ${email.received_at || "unknown"}`,
          `Has Attachments: ${email.has_attachments ? "yes" : "no"}`,
          bodySource ? `Body:\n${bodySource}` : "(no parsed body available)",
          attachmentContext ? `Attachment context:\n${attachmentContext}` : null,
        ]
          .filter(Boolean)
          .join("\n\n");

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: chooseModel(email, attachments || []),
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: `Classify this email:\n\n${emailContent}` },
            ],
          }),
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error("AI error:", aiResponse.status, errText);
          results.push({ email_id: email.id, status: "error", error: `AI ${aiResponse.status}` });
          continue;
        }

        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || "";

        let classification;
        try {
          const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          classification = JSON.parse(jsonStr);
        } catch {
          console.error("Failed to parse AI response:", content);
          results.push({ email_id: email.id, status: "error", error: "Parse error" });
          continue;
        }

        const company = COMPANIES.includes(classification.company) ? classification.company : "Unknown";
        const needsReview = company === "Unknown" || (classification.confidence && classification.confidence < 0.7) || classification.needs_review;

        const modelUsed = chooseModel(email, attachments || []);

        // Determine assigned agent based on classification + company
        const assignedAgent = deriveAssignedAgent(classification, company);

        await supabase.from("emails").update({
          classification: classification.classification,
          company,
          summary: classification.summary,
          action_required: classification.action_required || false,
          confidence: classification.confidence || 0,
          needs_review: needsReview,
          review_reason: needsReview ? (classification.review_reason || "Low confidence or unknown company") : null,
          processed: true,
          language: classification.language || "unknown",
          model_used: modelUsed,
          assigned_agent: assignedAgent,
          reader_status: "parsed",
          router_status: "routed",
        }).eq("id", email.id);

        // FALLBACK: If fast model gave low confidence, retry with deep model
        if (modelUsed.includes("flash") && classification.confidence && classification.confidence < 0.7) {
          console.log(`Low confidence (${classification.confidence}) from fast model for ${email.id}, retrying with deep model`);
          try {
            const retryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-pro",
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  { role: "user", content: `Classify this email:\n\n${emailContent}` },
                ],
              }),
            });
            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              const retryContent = retryData.choices?.[0]?.message?.content || "";
              const retryJson = JSON.parse(retryContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
              if (retryJson.confidence && retryJson.confidence > classification.confidence) {
                const retryCompany = COMPANIES.includes(retryJson.company) ? retryJson.company : "Unknown";
                const retryNeedsReview = retryCompany === "Unknown" || retryJson.confidence < 0.7 || retryJson.needs_review;
                await supabase.from("emails").update({
                  classification: retryJson.classification,
                  company: retryCompany,
                  summary: retryJson.summary,
                  action_required: retryJson.action_required || false,
                  confidence: retryJson.confidence,
                  needs_review: retryNeedsReview,
                  review_reason: retryNeedsReview ? (retryJson.review_reason || "Low confidence") : null,
                  language: retryJson.language || "unknown",
                  model_used: "google/gemini-2.5-pro",
                }).eq("id", email.id);
                classification = retryJson;
              }
            }
          } catch (retryErr) {
            console.error("Deep model retry failed:", retryErr);
          }
        }

        if (classification.task && classification.task.title) {
          await supabase.from("email_tasks").insert({
            email_id: email.id,
            title: classification.task.title,
            company,
            priority: classification.task.priority || "normal",
            status: classification.task.status || "to_do",
            due_date: classification.task.due_date || null,
            owner: classification.task.owner || "Alexandra",
            notes: classification.task.notes || null,
          });
        }

        if (classification.invoice && classification.classification === "invoice") {
          await supabase.from("email_invoices").insert({
            email_id: email.id,
            company,
            supplier_name: classification.invoice.supplier_name || null,
            invoice_number: classification.invoice.invoice_number || null,
            invoice_date: classification.invoice.invoice_date || null,
            due_date: classification.invoice.due_date || null,
            amount: classification.invoice.amount || null,
            currency: classification.invoice.currency || "DKK",
            vat: classification.invoice.vat || null,
            attachment_present: classification.invoice.attachment_present || false,
          });
        }

        results.push({ email_id: email.id, status: "classified" });
      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error);
        results.push({ email_id: email.id, status: "error", error: error instanceof Error ? error.message : "Unknown error" });
      }
    }

    return new Response(JSON.stringify({
      processed: results.filter((result) => result.status === "classified").length,
      errors: results.filter((result) => result.status === "error").length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Classification error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});