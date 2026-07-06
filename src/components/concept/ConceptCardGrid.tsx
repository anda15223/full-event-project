import { useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Concept, ConceptManager, ConceptSlug, CONCEPT_EMOJI, CONCEPT_LABELS } from "./types";
import { VerifyEntityBadge, useVerifyEntityQuestions } from "./VerifyEntityBadge";
import { VehicleSelector } from "./VehicleSelector";
import { ConceptToggle } from "./ConceptToggle";
import { useConceptIsActive } from "@/hooks/useConceptIsActive";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { useDraftMode } from "@/hooks/useDraftMode";

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
  /** When true, hides subtitle, variation note, verify badge, vehicle selector, and body — only title + assigned team leader. */
  minimal?: boolean;
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
  is_draft?: boolean | null;
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
  minimal = false,
}: Props) {
  const qc = useQueryClient();
  const { draftMode } = useDraftMode();

  const hasFinanceAccess = useFinanceAccess();

  const contractsQ = useQuery({
    queryKey: ["festival-contracts-grid", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select(
          "id, concept_alias, operating_entity_cvr, contract_status, concept_variation_note, stall_count, assigned_vehicle_id, is_draft, is_active, concept:concepts!concept_id(id, slug, name, display_order, color_hex, short_name)",
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
        .select("concept_id, festival_contract_id, manager_staff_id, festival_staff(id, name)")
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

  // Prefer contract-scoped assignments; fall back to any legacy concept-only row.
  const managerByContract = useMemo(() => {
    const byContract = new Map<string, ConceptManager>();
    const byConceptFallback = new Map<string, ConceptManager>();
    (assignmentsQ.data ?? []).forEach((row: any) => {
      const m: ConceptManager = {
        concept_id: row.concept_id,
        manager_staff_id: row.manager_staff_id,
        manager_name: row.festival_staff?.name ?? null,
      };
      if (row.festival_contract_id) byContract.set(row.festival_contract_id, m);
      else byConceptFallback.set(row.concept_id, m);
    });
    return { byContract, byConceptFallback };
  }, [assignmentsQ.data]);

  const upsertManager = useMutation({
    mutationFn: async ({ contractId, conceptId, staffId }: { contractId: string; conceptId: string; staffId: string | null }) => {
      // Try update first (per-contract row exists) — else insert.
      const { data: existing } = await supabase
        .from("festival_concept_assignments")
        .select("id")
        .eq("festival_contract_id", contractId)
        .eq("role", "manager")
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase
          .from("festival_concept_assignments")
          .update({ manager_staff_id: staffId, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("festival_concept_assignments")
          .insert({
            festival_id: festivalId,
            concept_id: conceptId,
            festival_contract_id: contractId,
            role: "manager",
            manager_staff_id: staffId,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concept-assignments", festivalId] }),
  });

  const verifyQ = useVerifyEntityQuestions(festivalId);
  const verifyQuestions = verifyQ.data ?? [];

  const sortedRows = useMemo(() => {
    const rows = (contractsQ.data ?? []).slice().filter((r: any) => {
      // Hide draft contracts unless user is in draft preview mode.
      if (r.is_draft && !draftMode) return false;
      // Hide disabled concepts entirely — restore via "Add concept" dropdown.
      if (r.is_active === false) return false;
      return true;
    });
    rows.sort((a, b) => {
      const ao = a.concept?.display_order ?? 999;
      const bo = b.concept?.display_order ?? 999;
      if (ao !== bo) return ao - bo;
      return (a.concept_alias ?? "").localeCompare(b.concept_alias ?? "");
    });
    return rows;
  }, [contractsQ.data, draftMode]);

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
        const manager =
          managerByContract.byContract.get(row.id) ??
          managerByContract.byConceptFallback.get(c.id) ??
          null;
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
          <ConceptCardItem
            key={row.id}
            row={row}
            concept={c}
            title={title}
            subtitle={subtitle}
            emoji={emoji}
            hideEmoji={hideEmoji}
            manager={manager}
            verifyQuestion={verifyQuestion}
            financeEntity={financeEntity}
            hasFinanceAccess={hasFinanceAccess}
            enableManagerEdit={enableManagerEdit}
            staff={staffQ.data ?? []}
            onManagerChange={(staffId) => upsertManager.mutate({ contractId: row.id, conceptId: c.id, staffId })}
            festivalSlug={festivalSlug}
            festivalId={festivalId}
            showVehicleSelector={showVehicleSelector}
            renderConceptBody={renderConceptBody}
            conceptData={conceptData}
            contract={contract}
            minimal={minimal}
          />
        );
      })}
    </div>
  );
}

interface ConceptCardItemProps {
  row: ContractRow;
  concept: Concept;
  title: string;
  subtitle: string;
  emoji: string;
  hideEmoji: boolean;
  manager: ConceptManager | null;
  verifyQuestion: any;
  financeEntity: string | null;
  hasFinanceAccess: boolean;
  enableManagerEdit: boolean;
  staff: { id: string; name: string | null; role: string }[];
  onManagerChange: (staffId: string | null) => void;
  festivalSlug?: string;
  festivalId: string;
  showVehicleSelector: boolean;
  renderConceptBody: Props["renderConceptBody"];
  conceptData: Record<string, any>;
  contract: ConceptContract;
  minimal?: boolean;
}

function ConceptCardItem({
  row,
  concept: c,
  title,
  subtitle,
  emoji,
  hideEmoji,
  manager,
  verifyQuestion,
  financeEntity,
  hasFinanceAccess,
  enableManagerEdit,
  staff,
  onManagerChange,
  festivalSlug,
  festivalId,
  showVehicleSelector,
  renderConceptBody,
  conceptData,
  contract,
}: ConceptCardItemProps) {
  const { isActive } = useConceptIsActive(festivalSlug ? c.slug : undefined, festivalSlug ?? "");
  const disabled = festivalSlug ? !isActive : false;

  return (
    <div
      className={`rounded-lg border bg-card p-4 print:break-inside-avoid transition-all ${
        disabled ? "opacity-60 saturate-0" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {!hideEmoji && <span className="text-2xl" aria-hidden>{emoji}</span>}
            <h3 className="text-lg font-semibold truncate">{title}</h3>
            {disabled && (
              <span className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs font-semibold rounded-full px-3 py-1 uppercase tracking-wide">
                <EyeOff size={12} />
                Hidden from reports
              </span>
            )}
            {row.is_draft && (
              <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-xs font-semibold rounded-full px-3 py-1 uppercase tracking-wide">
                Draft
              </span>
            )}
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
                  onValueChange={(v) => onManagerChange(v === "__none" ? null : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {staff.map((s) => (
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
            <div className="pointer-events-auto">
              <ConceptToggle festivalSlug={festivalSlug} conceptSlug={c.slug} />
            </div>
          )}
        </div>
      </div>
      <div className={disabled ? "pointer-events-none" : ""}>
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
    </div>
  );
}
