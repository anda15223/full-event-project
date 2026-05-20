import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, AlertTriangle, Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  positionLabel,
  conceptAccentClass,
  conceptChipClass,
  festivalDays,
  formatHoursMinutes,
  formatTimeHHMM,
} from "@/lib/scheduling";
import ConceptHoursDialog from "./ConceptHoursDialog";

interface HoursRow {
  id: string;
  festival_id: string;
  concept_id: string;
  open_time: string;
  close_time: string;
  crosses_midnight: boolean;
  computed_hours: number | null;
  notes: string | null;
}

interface Props {
  festivalId: string;
  onCellClick: (args: { positionId: string; date: string; shiftId?: string }) => void;
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

export default function SchedulingGrid({ festivalId, onCellClick, onGoToPositions }: Props) {
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
        .select("id, concept_id, station_id, position_number, display_order, notes, station:station_id(label)")
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
      }));
    },
  });

  const hoursQ = useQuery({
    queryKey: ["sched-grid-hours", festivalId],
    queryFn: async (): Promise<HoursRow[]> => {
      const { data, error } = await supabase
        .from("festival_concept_hours")
        .select("id, festival_id, concept_id, open_time, close_time, crosses_midnight, computed_hours, notes")
        .eq("festival_id", festivalId);
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

  const hoursByConceptId = useMemo(() => {
    const m = new Map<string, HoursRow>();
    for (const h of hoursQ.data ?? []) m.set(h.concept_id, h);
    return m;
  }, [hoursQ.data]);

  const [hoursDialog, setHoursDialog] = useState<{
    conceptId: string;
    conceptName: string;
    existing: HoursRow | null;
  } | null>(null);

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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {/* Header */}
          <thead className="sticky top-0 z-20 bg-card">
            <tr className="border-b">
              <th
                className={`${POS_COL} sticky left-0 z-30 bg-card text-left px-3 py-2 font-medium text-muted-foreground border-r`}
              >
                Position
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  className={`${DAY_COL} text-left px-3 py-2 font-medium text-muted-foreground border-r last:border-r-0`}
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
              return (
                <ConceptBlock
                  key={concept?.id ?? "orphan"}
                  conceptName={concept?.short_name ?? concept?.name ?? "Unassigned concept"}
                  conceptActive={!!concept}
                  accentClass={accent}
                  slug={slug}
                  totalCols={totalCols}
                  days={days}
                  positions={rows}
                  sibCount={sibKeyCounts}
                  shiftsByCell={shiftsByCell}
                  onCellClick={onCellClick}
                  posColClass={POS_COL}
                  dayColClass={DAY_COL}
                />
              );
            })}
          </tbody>

          <tfoot className="sticky bottom-0 z-20 bg-card">
            <tr className="border-t">
              <td
                className={`${POS_COL} sticky left-0 z-30 bg-card px-3 py-2 font-medium border-r`}
              >
                Hours
              </td>
              {days.map((d) => (
                <td
                  key={d.date}
                  className={`${DAY_COL} px-3 py-2 font-medium border-r last:border-r-0`}
                >
                  {formatHoursMinutes(totalsByDay.get(d.date) ?? 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </TooltipProvider>
  );
}

function ConceptBlock(props: {
  conceptName: string;
  conceptActive: boolean;
  accentClass: string;
  slug: string | null;
  totalCols: number;
  days: { date: string; label: string }[];
  positions: PositionRow[];
  sibCount: Map<string, number>;
  shiftsByCell: Map<string, ShiftRow[]>;
  onCellClick: Props["onCellClick"];
  posColClass: string;
  dayColClass: string;
}) {
  const {
    conceptName, conceptActive, accentClass, slug, totalCols, days,
    positions, sibCount, shiftsByCell, onCellClick, posColClass, dayColClass,
  } = props;

  return (
    <>
      <tr>
        <td
          colSpan={totalCols}
          className={`${accentClass} px-3 py-2 font-heading font-semibold border-t`}
        >
          {conceptName}
        </td>
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
              return (
                <td
                  key={d.date}
                  className={`${dayColClass} p-1.5 border-r last:border-r-0 align-top`}
                >
                  {cellShifts.length === 0 ? (
                    <EmptyCell
                      onClick={() => onCellClick({ positionId: p.id, date: d.date })}
                    />
                  ) : (
                    <div className="flex flex-col gap-1">
                      {cellShifts.map((s) => (
                        <ShiftChip
                          key={s.id}
                          shift={s}
                          slug={slug}
                          onClick={() =>
                            onCellClick({
                              positionId: p.id,
                              date: d.date,
                              shiftId: s.id,
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function EmptyCell({ onClick }: { onClick: () => void }) {
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

function ShiftChip({
  shift,
  slug,
  onClick,
}: {
  shift: ShiftRow;
  slug: string | null;
  onClick: () => void;
}) {
  const name = shift.staff_name?.trim() || "(no name)";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md border p-2 hover:brightness-95 transition ${conceptChipClass(slug)}`}
    >
      <div className={`text-xs font-semibold truncate ${shift.staff_name ? "" : "text-muted-foreground italic"}`}>
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
    </button>
  );
}
