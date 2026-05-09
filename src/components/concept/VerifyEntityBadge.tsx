import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface VerifyEntityQuestion {
  id: string;
  festival_id: string;
  concept_id: string | null;
  question: string;
  context: string | null;
  status: string;
}

interface Props {
  question: VerifyEntityQuestion;
  contractId: string;
  currentEntity: string | null;
  currentCvr: string | null;
}

export function VerifyEntityBadge({ question, contractId, currentEntity, currentCvr }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [entity, setEntity] = useState(currentEntity ?? "");
  const [cvr, setCvr] = useState(currentCvr ?? "");

  const resolve = useMutation({
    mutationFn: async (resolution: string) => {
      const { error } = await supabase
        .from("festival_open_questions")
        .update({
          status: "resolved",
          resolution,
          resolved_date: new Date().toISOString().slice(0, 10),
        })
        .eq("id", question.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verify-entity-questions"] });
      qc.invalidateQueries({ queryKey: ["festival-contracts-grid"] });
      setOpen(false);
      toast.success("Question resolved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const markResearch = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("festival_open_questions")
        .update({ priority: "high", context: (question.context ?? "") + " — Marked as needs research " + new Date().toISOString().slice(0, 10) })
        .eq("id", question.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verify-entity-questions"] });
      setOpen(false);
      toast.success("Marked as needs research");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const saveEntity = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await (supabase as any)
        .from("festival_contracts_finance")
        .upsert(
          { contract_id: contractId, operating_entity: entity || null, cvr: cvr || null },
          { onConflict: "contract_id" }
        );
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("festival_open_questions")
        .update({
          status: "resolved",
          resolution: `Updated entity to ${entity || "(blank)"}${cvr ? " · CVR " + cvr : ""}`,
          resolved_date: new Date().toISOString().slice(0, 10),
        })
        .eq("id", question.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verify-entity-questions"] });
      qc.invalidateQueries({ queryKey: ["festival-contracts-grid"] });
      setOpen(false);
      setEditing(false);
      toast.success("Entity updated and question resolved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 text-[10px] font-medium hover:bg-yellow-500/20 transition"
        title="Verify operating entity"
      >
        <AlertTriangle className="h-3 w-3" /> Verify
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Verify operating entity</SheetTitle>
            <SheetDescription>{question.question}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3 text-sm">
            {question.context && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">{question.context}</div>
            )}

            <div className="rounded-md border p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Currently recorded</div>
              <div className="font-medium">{currentEntity ?? "(blank)"}</div>
              {currentCvr && <div className="text-xs text-muted-foreground">CVR {currentCvr}</div>}
            </div>

            {editing ? (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Operating entity</Label>
                  <Input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="The Fish Project ApS" />
                </div>
                <div>
                  <Label className="text-xs">CVR</Label>
                  <Input value={cvr} onChange={(e) => setCvr(e.target.value)} placeholder="e.g. 40747745" />
                </div>
              </div>
            ) : null}
          </div>

          <SheetFooter className="mt-6 flex-col gap-2 sm:flex-col">
            {!editing ? (
              <>
                <Button onClick={() => resolve.mutate("confirmed_as_recorded")} disabled={resolve.isPending}>
                  Confirm as recorded
                </Button>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Edit entity
                </Button>
                <Button variant="ghost" onClick={() => markResearch.mutate()} disabled={markResearch.isPending}>
                  Mark as needs research
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => saveEntity.mutate()} disabled={saveEntity.isPending || !entity}>
                  Save and resolve
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Hook: returns map keyed by `${festival_id}|${concept_id ?? "*"}` */
export function useVerifyEntityQuestions(festivalId: string | undefined) {
  return useQuery({
    queryKey: ["verify-entity-questions", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_open_questions")
        .select("id, festival_id, concept_id, question, context, status")
        .eq("festival_id", festivalId!)
        .eq("question_type", "verify_operating_entity")
        .eq("status", "open");
      if (error) throw error;
      return (data ?? []) as VerifyEntityQuestion[];
    },
  });
}
