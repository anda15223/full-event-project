import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { positionLabel, conceptAccentClass } from "@/lib/scheduling";

interface Props {
  festivalId: string;
}

interface ConceptRow {
  id: string;
  name: string;
  short_name: string | null;
  slug: string | null;
}

interface StationRow {
  id: string;
  concept_id: string | null;
  code: string;
  label: string;
  display_order: number | null;
}

interface PositionRow {
  id: string;
  festival_id: string;
  concept_id: string;
  station_id: string;
  position_number: number;
  display_order: number;
  notes: string | null;
  station: { label: string } | null;
}

export default function PositionManager({ festivalId }: Props) {
  const qc = useQueryClient();
  const [addOpenForConcept, setAddOpenForConcept] = useState<ConceptRow | null>(null);
  const [pendingStationId, setPendingStationId] = useState<string>("");
  const [pendingNotes, setPendingNotes] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{ id: string; label: string } | null>(null);

  // a) Active concepts for this festival
  const conceptsQ = useQuery({
    queryKey: ["sched-concepts", festivalId],
    queryFn: async (): Promise<ConceptRow[]> => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select("concept_id, concepts:concept_id(id, name, short_name, slug)")
        .eq("festival_id", festivalId)
        .eq("is_active", true);
      if (error) throw error;
      const seen = new Set<string>();
      const out: ConceptRow[] = [];
      for (const row of data ?? []) {
        const c = (row as any).concepts as ConceptRow | null;
        if (c && !seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    },
  });

  // b) All positions for this festival
  const positionsQ = useQuery({
    queryKey: ["sched-positions", festivalId],
    queryFn: async (): Promise<PositionRow[]> => {
      const { data, error } = await supabase
        .from("festival_schedule_position")
        .select("id, festival_id, concept_id, station_id, position_number, display_order, notes, station:station_id(label)")
        .eq("festival_id", festivalId)
        .order("concept_id")
        .order("display_order")
        .order("position_number");
      if (error) throw error;
      return (data ?? []) as unknown as PositionRow[];
    },
  });

  // c) All active stations
  const stationsQ = useQuery({
    queryKey: ["sched-stations"],
    queryFn: async (): Promise<StationRow[]> => {
      const { data, error } = await supabase
        .from("station")
        .select("id, concept_id, code, label, display_order")
        .eq("is_active", true)
        .order("concept_id")
        .order("display_order")
        .order("label");
      if (error) throw error;
      return (data ?? []) as StationRow[];
    },
  });

  const stationsByConcept = useMemo(() => {
    const map = new Map<string, StationRow[]>();
    for (const s of stationsQ.data ?? []) {
      if (!s.concept_id) continue;
      const list = map.get(s.concept_id) ?? [];
      list.push(s);
      map.set(s.concept_id, list);
    }
    return map;
  }, [stationsQ.data]);

  const positionsByConcept = useMemo(() => {
    const map = new Map<string, PositionRow[]>();
    for (const p of positionsQ.data ?? []) {
      const list = map.get(p.concept_id) ?? [];
      list.push(p);
      map.set(p.concept_id, list);
    }
    return map;
  }, [positionsQ.data]);

  const addMutation = useMutation({
    mutationFn: async (args: { conceptId: string; stationId: string; notes: string | null }) => {
      const existing = (positionsQ.data ?? []).filter(
        (p) => p.concept_id === args.conceptId,
      );
      const sameStation = existing.filter((p) => p.station_id === args.stationId);
      const nextPosNum = (sameStation.reduce((m, p) => Math.max(m, p.position_number), 0)) + 1;
      const nextOrder = (existing.reduce((m, p) => Math.max(m, p.display_order), 0)) + 1;

      const { error } = await supabase.from("festival_schedule_position").insert({
        festival_id: festivalId,
        concept_id: args.conceptId,
        station_id: args.stationId,
        position_number: nextPosNum,
        display_order: nextOrder,
        notes: args.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sched-positions", festivalId] });
      toast.success("Position added");
      setAddOpenForConcept(null);
      setPendingStationId("");
      setPendingNotes("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add position"),
  });

  const removeMutation = useMutation({
    mutationFn: async (positionId: string) => {
      const target = (positionsQ.data ?? []).find((p) => p.id === positionId);
      if (!target) throw new Error("Position not found");

      const { error: delErr } = await supabase
        .from("festival_schedule_position")
        .delete()
        .eq("id", positionId);
      if (delErr) throw delErr;

      // Renumber remaining siblings (same festival+concept+station)
      const { data: siblings, error: sibErr } = await supabase
        .from("festival_schedule_position")
        .select("id, position_number")
        .eq("festival_id", festivalId)
        .eq("concept_id", target.concept_id)
        .eq("station_id", target.station_id)
        .order("position_number");
      if (sibErr) throw sibErr;

      for (let i = 0; i < (siblings ?? []).length; i++) {
        const s = siblings![i];
        const desired = i + 1;
        if (s.position_number !== desired) {
          // bump to a safe value first to avoid UNIQUE collisions
          const tmp = 10000 + i;
          await supabase
            .from("festival_schedule_position")
            .update({ position_number: tmp })
            .eq("id", s.id);
        }
      }
      for (let i = 0; i < (siblings ?? []).length; i++) {
        const s = siblings![i];
        const desired = i + 1;
        await supabase
          .from("festival_schedule_position")
          .update({ position_number: desired })
          .eq("id", s.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sched-positions", festivalId] });
      toast.success("Position removed");
      setRemoveTarget(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove position"),
  });

  if (conceptsQ.isLoading || positionsQ.isLoading || stationsQ.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const concepts = conceptsQ.data ?? [];

  if (concepts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        No active concepts for this festival. Activate concepts on the Contracts card first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {concepts.map((concept) => {
        const positions = positionsByConcept.get(concept.id) ?? [];
        const stationCounts = new Map<string, number>();
        for (const p of positions) {
          stationCounts.set(p.station_id, (stationCounts.get(p.station_id) ?? 0) + 1);
        }
        return (
          <section
            key={concept.id}
            className={`rounded-lg border ${conceptAccentClass(concept.slug)}`}
          >
            <header className="px-4 py-3 border-b border-current/10">
              <h3 className="font-heading font-semibold">
                {concept.short_name ?? concept.name}
              </h3>
            </header>
            <div className="bg-card rounded-b-lg">
              {positions.length === 0 ? (
                <div className="px-4 py-4 text-sm text-muted-foreground italic">
                  (no positions yet)
                </div>
              ) : (
                <ul className="divide-y">
                  {positions.map((p, idx) => {
                    const sibCount = stationCounts.get(p.station_id) ?? 1;
                    const label = positionLabel(
                      p.station?.label ?? "Unknown station",
                      p.position_number,
                      sibCount,
                    );
                    return (
                      <li key={p.id} className="flex items-center justify-between px-4 py-2">
                        <span className="text-sm">
                          <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                          {label}
                          {p.notes && (
                            <span className="ml-2 text-xs text-muted-foreground">— {p.notes}</span>
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setRemoveTarget({ id: p.id, label })}
                          aria-label={`Remove ${label}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="px-4 py-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAddOpenForConcept(concept);
                    setPendingStationId("");
                    setPendingNotes("");
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add position to {concept.short_name ?? concept.name}
                </Button>
              </div>
            </div>
          </section>
        );
      })}

      {/* Add position dialog */}
      <Dialog
        open={!!addOpenForConcept}
        onOpenChange={(o) => {
          if (!o) setAddOpenForConcept(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add position to {addOpenForConcept?.short_name ?? addOpenForConcept?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Station</Label>
              <Select value={pendingStationId} onValueChange={setPendingStationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a station…" />
                </SelectTrigger>
                <SelectContent>
                  {(addOpenForConcept ? stationsByConcept.get(addOpenForConcept.id) ?? [] : []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={pendingNotes}
                onChange={(e) => setPendingNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpenForConcept(null)}>
              Cancel
            </Button>
            <Button
              disabled={!pendingStationId || addMutation.isPending}
              onClick={() => {
                if (!addOpenForConcept || !pendingStationId) return;
                addMutation.mutate({
                  conceptId: addOpenForConcept.id,
                  stationId: pendingStationId,
                  notes: pendingNotes.trim() || null,
                });
              }}
            >
              Add position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(o) => {
          if (!o) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this position?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">"{removeTarget?.label}"</span>
              <br />
              Any shifts assigned to this position will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
