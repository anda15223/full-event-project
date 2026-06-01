import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tent, Link2Off } from "lucide-react";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";

export type SiblingConcept = {
  contractId: string;
  conceptName: string;
  conceptSlug: string;
  /** the contract this sibling is currently merged into (null if standalone) */
  mergedInto: string | null;
};

/** Banner shown on a primary card listing all merged-in children, with per-child unmerge. */
export function TentMergedBanner({
  children, invalidateKeys,
}: {
  children: SiblingConcept[];
  invalidateKeys: string[][];
}) {
  const qc = useQueryClient();
  const unmerge = useMutation({
    mutationFn: async (contractId: string) => {
      const { error } = await supabase.from("festival_contracts")
        .update({ tent_primary_contract_id: null } as any).eq("id", contractId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success("Unmerged");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  if (children.length === 0) return null;
  return (
    <div className="rounded-lg border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
      <Tent className="h-3.5 w-3.5 text-violet-700 dark:text-violet-300 shrink-0" />
      <span className="font-medium text-violet-900 dark:text-violet-200">Shared tent — includes:</span>
      {children.map((c) => (
        <span key={c.contractId} className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5">
          <span>{CONCEPT_EMOJI[c.conceptSlug as ConceptSlug] ?? "🎪"}</span>
          <span className="font-medium">{c.conceptName}</span>
          <button
            onClick={() => unmerge.mutate(c.contractId)}
            disabled={unmerge.isPending}
            className="ml-1 text-muted-foreground hover:text-rose-600"
            title="Unmerge this concept"
          >
            <Link2Off className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

/** Compact "Merge into…" selector on a standalone card. */
export function MergeIntoControl({
  contractId, targets, invalidateKeys,
}: {
  contractId: string;
  /** other concept contracts at this festival that are themselves NOT merged into anything */
  targets: SiblingConcept[];
  invalidateKeys: string[][];
}) {
  const qc = useQueryClient();
  const merge = useMutation({
    mutationFn: async (primaryId: string) => {
      const { error } = await supabase.from("festival_contracts")
        .update({ tent_primary_contract_id: primaryId } as any).eq("id", contractId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success("Merged into shared tent");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  if (targets.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm" variant="outline"
          className="h-7 text-xs gap-1"
          disabled={merge.isPending}
          title="Merge this concept's Power & Equipment into another concept that shares the same tent"
        >
          <Tent className="h-3 w-3" /> Same tent as…
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Merge into…
        </DropdownMenuLabel>
        {targets.map((t) => (
          <DropdownMenuItem key={t.contractId} onSelect={() => merge.mutate(t.contractId)}>
            <span className="mr-2">{CONCEPT_EMOJI[t.conceptSlug as ConceptSlug] ?? "🎪"}</span>
            {t.conceptName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
