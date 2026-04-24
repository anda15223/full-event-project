// Generates a chronological setup timeline for a festival.
// Reads brain_entries + summary of all related cards, asks the AI to return
// a structured JSON timeline via tool calling.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const tools = [
  {
    type: "function",
    function: {
      name: "return_timeline",
      description:
        "Return the complete chronological setup timeline for the festival.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day_offset: {
                  type: "integer",
                  description:
                    "Days relative to festival start. -30, -14, -7, -2, 0, etc. Negative = before, 0 = day of, positive = after.",
                },
                date: {
                  type: "string",
                  description: "ISO date YYYY-MM-DD",
                },
                action: { type: "string", description: "What needs to happen" },
                responsible: { type: "string" },
                priority: {
                  type: "string",
                  enum: ["urgent", "high", "normal", "low"],
                },
                category: {
                  type: "string",
                  description:
                    "Group label, e.g. Contracts, Equipment, Staff, Setup, Logistics.",
                },
              },
              required: ["day_offset", "date", "action", "priority"],
            },
          },
          summary: { type: "string" },
        },
        required: ["items"],
      },
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { festival_id } = await req.json();
    if (!festival_id) {
      return new Response(JSON.stringify({ error: "festival_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Pull broad festival context
    const [
      festival,
      brain,
      tasks,
      equipment,
      concepts,
      contacts,
      cars,
      hotels,
      crew,
    ] = await Promise.all([
      supabase.from("festivals").select("*").eq("id", festival_id).maybeSingle(),
      supabase
        .from("brain_entries")
        .select("category, content, display_name, source")
        .or(`festival_id.eq.${festival_id},scope.eq.global`)
        .limit(80),
      supabase
        .from("tasks_deadlines")
        .select("task, status, priority, deadline, card_origin")
        .eq("festival_id", festival_id),
      supabase
        .from("equipment_db")
        .select("item_name, source, status, card_origin, quantity")
        .eq("festival_id", festival_id)
        .limit(120),
      supabase
        .from("festival_concepts")
        .select("name, zone, gas_required, products_sold")
        .eq("festival_id", festival_id),
      supabase
        .from("festival_contacts")
        .select("name, role, phone, email")
        .eq("festival_id", festival_id),
      supabase
        .from("festival_cars")
        .select("label, make_model, license_plate, is_rental, driver_id")
        .eq("festival_id", festival_id),
      supabase
        .from("festival_hotels")
        .select("name, rooms_count, total_nights, total_cost")
        .eq("festival_id", festival_id),
      supabase
        .from("personal_festival_db")
        .select("name, role, is_crew, is_driver, needs_accommodation")
        .eq("festival_id", festival_id),
    ]);

    const ctx = {
      festival: festival.data,
      brain_entries: brain.data ?? [],
      open_tasks: tasks.data ?? [],
      equipment_summary: equipment.data ?? [],
      concepts: concepts.data ?? [],
      contacts: contacts.data ?? [],
      cars: cars.data ?? [],
      hotels: hotels.data ?? [],
      crew: crew.data ?? [],
    };

    const startDate = festival.data?.start_date;
    if (!startDate) {
      return new Response(
        JSON.stringify({ error: "Festival has no start_date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `You are a festival operations planner. Build a chronological setup timeline anchored to the festival start date (${startDate}).

Standard milestones (always include if relevant):
- Day -30: Contracts signed, suppliers confirmed
- Day -14: Equipment checked, staff allocated, accommodation booked
- Day -7: Final orders placed, training list reviewed
- Day -2: Setup begins, transportation departs
- Day 0: Festival starts
- Day +1..+N: Operating days
- Day +last: Teardown, return rentals, final reconciliation

Use the festival context (open tasks, missing equipment, concepts, hotels, crew) to add festival-specific actions. For each item compute the absolute date from start_date + day_offset. Return ONLY via the return_timeline tool.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate the setup timeline. Festival context:\n${JSON.stringify(ctx).slice(0, 28000)}`,
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "return_timeline" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits in Workspace Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.error("AI gateway error:", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = { items: [] };
    try {
      parsed = JSON.parse(tc?.function?.arguments || "{}");
    } catch (e) {
      console.error("parse failure", e);
    }

    return new Response(
      JSON.stringify({ timeline: parsed.items ?? [], summary: parsed.summary ?? "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("generate-setup-timeline error:", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
