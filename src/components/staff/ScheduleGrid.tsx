import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CONCEPT_ORDER, FestivalDay, conceptHeaderClass, formatHoursMinutes } from "@/lib/staffGrid";

export interface GridConcept { id: string; slug: string; name: string; }
export interface GridStation { id: string; concept_id: string | null; label: string; }
export interface GridPosition { id: string; concept_id: string | null; station_id: string; slots_needed: number | null; }
export interface GridStaff {
  id: string;
  full_name: string;
  display_name: string | null;
  primaryConceptId: string | null;
}
export interface GridShift {
  id: string;
  assignmentId: string;
  staffId: string;
  conceptId: string | null;
  stationId: string | null;
  shiftDate: string;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  shiftLabel: string | null;
  crossesMidnight: boolean;
}

interface Props {
  viewMode: "position" | "person";
  days: FestivalDay[];
  concepts: GridConcept[];
  stations: GridStation[];
  positions: GridPosition[];
  staff: GridStaff[];           // staff with an assignment for this festival
  shifts: GridShift[];
  activeConceptIds: Set<string>;
  onAddShift: (ctx: { conceptId: string | null; stationId: string | null; dayIso: string; staffId?: string }) => void;
  onEditShift: (shift: GridShift) => void;
}

interface Row {
  key: string;
  leftLabel: string;
  leftSub?: string;
  conceptId: string | null;
  // Filter for shifts that belong to this row
  matches: (s: GridShift) => boolean;
  // Used by add-shift quick action
  ctxStationId: string | null;
  ctxStaffId?: string;
}

interface Group {
  conceptId: string | null;
  conceptName: string;
  conceptSlug: string;
  rows: Row[];
}

export default function ScheduleGrid(props: Props) {
  const { viewMode, days, concepts, stations, positions, staff, shifts, activeConceptIds, onAddShift, onEditShift } = props;

  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const orderedConcepts = useMemo(() => {
    const list = [...concepts].sort((a, b) => {
      const ai = CONCEPT_ORDER.indexOf(a.slug as any);
      const bi = CONCEPT_ORDER.indexOf(b.slug as any);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return list.filter((c) => activeConceptIds.has(c.id));
  }, [concepts, activeConceptIds]);

  const groups = useMemo<Group[]>(() => {
    if (viewMode === "position") {
      // For each concept: rows are its festival_position entries, plus a "No position" row for orphan shifts.
      const out: Group[] = [];
      for (const c of orderedConcepts) {
        const conceptPositions = positions.filter((p) => p.concept_id === c.id);
        const knownStationIds = new Set(conceptPositions.map((p) => p.station_id));
        const rows: Row[] = conceptPositions.map((p) => {
          const stn = stationById.get(p.station_id);
          return {
            key: `pos:${p.id}`,
            leftLabel: stn?.label ?? "?",
            leftSub: `slots ${p.slots_needed ?? 0}`,
            conceptId: c.id,
            ctxStationId: p.station_id,
            matches: (s) => s.conceptId === c.id && s.stationId === p.station_id,
          };
        });
        // No position row: shifts for this concept where stationId is null OR not in knownStationIds
        const hasOrphans = shifts.some(
          (s) => s.conceptId === c.id && (!s.stationId || !knownStationIds.has(s.stationId)),
        );
        if (hasOrphans || rows.length === 0) {
          rows.push({
            key: `pos:${c.id}:none`,
            leftLabel: "No position",
            leftSub: "shifts without a planned position",
            conceptId: c.id,
            ctxStationId: null,
            matches: (s) => s.conceptId === c.id && (!s.stationId || !knownStationIds.has(s.stationId)),
          });
        }
        out.push({ conceptId: c.id, conceptName: c.name, conceptSlug: c.slug, rows });
      }
      // Catch-all for null-concept assignments (Management / Not assigned)
      const orphanGroup: Row[] = [];
      const hasNullConcept = staff.some((s) => !s.primaryConceptId) ||
        shifts.some((s) => !s.conceptId);
      if (hasNullConcept) {
        orphanGroup.push({
          key: "null-concept:none",
          leftLabel: "Unassigned / Management",
          leftSub: "no concept",
          conceptId: null,
          ctxStationId: null,
          matches: (s) => !s.conceptId,
        });
        out.push({ conceptId: null, conceptName: "Unassigned / Management", conceptSlug: "_", rows: orphanGroup });
      }
      return out;
    }

    // BY PERSON
    const out: Group[] = [];
    const personsByConcept = new Map<string | null, GridStaff[]>();
    for (const s of staff) {
      const k = s.primaryConceptId ?? null;
      if (k && !activeConceptIds.has(k)) continue;
      const list = personsByConcept.get(k) ?? [];
      list.push(s);
      personsByConcept.set(k, list);
    }
    for (const c of orderedConcepts) {
      const ppl = (personsByConcept.get(c.id) ?? [])
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
      if (ppl.length === 0) continue;
      const rows: Row[] = ppl.map((p) => ({
        key: `pers:${p.id}`,
        leftLabel: p.display_name || p.full_name,
        leftSub: p.display_name && p.display_name !== p.full_name ? p.full_name : undefined,
        conceptId: c.id,
        ctxStationId: null,
        ctxStaffId: p.id,
        matches: (s) => s.staffId === p.id,
      }));
      out.push({ conceptId: c.id, conceptName: c.name, conceptSlug: c.slug, rows });
    }
    const noConceptPpl = (personsByConcept.get(null) ?? [])
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (noConceptPpl.length > 0) {
      const rows: Row[] = noConceptPpl.map((p) => ({
        key: `pers:${p.id}`,
        leftLabel: p.display_name || p.full_name,
        leftSub: p.display_name && p.display_name !== p.full_name ? p.full_name : undefined,
        conceptId: null,
        ctxStationId: null,
        ctxStaffId: p.id,
        matches: (s) => s.staffId === p.id,
      }));
      out.push({ conceptId: null, conceptName: "Unassigned / Management", conceptSlug: "_", rows });
    }
    return out;
  }, [viewMode, orderedConcepts, positions, stationById, shifts, staff, activeConceptIds]);

  // Totals
  const dayTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of days) map[d.iso] = 0;
    for (const s of shifts) {
      // only count shifts in visible concepts
      if (s.conceptId && !activeConceptIds.has(s.conceptId)) continue;
      map[s.shiftDate] = (map[s.shiftDate] ?? 0) + (s.hours || 0);
    }
    return map;
  }, [shifts, days, activeConceptIds]);

  const conceptTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of shifts) {
      if (s.conceptId && !activeConceptIds.has(s.conceptId)) continue;
      const k = s.conceptId ?? "_";
      map[k] = (map[k] ?? 0) + (s.hours || 0);
    }
    return map;
  }, [shifts, activeConceptIds]);

  const grandTotal = useMemo(
    () => Object.values(dayTotals).reduce((a, b) => a + b, 0),
    [dayTotals],
  );

  const dayShiftCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of days) map[d.iso] = 0;
    for (const s of shifts) {
      if (s.conceptId && !activeConceptIds.has(s.conceptId)) continue;
      map[s.shiftDate] = (map[s.shiftDate] ?? 0) + 1;
    }
    return map;
  }, [shifts, days, activeConceptIds]);

  const colCount = days.length;

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <div
          className="min-w-[800px] grid"
          style={{ gridTemplateColumns: `260px repeat(${colCount}, minmax(180px, 1fr))` }}
        >
          {/* Top header */}
          <div className="bg-muted/50 border-b p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sticky left-0 z-10">
            {viewMode === "position" ? "Concept · Position" : "Concept · Person"}
          </div>
          {days.map((d) => (
            <div key={d.iso} className="bg-muted/50 border-b border-l p-3 text-sm">
              <div className="font-semibold">{d.label}</div>
              <div className="text-xs text-muted-foreground">{dayShiftCount[d.iso] ?? 0} shifts</div>
            </div>
          ))}

          {/* Body */}
          {groups.map((g) => (
            <GroupBlock
              key={g.conceptId ?? "_"}
              group={g}
              days={days}
              shifts={shifts}
              viewMode={viewMode}
              stationById={stationById}
              staffById={staffById}
              colCount={colCount}
              onAddShift={onAddShift}
              onEditShift={onEditShift}
            />
          ))}

          {groups.length === 0 && (
            <div
              className="col-span-full p-8 text-center text-sm text-muted-foreground"
              style={{ gridColumn: `span ${colCount + 1}` }}
            >
              No data yet. Add a position or open a shift drawer to start.
            </div>
          )}
        </div>
      </div>

      {/* Sticky-ish footer with totals */}
      <div
        className="border-t bg-muted/30 grid"
        style={{ gridTemplateColumns: `260px repeat(${colCount}, minmax(180px, 1fr))` }}
      >
        <div className="p-3 text-xs font-semibold uppercase text-muted-foreground">Per-day total</div>
        {days.map((d) => (
          <div key={d.iso} className="border-l p-3 text-sm font-medium">
            {formatHoursMinutes(dayTotals[d.iso] ?? 0)}
          </div>
        ))}
      </div>

      <div className="border-t bg-card p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {orderedConcepts.map((c) => (
            <Badge key={c.id} variant="outline" className={conceptHeaderClass(c.slug)}>
              {c.name}: {formatHoursMinutes(conceptTotals[c.id] ?? 0)}
            </Badge>
          ))}
          {(conceptTotals["_"] ?? 0) > 0 && (
            <Badge variant="outline" className="bg-slate-100">
              Unassigned: {formatHoursMinutes(conceptTotals["_"] ?? 0)}
            </Badge>
          )}
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Grand total: </span>
          <span className="font-semibold">{formatHoursMinutes(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function GroupBlock(props: {
  group: Group;
  days: FestivalDay[];
  shifts: GridShift[];
  viewMode: "position" | "person";
  stationById: Map<string, GridStation>;
  staffById: Map<string, GridStaff>;
  colCount: number;
  onAddShift: Props["onAddShift"];
  onEditShift: Props["onEditShift"];
}) {
  const { group, days, shifts, viewMode, stationById, staffById, colCount, onAddShift, onEditShift } = props;

  return (
    <>
      {/* Concept header row */}
      <div
        className={`border-b ${conceptHeaderClass(group.conceptSlug)} px-3 py-2 text-sm font-semibold`}
        style={{ gridColumn: `span ${colCount + 1}` }}
      >
        {group.conceptName}
      </div>

      {/* Row per item */}
      {group.rows.map((r) => (
        <RowBlock
          key={r.key}
          row={r}
          days={days}
          shifts={shifts}
          viewMode={viewMode}
          stationById={stationById}
          staffById={staffById}
          onAddShift={onAddShift}
          onEditShift={onEditShift}
        />
      ))}
    </>
  );
}

function RowBlock(props: {
  row: Row;
  days: FestivalDay[];
  shifts: GridShift[];
  viewMode: "position" | "person";
  stationById: Map<string, GridStation>;
  staffById: Map<string, GridStaff>;
  onAddShift: Props["onAddShift"];
  onEditShift: Props["onEditShift"];
}) {
  const { row, days, shifts, viewMode, stationById, staffById, onAddShift, onEditShift } = props;

  return (
    <>
      <div className="border-b p-3 bg-card">
        <div className="text-sm font-medium">{row.leftLabel}</div>
        {row.leftSub && <div className="text-xs text-muted-foreground">{row.leftSub}</div>}
      </div>
      {days.map((d) => {
        const cellShifts = shifts.filter((s) => row.matches(s) && s.shiftDate === d.iso);
        return (
          <div
            key={d.iso}
            className="border-b border-l p-1.5 bg-card min-h-[60px] group/cell relative"
          >
            <div className="space-y-1">
              {cellShifts.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onEditShift(s)}
                  className="w-full text-left rounded-md border bg-sky-50 hover:bg-sky-100 border-sky-200 p-1.5 transition-colors"
                >
                  <div className="text-xs font-medium leading-tight">
                    {viewMode === "position"
                      ? (staffById.get(s.staffId)?.display_name || staffById.get(s.staffId)?.full_name || "?")
                      : (s.stationId ? (stationById.get(s.stationId)?.label ?? "?") : "no station")
                    }
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between gap-1">
                    <span>{s.startTime?.slice(0,5) ?? "?"}–{s.endTime?.slice(0,5) ?? "?"}</span>
                    <span className="font-mono">{s.hours}h</span>
                  </div>
                  {s.shiftLabel && (
                    <div className="text-[10px] text-muted-foreground italic truncate">{s.shiftLabel}</div>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onAddShift({
                conceptId: row.conceptId,
                stationId: row.ctxStationId,
                dayIso: d.iso,
                staffId: row.ctxStaffId,
              })}
              className="absolute inset-x-1 bottom-1 opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 rounded py-0.5"
            >
              <Plus className="h-3 w-3" /> add shift
            </button>
          </div>
        );
      })}
    </>
  );
}
