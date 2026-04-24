import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STANDARD_ALLERGENS = [
  "gluten", "dairy", "egg", "fish", "shellfish", "soy", "nuts",
  "peanuts", "sesame", "celery", "mustard", "sulfites", "lupin", "molluscs",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, filename } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'text'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a food-product recipe parser. Extract structured recipe data from raw text scraped from a PDF/Word/image. Output via the provided tool. Identify all standard EU allergens present based on ingredient names. Allergen list MUST be a subset of: ${STANDARD_ALLERGENS.join(", ")}.`;

    const userPrompt = `Source filename: ${filename || "unknown"}\n\nRAW TEXT:\n${text.slice(0, 12000)}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "save_recipe",
                description: "Save the parsed recipe.",
                parameters: {
                  type: "object",
                  properties: {
                    product_name: { type: "string" },
                    recipe_text: { type: "string", description: "Step-by-step preparation method." },
                    gramaj: { type: "number", description: "Portion weight in grams." },
                    ingredients: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          quantity: { type: "string", description: "e.g. '120g', '1 tbsp'" },
                        },
                        required: ["name", "quantity"],
                      },
                    },
                    allergens: {
                      type: "array",
                      items: { type: "string", enum: STANDARD_ALLERGENS },
                    },
                    allergen_notes: {
                      type: "string",
                      description: "Short note explaining which ingredient triggers each allergen.",
                    },
                  },
                  required: ["product_name", "ingredients", "allergens"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "save_recipe" } },
        }),
      },
    );

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");
    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ recipe: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-recipe error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
