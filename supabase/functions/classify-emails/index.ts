import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Your job is to analyze each email and return structured JSON.

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
- invoice: Contains invoice, faktura, payment request, billing notice, supplier/utility/rent invoice
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
  "classification": "invoice|task|waiting|information|irrelevant",
  "company": "one of the companies above",
  "confidence": 0.0-1.0,
  "summary": "brief summary",
  "action_required": true/false,
  "needs_review": true/false,
  "review_reason": "reason or empty",
  "task": null or {
    "title": "task title",
    "priority": "urgent|high|normal|low",
    "status": "urgent|to_do|waiting|done",
    "due_date": "YYYY-MM-DD or null",
    "owner": "Alexandra",
    "notes": "context"
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email_ids, batch_size = 20 } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get unprocessed emails
    let query = supabase.from("emails").select("*").eq("processed", false).limit(batch_size);
    if (email_ids && email_ids.length > 0) {
      query = supabase.from("emails").select("*").in("id", email_ids);
    }
    
    const { data: emails, error: fetchError } = await query;
    if (fetchError) throw fetchError;
    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ message: "No unprocessed emails found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ email_id: string; status: string; error?: string }> = [];

    for (const email of emails) {
      try {
        const bodySnippet = (email.body_text || "").substring(0, 2000);
        const emailContent = `
Subject: ${email.subject || "(no subject)"}
From: ${email.sender || "unknown"}
Date: ${email.received_at || "unknown"}
${bodySnippet ? `Body:\n${bodySnippet}` : "(no body text available — classify based on subject and sender)"}
`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
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
        
        // Parse JSON from response (handle markdown code blocks)
        let parsed;
        try {
          const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsed = JSON.parse(jsonStr);
        } catch {
          console.error("Failed to parse AI response:", content);
          results.push({ email_id: email.id, status: "error", error: "Parse error" });
          continue;
        }

        // Validate company
        const company = COMPANIES.includes(parsed.company) ? parsed.company : "Unknown";
        const needsReview = company === "Unknown" || (parsed.confidence && parsed.confidence < 0.7) || parsed.needs_review;

        // Update email record
        await supabase.from("emails").update({
          classification: parsed.classification,
          company,
          summary: parsed.summary,
          action_required: parsed.action_required || false,
          confidence: parsed.confidence || 0,
          needs_review: needsReview,
          review_reason: needsReview ? (parsed.review_reason || "Low confidence or unknown company") : null,
          processed: true,
        }).eq("id", email.id);

        // Create task if present
        if (parsed.task && parsed.task.title) {
          await supabase.from("email_tasks").insert({
            email_id: email.id,
            title: parsed.task.title,
            company,
            priority: parsed.task.priority || "normal",
            status: parsed.task.status || "to_do",
            due_date: parsed.task.due_date || null,
            owner: parsed.task.owner || "Alexandra",
            notes: parsed.task.notes || null,
          });
        }

        // Create invoice if present
        if (parsed.invoice && parsed.classification === "invoice") {
          await supabase.from("email_invoices").insert({
            email_id: email.id,
            company,
            supplier_name: parsed.invoice.supplier_name || null,
            invoice_number: parsed.invoice.invoice_number || null,
            invoice_date: parsed.invoice.invoice_date || null,
            due_date: parsed.invoice.due_date || null,
            amount: parsed.invoice.amount || null,
            currency: parsed.invoice.currency || "DKK",
            vat: parsed.invoice.vat || null,
            attachment_present: parsed.invoice.attachment_present || false,
          });
        }

        results.push({ email_id: email.id, status: "classified" });
      } catch (e) {
        console.error(`Error processing email ${email.id}:`, e);
        results.push({ email_id: email.id, status: "error", error: e.message });
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.filter(r => r.status === "classified").length,
        errors: results.filter(r => r.status === "error").length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("Classification error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
