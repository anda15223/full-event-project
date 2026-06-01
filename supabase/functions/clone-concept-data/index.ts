// Clones one concept's data from a source festival into a target festival as draft rows.
// Mirrors the approach in clone-card-data, but scoped to a single concept_id.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Tables that have BOTH concept_id and is_draft — safe per-concept clone.
const CONCEPT_TABLES = [
  "festival_contracts",
  "festival_concept_assignments",
  "festival_concept_hours",
  "festival_concept_prices",
  "festival_service_hours",
  "festival_setup",
  "festival_equipment",
  "festival_facade_status",
  "festival_schedule_position",
  "festival_shifts",
  "festival_staff",
  "festival_trolley_items",
  "festival_daka",
  "festival_action_items",
  "festival_open_questions",
] as const;

const STRIP = new Set<string>([
  "id",
  "created_at",
  "updated_at",
  "computed_hours",
  "crosses_midnight",
]);

interface Body {
  sourceFestivalId: string;
  targetFestivalId: string;
  conceptId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as Body;
    const { sourceFestivalId, targetFestivalId, conceptId } = body;

    if (!sourceFestivalId || !targetFestivalId || !conceptId) {
      return json({ error: "Missing sourceFestivalId/targetFestivalId/conceptId" }, 400);
    }
    if (sourceFestivalId === targetFestivalId) {
      return json({ error: "Source and target must differ" }, 400);
    }

    const imported: Record<string, number> = {};
    const errors: Record<string, string> = {};

    for (const t of CONCEPT_TABLES) {
      // Wipe prior drafts for this concept at the target so re-import is idempotent.
      await supabase
        .from(t)
        .delete()
        .eq("festival_id", targetFestivalId)
        .eq("concept_id", conceptId)
        .eq("is_draft", true);

      const { data: rows, error } = await supabase
        .from(t)
        .select("*")
        .eq("festival_id", sourceFestivalId)
        .eq("concept_id", conceptId)
        .eq("is_draft", false);

      if (error) {
        errors[t] = error.message;
        continue;
      }
      if (!rows || rows.length === 0) {
        imported[t] = 0;
        continue;
      }

      const cleaned = rows.map((r: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          if (STRIP.has(k)) continue;
          out[k] = v;
        }
        out.festival_id = targetFestivalId;
        out.is_draft = true;
        out.draft_source_festival_id = sourceFestivalId;
        return out;
      });

      let inserted = 0;
      for (let i = 0; i < cleaned.length; i += 200) {
        const chunk = cleaned.slice(i, i + 200);
        const { error: insErr, count } = await supabase
          .from(t)
          .insert(chunk, { count: "exact" });
        if (insErr) {
          errors[t] = insErr.message;
          break;
        }
        inserted += count ?? chunk.length;
      }
      imported[t] = inserted;
    }

    return json({ imported, errors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
