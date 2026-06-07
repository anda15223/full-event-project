// Q&A over the festival info text the AI already parsed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { festivalId, question, history = [] } = await req.json();
    if (!festivalId || !question) {
      return new Response(JSON.stringify({ error: "festivalId and question required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: row } = await sb
      .from("festival_info_summaries")
      .select("raw_text, summary")
      .eq("festival_id", festivalId)
      .maybeSingle();

    if (!row?.raw_text && !row?.summary) {
      return new Response(JSON.stringify({
        answer: "No festival info has been parsed yet. Upload or paste the festival info first.",
        quote: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const raw = (row?.raw_text ?? "").slice(0, 120000);
    const summaryText = row?.summary
      ? Object.entries(row.summary as Record<string, string[]>)
          .map(([k, v]) => `## ${k}\n- ${(v ?? []).join("\n- ")}`)
          .join("\n\n")
      : "";

    const system = `You answer questions about a festival, using ONLY the SOURCE TEXT and SUMMARY below.
Rules:
- Answer briefly and directly (1-3 sentences).
- Then quote the EXACT paragraph(s) from the SOURCE TEXT that contain the answer, verbatim. Do not invent or paraphrase.
- If the answer is not in the text, say "Not in the festival info." and leave the quote empty.
- Format your reply as JSON: {"answer": "...", "quote": "..."}.

=== SOURCE TEXT ===
${raw}

=== AI SUMMARY ===
${summaryText}`;

    const messages = [
      { role: "system", content: system },
      ...history.slice(-8).map((m: any) => ({ role: m.role, content: String(m.content ?? "") })),
      { role: "user", content: String(question) },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limited — try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits required." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      console.error("AI error", aiResp.status, txt);
      return new Response(JSON.stringify({ error: "AI service error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const json = await aiResp.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { answer?: string; quote?: string } = {};
    try { parsed = JSON.parse(content); } catch { parsed = { answer: content, quote: "" }; }

    return new Response(JSON.stringify({
      answer: parsed.answer ?? "",
      quote: parsed.quote ?? "",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("festival-info-chat error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
