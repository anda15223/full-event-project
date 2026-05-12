// Setup planner AI chat — answers planning questions with festival context.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Date(d).toISOString().slice(0, 16).replace("T", " "); } catch { return String(d); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { festivalId, conversationHistory = [], userMessage } = await req.json();
    if (!festivalId || !userMessage) {
      return new Response(JSON.stringify({ error: "festivalId and userMessage required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const [{ data: festival }, { data: phases }, { data: vehicles }, { data: contracts }, { data: actions }] =
      await Promise.all([
        sb.from("festivals").select("name, slug, start_date, end_date, setup_date, breakdown_date, address, city").eq("id", festivalId).maybeSingle(),
        sb.from("festival_setup").select("work_type, description, scheduled_start_at, location, crew_lead, crew_size, crew_assigned, vehicles_assigned, tasks, status").eq("festival_id", festivalId).order("scheduled_start_at", { ascending: true, nullsFirst: false }),
        sb.from("festival_transport").select("id, vehicle_type").eq("festival_id", festivalId),
        sb.from("festival_contracts").select("concepts(name)").eq("festival_id", festivalId).eq("is_active", true),
        sb.from("festival_action_items").select("title, due_date, status").eq("festival_id", festivalId).in("status", ["open", "in_progress"]).limit(20),
      ]);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = festival?.start_date ? new Date(`${festival.start_date}T00:00:00`) : null;
    const daysUntil = start ? Math.round((start.getTime() - today.getTime()) / 86400000) : null;

    const phaseLines = (phases ?? []).map((p: any, i: number) =>
      `${i + 1}. [${p.work_type ?? "?"} | ${p.status ?? "planned"}] ${fmt(p.scheduled_start_at)} — ${(p.description ?? "").slice(0, 120)}${p.location ? ` @ ${p.location}` : ""}${p.crew_lead ? ` (lead: ${p.crew_lead})` : ""}`
    ).join("\n");

    const vehicleLines = (vehicles ?? []).map((v: any) => `- ${v.vehicle_type}`).join("\n");
    const conceptLines = (contracts ?? []).map((c: any) => `- ${c.concepts?.name ?? "?"}`).filter(Boolean).join("\n");
    const actionLines = (actions ?? []).map((a: any) => `- ${a.title}${a.due_date ? ` (due ${a.due_date})` : ""}`).join("\n");

    const systemPrompt = `You are a setup planner AI for The Fish Project festival operations.
You are helping the user plan setup for ${festival?.name ?? "this festival"} (${festival?.start_date ?? "?"} → ${festival?.end_date ?? "?"}).
Location: ${festival?.address ?? ""} ${festival?.city ?? ""}.
Days until festival start: ${daysUntil ?? "?"}.
Setup begins (planned): ${festival?.setup_date ?? "—"}.

CURRENT SETUP PHASES (${(phases ?? []).length}):
${phaseLines || "(none)"}

VEHICLES AVAILABLE:
${vehicleLines || "(none)"}

ACTIVE CONCEPTS AT THIS FESTIVAL:
${conceptLines || "(none)"}

OPEN ACTION ITEMS:
${actionLines || "(none)"}

Be specific, concise, practical. Suggest concrete next steps when relevant.
Keep replies under 4 sentences unless detail is explicitly requested.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-12).map((m: any) => ({ role: m.role, content: String(m.content ?? "") })),
      { role: "user", content: String(userMessage) },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits required — top up in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI error", aiResp.status, txt);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiResp.json();
    const reply = json?.choices?.[0]?.message?.content ?? "(no reply)";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("setup-chat error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
