import { useMemo, useState } from "react";
import { Plus, Trash2, Wand2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CONCEPT_ORDER, conceptHeaderClass } from "@/lib/staffGrid";

interface Concept { id: string; slug: string; name: string; }
interface Station { id: string; concept_id: string | null; label: string; display_order?: number | null; }
interface FestivalPosition {
  id: string;
  concept_id: string | null;
  station_id: string;
  slots_needed: number | null;
}
interface AssignmentShiftRow {
  staff_id: string;
  primary_concept_id: string | null;
  station_id: string | null;
}

interface Props {
  festivalId: string;
  concepts: Concept[];
  stations: Station[];
  positions: FestivalPosition[];
  activeConceptIds: Set<string>;
  // Used to compute "filled" + auto-suggest
  shiftDuty: AssignmentShiftRow[];
  onChanged: () => void;
}

export default function PositionsPanel(props: Props) {
  const { festivalId, concepts, stations, positions, activeConceptIds, shiftDuty, onChanged } = props;
  const [open, setOpen] = useState(positions.length === 0);
  const [showAdd, setShowAdd] = useState(false);
  const [addConceptId, setAddConceptId] = useState<string>("");
  const [addStationId, setAddStationId] = useState<string>("");
  const [addSlots, setAddSlots] = useState<number>(1);
  const [busy, setBusy] = useState(false);

  // auto-suggest preview
  const [suggestOpen, setSuggestOpen] = useState(false);
  type Suggestion = { conceptId: string | null; stationId: string; conceptName: string; stationLabel: string; count: number; approve: boolean; };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);

  const orderedConcepts = useMemo(() => {
    const sorted = [...concepts].sort((a, b) => {
      const ai = CONCEPT_ORDER.indexOf(a.slug as any);
      const bi = CONCEPT_ORDER.indexOf(b.slug as any);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return sorted.filter((c) => activeConceptIds.has(c.id));
  }, [concepts, activeConceptIds]);

  const positionsByConcept = useMemo(() => {
    const m = new Map<string, FestivalPosition[]>();
    for (const p of positions) {
      const key = p.concept_id ?? "_none";
      const list = m.get(key) ?? [];
      list.push(p);
      m.set(key, list);
    }
    return m;
  }, [positions]);

  // filled count: distinct staff with a shift at (concept, station)
  const filledMap = useMemo(() => {
    // key = `${conceptId ?? "_"}|${stationId}`
    const map = new Map<string, Set<string>>();
    for (const r of shiftDuty) {
      if (!r.station_id) continue;
      const k = `${r.primary_concept_id ?? "_"}|${r.station_id}`;
      if (!map.has(k)) map.set(k, new Set());
      map.get(k)!.add(r.staff_id);
    }
    return map;
  }, [shiftDuty]);

  function filledFor(conceptId: string | null, stationId: string): number {
    return filledMap.get(`${conceptId ?? "_"}|${stationId}`)?.size ?? 0;
  }

  function stationsForConcept(conceptId: string): Station[] {
    return stations
      .filter((s) => s.concept_id === conceptId)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.label.localeCompare(b.label));
  }

  async function handleAdd() {
    if (!addConceptId || !addStationId) {
      toast.error("Pick concept and station"); return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("festival_position")
        .upsert(
          { festival_id: festivalId, concept_id: addConceptId, station_id: addStationId, slots_needed: addSlots },
          { onConflict: "festival_id,concept_id,station_id" },
        );
      if (error) throw new Error(error.message);
      toast.success("Position saved");
      setShowAdd(false);
      setAddStationId("");
      setAddSlots(1);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSlotChange(pos: FestivalPosition, slots: number) {
    if (slots < 0) return;
    const { error } = await supabase
      .from("festival_position").update({ slots_needed: slots }).eq("id", pos.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }

  async function handleDelete(pos: FestivalPosition) {
    const stn = stationById.get(pos.station_id);
    if (!confirm(`Delete position "${stn?.label ?? "?"}"? Shifts on it stay (just no longer counted as a planned position).`)) return;
    const { error } = await supabase.from("festival_position").delete().eq("id", pos.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Position removed");
    onChanged();
  }

  function buildSuggestions() {
    // Aggregate distinct (concept, station) pairs from shift duty + count distinct staff
    const agg = new Map<string, { conceptId: string | null; stationId: string; staff: Set<string> }>();
    for (const r of shiftDuty) {
      if (!r.station_id) continue;
      const k = `${r.primary_concept_id ?? "_"}|${r.station_id}`;
      if (!agg.has(k)) agg.set(k, { conceptId: r.primary_concept_id, stationId: r.station_id, staff: new Set() });
      agg.get(k)!.staff.add(r.staff_id);
    }
    const existing = new Set(positions.map((p) => `${p.concept_id ?? "_"}|${p.station_id}`));
    const items: Suggestion[] = [];
    for (const [k, v] of agg) {
      if (existing.has(k)) continue;
      if (!v.conceptId) continue; // skip null concept here
      const c = conceptById.get(v.conceptId);
      const s = stationById.get(v.stationId);
      if (!c || !s) continue;
      items.push({
        conceptId: v.conceptId,
        stationId: v.stationId,
        conceptName: c.name,
        stationLabel: s.label,
        count: v.staff.size,
        approve: true,
      });
    }
    items.sort((a, b) => a.conceptName.localeCompare(b.conceptName) || a.stationLabel.localeCompare(b.stationLabel));
    setSuggestions(items);
    setSuggestOpen(true);
  }

  async function confirmSuggestions() {
    const approved = suggestions.filter((s) => s.approve);
    if (approved.length === 0) { setSuggestOpen(false); return; }
    setBusy(true);
    try {
      const rows = approved.map((s) => ({
        festival_id: festivalId,
        concept_id: s.conceptId,
        station_id: s.stationId,
        slots_needed: s.count,
      }));
      const { error } = await supabase.from("festival_position")
        .upsert(rows, { onConflict: "festival_id,concept_id,station_id" });
      if (error) throw new Error(error.message);
      toast.success(`Created ${approved.length} positions`);
      setSuggestOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between p-4">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <div>
                <h2 className="font-heading text-base font-semibold">Positions</h2>
                <p className="text-xs text-muted-foreground">
                  {positions.length} planned across {orderedConcepts.length} active concepts
                </p>
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={buildSuggestions}>
              <Wand2 className="h-4 w-4 mr-1.5" /> Auto-suggest
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add position
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            {orderedConcepts.map((c) => {
              const list = positionsByConcept.get(c.id) ?? [];
              return (
                <div key={c.id} className={`rounded-xl border ${conceptHeaderClass(c.slug)} p-3`}>
                  <div className="font-medium text-sm mb-2">{c.name}</div>
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No positions yet — use Add or Auto-suggest.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {list.map((p) => {
                        const stn = stationById.get(p.station_id);
                        const filled = filledFor(p.concept_id, p.station_id);
                        const slots = p.slots_needed ?? 0;
                        return (
                          <li key={p.id} className="flex items-center gap-2 bg-card rounded-md border p-2">
                            <span className="text-sm font-medium flex-1">{stn?.label ?? "?"}</span>
                            <Badge variant="outline" className={
                              filled >= slots && slots > 0
                                ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                                : "border-amber-300 text-amber-700 bg-amber-50"
                            }>
                              {filled}/{slots} filled
                            </Badge>
                            <Input
                              type="number"
                              min={0}
                              value={slots}
                              onChange={(e) => handleSlotChange(p, Number(e.target.value))}
                              className="h-7 w-16 text-xs"
                            />
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(p)}>
                              <Trash2 className="h-4 w-4 text-rose-600" />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add position</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Concept</Label>
              <Select value={addConceptId} onValueChange={(v) => { setAddConceptId(v); setAddStationId(""); }}>
                <SelectTrigger><SelectValue placeholder="Pick concept" /></SelectTrigger>
                <SelectContent>
                  {orderedConcepts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Station</Label>
              <Select value={addStationId} onValueChange={setAddStationId} disabled={!addConceptId}>
                <SelectTrigger><SelectValue placeholder={addConceptId ? "Pick station" : "Pick concept first"} /></SelectTrigger>
                <SelectContent>
                  {addConceptId && stationsForConcept(addConceptId).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Slots needed</Label>
              <Input
                type="number" min={1} value={addSlots}
                onChange={(e) => setAddSlots(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleAdd} disabled={busy || !addConceptId || !addStationId}>
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suggest dialog */}
      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Suggested positions from current shifts</DialogTitle></DialogHeader>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No new positions to suggest — every (concept, station) combination from existing shifts already has a planned position.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {suggestions.map((s, i) => (
                <li key={i} className="flex items-center gap-2 border rounded-md p-2">
                  <Checkbox
                    checked={s.approve}
                    onCheckedChange={(v) => setSuggestions((prev) =>
                      prev.map((x, j) => j === i ? { ...x, approve: !!v } : x))}
                  />
                  <span className="flex-1 text-sm">
                    <span className="font-medium">{s.stationLabel}</span>
                    <span className="text-muted-foreground"> · {s.conceptName}</span>
                  </span>
                  <Badge variant="outline">{s.count} {s.count === 1 ? "person" : "people"}</Badge>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmSuggestions}
              disabled={busy || suggestions.filter((s) => s.approve).length === 0}
            >
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create {suggestions.filter((s) => s.approve).length} positions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
