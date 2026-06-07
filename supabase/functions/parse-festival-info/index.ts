import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "arriving", "leaving", "rules", "schedule", "access_credentials",
    "parking_vehicles", "accommodation_camping", "food_drink",
    "safety_emergency", "contacts", "other",
  ],
  properties: {
    arriving: { type: "array", items: { type: "string" } },
    leaving: { type: "array", items: { type: "string" } },
    rules: { type: "array", items: { type: "string" } },
    schedule: { type: "array", items: { type: "string" } },
    access_credentials: { type: "array", items: { type: "string" } },
    parking_vehicles: { type: "array", items: { type: "string" } },
    accommodation_camping: { type: "array", items: { type: "string" } },
    food_drink: { type: "array", items: { type: "string" } },
    safety_emergency: { type: "array", items: { type: "string" } },
    contacts: { type: "array", items: { type: "string" } },
    other: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM_PROMPT = `You read festival info documents sent by festival organisers (Danish, English, or Romanian) and turn them into short English bullet points grouped by category.

Categories:
- arriving: arrival times, build-up, check-in, gate access on the way in
- leaving: tear-down, departure times, check-out, exit procedure
- rules: rules, restrictions, do's & don'ts, penalties, behaviour expectations
- schedule: opening hours, key timings, programme highlights
- access_credentials: wristbands, accreditation, pickup of badges, entry procedure
- parking_vehicles: parking, vehicle passes, delivery windows, loading
- accommodation_camping: crew camping, hotels, sleeping rules
- food_drink: crew catering, meal tickets, allowed/forbidden products
- safety_emergency: safety, fire, first aid, emergency contacts
- contacts: people to call/email, with name + role + phone/email if available
- other: anything important that doesn't fit above

Rules:
- Each bullet is one short, plain-English sentence (max ~20 words).
- Be specific: keep dates, times, addresses, names, phone numbers, prices.
- Never invent info. If a category has nothing, return an empty array.
- Output ONLY by calling save_festival_info_summary.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { rawText, festivalId } = await req.json().catch(() => ({}));

    if (typeof rawText !== "string" || rawText.trim().length === 0) {
      return new Response(JSON.stringify({ error: "rawText is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: rawText },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_festival_info_summary",
            description: "Save the categorised festival info bullets.",
            parameters: SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "save_festival_info_summary" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted, add credits in Lovable settings" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI gateway error: ${aiRes.status} ${txt}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const argsStr = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) {
      return new Response(JSON.stringify({ error: "Model did not return tool call" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let summary: Record<string, string[]>;
    try {
      summary = typeof argsStr === "string" ? JSON.parse(argsStr) : argsStr;
    } catch (e) {
      return new Response(JSON.stringify({ error: `Failed to parse: ${(e as Error).message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof festivalId === "string" && festivalId.length > 0) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { error } = await supabase
        .from("festival_info_summaries")
        .upsert(
          {
            festival_id: festivalId,
            raw_text: rawText,
            summary,
            parsed_at: new Date().toISOString(),
          },
          { onConflict: "festival_id" },
        );
      if (error) {
        return new Response(JSON.stringify({ error: `DB save failed: ${error.message}`, summary }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ summary }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
