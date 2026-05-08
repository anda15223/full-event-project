import { useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Concept, ConceptManager, ConceptSlug, CONCEPT_EMOJI, CONCEPT_LABELS } from "./types";

interface Props {
  festivalId: string;
  conceptData: Record<string, any>;
  renderConceptBody: (concept: Concept, data: any, manager: ConceptManager | null) => ReactNode;
  enableManagerEdit?: boolean;
}

export function ConceptCardGrid({
  festivalId,
  conceptData,
  renderConceptBody,
  enableManagerEdit = true,
}: Props) {
  const qc = useQueryClient();

  const conceptsQ = useQuery({
    queryKey: ["concepts-ordered"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concepts")
        .select("id, slug, name, display_order, color_hex, short_name")
        .not("display_order", "is", null)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Concept[];
    },
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

  if (conceptsQ.isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(conceptsQ.data ?? []).map((c) => {
        const manager = managerByConcept.get(c.id) ?? null;
        const slug = c.slug as ConceptSlug;
        const emoji = CONCEPT_EMOJI[slug] ?? "🍽️";
        const label = CONCEPT_LABELS[slug] ?? c.name;
        return (
          <div key={c.id} className="rounded-lg border bg-card p-4 print:break-inside-avoid">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden>{emoji}</span>
                <h3 className="text-lg font-semibold">{label}</h3>
              </div>
              <div className="min-w-[220px]">
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
            </div>
            <div>{renderConceptBody(c, conceptData[c.id], manager)}</div>
          </div>
        );
      })}
    </div>
  );
}
