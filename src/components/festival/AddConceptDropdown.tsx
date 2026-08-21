import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDraftMode } from "@/hooks/useDraftMode";

interface Props {
  festivalId: string;
}

interface ConceptRow {
  id: string;
  slug: string;
  name: string;
  display_order: number | null;
}

interface ExistingConceptRow {
  id: string;
  concept_id: string;
  is_active: boolean | null;
  is_draft: boolean | null;
  concept_alias: string | null;
}

type AddConceptOption = ConceptRow & {
  mode: "add" | "restore" | "review";
  contractId?: string;
  conceptAlias?: string | null;
};

interface FestivalRow {
  id: string;
  name: string;
  slug: string;
  start_date: string | null;
}

export function AddConceptDropdown({ festivalId }: Props) {
  const qc = useQueryClient();
  const { setDraftMode } = useDraftMode();
  const [conceptId, setConceptId] = useState<string>("");
  const [sourceFestivalId, setSourceFestivalId] = useState<string>("");
  const [open, setOpen] = useState(false);

  // All concepts.
  const conceptsQ = useQuery({
    queryKey: ["all-concepts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concepts")
        .select("id, slug, name, display_order")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ConceptRow[];
    },
  });

  // Concepts already present at this festival (live, draft, or disabled).
  const existingQ = useQuery({
    queryKey: ["festival-contracts-concept-ids", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select("id, concept_id, is_active, is_draft, concept_alias")
        .eq("festival_id", festivalId);
      if (error) throw error;
      return (data ?? []) as ExistingConceptRow[];
    },
  });

  const options = useMemo<AddConceptOption[]>(() => {
    const existing = existingQ.data ?? [];
    return (conceptsQ.data ?? []).flatMap<AddConceptOption>((c) => {
      const rows = existing.filter((row) => row.concept_id === c.id);
      if (rows.length === 0) return [{ ...c, mode: "add" }];

      // Keep every disabled contract recoverable. Grouping only by concept used to
      // hide these whenever another row for the same concept was active or a draft.
      const disabled = rows.filter((row) => row.is_active === false);
      if (disabled.length > 0) {
        return disabled.map((row) => ({
          ...c,
          mode: "restore" as const,
          contractId: row.id,
          conceptAlias: row.concept_alias,
        }));
      }

      // An active draft is intentionally absent from the live lineup. Give users
      // a direct route back to it instead of making the concept appear unavailable.
      if (rows.some((row) => row.is_draft === true)) {
        return [{ ...c, mode: "review", contractId: rows.find((row) => row.is_draft === true)?.id }];
      }
      return [];
    });
  }, [conceptsQ.data, existingQ.data]);

  // Past festivals that have this concept (festival_contracts row).
  const sourcesQ = useQuery({
    queryKey: ["concept-source-festivals", conceptId, festivalId],
    enabled: !!conceptId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select("festival_id, festivals!festival_id(id, name, slug, start_date)")
        .eq("concept_id", conceptId)
        .eq("is_draft", false);
      if (error) throw error;
      const seen = new Set<string>();
      const out: FestivalRow[] = [];
      (data ?? []).forEach((r: any) => {
        const f = r.festivals;
        if (!f || f.id === festivalId || seen.has(f.id)) return;
        seen.add(f.id);
        out.push(f);
      });
      out.sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
      return out;
    },
  });

  const importMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("clone-concept-data", {
        body: { sourceFestivalId, targetFestivalId: festivalId, conceptId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { imported: Record<string, number>; errors: Record<string, string> };
    },
    onSuccess: (res) => {
      const total = Object.values(res?.imported ?? {}).reduce((a, b) => a + b, 0);
      const errCount = Object.keys(res?.errors ?? {}).length;
      toast.success(
        `Imported ${total} draft rows${errCount ? ` (${errCount} table(s) had issues)` : ""}. Review then click "Set up for this event".`
      );
      setDraftMode(true);
      setOpen(false);
      setConceptId("");
      setSourceFestivalId("");
      qc.invalidateQueries({ queryKey: ["festival-contracts-grid", festivalId] });
      qc.invalidateQueries({ queryKey: ["festival-contracts-concept-ids", festivalId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Import failed"),
  });

  const restoreMut = useMutation({
    mutationFn: async ({ contractId, conceptId }: { contractId: string; conceptId: string }) => {
      const { error } = await supabase
        .from("festival_contracts")
        // Restore = live everywhere: clear the draft flag too, otherwise the concept
        // stays invisible on every card unless draft preview is on.
        .update({ is_active: true, is_draft: false })
        .eq("id", contractId)
        .eq("festival_id", festivalId);
      if (error) throw error;
      return conceptId;
    },
    onSuccess: (id) => {
      const concept = conceptsQ.data?.find((c) => c.id === id);
      toast.success(`${concept?.name ?? "Concept"} restored to this festival.`);
      qc.invalidateQueries({ queryKey: ["festival-contracts-grid", festivalId] });
      qc.invalidateQueries({ queryKey: ["festival-contracts-concept-ids", festivalId] });
      qc.invalidateQueries({ queryKey: ["disabled-concepts"] });
      qc.invalidateQueries({ queryKey: ["concept-active"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not restore concept"),
  });

  if (options.length === 0) return null;

  return (
    <>
      <Select
        value=""
        onValueChange={(v) => {
          const [mode, id, contractId] = v.split(":");
          if (mode === "restore") {
            if (!contractId) {
              toast.error("Could not identify the disabled concept.");
              return;
            }
            restoreMut.mutate({ contractId, conceptId: id });
            return;
          }
          if (mode === "review") {
            if (!contractId) {
              toast.error("Could not identify the draft concept.");
              return;
            }
            // Promote the draft so the concept shows up on every card for the event.
            restoreMut.mutate({ contractId, conceptId: id });
            return;
          }
          setConceptId(id);
          setSourceFestivalId("");
          setOpen(true);
        }}
      >
        <SelectTrigger className="h-9 w-auto gap-2 border-dashed">
          <Plus className="h-4 w-4" />
          <SelectValue placeholder={restoreMut.isPending ? "Restoring…" : "Add concept"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem
              key={`${c.mode}:${c.id}:${c.contractId ?? "new"}`}
              value={`${c.mode}:${c.id}:${c.contractId ?? "new"}`}
            >
              {c.name}
              {c.conceptAlias?.trim() && c.conceptAlias.trim() !== c.name
                ? ` (${c.conceptAlias.trim()})`
                : ""}
              {c.mode === "restore" ? " — re-enable" : c.mode === "review" ? " — make live" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={open} onOpenChange={(o) => { if (!o && !importMut.isPending) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {conceptsQ.data?.find((c) => c.id === conceptId)?.name ?? "concept"}
            </DialogTitle>
            <DialogDescription>
              Choose a previous festival to import this concept's data from. Imported rows
              land as an editable draft — you can review and trim them before promoting.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Source festival</label>
              {sourcesQ.isLoading ? (
                <div className="text-sm text-muted-foreground py-2">Loading…</div>
              ) : (sourcesQ.data ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">
                  No previous festival has this concept yet.
                </div>
              ) : (
                <Select value={sourceFestivalId} onValueChange={setSourceFestivalId}>
                  <SelectTrigger><SelectValue placeholder="Pick festival…" /></SelectTrigger>
                  <SelectContent>
                    {(sourcesQ.data ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}{f.start_date ? ` — ${f.start_date.slice(0, 4)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={importMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => importMut.mutate()}
              disabled={!sourceFestivalId || importMut.isPending}
            >
              {importMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import as draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
