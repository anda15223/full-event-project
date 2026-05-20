import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Search, Trash2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  computeShiftHours,
  formatHoursMinutes,
  formatTimeHHMM,
  intervalsOverlap,
  shiftIntervalMin,
  type FestivalDay,
} from "@/lib/scheduling";

export interface ShiftEditorShift {
  id: string;
  schedule_position_id: string;
  shift_date: string;
  festival_staff_id: string;
  staff_name: string | null;
  start_time: string;
  end_time: string;
  notes: string | null;
  position_label?: string;
  concept_name?: string;
}

export interface FestivalStaffLite {
  id: string;
  name: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  festivalId: string;
  schedulePositionId: string;
  shiftDate: string;
  conceptId: string;
  positionLabel: string;
  conceptName: string;
  shiftDateLabel: string;
  conceptHoursForDay?: { open_time: string; close_time: string } | null;
  existingShift?: {
    id: string;
    festival_staff_id: string;
    staff_name: string | null;
    start_time: string;
    end_time: string;
    notes: string | null;
  } | null;
  allShiftsForFestival: ShiftEditorShift[];
  festivalStaffList: FestivalStaffLite[];
  festivalDays: FestivalDay[];
  onSaved: () => void;
}

const trim = (t: string) => (t ?? "").slice(0, 5);

export default function ShiftEditor(props: Props) {
  const {
    open, onOpenChange, mode, schedulePositionId, shiftDate,
    positionLabel, conceptName, shiftDateLabel, conceptHoursForDay,
    existingShift, allShiftsForFestival, festivalStaffList, festivalDays, onSaved,
  } = props;

  const [staffId, setStaffId] = useState<string>("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<{ staff?: string; time?: string }>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [duplicateDays, setDuplicateDays] = useState<Set<string>>(new Set());
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && existingShift) {
      setStaffId(existingShift.festival_staff_id);
      setStart(trim(existingShift.start_time));
      setEnd(trim(existingShift.end_time));
      setNotes(existingShift.notes ?? "");
    } else {
      setStaffId("");
      setStart(trim(conceptHoursForDay?.open_time || "") || "10:00");
      setEnd(trim(conceptHoursForDay?.close_time || "") || "22:00");
      setNotes("");
    }
    setErrors({});
    setPickerOpen(false);
    setSearch("");
    setConfirmDelete(false);
    setDuplicateDays(new Set());
  }, [open, mode, existingShift, conceptHoursForDay]);

  const sortedStaff = useMemo(() => {
    return [...festivalStaffList].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? ""),
    );
  }, [festivalStaffList]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedStaff;
    return sortedStaff.filter((s) => (s.name ?? "").toLowerCase().includes(q));
  }, [sortedStaff, search]);

  const otherShiftsForStaff = (sid: string) =>
    allShiftsForFestival.filter(
      (s) =>
        s.festival_staff_id === sid &&
        s.shift_date === shiftDate &&
        (mode !== "edit" || s.id !== existingShift?.id),
    );

  const liveHours =
    start && end ? computeShiftHours(start, end) : 0;

  const conflict = useMemo(() => {
    if (!staffId || !start || !end) return null;
    const others = otherShiftsForStaff(staffId);
    if (others.length === 0) return null;
    const cur = shiftIntervalMin(start, end);
    const overlapping = others.filter((o) =>
      intervalsOverlap(cur, shiftIntervalMin(o.start_time, o.end_time)),
    );
    return {
      others,
      overlapping,
      hasOverlap: overlapping.length > 0,
    };
  }, [staffId, start, end, allShiftsForFestival, shiftDate, mode, existingShift?.id]);

  const selectedStaff = sortedStaff.find((s) => s.id === staffId);

  function validate(): boolean {
    const e: typeof errors = {};
    if (!staffId) e.staff = "Pick a staff member";
    if (!start || !end) e.time = "Start and end are required";
    else if (start === end) e.time = "Start and end cannot be the same time";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      if (mode === "edit" && existingShift) {
        const { error } = await supabase
          .from("festival_schedule_shift")
          .update({
            festival_staff_id: staffId,
            start_time: start,
            end_time: end,
            notes: notes.trim() || null,
          })
          .eq("id", existingShift.id);
        if (error) throw error;
        toast.success("Shift updated");
      } else {
        const { error } = await supabase
          .from("festival_schedule_shift")
          .insert({
            schedule_position_id: schedulePositionId,
            shift_date: shiftDate,
            festival_staff_id: staffId,
            start_time: start,
            end_time: end,
            notes: notes.trim() || null,
          });
        if (error) throw error;
        toast.success("Shift saved");
      }
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save shift");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existingShift) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("festival_schedule_shift")
        .delete()
        .eq("id", existingShift.id);
      if (error) throw error;
      toast.success("Shift deleted");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete shift");
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Edit shift" : "Add shift"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Position: </span>
                <span className="font-medium">{conceptName} / {positionLabel}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Day: </span>
                <span className="font-medium">{shiftDateLabel}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Staff</label>
              {!pickerOpen ? (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="w-full text-left rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
                >
                  {selectedStaff?.name ?? (
                    <span className="text-muted-foreground">Select staff…</span>
                  )}
                </button>
              ) : (
                <div className="rounded-md border bg-background">
                  <div className="flex items-center gap-2 border-b px-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search staff…"
                      className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-9"
                    />
                  </div>
                  <div className="max-h-64 overflow-auto p-1">
                    {filteredStaff.length === 0 && (
                      <div className="p-3 text-xs text-muted-foreground">No staff found.</div>
                    )}
                    {filteredStaff.map((s) => {
                      const others = otherShiftsForStaff(s.id);
                      const hasOther = others.length > 0;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setStaffId(s.id);
                            setPickerOpen(false);
                            setErrors((e) => ({ ...e, staff: undefined }));
                          }}
                          className="w-full text-left rounded-md px-2 py-1.5 hover:bg-accent flex flex-col gap-0.5"
                        >
                          <div className="flex items-center gap-1.5 text-sm">
                            {staffId === s.id && <Check className="h-3.5 w-3.5" />}
                            {hasOther && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                            )}
                            <span className={hasOther ? "font-medium text-amber-700" : "font-medium"}>
                              {s.name ?? "(no name)"}
                            </span>
                          </div>
                          {hasOther && (
                            <div className="ml-5 text-[11px] text-muted-foreground space-y-0.5">
                              <div>Already today:</div>
                              {others.map((o) => (
                                <div key={o.id}>
                                  • {o.concept_name ?? "?"} / {o.position_label ?? "?"} /{" "}
                                  {formatTimeHHMM(o.start_time)}–{formatTimeHHMM(o.end_time)}
                                </div>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {errors.staff && (
                <p className="text-xs text-destructive">{errors.staff}</p>
              )}
            </div>

            {conflict && (
              <div
                className={`rounded-md border p-3 text-xs space-y-1 ${
                  conflict.hasOverlap
                    ? "border-destructive/40 bg-destructive/5 text-destructive"
                    : "border-amber-400/60 bg-amber-50 text-amber-900"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {conflict.hasOverlap
                    ? `${selectedStaff?.name ?? "Staff"} is double-booked`
                    : `${selectedStaff?.name ?? "Staff"} also works today`}
                </div>
                {conflict.others.map((o) => (
                  <div key={o.id}>
                    • {o.concept_name ?? "?"} / {o.position_label ?? "?"} /{" "}
                    {formatTimeHHMM(o.start_time)}–{formatTimeHHMM(o.end_time)}
                  </div>
                ))}
                <div className="pt-1 opacity-90">
                  {conflict.hasOverlap
                    ? `Overlaps with this shift's ${start}–${end}. Confirm before saving.`
                    : "Times don't overlap with this shift."}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start time</label>
                <Input
                  type="time"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setErrors((er) => ({ ...er, time: undefined }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">End time</label>
                <Input
                  type="time"
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setErrors((er) => ({ ...er, time: undefined }));
                  }}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Hours: <span className="font-medium text-foreground">{formatHoursMinutes(liveHours)}</span>
            </div>
            {errors.time && (
              <p className="text-xs text-destructive">{errors.time}</p>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="flex sm:justify-between gap-2 pt-2">
            <div>
              {mode === "edit" && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                Save shift
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the shift. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
