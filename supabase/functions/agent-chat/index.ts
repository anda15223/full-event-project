import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the AI Suite Assistant — an intelligent command center for a business email management system.

You have access to these agents:
1. EMAIL MEMORY AGENT (blue) — knows all stored emails, senders, companies, languages
2. EMAIL ORGANIZER AGENT (purple) — classifies emails as invoice/task/waiting/information/irrelevant
3. INVOICE INTELLIGENCE AGENT (green) — extracts invoice data: supplier, amount, VAT, due dates
4. TASK & REPLY AGENT (orange) — manages email-derived tasks, deadlines, draft replies
5. NON-EMAIL TASK AGENT (gray) — handles manual/internal tasks

When the user asks a question:
- Identify which agent should handle it
- Provide clear, structured answers
- Use markdown formatting
- If asked about data, query the database context provided
- Always mention which agent is responding

Format your responses cleanly with:
- Bold headers for sections
- Bullet points for lists
- Numbers for amounts/counts
- Tables when comparing data

You are helpful, professional, and concise. You speak like a smart business assistant.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build context from database if available
    let contextMessage = "";
    if (context) {
      contextMessage = `\n\nCurrent database context:\n- Total emails: ${context.totalEmails || 0}\n- Pending emails: ${context.pendingEmails || 0}\n- Total invoices: ${context.totalInvoices || 0}\n- Total tasks: ${context.totalTasks || 0}\n- Pending review: ${context.reviewCount || 0}\n- Companies: ${(context.companies || []).join(", ") || "none"}\n- Recent senders: ${(context.recentSenders || []).join(", ") || "none"}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + contextMessage },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
