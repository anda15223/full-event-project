import { useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Concept, ConceptManager, ConceptSlug, CONCEPT_EMOJI, CONCEPT_LABELS } from "./types";
import { VerifyEntityBadge, useVerifyEntityQuestions } from "./VerifyEntityBadge";
import { VehicleSelector } from "./VehicleSelector";
import { ConceptToggle } from "./ConceptToggle";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";

export interface ConceptContract {
  contract_id: string;
  concept_alias: string | null;
  operating_entity: string | null;
  operating_entity_cvr: string | null;
  contract_status: string | null;
  concept_variation_note: string | null;
  stall_count: number | null;
}

interface Props {
  festivalId: string;
  /** Data keyed by concept_id (shared across stalls of same brand) */
  conceptData: Record<string, any>;
  renderConceptBody: (
    concept: Concept,
    data: any,
    manager: ConceptManager | null,
    contract?: ConceptContract,
  ) => ReactNode;
  enableManagerEdit?: boolean;
  /** Show "Pack into: [vehicle]" dropdown on each card. Use on Power/Facade/Topskilt/Loading pages only. */
  showVehicleSelector?: boolean;
  layout?: "stack" | "grid";
  hideEmoji?: boolean;
  /** When provided, renders an active/inactive toggle on each card header. */
  festivalSlug?: string;
}

interface ContractRow {
  id: string;
  concept_alias: string | null;
  operating_entity: string | null;
  operating_entity_cvr: string | null;
  contract_status: string | null;
  concept_variation_note: string | null;
  stall_count: number | null;
  assigned_vehicle_id: string | null;
  concept: {
    id: string;
    slug: ConceptSlug;
    name: string;
    display_order: number | null;
    color_hex: string | null;
    short_name: string | null;
  } | null;
}

export function ConceptCardGrid({
  festivalId,
  conceptData,
  renderConceptBody,
  enableManagerEdit = true,
  showVehicleSelector = false,
  layout = "stack",
  hideEmoji = false,
  festivalSlug,
}: Props) {
  const qc = useQueryClient();

  const hasFinanceAccess = useFinanceAccess();

  const contractsQ = useQuery({
    queryKey: ["festival-contracts-grid", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select(
          "id, concept_alias, operating_entity_cvr, contract_status, concept_variation_note, stall_count, assigned_vehicle_id, concept:concepts!concept_id(id, slug, name, display_order, color_hex, short_name)",
        )
        .eq("festival_id", festivalId);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, operating_entity: null })) as unknown as ContractRow[];
    },
    enabled: !!festivalId,
  });

  // Finance-locked entity names — only loads for users with finance access (RLS).
  const financeQ = useQuery({
    queryKey: ["festival-contracts-finance", festivalId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("festival_contracts_finance")
        .select("contract_id, operating_entity");
      const map = new Map<string, string | null>();
      (data ?? []).forEach((r: any) => map.set(r.contract_id, r.operating_entity));
      return map;
    },
    enabled: !!festivalId && hasFinanceAccess,
  });

  const assignmentsQ = useQuery({
    queryKey: ["concept-assignments", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_concept_assignments")
        .select("concept_id, manager_staff_id, festival_staff(id, name)")
        .eq("festival_id", festivalId)
        .eq("role", "manager");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!festivalId,
  });

  const staffQ = useQuery({
    queryKey: ["festival-staff-for-manager", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_staff")
        .select("id, name, role")
        .eq("festival_id", festivalId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string | null; role: string }[];
    },
    enabled: !!festivalId,
  });

  const managerByConcept = useMemo(() => {
    const m = new Map<string, ConceptManager>();
    (assignmentsQ.data ?? []).forEach((row: any) => {
      m.set(row.concept_id, {
        concept_id: row.concept_id,
        manager_staff_id: row.manager_staff_id,
        manager_name: row.festival_staff?.name ?? null,
      });
    });
    return m;
  }, [assignmentsQ.data]);

  const upsertManager = useMutation({
    mutationFn: async ({ conceptId, staffId }: { conceptId: string; staffId: string | null }) => {
      const { error } = await supabase
        .from("festival_concept_assignments")
        .upsert(
          {
            festival_id: festivalId,
            concept_id: conceptId,
            role: "manager",
            manager_staff_id: staffId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "festival_id,concept_id,role" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concept-assignments", festivalId] }),
  });

  const verifyQ = useVerifyEntityQuestions(festivalId);
  const verifyQuestions = verifyQ.data ?? [];

  const sortedRows = useMemo(() => {
    const rows = (contractsQ.data ?? []).slice();
    rows.sort((a, b) => {
      const ao = a.concept?.display_order ?? 999;
      const bo = b.concept?.display_order ?? 999;
      if (ao !== bo) return ao - bo;
      return (a.concept_alias ?? "").localeCompare(b.concept_alias ?? "");
    });
    return rows;
  }, [contractsQ.data]);

  if (contractsQ.isLoading) {
    return (
      <div className={layout === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-4"}>
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  if (sortedRows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic p-4 border rounded-md">
        No concept contracts found for this festival.
      </div>
    );
  }

  return (
    <div className={layout === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-4"}>
      {sortedRows.map((row) => {
        if (!row.concept) return null;
        const c: Concept = {
          id: row.concept.id,
          slug: row.concept.slug,
          name: row.concept.name,
          display_order: row.concept.display_order ?? 0,
          color_hex: row.concept.color_hex,
          short_name: row.concept.short_name,
        };
        const manager = managerByConcept.get(c.id) ?? null;
        const slug = c.slug as ConceptSlug;
        const emoji = CONCEPT_EMOJI[slug] ?? "🍽️";
        const baseLabel = CONCEPT_LABELS[slug] ?? c.name;
        const title = row.concept_alias?.trim() ? row.concept_alias : baseLabel;
        const financeEntity = hasFinanceAccess ? (financeQ.data?.get(row.id) ?? null) : null;
        const subtitleParts: string[] = [];
        if (hasFinanceAccess && financeEntity) subtitleParts.push(financeEntity);
        if (hasFinanceAccess && row.operating_entity_cvr) subtitleParts.push(`CVR ${row.operating_entity_cvr}`);
        const subtitle = subtitleParts.join(" · ");
        const verifyQuestion =
          verifyQuestions.find((q) => q.concept_id === c.id) ??
          verifyQuestions.find((q) => q.concept_id === null);
        const contract: ConceptContract = {
          contract_id: row.id,
          concept_alias: row.concept_alias,
          operating_entity: financeEntity,
          operating_entity_cvr: hasFinanceAccess ? row.operating_entity_cvr : null,
          contract_status: row.contract_status,
          concept_variation_note: row.concept_variation_note,
          stall_count: row.stall_count,
        };
        return (
          <div key={row.id} className="rounded-lg border bg-card p-4 print:break-inside-avoid">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {!hideEmoji && <span className="text-2xl" aria-hidden>{emoji}</span>}
                  <h3 className="text-lg font-semibold truncate">{title}</h3>
                </div>
                {(subtitle || verifyQuestion) && (
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                    {subtitle && <span>{subtitle}</span>}
                    {hasFinanceAccess && verifyQuestion && (
                      <VerifyEntityBadge
                        question={verifyQuestion}
                        contractId={row.id}
                        currentEntity={financeEntity}
                        currentCvr={row.operating_entity_cvr}
                      />
                    )}
                  </div>
                )}
                {row.concept_variation_note && (
                  <div className="text-xs italic text-muted-foreground mt-1">
                    {row.concept_variation_note}
                  </div>
                )}
              </div>
              <div className="flex items-start gap-3 shrink-0">
                <div className="min-w-[220px] shrink-0">
                  {enableManagerEdit ? (
                    <div className="flex items-center gap-2">
                      <span aria-hidden>👤</span>
                      <Select
                        value={manager?.manager_staff_id ?? "__none"}
                        onValueChange={(v) =>
                          upsertManager.mutate({ conceptId: c.id, staffId: v === "__none" ? null : v })
                        }
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Unassigned</SelectItem>
                          {(staffQ.data ?? []).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name ?? "(no name)"}{s.role ? ` — ${s.role}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      👤 {manager?.manager_name ?? "Unassigned"}
                    </div>
                  )}
                </div>
                {festivalSlug && (
                  <ConceptToggle festivalSlug={festivalSlug} conceptSlug={c.slug} />
                )}
              </div>
            </div>
            {showVehicleSelector && (
              <div className="mb-3">
                <VehicleSelector
                  festivalId={festivalId}
                  contractId={row.id}
                  currentVehicleId={row.assigned_vehicle_id}
                />
              </div>
            )}
            <div>{renderConceptBody(c, conceptData[c.id], manager, contract)}</div>
          </div>
        );
      })}
    </div>
  );
}
