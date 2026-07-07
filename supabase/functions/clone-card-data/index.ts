import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Allowlist of tables that can be cloned. Mirrors the columns added in the draft migration.
const ALLOWED_TABLES = new Set<string>([
  "festival_accommodation",
  "festival_action_items",
  "festival_concept_assignments",
  "festival_concept_hours",
  "festival_concept_prices",
  "festival_contacts",
  "festival_contracts",
  "festival_cooling",
  "festival_cooling_unit",
  "festival_daka",
  "festival_deadlines",
  "festival_equipment",
  "festival_equipment_transport",
  "festival_facade_status",
  "festival_hours",
  "festival_ingredient_manual",
  "festival_location_documents",
  "festival_open_questions",
  "festival_safety",
  "festival_safety_zone",
  "festival_schedule_position",
  "festival_service_hours",
  "festival_setup",
  "festival_shifts",
  "festival_staff",
  "festival_staff_vehicles",
  "festival_timeline_event",
  "festival_transport",
  "festival_trolley_items",
]);

// Columns stripped on copy — recomputed by Postgres / triggers.
const STRIP = new Set<string>([
  "id",
  "created_at",
  "updated_at",
  "computed_hours",
  "crosses_midnight",
  "hours",
]);

// Per-table additional strips: columns whose value must be re-derived on the
// target festival (unique-per-festival numbering, etc.) to avoid 23505 clashes.
const PER_TABLE_STRIP: Record<string, string[]> = {
  festival_staff: ["staff_number"], // trigger assign_festival_staff_number renumbers on insert
};


type Action = "import" | "commit" | "discard" | "count";

interface Body {
  action: Action;
  tables: string[];
  sourceFestivalId?: string;
  targetFestivalId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as Body;
    const { action, tables, sourceFestivalId, targetFestivalId } = body;

    if (!action || !targetFestivalId || !Array.isArray(tables) || tables.length === 0) {
      return json({ error: "Missing action/tables/targetFestivalId" }, 400);
    }
    for (const t of tables) {
      if (!ALLOWED_TABLES.has(t)) return json({ error: `Table not allowed: ${t}` }, 400);
    }

    if (action === "count") {
      const counts: Record<string, number> = {};
      for (const t of tables) {
        const { count } = await supabase
          .from(t)
          .select("*", { count: "exact", head: true })
          .eq("festival_id", targetFestivalId)
          .eq("is_draft", true);
        counts[t] = count ?? 0;
      }
      return json({ counts });
    }

    if (action === "discard") {
      const removed: Record<string, number> = {};
      for (const t of tables) {
        const { error, count } = await supabase
          .from(t)
          .delete({ count: "exact" })
          .eq("festival_id", targetFestivalId)
          .eq("is_draft", true);
        if (error) return json({ error: `${t}: ${error.message}` }, 500);
        removed[t] = count ?? 0;
      }
      return json({ removed });
    }

    if (action === "commit") {
      const promoted: Record<string, number> = {};
      for (const t of tables) {
        const { error, count } = await supabase
          .from(t)
          .update(
            { is_draft: false, draft_source_festival_id: null },
            { count: "exact" },
          )
          .eq("festival_id", targetFestivalId)
          .eq("is_draft", true);
        if (error) return json({ error: `${t}: ${error.message}` }, 500);
        promoted[t] = count ?? 0;
      }
      return json({ promoted });
    }

    // action === "import"
    if (!sourceFestivalId) return json({ error: "sourceFestivalId required for import" }, 400);
    if (sourceFestivalId === targetFestivalId) {
      return json({ error: "Source and target must differ" }, 400);
    }

    const imported: Record<string, number> = {};
    const errors: Record<string, string> = {};

    // Retry wrapper for transient upstream failures (e.g. Cloudflare 522).
    const withRetry = async <T,>(fn: () => Promise<{ data?: T; error: any; count?: number | null }>, label: string) => {
      let lastErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fn();
          if (!res.error) return res;
          lastErr = res.error;
          const msg = String(res.error?.message ?? "");
          // Only retry transient network/timeout errors
          if (!/522|timeout|fetch failed|network|ECONN|ETIMEDOUT/i.test(msg)) return res;
        } catch (e) {
          lastErr = e;
        }
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
      return { data: undefined as any, error: lastErr, count: null };
    };

    for (const t of tables) {
      try {
        // Wipe any prior drafts for this scope first, so re-import is idempotent.
        await withRetry(
          () => supabase.from(t).delete().eq("festival_id", targetFestivalId).eq("is_draft", true) as any,
          `${t} wipe`,
        );

        const { data: rows, error } = await withRetry(
          () => supabase.from(t).select("*").eq("festival_id", sourceFestivalId).eq("is_draft", false) as any,
          `${t} read`,
        );
        if (error) {
          errors[t] = `read: ${(error as any).message ?? String(error)}`.slice(0, 300);
          continue;
        }
        const rowList = (rows ?? []) as Record<string, unknown>[];
        if (rowList.length === 0) {
          imported[t] = 0;
          continue;
        }

        const cleaned = rowList.map((r) => {
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
        let tableErr: string | null = null;
        for (let i = 0; i < cleaned.length; i += 200) {
          const chunk = cleaned.slice(i, i + 200);
          const res = await withRetry(
            () => supabase.from(t).insert(chunk, { count: "exact" }) as any,
            `${t} insert`,
          );
          let insErr: any = res.error;
          let count: number | null = res.count ?? null;
          if (insErr && (insErr as any).code === "23505") {
            insErr = null;
            count = 0;
            for (const row of chunk) {
              const single = await supabase.from(t).insert(row, { count: "exact" });
              if (single.error) {
                if ((single.error as any).code === "23505") continue;
                insErr = single.error;
                break;
              }
              count += single.count ?? 1;
            }
          }
          if (insErr) {
            tableErr = `insert: ${(insErr as any).message ?? String(insErr)}`.slice(0, 300);
            break;
          }
          inserted += count ?? chunk.length;
        }
        if (tableErr) {
          errors[t] = tableErr;
        }
        imported[t] = inserted;
      } catch (e) {
        errors[t] = (e as Error).message?.slice(0, 300) ?? "unknown error";
      }
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
