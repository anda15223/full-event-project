import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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
  const [open, setOpen] = useState(false);
  const merge = useMutation({
    mutationFn: async (primaryId: string) => {
      const { error } = await supabase.from("festival_contracts")
        .update({ tent_primary_contract_id: primaryId } as any).eq("id", contractId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success("Merged into shared tent");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  if (targets.length === 0) return null;
  if (!open) {
    return (
      <Button
        size="sm" variant="outline"
        className="h-7 text-xs gap-1"
        onClick={() => setOpen(true)}
        title="Merge this concept's Power & Equipment into another concept that shares the same tent"
      >
        <Tent className="h-3 w-3" /> Same tent as…
      </Button>
    );
  }
  return (
    <Select onValueChange={(v) => merge.mutate(v)} onOpenChange={(o) => !o && setOpen(false)} open>
      <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue placeholder="Pick concept…" /></SelectTrigger>
      <SelectContent>
        {targets.map((t) => (
          <SelectItem key={t.contractId} value={t.contractId}>
            {CONCEPT_EMOJI[t.conceptSlug as ConceptSlug] ?? "🎪"} {t.conceptName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
