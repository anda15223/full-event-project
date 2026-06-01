import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["festival", "dates", "contacts", "menu", "location", "cost", "deadlines", "obligations"],
  properties: {
    festival: {
      type: "object",
      additionalProperties: false,
      required: ["name", "festival_entity", "stadeholder_entity"],
      properties: {
        name: { type: "string" },
        festival_entity: { type: "string" },
        stadeholder_entity: { type: "string" },
      },
    },
    dates: {
      type: "object",
      additionalProperties: false,
      required: ["festival_days", "opening_hours", "setup_access", "camping"],
      properties: {
        festival_days: { type: "array", items: { type: "string" } },
        opening_hours: { type: "array", items: { type: "string" } },
        setup_access: { type: "string" },
        camping: { type: "string" },
      },
    },
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "name", "email", "phone"],
        properties: {
          role: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
        },
      },
    },
    menu: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "concept", "lactose_free", "gluten_free", "vegetarian", "vegan", "local"],
        properties: {
          item: { type: "string" },
          concept: { type: "string" },
          lactose_free: { type: "string" },
          gluten_free: { type: "string" },
          vegetarian: { type: "string" },
          vegan: { type: "string" },
          local: { type: "string" },
        },
      },
    },
    location: {
      type: "object",
      additionalProperties: false,
      required: ["venue", "kommune", "stand_placement_status"],
      properties: {
        venue: { type: "string" },
        kommune: { type: "string" },
        stand_placement_status: { type: "string" },
      },
    },
    cost: {
      type: "object",
      additionalProperties: false,
      required: ["commission_pct", "deposit", "penalty_per_breach", "ip_breach_penalty", "late_order_fee", "meal_ticket_price", "settlement_terms"],
      properties: {
        commission_pct: { type: "string" },
        deposit: { type: "string" },
        penalty_per_breach: { type: "string" },
        ip_breach_penalty: { type: "string" },
        late_order_fee: { type: "string" },
        meal_ticket_price: { type: "string" },
        settlement_terms: { type: "string" },
      },
    },
    deadlines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "item", "clause_ref"],
        properties: {
          date: { type: "string" },
          item: { type: "string" },
          clause_ref: { type: "string" },
        },
      },
    },
    obligations: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM_PROMPT = `You extract structured data from festival stallholder (stadeholder) contracts. The source contract may be in Danish; always output values in English. Read the FULL contract including all appendices (Bilag A, B, etc). Fill every field. If a value is genuinely absent, use 'TBD' — never leave a field empty or omit it. Deadlines: extract EVERY date in the contract and its deadline table, include the clause reference (e.g. 'pkt. 5.5'), and return them sorted chronologically (earliest first). Obligations: each is a short plain-language bullet, max ~15 words, focused on what the stadeholder MUST do or MUST NOT do — prioritise anything tied to a penalty or 'væsentlig misligholdelse'. Call save_contract_summary with the result.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { contractText, contractId } = body as { contractText?: unknown; contractId?: unknown };

    if (typeof contractText !== "string" || contractText.trim().length === 0) {
      return new Response(JSON.stringify({ error: "contractText is required (non-empty string)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          { role: "user", content: contractText },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_contract_summary",
            description: "Save the structured contract summary.",
            parameters: SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "save_contract_summary" } },
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
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      return new Response(JSON.stringify({ error: "Model did not return tool call" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let summary: unknown;
    try {
      summary = typeof argsStr === "string" ? JSON.parse(argsStr) : argsStr;
    } catch (e) {
      return new Response(JSON.stringify({ error: `Failed to parse tool arguments: ${(e as Error).message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof contractId === "string" && contractId.length > 0) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { error } = await supabase
        .from("festival_contracts")
        .update({ summary, parsed_at: new Date().toISOString() })
        .eq("id", contractId);
      if (error) {
        return new Response(JSON.stringify({ error: `DB update failed: ${error.message}`, summary }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
