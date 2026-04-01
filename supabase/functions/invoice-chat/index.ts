import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  invoice_id: z.string().uuid(),
  message: z.string().min(1).max(2000),
  chat_history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).optional().default([]),
});

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

    const { invoice_id, message, chat_history } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const claudeKey = Deno.env.get("aiagents") || Deno.env.get("AIAGENTS");
    if (!claudeKey) {
      return new Response(JSON.stringify({ error: "Claude API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices").select("*").eq("id", invoice_id).single();
    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load source email if available
    let email: any = null;
    if (invoice.email_id) {
      const { data } = await supabase
        .from("emails")
        .select("sender, subject, body_clean_text, company, classification")
        .eq("id", invoice.email_id).single();
      email = data;
    }

    const systemPrompt = `You are an invoice intelligence assistant embedded in a business operating system for a Danish multi-company food and restaurant group.

You have access to this specific invoice:
${JSON.stringify(invoice, null, 2)}

${email ? `Original email:
From: ${email.sender}
Subject: ${email.subject}
Body: ${(email.body_clean_text || "").substring(0, 800)}` : "No source email available."}

KNOWN COMPANIES (legal entities):
- The Fish Project ApS
- Blue Fish ApS
- Aegean ApS
- Athos ApS
- MCA Trading ApS
- M.C.A. Holding ApS
- Romania (all Romanian entities)

Your job:
1. Understand what the user is telling you about this invoice
2. Determine what action to take
3. Respond conversationally AND include a structured action

ALWAYS respond with valid JSON (no markdown fences):
{
  "reply": "conversational reply to the user — explain what you did",
  "action": "NONE|IGNORE|NOT_INVOICE|FIX_COMPANY|FIX_SUPPLIER|FIX_LOCATION|FIX_AMOUNT|MARK_CREDIT|MARK_PAID|UPDATE_FIELDS",
  "updates": {},
  "brain_rule": null
}

For "updates": include any invoice fields to change, e.g. {"company": "Athos ApS", "location": "..."}.

For "brain_rule": if this correction should be remembered permanently, include:
{
  "key_name": "snake_case_unique_key",
  "display_name": "Human readable name",
  "category": "extraction_rule|company_rule|ignore_rule|supplier_rule",
  "content": "Plain English description of the rule",
  "structured_data": {"pattern": "...", "action": "..."}
}

If "action" is "NOT_INVOICE" or "IGNORE", the invoice will be removed.
If "action" is "MARK_CREDIT", amounts will be made negative automatically.
If "action" is "MARK_PAID", status will be set to paid.
For "NONE", no changes are made (just conversation).

Be concise, friendly, and decisive. Execute immediately — no confirmation needed.`;

    // Call Claude
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": claudeKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          system: systemPrompt,
          messages: [
            ...chat_history,
            { role: "user", content: message },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Claude API error ${response.status}: ${errText.substring(0, 200)}`);
      }

      const claudeResponse = await response.json();
      const responseText = claudeResponse.content?.[0]?.text || "";

      // Parse Claude's JSON response
      let parsed_response: any;
      try {
        // Clean markdown fences if present
        let cleaned = responseText
          .replace(/```json\s*/gi, "")
          .replace(/```\s*/g, "")
          .trim();
        const jsonStart = cleaned.search(/\{/);
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
        }
        parsed_response = JSON.parse(cleaned);
      } catch {
        // If JSON parse fails, treat as plain text reply
        parsed_response = {
          reply: responseText,
          action: "NONE",
          updates: {},
          brain_rule: null,
        };
      }

      const { action, updates, brain_rule } = parsed_response;
      let actionTaken = false;

      // Execute action
      if (action === "NOT_INVOICE" || action === "IGNORE") {
        await supabase.from("invoices").delete().eq("id", invoice_id);
        if (invoice.email_id) {
          await supabase.from("emails").update({
            router_status: "ignored",
            classification: "not_invoice",
          }).eq("id", invoice.email_id);
        }
        actionTaken = true;
      } else if (action === "MARK_CREDIT") {
        await supabase.from("invoices").update({
          amount: -Math.abs(invoice.amount || 0),
          vat_amount: -Math.abs(invoice.vat_amount || 0),
          total_with_vat: -Math.abs(invoice.total_with_vat || 0),
          category: "credit_note",
          status: "credit",
          ...(updates || {}),
        }).eq("id", invoice_id);
        actionTaken = true;
      } else if (action === "MARK_PAID") {
        const paidDate = new Date().toISOString().split("T")[0];
        await supabase.from("invoices").update({
          status: "paid",
          overdue_flag: false,
          ...(updates || {}),
        }).eq("id", invoice_id);
        // Also create ledger entry
        await supabase.from("ledger").insert({
          invoice_id: invoice_id,
          supplier_name: invoice.supplier_name,
          amount: invoice.amount,
          vat_amount: invoice.vat_amount,
          total_with_vat: invoice.total_with_vat,
          company: invoice.company,
          location: invoice.location,
          what_was_bought: invoice.what_was_bought,
          paid_date: paidDate,
          payment_reference: invoice.payment_reference,
          invoice_number: invoice.invoice_number,
        });
        actionTaken = true;
      } else if (updates && Object.keys(updates).length > 0) {
        await supabase.from("invoices").update(updates).eq("id", invoice_id);
        actionTaken = true;
      }

      // Write brain rule if provided
      let brainRuleSaved = false;
      if (brain_rule?.key_name && brain_rule?.content) {
        const { error: brainErr } = await supabase.from("brain_entries").upsert({
          key_name: brain_rule.key_name,
          display_name: brain_rule.display_name || brain_rule.key_name,
          category: brain_rule.category || "extraction_rule",
          content: brain_rule.content,
          structured_data: brain_rule.structured_data || {},
          source: "user_correction",
          is_active: true,
          tags: brain_rule.tags || [],
        }, { onConflict: "key_name" });

        if (!brainErr) brainRuleSaved = true;

        // Also log as supplier correction for learning
        if (actionTaken && invoice.supplier_name) {
          await supabase.from("supplier_corrections").insert({
            supplier_name: invoice.supplier_name,
            invoice_id: invoice_id,
            field_corrected: action,
            old_value: JSON.stringify(invoice),
            new_value: JSON.stringify(updates || {}),
          });
        }
      }

      return new Response(JSON.stringify({
        reply: parsed_response.reply,
        action,
        action_taken: actionTaken,
        brain_rule_saved: brainRuleSaved,
        brain_rule_name: brain_rule?.display_name || null,
        invoice_deleted: action === "NOT_INVOICE" || action === "IGNORE",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } finally {
      clearTimeout(timeout);
    }

  } catch (error) {
    console.error("Invoice chat error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
