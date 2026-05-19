import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { computeShiftHours } from "@/lib/staffImport";
import { FestivalDay } from "@/lib/staffGrid";

export interface ShiftDrawerStaff {
  id: string;                 // staff.id
  full_name: string;
  display_name: string | null;
  hasAssignment: boolean;     // true if staff already has festival_staff_assignment
  assignmentId: string | null;
  primaryConceptId: string | null;
  skilledStationIds: Set<string>;
}

export interface ShiftDrawerStation {
  id: string;
  label: string;
  conceptId: string | null;
}

export interface ShiftDrawerConcept {
  id: string;
  slug: string;
  name: string;
}

export interface EditingShift {
  id: string;
  assignmentId: string;
  staffId: string;
  shiftDate: string;
  stationId: string | null;
  startTime: string | null;
  endTime: string | null;
  shiftLabel: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  festivalId: string;
  days: FestivalDay[];
  staffOptions: ShiftDrawerStaff[];
  stations: ShiftDrawerStation[];
  concepts: ShiftDrawerConcept[];
  initial: {
    mode: "create" | "edit";
    editing?: EditingShift;
    defaults?: {
      staffId?: string | null;
      conceptId?: string | null;
      stationId?: string | null;
      dayIso?: string | null;
    };
  };
}

export default function ShiftDrawer(props: Props) {
  const { open, onClose, onSaved, festivalId, days, staffOptions, stations, concepts, initial } = props;

  const [staffId, setStaffId] = useState<string>("");
  const [conceptId, setConceptId] = useState<string>("");
  const [stationId, setStationId] = useState<string>("");
  const [dayIso, setDayIso] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [shiftLabel, setShiftLabel] = useState<string>("");
  const [staffFilter, setStaffFilter] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Seed on open
  useEffect(() => {
    if (!open) return;
    if (initial.mode === "edit" && initial.editing) {
      const e = initial.editing;
      setStaffId(e.staffId);
      setStationId(e.stationId ?? "");
      const sourceStation = stations.find((s) => s.id === e.stationId);
      const fromAssn = staffOptions.find((s) => s.id === e.staffId)?.primaryConceptId ?? null;
      setConceptId(sourceStation?.conceptId ?? fromAssn ?? "");
      setDayIso(e.shiftDate);
      setStartTime(e.startTime ?? "");
      setEndTime(e.endTime ?? "");
      setShiftLabel(e.shiftLabel ?? "");
    } else {
      const d = initial.defaults ?? {};
      setStaffId(d.staffId ?? "");
      setConceptId(d.conceptId ?? "");
      setStationId(d.stationId ?? "");
      setDayIso(d.dayIso ?? days[0]?.iso ?? "");
      setStartTime("");
      setEndTime("");
      setShiftLabel("");
    }
    setStaffFilter("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const stationsForConcept = useMemo(
    () => stations.filter((s) => s.conceptId === (conceptId || null)),
    [stations, conceptId],
  );

  const filteredStaff = useMemo(() => {
    const q = staffFilter.trim().toLowerCase();
    const list = q
      ? staffOptions.filter((s) =>
          s.full_name.toLowerCase().includes(q) ||
          (s.display_name ?? "").toLowerCase().includes(q))
      : staffOptions;
    // Sort: assigned-first, then alpha
    return [...list].sort((a, b) => {
      if (a.hasAssignment !== b.hasAssignment) return a.hasAssignment ? -1 : 1;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [staffOptions, staffFilter]);

  const computed = computeShiftHours(startTime || null, endTime || null);

  const canSave =
    !!staffId && !!conceptId && !!dayIso && !!startTime && !!endTime && computed.hours > 0;

  async function handleSave() {
    if (!canSave) return;
    setBusy(true);
    try {
      // 1. Ensure assignment for (festival, staff)
      const existing = await supabase
        .from("festival_staff_assignment")
        .select("id, primary_concept_id")
        .eq("festival_id", festivalId)
        .eq("staff_id", staffId)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);

      let assignmentId: string;
      if (existing.data?.id) {
        assignmentId = existing.data.id;
        if (!existing.data.primary_concept_id) {
          await supabase.from("festival_staff_assignment")
            .update({ primary_concept_id: conceptId })
            .eq("id", assignmentId);
        }
      } else {
        const ins = await supabase.from("festival_staff_assignment")
          .insert({ festival_id: festivalId, staff_id: staffId, primary_concept_id: conceptId })
          .select("id").single();
        if (ins.error) throw new Error(ins.error.message);
        assignmentId = ins.data!.id;
      }

      const payload = {
        assignment_id: assignmentId,
        shift_date: dayIso,
        station_id: stationId || null,
        start_time: startTime,
        end_time: endTime,
        crosses_midnight: computed.crossesMidnight,
        computed_hours: computed.hours,
        shift_label: shiftLabel.trim() || null,
      };

      if (initial.mode === "edit" && initial.editing) {
        const { error } = await supabase
          .from("festival_staff_shift").update(payload).eq("id", initial.editing.id);
        if (error) throw new Error(error.message);
        toast.success("Shift updated");
      } else {
        const { error } = await supabase.from("festival_staff_shift").insert(payload);
        if (error) throw new Error(error.message);
        toast.success("Shift added");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (initial.mode !== "edit" || !initial.editing) return;
    if (!confirm("Delete this shift? The person and their assignment stay.")) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("festival_staff_shift")
        .delete().eq("id", initial.editing.id);
      if (error) throw new Error(error.message);
      toast.success("Shift deleted");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial.mode === "edit" ? "Edit shift" : "Add shift"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Person */}
          <div className="space-y-1.5">
            <Label>Person</Label>
            <Input
              placeholder="Search…"
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className="h-8"
            />
            <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
              {filteredStaff.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">No staff match.</div>
              ) : filteredStaff.map((s) => {
                const matches = stationId && s.skilledStationIds.has(stationId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStaffId(s.id)}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between ${
                      staffId === s.id ? "bg-sky-50" : "hover:bg-muted/50"
                    }`}
                  >
                    <span>
                      {s.full_name}
                      {s.display_name && s.display_name !== s.full_name && (
                        <span className="text-muted-foreground"> · {s.display_name}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      {!s.hasAssignment && <Badge variant="outline" className="text-[10px]">new to fest</Badge>}
                      {matches && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">matches</Badge>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Concept + Station */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Concept</Label>
              <Select value={conceptId} onValueChange={(v) => { setConceptId(v); setStationId(""); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick concept" /></SelectTrigger>
                <SelectContent>
                  {concepts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Position (station)</Label>
              <Select value={stationId || "_none"} onValueChange={(v) => setStationId(v === "_none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick station" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— No specific station —</SelectItem>
                  {stationsForConcept.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Day + times */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Day</Label>
              <Select value={dayIso} onValueChange={setDayIso}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Day" /></SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d.iso} value={d.iso}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {startTime && endTime ? (
              <>Hours: <span className="font-medium text-foreground">{computed.hours}h</span>
                {computed.crossesMidnight && " — crosses midnight"}
              </>
            ) : "Set start and end to compute hours."}
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label>Shift label (optional)</Label>
            <Input
              value={shiftLabel}
              onChange={(e) => setShiftLabel(e.target.value)}
              placeholder="e.g. Setup + prep, SWAP BACK"
              className="h-9"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {initial.mode === "edit" && (
            <Button variant="outline" onClick={handleDelete} disabled={busy} className="text-rose-700 mr-auto">
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {initial.mode === "edit" ? "Save changes" : "Add shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
