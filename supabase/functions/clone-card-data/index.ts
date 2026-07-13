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
  // Staff imports are staged as drafts and replace live rows on commit, so the
  // source numbering can be preserved exactly without colliding with live rows.
  festival_staff: [],
};


type Action = "import" | "commit" | "discard" | "count";

const STAFF_REPLACE_TABLES = new Set(["festival_staff", "festival_staff_vehicles"]);

interface Body {
  action: Action;
  tables: string[];
  sourceFestivalId?: string;
  targetFestivalId: string;
}

type ContractRow = {
  id: string;
  concept_id: string;
  concept_alias: string | null;
  is_active?: boolean | null;
};

const normalizeAlias = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

async function remapDraftStaffAssignments(
  supabase: ReturnType<typeof createClient>,
  sourceFestivalId: string,
  targetFestivalId: string,
) {
  const [{ data: sourceContracts, error: sourceErr }, { data: targetContracts, error: targetErr }] =
    await Promise.all([
      supabase
        .from("festival_contracts")
        .select("id, concept_id, concept_alias, is_active")
        .eq("festival_id", sourceFestivalId),
      supabase
        .from("festival_contracts")
        .select("id, concept_id, concept_alias, is_active")
        .eq("festival_id", targetFestivalId)
        .eq("is_active", true),
    ]);
  if (sourceErr) throw new Error(`festival_contracts source: ${sourceErr.message}`);
  if (targetErr) throw new Error(`festival_contracts target: ${targetErr.message}`);

  const activeTargets = (targetContracts ?? []) as ContractRow[];
  const targetByExactAlias = new Map<string, ContractRow>();
  const targetsByConcept = new Map<string, ContractRow[]>();
  activeTargets.forEach((tc) => {
    const list = targetsByConcept.get(tc.concept_id) ?? [];
    list.push(tc);
    targetsByConcept.set(tc.concept_id, list);

    const alias = normalizeAlias(tc.concept_alias);
    if (alias) targetByExactAlias.set(`${tc.concept_id}::${alias}`, tc);
  });

  const contractMap = new Map<string, { contractId: string; conceptId: string }>();
  ((sourceContracts ?? []) as ContractRow[]).forEach((sc) => {
    const alias = normalizeAlias(sc.concept_alias);
    let match: ContractRow | undefined;

    if (alias) {
      // Duplicate concepts (Fish 1/Fish 2, Gyros 1/Gyros 2) must match by alias.
      // If the same alias is not active on the target festival, the staff member
      // belongs in Not assigned instead of being moved to another duplicate stall.
      match = targetByExactAlias.get(`${sc.concept_id}::${alias}`);
    } else {
      // Old rows without aliases are safe to map by concept only when the target
      // festival has exactly one active contract for that concept.
      const sameConcept = targetsByConcept.get(sc.concept_id) ?? [];
      if (sameConcept.length === 1) match = sameConcept[0];
    }

    if (match) {
      contractMap.set(sc.id, { contractId: match.id, conceptId: match.concept_id });
    }
  });

  const { data: draftStaff, error: staffErr } = await supabase
    .from("festival_staff")
    .select("id, contract_id")
    .eq("festival_id", targetFestivalId)
    .eq("is_draft", true)
    .eq("draft_source_festival_id", sourceFestivalId)
    .not("contract_id", "is", null);
  if (staffErr) throw new Error(`festival_staff remap: ${staffErr.message}`);

  const clearIds: string[] = [];
  const updateGroups = new Map<string, { conceptId: string; ids: string[] }>();
  ((draftStaff ?? []) as { id: string; contract_id: string | null }[]).forEach((row) => {
    if (!row.contract_id) return;
    const mapped = contractMap.get(row.contract_id);
    if (!mapped) {
      clearIds.push(row.id);
      return;
    }
    const group = updateGroups.get(mapped.contractId) ?? { conceptId: mapped.conceptId, ids: [] };
    group.ids.push(row.id);
    updateGroups.set(mapped.contractId, group);
  });

  const chunks = <T,>(items: T[], size = 100) => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  };

  let remapped = 0;
  for (const [contractId, group] of updateGroups) {
    for (const ids of chunks(group.ids)) {
      const { error } = await supabase
        .from("festival_staff")
        .update({ contract_id: contractId, concept_id: group.conceptId, role: "crew" })
        .in("id", ids);
      if (error) throw new Error(`festival_staff remap update: ${error.message}`);
      remapped += ids.length;
    }
  }

  for (const ids of chunks(clearIds)) {
    const { error } = await supabase
      .from("festival_staff")
      .update({ contract_id: null, concept_id: null, station: null, role: "crew" })
      .in("id", ids);
    if (error) throw new Error(`festival_staff unassign update: ${error.message}`);
  }

  return { remapped, unassigned: clearIds.length };
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

      // Staff card imports are replacement lists: when the user clicks
      // "Set up for this event", the staged Tårnby staff list must replace
      // any existing live Kolding staff list instead of being appended. This
      // prevents duplicate staff_number collisions and matches the UI wording.
      const replacingStaff = tables.some((t) => STAFF_REPLACE_TABLES.has(t));
      if (replacingStaff) {
        const { data: transports, error: transportReadErr } = await supabase
          .from("festival_transport")
          .select("id")
          .eq("festival_id", targetFestivalId);
        if (transportReadErr) return json({ error: `festival_transport: ${transportReadErr.message}` }, 500);

        const transportIds = (transports ?? []).map((r: any) => r.id).filter(Boolean);
        if (transportIds.length > 0) {
          const { data: legs, error: legReadErr } = await supabase
            .from("transport_legs")
            .select("id")
            .in("transport_id", transportIds);
          if (legReadErr) return json({ error: `transport_legs: ${legReadErr.message}` }, 500);

          const legIds = (legs ?? []).map((r: any) => r.id).filter(Boolean);
          if (legIds.length > 0) {
            const { error: assignmentErr } = await supabase
              .from("transport_leg_assignments")
              .update({ staff_id: null })
              .in("leg_id", legIds);
            if (assignmentErr) return json({ error: `transport_leg_assignments: ${assignmentErr.message}` }, 500);
          }
        }

        const { error: managerErr } = await supabase
          .from("festival_concept_assignments")
          .update({ manager_staff_id: null })
          .eq("festival_id", targetFestivalId);
        if (managerErr) return json({ error: `festival_concept_assignments: ${managerErr.message}` }, 500);

        const { error: vehicleErr } = await supabase
          .from("festival_staff_vehicles")
          .delete()
          .eq("festival_id", targetFestivalId)
          .eq("is_draft", false);
        if (vehicleErr) return json({ error: `festival_staff_vehicles: ${vehicleErr.message}` }, 500);

        const { error: staffErr } = await supabase
          .from("festival_staff")
          .delete()
          .eq("festival_id", targetFestivalId)
          .eq("is_draft", false);
        if (staffErr) return json({ error: `festival_staff: ${staffErr.message}` }, 500);
      }

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

      // When staff is committed, also copy schedule shifts (slot assignments)
      // from the source festival, remapping schedule_position_id and
      // festival_staff_id, and collapsing dates onto the target festival day.
      let shiftsCopied = 0;
      if (replacingStaff) {
        const { data: targetFest } = await supabase
          .from("festivals")
          .select("staff_import_source_festival_id, start_date")
          .eq("id", targetFestivalId)
          .maybeSingle();
        const srcFestId = (targetFest as any)?.staff_import_source_festival_id as string | null;
        const targetDate = (targetFest as any)?.start_date as string | null;

        if (srcFestId) {
          const [srcPosRes, tgtPosRes, srcStaffRes, tgtStaffRes] = await Promise.all([
            supabase.from("festival_schedule_position")
              .select("id, concept_id, station_id, position_number")
              .eq("festival_id", srcFestId).eq("is_draft", false),
            supabase.from("festival_schedule_position")
              .select("id, concept_id, station_id, position_number")
              .eq("festival_id", targetFestivalId).eq("is_draft", false),
            supabase.from("festival_staff")
              .select("id, staff_number")
              .eq("festival_id", srcFestId).eq("is_draft", false),
            supabase.from("festival_staff")
              .select("id, staff_number")
              .eq("festival_id", targetFestivalId).eq("is_draft", false),
          ]);

          const posKey = (r: any) => `${r.concept_id}::${r.station_id}::${r.position_number}`;
          const tgtPosByKey = new Map<string, string>();
          (tgtPosRes.data ?? []).forEach((r: any) => tgtPosByKey.set(posKey(r), r.id));
          const posMap = new Map<string, string>();
          (srcPosRes.data ?? []).forEach((r: any) => {
            const tid = tgtPosByKey.get(posKey(r));
            if (tid) posMap.set(r.id, tid);
          });

          const tgtStaffByNum = new Map<number, string>();
          (tgtStaffRes.data ?? []).forEach((r: any) => {
            if (r.staff_number != null) tgtStaffByNum.set(r.staff_number, r.id);
          });
          const staffMap = new Map<string, string>();
          (srcStaffRes.data ?? []).forEach((r: any) => {
            const tid = r.staff_number != null ? tgtStaffByNum.get(r.staff_number) : null;
            if (tid) staffMap.set(r.id, tid);
          });

          const srcStaffIds = (srcStaffRes.data ?? []).map((r: any) => r.id);
          if (srcStaffIds.length > 0 && posMap.size > 0) {
            const { data: srcShifts } = await supabase
              .from("festival_schedule_shift")
              .select("schedule_position_id, shift_date, festival_staff_id, start_time, end_time, notes")
              .in("festival_staff_id", srcStaffIds);

            const newRows = ((srcShifts ?? []) as any[])
              .map((s) => {
                const posId = posMap.get(s.schedule_position_id);
                const staffId = staffMap.get(s.festival_staff_id);
                if (!posId || !staffId) return null;
                return {
                  schedule_position_id: posId,
                  festival_staff_id: staffId,
                  shift_date: targetDate ?? s.shift_date,
                  start_time: s.start_time,
                  end_time: s.end_time,
                  notes: s.notes,
                };
              })
              .filter(Boolean) as any[];

            if (newRows.length > 0) {
              for (let i = 0; i < newRows.length; i += 200) {
                const chunk = newRows.slice(i, i + 200);
                const { error, count } = await supabase
                  .from("festival_schedule_shift")
                  .insert(chunk, { count: "exact" });
                if (error) return json({ error: `festival_schedule_shift: ${error.message}` }, 500);
                shiftsCopied += count ?? chunk.length;
              }
            }
          }
        }
      }

      return json({ promoted, shiftsCopied });
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
        const wipeRes = await withRetry(
          () => supabase.from(t).delete().eq("festival_id", targetFestivalId).eq("is_draft", true) as any,
          `${t} wipe`,
        );
        if (wipeRes.error) {
          errors[t] = `wipe: ${(wipeRes.error as any).message ?? String(wipeRes.error)}`.slice(0, 300);
          continue;
        }

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

        const extraStrip = new Set(PER_TABLE_STRIP[t] ?? []);
        const cleaned = rowList.map((r) => {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(r)) {
            if (STRIP.has(k) || extraStrip.has(k)) continue;
            out[k] = v;
          }
          out.festival_id = targetFestivalId;
          out.is_draft = true;
          out.draft_source_festival_id = sourceFestivalId;
          return out;
        });

        const isDupErr = (e: any) =>
          e && ((e as any).code === "23505" || /duplicate key/i.test(String((e as any).message ?? "")));

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
          if (isDupErr(insErr)) {
            insErr = null;
            count = 0;
            for (const row of chunk) {
              const single = await supabase.from(t).insert(row, { count: "exact" });
              if (single.error) {
                if (isDupErr(single.error)) continue;
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

    let staffRemap: { remapped: number; unassigned: number } | null = null;

    // If staff was part of this import, remap source contract IDs to the active
    // target festival contracts before the user previews/commits the draft.
    // This keeps identical stations filled and parks staff from disabled
    // duplicate stalls (for example Fish 2) in Not assigned.
    if (tables.some((t) => STAFF_REPLACE_TABLES.has(t))) {
      staffRemap = await remapDraftStaffAssignments(supabase, sourceFestivalId, targetFestivalId);

      await supabase
        .from("festivals")
        .update({ staff_import_source_festival_id: sourceFestivalId })
        .eq("id", targetFestivalId);
    }

    return json({ imported, errors, staffRemap });


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
