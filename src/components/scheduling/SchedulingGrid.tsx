import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, AlertTriangle, Plus, Pencil, Copy, Trash2, X, Clipboard } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  positionLabel,
  conceptAccentClass,
  conceptChipClass,
  festivalDays,
  formatHoursMinutes,
  formatTimeHHMM,
  intervalsOverlap,
  shiftIntervalMin,
} from "@/lib/scheduling";
import ConceptHoursDialog from "./ConceptHoursDialog";
import ShiftEditor, { ShiftEditorShift, FestivalStaffLite } from "./ShiftEditor";

interface HoursRow {
  id: string;
  festival_id: string;
  concept_id: string;
  operating_date: string;
  open_time: string;
  close_time: string;
  crosses_midnight: boolean;
  computed_hours: number | null;
  notes: string | null;
}


interface Props {
  festivalId: string;
  onGoToPositions?: () => void;
}



interface FestivalRow {
  id: string;
  start_date: string;
  end_date: string;
}
interface ConceptRow {
  id: string;
  name: string;
  short_name: string | null;
  slug: string | null;
}
interface PositionRow {
  id: string;
  concept_id: string;
  station_id: string;
  position_number: number;
  display_order: number;
  notes: string | null;
  station_label: string;
  display_name: string | null;
}
interface ShiftRow {
  id: string;
  schedule_position_id: string;
  shift_date: string;
  festival_staff_id: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  computed_hours: number;
  notes: string | null;
  staff_name: string | null;
}

interface CopiedShift {
  sourceShiftId: string;
  staffId: string;
  staffName: string | null;
  startTime: string;
  endTime: string;
  notes: string | null;
}

export default function SchedulingGrid({ festivalId, onGoToPositions }: Props) {
  const festivalQ = useQuery({
    queryKey: ["sched-grid-festival", festivalId],
    queryFn: async (): Promise<FestivalRow> => {

      const { data, error } = await supabase
        .from("festivals")
        .select("id, start_date, end_date")
        .eq("id", festivalId)
        .single();
      if (error) throw error;
      return data as FestivalRow;
    },
  });

  const conceptsQ = useQuery({
    queryKey: ["sched-grid-concepts", festivalId],
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

  const positionsQ = useQuery({
    queryKey: ["sched-grid-positions", festivalId],
    queryFn: async (): Promise<PositionRow[]> => {
      const { data, error } = await supabase
        .from("festival_schedule_position")
        .select("id, concept_id, station_id, position_number, display_order, notes, display_name, station:station_id(label)")
        .eq("festival_id", festivalId)
        .order("concept_id")
        .order("display_order")
        .order("position_number");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        concept_id: r.concept_id,
        station_id: r.station_id,
        position_number: r.position_number,
        display_order: r.display_order,
        notes: r.notes,
        station_label: r.station?.label ?? "Unknown station",
        display_name: r.display_name ?? null,
      }));
    },
  });

  const hoursQ = useQuery({
    queryKey: ["sched-grid-hours", festivalId],
    queryFn: async (): Promise<HoursRow[]> => {
      const { data, error } = await supabase
        .from("festival_concept_hours")
        .select("id, festival_id, concept_id, operating_date, open_time, close_time, crosses_midnight, computed_hours, notes")
        .eq("festival_id", festivalId)
        .order("concept_id")
        .order("operating_date");
      if (error) throw error;
      return (data ?? []) as HoursRow[];
    },
  });


  const shiftsQ = useQuery({
    queryKey: ["sched-grid-shifts", festivalId],
    enabled: !!positionsQ.data,
    queryFn: async (): Promise<ShiftRow[]> => {
      const posIds = (positionsQ.data ?? []).map((p) => p.id);
      if (posIds.length === 0) return [];
      const { data, error } = await supabase
        .from("festival_schedule_shift")
        .select("id, schedule_position_id, shift_date, festival_staff_id, start_time, end_time, crosses_midnight, computed_hours, notes, staff:festival_staff_id(name)")
        .in("schedule_position_id", posIds)
        .order("shift_date")
        .order("start_time");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        schedule_position_id: r.schedule_position_id,
        shift_date: r.shift_date,
        festival_staff_id: r.festival_staff_id,
        start_time: r.start_time,
        end_time: r.end_time,
        crosses_midnight: r.crosses_midnight,
        computed_hours: Number(r.computed_hours),
        notes: r.notes,
        staff_name: r.staff?.name ?? null,
      }));
    },
  });

  const staffQ = useQuery({
    queryKey: ["sched-grid-staff", festivalId],
    queryFn: async (): Promise<FestivalStaffLite[]> => {
      const { data, error } = await supabase
        .from("festival_staff")
        .select("id, name")
        .eq("festival_id", festivalId);
      if (error) throw error;
      return (data ?? []) as FestivalStaffLite[];
    },
  });

  const hoursByConceptByDate = useMemo(() => {
    const m = new Map<string, Map<string, HoursRow>>();
    for (const h of hoursQ.data ?? []) {
      let inner = m.get(h.concept_id);
      if (!inner) {
        inner = new Map();
        m.set(h.concept_id, inner);
      }
      inner.set(h.operating_date, h);
    }
    return m;
  }, [hoursQ.data]);

  const [hoursDialog, setHoursDialog] = useState<{
    conceptId: string;
    conceptName: string;
  } | null>(null);

  const [editor, setEditor] = useState<{
    mode: "create" | "edit";
    schedulePositionId: string;
    shiftDate: string;
    conceptId: string;
    positionLabel: string;
    conceptName: string;
    shiftDateLabel: string;
    existingShiftId?: string;
  } | null>(null);

  // Copy mode + delete-confirm state
  const [copied, setCopied] = useState<CopiedShift | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    shiftId: string;
    name: string;
    timeLabel: string;
    contextLabel: string;
  } | null>(null);

  // Escape cancels copy mode
  useEffect(() => {
    if (!copied) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCopied(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copied]);

  const days = useMemo(() => {
    if (!festivalQ.data) return [];
    return festivalDays(festivalQ.data.start_date, festivalQ.data.end_date);
  }, [festivalQ.data]);

  const conceptById = useMemo(() => {
    const m = new Map<string, ConceptRow>();
    for (const c of conceptsQ.data ?? []) m.set(c.id, c);
    return m;
  }, [conceptsQ.data]);

  // Group positions by concept (preserve order). Include positions whose concept is inactive.
  const grouped = useMemo(() => {
    const positions = positionsQ.data ?? [];
    const concepts = conceptsQ.data ?? [];
    const byConcept = new Map<string, PositionRow[]>();
    for (const p of positions) {
      const list = byConcept.get(p.concept_id) ?? [];
      list.push(p);
      byConcept.set(p.concept_id, list);
    }
    // station sibling counts per concept+station
    const sibCount = new Map<string, number>();
    for (const p of positions) {
      if (p.display_name && p.display_name.trim().length > 0) continue;
      const k = `${p.concept_id}:${p.station_id}`;
      sibCount.set(k, (sibCount.get(k) ?? 0) + 1);
    }
    const groups: { concept: ConceptRow | null; positions: PositionRow[] }[] = [];
    for (const c of concepts) {
      const list = byConcept.get(c.id);
      if (list && list.length) {
        groups.push({ concept: c, positions: list });
        byConcept.delete(c.id);
      }
    }
    // Leftover positions whose concept is NOT active
    for (const [conceptId, list] of byConcept.entries()) {
      groups.push({
        concept: conceptById.get(conceptId) ?? null,
        positions: list,
      });
    }
    return { groups, sibCount };
  }, [positionsQ.data, conceptsQ.data, conceptById]);

  const shiftsByCell = useMemo(() => {
    const m = new Map<string, ShiftRow[]>();
    for (const s of shiftsQ.data ?? []) {
      const k = `${s.schedule_position_id}|${s.shift_date}`;
      const list = m.get(k) ?? [];
      list.push(s);
      m.set(k, list);
    }
    return m;
  }, [shiftsQ.data]);

  const totalsByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shiftsQ.data ?? []) {
      m.set(s.shift_date, (m.get(s.shift_date) ?? 0) + (s.computed_hours || 0));
    }
    return m;
  }, [shiftsQ.data]);

  const positionInfo = useMemo(() => {
    const m = new Map<string, { label: string; conceptId: string; conceptName: string }>();
    const sibCount = new Map<string, number>();
    for (const p of positionsQ.data ?? []) {
      const k = `${p.concept_id}:${p.station_id}`;
      sibCount.set(k, (sibCount.get(k) ?? 0) + 1);
    }
    for (const p of positionsQ.data ?? []) {
      const c = conceptById.get(p.concept_id);
      const sib = sibCount.get(`${p.concept_id}:${p.station_id}`) ?? 1;
      m.set(p.id, {
        label: positionLabel(p.station_label, p.position_number, sib),
        conceptId: p.concept_id,
        conceptName: c?.short_name ?? c?.name ?? "?",
      });
    }
    return m;
  }, [positionsQ.data, conceptById]);

  const augmentedShifts = useMemo<ShiftEditorShift[]>(() => {
    return (shiftsQ.data ?? []).map((s) => {
      const info = positionInfo.get(s.schedule_position_id);
      return {
        id: s.id,
        schedule_position_id: s.schedule_position_id,
        shift_date: s.shift_date,
        festival_staff_id: s.festival_staff_id,
        staff_name: s.staff_name,
        start_time: s.start_time,
        end_time: s.end_time,
        notes: s.notes,
        position_label: info?.label,
        concept_name: info?.conceptName,
      };
    });
  }, [shiftsQ.data, positionInfo]);

  const shiftsByStaffByDate = useMemo(() => {
    const m = new Map<string, Map<string, ShiftEditorShift[]>>();
    for (const s of augmentedShifts) {
      let inner = m.get(s.festival_staff_id);
      if (!inner) {
        inner = new Map();
        m.set(s.festival_staff_id, inner);
      }
      const list = inner.get(s.shift_date) ?? [];
      list.push(s);
      inner.set(s.shift_date, list);
    }
    return m;
  }, [augmentedShifts]);

  const dayLabelByDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of days) m.set(d.date, d.label);
    return m;
  }, [days]);

  function openCreate(positionId: string, date: string) {
    const info = positionInfo.get(positionId);
    if (!info) return;
    setEditor({
      mode: "create",
      schedulePositionId: positionId,
      shiftDate: date,
      conceptId: info.conceptId,
      positionLabel: info.label,
      conceptName: info.conceptName,
      shiftDateLabel: dayLabelByDate.get(date) ?? date,
    });
  }


  // ============ Drag and drop ============
  const qc = useQueryClient();
  const shiftsKey = ["sched-grid-shifts", festivalId];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const [activeDrag, setActiveDrag] = useState<{ shift: ShiftRow; slug: string | null } | null>(null);

  const slugByPositionId = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of positionsQ.data ?? []) {
      const c = conceptById.get(p.concept_id);
      m.set(p.id, c?.slug ?? null);
    }
    return m;
  }, [positionsQ.data, conceptById]);

  const collisionDetection: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    const chipHit = hits.find((h) => String(h.id).startsWith("chip:"));
    if (chipHit) return [chipHit];
    const cellHit = hits.find((h) => String(h.id).startsWith("cell:"));
    return cellHit ? [cellHit] : [];
  };

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current as { shiftId: string } | undefined;
    if (!data) return;
    const shift = (shiftsQ.data ?? []).find((s) => s.id === data.shiftId);
    if (!shift) return;
    setActiveDrag({ shift, slug: slugByPositionId.get(shift.schedule_position_id) ?? null });
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const over = e.over;
    const active = e.active;
    if (!over) return;
    const a = active.data.current as
      | { shiftId: string; positionId: string; date: string }
      | undefined;
    const o = over.data.current as
      | { kind: "cell" | "chip"; positionId: string; date: string; shiftId?: string }
      | undefined;
    if (!a || !o) return;
    if (o.positionId === a.positionId && o.date === a.date) return;

    const prev = qc.getQueryData<ShiftRow[]>(shiftsKey) ?? [];
    let next: ShiftRow[];
    let action: "move" | "swap";
    let swapPartnerId: string | undefined;

    if (o.kind === "chip" && o.shiftId && o.shiftId !== a.shiftId) {
      action = "swap";
      swapPartnerId = o.shiftId;
      next = prev.map((s) => {
        if (s.id === a.shiftId) return { ...s, schedule_position_id: o.positionId, shift_date: o.date };
        if (s.id === o.shiftId) return { ...s, schedule_position_id: a.positionId, shift_date: a.date };
        return s;
      });
    } else {
      action = "move";
      next = prev.map((s) =>
        s.id === a.shiftId
          ? { ...s, schedule_position_id: o.positionId, shift_date: o.date }
          : s,
      );
    }

    qc.setQueryData(shiftsKey, next);

    try {
      if (action === "swap" && swapPartnerId) {
        const r1 = await supabase
          .from("festival_schedule_shift")
          .update({ schedule_position_id: o.positionId, shift_date: o.date })
          .eq("id", a.shiftId);
        if (r1.error) throw r1.error;
        const r2 = await supabase
          .from("festival_schedule_shift")
          .update({ schedule_position_id: a.positionId, shift_date: a.date })
          .eq("id", swapPartnerId);
        if (r2.error) throw r2.error;
        toast.success("Shifts swapped");
      } else {
        const r = await supabase
          .from("festival_schedule_shift")
          .update({ schedule_position_id: o.positionId, shift_date: o.date })
          .eq("id", a.shiftId);
        if (r.error) throw r.error;
        toast.success("Shift moved");
      }
      shiftsQ.refetch();
    } catch (err) {
      console.error("Drag-and-drop save failed", err);
      qc.setQueryData(shiftsKey, prev);
      toast.error("Couldn't move shift — try again");
    }
  }



  function openEdit(positionId: string, date: string, shiftId: string) {
    const info = positionInfo.get(positionId);
    if (!info) return;
    setEditor({
      mode: "edit",
      schedulePositionId: positionId,
      shiftDate: date,
      conceptId: info.conceptId,
      positionLabel: info.label,
      conceptName: info.conceptName,
      shiftDateLabel: dayLabelByDate.get(date) ?? date,
      existingShiftId: shiftId,
    });
  }

  function handleCopyChip(shift: ShiftRow) {
    if (copied?.sourceShiftId === shift.id) {
      // Toggle off
      setCopied(null);
      return;
    }
    setCopied({
      sourceShiftId: shift.id,
      staffId: shift.festival_staff_id,
      staffName: shift.staff_name,
      startTime: shift.start_time,
      endTime: shift.end_time,
      notes: shift.notes,
    });
  }

  function requestDelete(shift: ShiftRow, info: { conceptName: string; positionLabel: string; dayLabel: string }) {
    setConfirmDelete({
      shiftId: shift.id,
      name: shift.staff_name?.trim() || "(no name)",
      timeLabel: `${formatTimeHHMM(shift.start_time)}–${formatTimeHHMM(shift.end_time)}`,
      contextLabel: `${info.conceptName} / ${info.positionLabel} / ${info.dayLabel}`,
    });
  }

  async function performDelete() {
    if (!confirmDelete) return;
    const id = confirmDelete.shiftId;
    try {
      const { error } = await supabase
        .from("festival_schedule_shift")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Shift deleted");
      if (copied?.sourceShiftId === id) setCopied(null);
      shiftsQ.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't delete shift");
    } finally {
      setConfirmDelete(null);
    }
  }

  async function pasteToCell(positionId: string, date: string) {
    if (!copied) return;
    try {
      const { error } = await supabase
        .from("festival_schedule_shift")
        .insert({
          schedule_position_id: positionId,
          shift_date: date,
          festival_staff_id: copied.staffId,
          start_time: copied.startTime,
          end_time: copied.endTime,
          notes: copied.notes,
        });
      if (error) throw error;
      toast.success("Shift pasted");
      shiftsQ.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't paste shift");
    }
  }


  if (festivalQ.isLoading || conceptsQ.isLoading || positionsQ.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }
  if (festivalQ.isError || conceptsQ.isError || positionsQ.isError || shiftsQ.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Failed to load scheduling data.
      </div>
    );
  }

  const positions = positionsQ.data ?? [];
  if (positions.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center space-y-3">
        <p className="text-muted-foreground">
          No positions defined yet. Go to the Positions tab to add stations for this festival.
        </p>
        {onGoToPositions && (
          <button
            type="button"
            onClick={onGoToPositions}
            className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Go to Positions
          </button>
        )}
      </div>
    );
  }

  const POS_COL = "w-[140px] md:w-[180px] min-w-[140px] md:min-w-[180px]";
  const DAY_COL = "min-w-[160px]";
  const totalCols = days.length + 1;
  const copyMode = !!copied;

  return (
    <TooltipProvider delayDuration={200}>
      {copied && (
        <div className="sticky top-2 z-40 mx-auto mb-2 flex max-w-md items-center justify-between gap-3 rounded-full border bg-background/95 px-4 py-2 shadow-md backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            <Copy className="h-4 w-4 text-primary" />
            <span>
              Copying{" "}
              <span className="font-semibold">{copied.staffName ?? "(no name)"}</span>
              ’s {formatTimeHHMM(copied.startTime)}–{formatTimeHHMM(copied.endTime)} shift · click an empty cell to paste
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCopied(null)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveDrag(null)}
        autoScroll
      >
      <div className="rounded-lg border bg-card overflow-auto max-h-[calc(100vh-260px)] md:max-h-[calc(100vh-240px)]">

        <table className="w-full border-collapse text-sm">
          {/* Header */}
          <thead>
            <tr>
              <th
                className={`${POS_COL} sticky top-0 left-0 z-30 bg-card text-left px-3 py-2 font-medium text-muted-foreground border-r border-b shadow-[0_1px_0_0_hsl(var(--border))]`}
              >
                Position
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  className={`${DAY_COL} sticky top-0 z-20 bg-card text-left px-3 py-2 font-medium text-muted-foreground border-r border-b last:border-r-0 shadow-[0_1px_0_0_hsl(var(--border))]`}
                >
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {grouped.groups.map(({ concept, positions: rows }) => {
              const slug = concept?.slug ?? null;
              const accent = conceptAccentClass(slug);
              const sibKeyCounts = grouped.sibCount;
              const hoursByDate = concept
                ? hoursByConceptByDate.get(concept.id) ?? new Map<string, HoursRow>()
                : new Map<string, HoursRow>();
              return (
                <ConceptBlock
                  key={concept?.id ?? "orphan"}
                  conceptId={concept?.id ?? null}
                  conceptName={concept?.short_name ?? concept?.name ?? "Unassigned concept"}
                  conceptActive={!!concept}
                  accentClass={accent}
                  slug={slug}
                  totalCols={totalCols}
                  days={days}
                  positions={rows}
                  sibCount={sibKeyCounts}
                  shiftsByCell={shiftsByCell}
                  shiftsByStaffByDate={shiftsByStaffByDate}
                  onOpenCreate={openCreate}
                  onOpenEdit={openEdit}
                  onCopyShift={handleCopyChip}
                  onRequestDelete={(s, posId, date) => {
                    const info = positionInfo.get(posId);
                    requestDelete(s, {
                      conceptName: info?.conceptName ?? "?",
                      positionLabel: info?.label ?? "?",
                      dayLabel: dayLabelByDate.get(date) ?? date,
                    });
                  }}
                  copyMode={copyMode}
                  copiedSourceId={copied?.sourceShiftId ?? null}
                  onPaste={pasteToCell}
                  posColClass={POS_COL}
                  dayColClass={DAY_COL}
                  hoursByDate={hoursByDate}
                  onEditHours={() => {
                    if (!concept) return;
                    setHoursDialog({
                      conceptId: concept.id,
                      conceptName: concept.short_name ?? concept.name,
                    });
                  }}
                />
              );
            })}
          </tbody>


          <tfoot>
            <tr>
              <td
                className={`${POS_COL} sticky bottom-0 left-0 z-30 bg-card px-3 py-2 font-medium border-r border-t`}
              >
                Hours
              </td>
              {days.map((d) => (
                <td
                  key={d.date}
                  className={`${DAY_COL} sticky bottom-0 z-20 bg-card px-3 py-2 font-medium border-r border-t last:border-r-0`}
                >
                  {formatHoursMinutes(totalsByDay.get(d.date) ?? 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {hoursDialog && festivalQ.data && (
        <ConceptHoursDialog
          festivalId={festivalId}
          festivalStartDate={festivalQ.data.start_date}
          festivalEndDate={festivalQ.data.end_date}
          conceptId={hoursDialog.conceptId}
          conceptName={hoursDialog.conceptName}
          existingHoursByDate={
            hoursByConceptByDate.get(hoursDialog.conceptId) ?? new Map()
          }
          open={!!hoursDialog}
          onOpenChange={(o) => {
            if (!o) setHoursDialog(null);
          }}
          onSaved={() => {
            hoursQ.refetch();
          }}
        />
      )}

      {editor && festivalQ.data && (() => {
        const existing =
          editor.mode === "edit" && editor.existingShiftId
            ? augmentedShifts.find((s) => s.id === editor.existingShiftId)
            : null;
        const hours = hoursByConceptByDate
          .get(editor.conceptId)
          ?.get(editor.shiftDate);
        return (
          <ShiftEditor
            open={!!editor}
            onOpenChange={(o) => {
              if (!o) setEditor(null);
            }}
            mode={editor.mode}
            festivalId={festivalId}
            schedulePositionId={editor.schedulePositionId}
            shiftDate={editor.shiftDate}
            conceptId={editor.conceptId}
            positionLabel={editor.positionLabel}
            conceptName={editor.conceptName}
            shiftDateLabel={editor.shiftDateLabel}
            conceptHoursForDay={
              hours
                ? { open_time: hours.open_time, close_time: hours.close_time }
                : null
            }
            existingShift={
              existing
                ? {
                    id: existing.id,
                    festival_staff_id: existing.festival_staff_id,
                    staff_name: existing.staff_name,
                    start_time: existing.start_time,
                    end_time: existing.end_time,
                    notes: existing.notes,
                  }
                : null
            }
            allShiftsForFestival={augmentedShifts}
            festivalStaffList={staffQ.data ?? []}
            festivalDays={days}
            onSaved={() => {
              shiftsQ.refetch();
            }}
          />
        );
      })()}
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="rotate-3 shadow-xl opacity-95 w-[160px]">
            <ShiftChipVisual
              staffName={activeDrag.shift.staff_name}
              startTime={activeDrag.shift.start_time}
              endTime={activeDrag.shift.end_time}
              computedHours={activeDrag.shift.computed_hours}
              notes={activeDrag.shift.notes}
              slug={activeDrag.slug}
            />
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  {confirmDelete.name} · {confirmDelete.timeLabel} · {confirmDelete.contextLabel}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}


function ConceptBlock(props: {
  conceptId: string | null;
  conceptName: string;
  conceptActive: boolean;
  accentClass: string;
  slug: string | null;
  totalCols: number;
  days: { date: string; label: string }[];
  positions: PositionRow[];
  sibCount: Map<string, number>;
  shiftsByCell: Map<string, ShiftRow[]>;
  shiftsByStaffByDate: Map<string, Map<string, ShiftEditorShift[]>>;
  onOpenCreate: (positionId: string, date: string) => void;
  onOpenEdit: (positionId: string, date: string, shiftId: string) => void;
  onCopyShift: (s: ShiftRow) => void;
  onRequestDelete: (s: ShiftRow, posId: string, date: string) => void;
  copyMode: boolean;
  copiedSourceId: string | null;
  onPaste: (positionId: string, date: string) => void;
  posColClass: string;
  dayColClass: string;
  hoursByDate: Map<string, HoursRow>;
  onEditHours: () => void;
}) {
  const {
    conceptId, conceptName, conceptActive, accentClass, slug, days,
    positions, sibCount, shiftsByCell, shiftsByStaffByDate,
    onOpenCreate, onOpenEdit, onCopyShift, onRequestDelete,
    copyMode, copiedSourceId, onPaste,
    posColClass, dayColClass,
    hoursByDate, onEditHours,
  } = props;

  const clickable = !!conceptId;
  const handleOpen = () => {
    if (clickable) onEditHours();
  };

  return (
    <>
      <tr className={accentClass}>
        <td
          className={`${posColClass} sticky left-0 z-10 ${accentClass} px-3 py-2 font-heading font-semibold border-t border-r`}
        >
          <button
            type="button"
            onClick={handleOpen}
            disabled={!clickable}
            className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-default"
          >
            <span className="truncate">{conceptName}</span>
            {clickable && (
              <Pencil className="h-3.5 w-3.5 shrink-0 opacity-70" aria-label="Edit opening hours" />
            )}
          </button>
        </td>
        {days.map((d) => {
          const h = hoursByDate.get(d.date);
          return (
            <td
              key={d.date}
              className={`${dayColClass} px-3 py-2 border-t border-r last:border-r-0 align-middle`}
            >
              {clickable ? (
                <button
                  type="button"
                  onClick={handleOpen}
                  className="w-full text-left text-xs font-normal hover:underline underline-offset-2"
                >
                  {h ? (
                    <span className="opacity-90">
                      {formatTimeHHMM(h.open_time)}–{formatTimeHHMM(h.close_time)}
                    </span>
                  ) : (
                    <span className="opacity-50">— Set hours</span>
                  )}
                </button>
              ) : (
                <span className="opacity-50 text-xs">—</span>
              )}
            </td>
          );
        })}
      </tr>

      {positions.map((p) => {
        const sib = sibCount.get(`${p.concept_id}:${p.station_id}`) ?? 1;
        const label = positionLabel(p.station_label, p.position_number, sib);
        return (
          <tr key={p.id} className="border-b last:border-b-0">
            <td
              className={`${posColClass} sticky left-0 z-10 bg-card px-3 py-2 border-r align-top`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{label}</span>
                {p.notes && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      {p.notes}
                    </TooltipContent>
                  </Tooltip>
                )}
                {!conceptActive && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      Concept not active for this festival.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </td>
            {days.map((d) => {
              const cellShifts = shiftsByCell.get(`${p.id}|${d.date}`) ?? [];
              const isEmpty = cellShifts.length === 0;
              return (
                <td
                  key={d.date}
                  className={`${dayColClass} p-1.5 border-r last:border-r-0 align-top`}
                >
                  <CellDrop positionId={p.id} date={d.date}>
                    {isEmpty ? (
                      <EmptyCell
                        copyMode={copyMode}
                        onClick={() => {
                          if (copyMode) onPaste(p.id, d.date);
                          else onOpenCreate(p.id, d.date);
                        }}
                      />
                    ) : (
                      <div className="flex flex-col gap-1">
                        {cellShifts.map((s) => {
                          const sibs =
                            shiftsByStaffByDate.get(s.festival_staff_id)?.get(s.shift_date) ?? [];
                          return (
                            <ShiftChip
                              key={s.id}
                              shift={s}
                              slug={slug}
                              siblings={sibs}
                              positionId={p.id}
                              date={d.date}
                              onClick={() => onOpenEdit(p.id, d.date, s.id)}
                              onCopy={() => onCopyShift(s)}
                              onDelete={() => onRequestDelete(s, p.id, d.date)}
                              copyMode={copyMode}
                              isCopiedSource={copiedSourceId === s.id}
                            />
                          );
                        })}
                        {!copyMode && (
                          <button
                            type="button"
                            onClick={() => onOpenCreate(p.id, d.date)}
                            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 pl-1"
                          >
                            <Plus className="h-3 w-3" /> Add another
                          </button>
                        )}
                      </div>
                    )}
                  </CellDrop>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function EmptyCell({ onClick, copyMode }: { onClick: () => void; copyMode: boolean }) {
  if (copyMode) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group w-full min-h-[56px] rounded-md border border-dashed border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10 transition-colors flex items-center justify-center text-xs text-primary"
      >
        <span className="inline-flex items-center gap-1 opacity-60 group-hover:opacity-100">
          <Clipboard className="h-3 w-3" /> Paste here
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full min-h-[56px] rounded-md border border-dashed border-transparent text-xs text-muted-foreground/0 hover:border-border hover:bg-muted/50 hover:text-muted-foreground transition-colors flex items-center justify-center"
    >
      <span className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100">
        <Plus className="h-3 w-3" /> Add shift
      </span>
    </button>
  );
}

function CellDrop({
  positionId,
  date,
  children,
}: {
  positionId: string;
  date: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef, active } = useDroppable({
    id: `cell:${positionId}:${date}`,
    data: { kind: "cell", positionId, date },
  });
  const activeData = active?.data?.current as
    | { positionId: string; date: string }
    | undefined;
  const isSameCell =
    activeData && activeData.positionId === positionId && activeData.date === date;
  const highlight = isOver && !isSameCell;
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md transition-colors ${
        highlight ? "outline outline-2 outline-dashed outline-primary/60 bg-primary/5" : ""
      }`}
    >
      {children}
    </div>
  );
}

function ShiftChipVisual({
  staffName,
  startTime,
  endTime,
  computedHours,
  notes,
  slug,
  multi,
  hasOverlap,
  siblingsCount,
}: {
  staffName: string | null;
  startTime: string;
  endTime: string;
  computedHours: number;
  notes: string | null;
  slug: string | null;
  multi?: boolean;
  hasOverlap?: boolean;
  siblingsCount?: number;
}) {
  const name = staffName?.trim() || "(no name)";
  const extraBorder = multi
    ? hasOverlap
      ? "border-2 border-destructive"
      : "border-2 border-amber-500"
    : "border";
  return (
    <div
      className={`relative w-full text-left rounded-md p-2 ${conceptChipClass(slug)} ${extraBorder}`}
    >
      {multi && siblingsCount ? (
        <span
          className={`absolute -top-1.5 -right-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 py-0.5 text-white shadow ${
            hasOverlap ? "bg-destructive" : "bg-amber-500"
          }`}
        >
          {siblingsCount}×
        </span>
      ) : null}
      <div className={`text-xs font-semibold truncate ${staffName ? "" : "text-muted-foreground italic"}`}>
        {name}
      </div>
      <div className="flex items-center justify-between text-xs mt-0.5">
        <span>
          {formatTimeHHMM(startTime)} – {formatTimeHHMM(endTime)}
        </span>
        <span className="font-medium">{formatHoursMinutes(computedHours)}</span>
      </div>
      {notes && (
        <div className="text-[11px] italic text-muted-foreground truncate mt-0.5">
          {notes}
        </div>
      )}
    </div>
  );
}

function ShiftChip({
  shift,
  slug,
  siblings,
  positionId,
  date,
  onClick,
  onCopy,
  onDelete,
  copyMode,
  isCopiedSource,
}: {
  shift: ShiftRow;
  slug: string | null;
  siblings: ShiftEditorShift[];
  positionId: string;
  date: string;
  onClick: () => void;
  onCopy: () => void;
  onDelete: () => void;
  copyMode: boolean;
  isCopiedSource: boolean;
}) {
  const name = shift.staff_name?.trim() || "(no name)";
  const multi = siblings.length >= 2;

  const cur = shiftIntervalMin(shift.start_time, shift.end_time);
  const hasOverlap =
    multi &&
    siblings.some(
      (o) => o.id !== shift.id && intervalsOverlap(cur, shiftIntervalMin(o.start_time, o.end_time)),
    );

  // Disable drag while in copy mode
  const draggable = useDraggable({
    id: `drag:${shift.id}`,
    data: { shiftId: shift.id, positionId, date },
    disabled: copyMode,
  });
  const droppable = useDroppable({
    id: `chip:${shift.id}`,
    data: { kind: "chip", shiftId: shift.id, positionId, date },
    disabled: copyMode,
  });

  const setRefs = (el: HTMLDivElement | null) => {
    draggable.setNodeRef(el);
    droppable.setNodeRef(el);
  };

  const activeData = droppable.active?.data?.current as
    | { positionId: string; date: string; shiftId: string }
    | undefined;
  const isSelf = activeData?.shiftId === shift.id;
  const swapHighlight = droppable.isOver && !isSelf;

  const extraBorder = multi
    ? hasOverlap
      ? "border-2 border-destructive"
      : "border-2 border-amber-500"
    : "border";

  const isDragging = draggable.isDragging;

  // In copy mode: clicking the chip body does NOTHING (no edit)
  const handleBodyClick = () => {
    if (copyMode) return;
    onClick();
  };

  const stop = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
  };

  const sourceOutline = isCopiedSource ? "outline outline-2 outline-dashed outline-primary outline-offset-1" : "";

  const chip = (
    <div
      ref={setRefs}
      role="button"
      tabIndex={0}
      onClick={handleBodyClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleBodyClick();
        }
      }}
      {...(copyMode ? {} : draggable.attributes)}
      {...(copyMode ? {} : draggable.listeners)}
      className={`group relative w-full text-left rounded-md p-2 hover:brightness-95 hover:shadow-md transition ${
        copyMode ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } ${conceptChipClass(slug)} ${extraBorder} ${
        isDragging ? "opacity-50" : ""
      } ${swapHighlight ? "ring-2 ring-primary ring-offset-1" : ""} ${sourceOutline}`}
    >
      {/* Hover action icons */}
      <div
        className="absolute top-1 right-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        onPointerDown={stop}
        onMouseDown={stop}
      >
        <button
          type="button"
          aria-label="Copy shift"
          onClick={(e) => { stop(e); onCopy(); }}
          onPointerDown={stop}
          onMouseDown={stop}
          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-background/70 text-foreground/70 hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Edit shift"
          onClick={(e) => { stop(e); onClick(); }}
          onPointerDown={stop}
          onMouseDown={stop}
          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-background/70 text-foreground/70 hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Delete shift"
          onClick={(e) => { stop(e); onDelete(); }}
          onPointerDown={stop}
          onMouseDown={stop}
          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-destructive/15 text-foreground/70 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {multi && (
        <span
          className={`absolute -top-1.5 -left-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 py-0.5 text-white shadow ${
            hasOverlap ? "bg-destructive" : "bg-amber-500"
          }`}
        >
          {siblings.length}×
        </span>
      )}
      <div className={`text-xs font-semibold truncate pr-16 ${shift.staff_name ? "" : "text-muted-foreground italic"}`}>
        {name}
      </div>
      <div className="flex items-center justify-between text-xs mt-0.5">
        <span>
          {formatTimeHHMM(shift.start_time)} – {formatTimeHHMM(shift.end_time)}
        </span>
        <span className="font-medium">{formatHoursMinutes(shift.computed_hours)}</span>
      </div>
      {shift.notes && (
        <div className="text-[11px] italic text-muted-foreground truncate mt-0.5">
          {shift.notes}
        </div>
      )}
    </div>
  );

  if (!multi) return chip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <div className="text-xs space-y-0.5">
          <div className="font-semibold">{name} also works today:</div>
          {siblings.map((o) => (
            <div key={o.id} className={o.id === shift.id ? "font-medium" : ""}>
              • {o.concept_name ?? "?"} / {o.position_label ?? "?"} /{" "}
              {formatTimeHHMM(o.start_time)}–{formatTimeHHMM(o.end_time)}
              {o.id === shift.id ? " (this shift)" : ""}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
