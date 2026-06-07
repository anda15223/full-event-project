// AI-generated action plan for a festival, based on all known info.
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
    const { festivalId } = await req.json();
    if (!festivalId) {
      return new Response(JSON.stringify({ error: "festivalId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const [
      { data: festival },
      { data: info },
      { data: contracts },
      { data: existing },
      { data: questions },
      { data: contacts },
      { data: accomm },
      { data: transport },
    ] = await Promise.all([
      sb.from("festivals").select("name, slug, start_date, end_date, address, city, setup_date, breakdown_date").eq("id", festivalId).maybeSingle(),
      sb.from("festival_info_summaries").select("raw_text, summary").eq("festival_id", festivalId).maybeSingle(),
      sb.from("festival_contracts").select("contract_status, notes, concept:concepts(name, slug)").eq("festival_id", festivalId).eq("is_active", true),
      sb.from("festival_action_items").select("title, status, priority, due_date, owner").eq("festival_id", festivalId).eq("is_draft", false).order("created_at", { ascending: false }).limit(80),
      sb.from("festival_open_questions").select("question, status, deadline").eq("festival_id", festivalId).eq("status", "open").limit(40),
      sb.from("festival_contacts").select("name, role, organization, email").eq("festival_id", festivalId).limit(40),
      sb.from("festival_accommodation").select("status, check_in_date, check_out_date, hotel_name").eq("festival_id", festivalId),
      sb.from("festival_transport").select("vehicle_type, status").eq("festival_id", festivalId),
    ]);

    const today = new Date(); today.setHours(0,0,0,0);
    const start = festival?.start_date ? new Date(`${festival.start_date}T00:00:00`) : null;
    const daysUntil = start ? Math.round((start.getTime() - today.getTime()) / 86400000) : null;

    const summaryText = info?.summary
      ? Object.entries(info.summary as Record<string, string[]>)
          .map(([k, v]) => `## ${k}\n- ${(v ?? []).join("\n- ")}`).join("\n\n")
      : "";

    const conceptLines = (contracts ?? []).map((c: any) => `- ${c.concept?.name ?? "?"} (${c.contract_status ?? "?"})`).join("\n");
    const existingLines = (existing ?? []).map((a: any) => `- [${a.status}/${a.priority}] ${a.title}${a.due_date ? ` (due ${a.due_date})` : ""}${a.owner ? ` — ${a.owner}` : ""}`).join("\n");
    const questionLines = (questions ?? []).map((q: any) => `- ${q.question}${q.deadline ? ` (deadline ${q.deadline})` : ""}`).join("\n");
    const contactLines = (contacts ?? []).map((c: any) => `- ${c.name}${c.role ? `, ${c.role}` : ""}${c.organization ? ` @ ${c.organization}` : ""}`).join("\n");
    const accommLines = (accomm ?? []).map((a: any) => `- ${a.hotel_name ?? "?"} [${a.status ?? "?"}] ${a.check_in_date ?? ""}→${a.check_out_date ?? ""}`).join("\n");
    const transportLines = (transport ?? []).map((t: any) => `- ${t.vehicle_type} [${t.status ?? "?"}]`).join("\n");

    const system = `You are a senior festival operations planner for The Fish Project (Danish street food at festivals).
Generate a concrete, prioritized ACTION PLAN for this festival based ONLY on the context below.
Output JSON: {"actions": [{"title": "...", "description": "...", "priority": "critical|high|medium|low", "due_date": "YYYY-MM-DD" | null, "owner": "Alexandra Artimon|Marius|Costel|Marko|Anca" | null, "category": "..."}]}

Rules:
- Propose 8–20 actions covering: arrival/load-in, setup, staff/accommodation, transport, power/equipment, supplies, safety, comms with festival, breakdown, post-festival.
- Skip anything already covered by existing action items (do not duplicate).
- Use the festival info text to derive concrete deadlines (e.g. "vehicle list due X").
- due_date must be before festival start where possible; null if unknown.
- Be specific: include WHO to contact or WHAT to bring when known from the info.
- Keep titles short (max ~10 words). Description: 1–2 sentences with the why/how.`;

    const userContext = `FESTIVAL: ${festival?.name} (${festival?.start_date} → ${festival?.end_date})
Location: ${festival?.address ?? ""} ${festival?.city ?? ""}
Setup begins: ${festival?.setup_date ?? "?"} · Breakdown: ${festival?.breakdown_date ?? "?"}
Days until start: ${daysUntil ?? "?"} · Today: ${today.toISOString().slice(0,10)}

ACTIVE CONCEPTS:
${conceptLines || "(none)"}

EXISTING ACTION ITEMS (do NOT duplicate):
${existingLines || "(none)"}

OPEN QUESTIONS:
${questionLines || "(none)"}

KEY CONTACTS:
${contactLines || "(none)"}

ACCOMMODATION:
${accommLines || "(none)"}

TRANSPORT:
${transportLines || "(none)"}

FESTIVAL INFO (AI summary):
${summaryText || "(none)"}

FESTIVAL INFO (raw, truncated):
${(info?.raw_text ?? "").slice(0, 12000)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContext },
        ],
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
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { actions: [] }; }

    const allowedPriority = new Set(["critical", "high", "medium", "low"]);
    const allowedOwner = new Set(["alexandra artimon", "marius", "costel", "marko", "anca"]);
    const actions = (parsed.actions ?? []).map((a: any) => ({
      title: String(a.title ?? "").slice(0, 200),
      description: a.description ? String(a.description).slice(0, 1000) : null,
      priority: allowedPriority.has(a.priority) ? a.priority : "medium",
      due_date: a.due_date && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date) ? a.due_date : null,
      owner: a.owner && allowedOwner.has(String(a.owner).toLowerCase()) ? String(a.owner).toLowerCase() : null,
      category: a.category ? String(a.category).slice(0, 60) : null,
    })).filter((a: any) => a.title);

    return new Response(JSON.stringify({ actions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-action-plan error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
