import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Check, X, FileDown, ExternalLink, Copy, Eye, EyeOff, KeyRound, Pencil, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { ImportFromPreviousCard, CARD_TABLES } from "@/components/festival/ImportFromPreviousCard";
import { useDraftMode } from "@/hooks/useDraftMode";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";
import { AddStaffMenu } from "@/components/festival/AddStaffMenu";

type Staff = {
  id: string;
  festival_id: string;
  staff_number: number | null;
  name: string | null;
  email: string | null;
  home_location: string | null;
  confirmed: boolean | null;
  needs_accommodation: boolean | null;
  concept_id: string | null;
  // Legacy day flags (still in DB for the PDF export). New code uses
  // work_dates / accom_dates instead.
  works_thursday: boolean | null;
  works_friday: boolean | null;
  works_saturday: boolean | null;
  works_sunday: boolean | null;
  accom_thursday: boolean | null;
  accom_friday: boolean | null;
  accom_saturday: boolean | null;
  accom_sunday: boolean | null;
  // New flexible day arrays — any calendar date (YYYY-MM-DD).
  work_dates: string[] | null;
  accom_dates: string[] | null;
  staff_source: string;
  role: string;
  station: string | null;
  notes: string | null;
};

// Day window helpers — derive the list of dates shown as chips from the
// festival's start/end date, with a buffer for early arrivals / pack-down.
const BUFFER_BEFORE_DAYS = 3;
const BUFFER_AFTER_DAYS = 1;

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function buildDayWindow(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return [] as { iso: string; label: string; isFestivalDay: boolean }[];
  const out: { iso: string; label: string; isFestivalDay: boolean }[] = [];
  const start = addDaysISO(startDate, -BUFFER_BEFORE_DAYS);
  const end = addDaysISO(endDate, BUFFER_AFTER_DAYS);
  let cursor = start;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  while (cursor <= end) {
    const d = new Date(cursor + "T00:00:00Z");
    out.push({
      iso: cursor,
      label: `${weekdays[d.getUTCDay()]} ${d.getUTCDate()}`,
      isFestivalDay: cursor >= startDate && cursor <= endDate,
    });
    cursor = addDaysISO(cursor, 1);
  }
  return out;
}


type Concept = { id: string; name: string };

const SOURCE_OPTIONS = [
  { value: "soborg", label: "Copenhagen" },
  { value: "aarhus", label: "Aarhus" },
  { value: "local", label: "Local" },
  { value: "fidibus", label: "Fidibus" },
  { value: "unknown", label: "Unknown" },
];

// Fallback station catalog (used for legacy rows / exports). The live source of
// truth comes from the `station` table (queried below) and per-festival slot
// counts come from `festival_schedule_position` so edits here also drive the
// Schedule page and Crew Portal.
const STATION_OPTIONS = [
  { value: "cash_register", label: "Cash register" },
  { value: "assembly", label: "Assembly" },
  { value: "fryer", label: "Fryer" },
  { value: "oven", label: "Oven" },
  { value: "pita_wrapper", label: "Pita wrapper" },
  { value: "pita_griddle", label: "Pita griddle" },
  { value: "burger", label: "Burger" },
  { value: "burger_bun_grill", label: "Burger bun grill" },
  { value: "crepes", label: "Crepes" },
];
const FALLBACK_STATION_LABEL: Record<string, string> = Object.fromEntries(
  STATION_OPTIONS.map((s) => [s.value, s.label])
);

// Map station.code (catalog) -> festival_staff.station (legacy free-text code)
const STATION_CODE_TO_STAFF: Record<string, string> = {
  cash: "cash_register",
  pita_wrap: "pita_wrapper",
  bun_grill: "burger_bun_grill",
};
const staffCodeForStation = (code: string) =>
  STATION_CODE_TO_STAFF[code] ?? code;

type StationRow = {
  id: string;
  concept_id: string | null;
  code: string;
  label: string;
  display_order: number | null;
};
type PositionRow = {
  id: string;
  festival_id: string;
  concept_id: string;
  station_id: string;
  position_number: number;
  display_order: number;
};
type PlanSlot = {
  stationId: string;
  stationCode: string; // staff-code form (e.g. "cash_register")
  label: string;
  count: number;
};


export default function FestivalStaff() {
  const { draftMode } = useDraftMode();
  const { slug = "" } = useParams();
  const hideAccom = /copenhell|cirkus/i.test(slug);
  const qc = useQueryClient();

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, name, slug, start_date, end_date, crew_register_url, crew_register_username, crew_register_password, staff_emails")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const festivalId = festivalQ.data?.id;
  const dayWindow = useMemo(
    () => buildDayWindow(festivalQ.data?.start_date as any, festivalQ.data?.end_date as any),
    [festivalQ.data?.start_date, festivalQ.data?.end_date]
  );

  const staffQ = useQuery({
    queryKey: ["festival-staff-page", festivalId, draftMode],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_staff")
        .select("*")
        .eq("festival_id", festivalId!)
        .eq("is_draft", draftMode)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Staff[];
    },
  });

  const conceptsQ = useQuery({
    queryKey: ["festival-concepts-for-staff", festivalId, draftMode],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select("concept_id, concepts:concept_id(id, name)")
        .eq("festival_id", festivalId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.concepts)
        .filter(Boolean) as Concept[];
    },
  });
  const concepts = conceptsQ.data ?? [];

  // Station catalog (live source: `station` table)
  const stationsQ = useQuery({
    queryKey: ["staff-stations"],
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
  const stations = stationsQ.data ?? [];
  const stationById = useMemo(() => {
    const m = new Map<string, StationRow>();
    stations.forEach((s) => m.set(s.id, s));
    return m;
  }, [stations]);
  const stationsByConcept = useMemo(() => {
    const m = new Map<string, StationRow[]>();
    stations.forEach((s) => {
      if (!s.concept_id) return;
      const list = m.get(s.concept_id) ?? [];
      list.push(s);
      m.set(s.concept_id, list);
    });
    return m;
  }, [stations]);

  // Per-festival station slots (source of truth shared with Schedule + Crew Portal)
  const positionsQ = useQuery({
    queryKey: ["staff-positions", festivalId, draftMode],
    enabled: !!festivalId,
    queryFn: async (): Promise<PositionRow[]> => {
      const { data, error } = await supabase
        .from("festival_schedule_position")
        .select("id, festival_id, concept_id, station_id, position_number, display_order")
        .eq("festival_id", festivalId!)
        .eq("is_draft", draftMode);
      if (error) throw error;
      return (data ?? []) as PositionRow[];
    },
  });

  // Build plan: concept_id -> ordered slots derived from positions
  const planByConcept = useMemo(() => {
    const map = new Map<string, PlanSlot[]>();
    const grouped = new Map<string, Map<string, number>>(); // conceptId -> stationId -> count
    (positionsQ.data ?? []).forEach((p) => {
      const inner = grouped.get(p.concept_id) ?? new Map();
      inner.set(p.station_id, (inner.get(p.station_id) ?? 0) + 1);
      grouped.set(p.concept_id, inner);
    });
    grouped.forEach((inner, conceptId) => {
      const slots: PlanSlot[] = [];
      inner.forEach((count, stationId) => {
        const s = stationById.get(stationId);
        if (!s) return;
        slots.push({
          stationId,
          stationCode: staffCodeForStation(s.code),
          label: s.label,
          count,
        });
      });
      slots.sort((a, b) => {
        const sa = stationById.get(a.stationId);
        const sb = stationById.get(b.stationId);
        return (sa?.display_order ?? 0) - (sb?.display_order ?? 0);
      });
      map.set(conceptId, slots);
    });
    return map;
  }, [positionsQ.data, stationById]);

  // Live station label lookup (staff-code form first, falls back to legacy map)
  const STATION_LABEL = useMemo(() => {
    const m: Record<string, string> = { ...FALLBACK_STATION_LABEL };
    stations.forEach((s) => {
      m[staffCodeForStation(s.code)] = s.label;
    });
    return m;
  }, [stations]);

  // --- Slot editor mutations -------------------------------------------------
  const addSlot = useMutation({
    mutationFn: async ({ conceptId, stationId }: { conceptId: string; stationId: string }) => {
      const existing = (positionsQ.data ?? []).filter(
        (p) => p.concept_id === conceptId,
      );
      const same = existing.filter((p) => p.station_id === stationId);
      const nextPos = same.reduce((m, p) => Math.max(m, p.position_number), 0) + 1;
      const nextOrder = existing.reduce((m, p) => Math.max(m, p.display_order), 0) + 1;
      const { error } = await supabase.from("festival_schedule_position").insert({
        festival_id: festivalId!,
        concept_id: conceptId,
        station_id: stationId,
        position_number: nextPos,
        display_order: nextOrder,
        is_draft: draftMode,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-positions", festivalId, draftMode] });
      qc.invalidateQueries({ queryKey: ["sched-positions", festivalId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to add slot"),
  });

  const removeSlot = useMutation({
    mutationFn: async ({ conceptId, stationId }: { conceptId: string; stationId: string }) => {
      const same = (positionsQ.data ?? [])
        .filter((p) => p.concept_id === conceptId && p.station_id === stationId)
        .sort((a, b) => b.position_number - a.position_number);
      const victim = same[0];
      if (!victim) return;
      const { error } = await supabase
        .from("festival_schedule_position")
        .delete()
        .eq("id", victim.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-positions", festivalId, draftMode] });
      qc.invalidateQueries({ queryKey: ["sched-positions", festivalId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to remove slot"),
  });

  // Import all slots for a concept from another festival (replaces current)
  const importSlots = useMutation({
    mutationFn: async ({ conceptId, fromFestivalId }: { conceptId: string; fromFestivalId: string }) => {
      // Fetch source positions
      const { data: src, error: srcErr } = await supabase
        .from("festival_schedule_position")
        .select("station_id, position_number, display_order")
        .eq("festival_id", fromFestivalId)
        .eq("concept_id", conceptId);
      if (srcErr) throw srcErr;
      if (!src || src.length === 0) throw new Error("No stations found in that festival for this concept.");

      // Wipe current slots for this concept (current festival + draft mode)
      const { error: delErr } = await supabase
        .from("festival_schedule_position")
        .delete()
        .eq("festival_id", festivalId!)
        .eq("concept_id", conceptId)
        .eq("is_draft", draftMode);
      if (delErr) throw delErr;

      // Insert copies
      const rows = src.map((p) => ({
        festival_id: festivalId!,
        concept_id: conceptId,
        station_id: p.station_id,
        position_number: p.position_number,
        display_order: p.display_order,
        is_draft: draftMode,
      }));
      const { error: insErr } = await supabase.from("festival_schedule_position").insert(rows);
      if (insErr) throw insErr;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Imported ${n} slot${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["staff-positions", festivalId, draftMode] });
      qc.invalidateQueries({ queryKey: ["sched-positions", festivalId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Import failed"),
  });



  const updateStaff = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Staff> }) => {
      const { error } = await supabase.from("festival_staff").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival-staff-page", festivalId, draftMode] }),
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const addStaff = useMutation({
    mutationFn: async () => {
      const festivalDayIsos = dayWindow.filter((d) => d.isFestivalDay).map((d) => d.iso);
      const { error } = await supabase.from("festival_staff").insert({
        festival_id: festivalId!,
        name: "",
        home_location: "",
        confirmed: false,
        role: "crew",
        staff_source: "unknown",
        work_dates: festivalDayIsos,
        accom_dates: [],
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival-staff-page", festivalId, draftMode] }),
    onError: (e: any) => toast.error(e.message ?? "Insert failed"),
  });

  const deleteStaff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_staff").delete().eq("id", id);
      if (error) throw error;

      const { data: remaining, error: fetchErr } = await supabase
        .from("festival_staff")
        .select("id, staff_number, created_at")
        .eq("festival_id", festivalId!)
        .eq("is_draft", draftMode);
      if (fetchErr) throw fetchErr;

      const rows = (remaining ?? []).sort((a: any, b: any) => {
        if (a.staff_number !== null && b.staff_number !== null) {
          return a.staff_number - b.staff_number;
        }
        if (a.staff_number !== null) return -1;
        if (b.staff_number !== null) return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      for (let i = 0; i < rows.length; i++) {
        const newNum = i + 1;
        if (rows[i].staff_number !== newNum) {
          const { error: updErr } = await supabase
            .from("festival_staff")
            .update({ staff_number: newNum })
            .eq("id", rows[i].id);
          if (updErr) throw updErr;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["festival-staff-page", festivalId, draftMode] });
      qc.invalidateQueries({ queryKey: ["festival-staff-employee-ids", festivalId, draftMode] });
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const allRows = staffQ.data ?? [];
  const confirmedCount = allRows.filter((s) => s.confirmed).length;
  const unconfirmedCount = allRows.length - confirmedCount;
  const unassignedCount = allRows.filter((s) => !s.concept_id && s.role !== "management").length;

  const [filter, setFilter] = useState<"all" | "unconfirmed" | "unassigned">("all");
  const [cityFilter, setCityFilter] = useState<string>("__all__");
  const [accomFilter, setAccomFilter] = useState<"any" | "yes" | "no">("any");

  // City list is built from free-text `home_location` entries. We normalize
  // (case-insensitive, trimmed) so "copenhaga", "Copenhaga", "COPENHAGA" all
  // collapse into one option displayed in Title Case.
  const toTitleCase = (s: string) =>
    s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const cityOptions = (() => {
    const seen = new Map<string, string>(); // key: lowercase, value: display label
    seen.set("aarhus", "Aarhus");
    allRows.forEach((s) => {
      const raw = (s.home_location ?? "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, toTitleCase(raw));
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  })();

  const rows = allRows
    .filter((s) =>
      filter === "unconfirmed"
        ? !s.confirmed
        : filter === "unassigned"
        ? !s.concept_id && s.role !== "management"
        : true
    )
    .filter((s) =>
      cityFilter === "__all__"
        ? true
        : (s.home_location ?? "").trim().toLowerCase() === cityFilter.toLowerCase()
    )
    .filter((s) =>
      accomFilter === "any"
        ? true
        : accomFilter === "yes"
        ? !!s.needs_accommodation
        : !s.needs_accommodation
    )
    .sort((a, b) => (a.staff_number ?? 9999) - (b.staff_number ?? 9999));

  // Empty-slot calculation across concept plans (from live positions)
  const emptySlots: { conceptName: string; stationLabel: string; missing: number }[] = [];
  concepts.forEach((c) => {
    const slots = planByConcept.get(c.id);
    if (!slots || slots.length === 0) return;
    const conceptPeople = allRows.filter((s) => s.concept_id === c.id && s.role !== "management");
    slots.forEach((slot) => {
      const filled = conceptPeople.filter((p) => p.station === slot.stationCode).length;
      const missing = slot.count - Math.min(filled, slot.count);
      if (missing > 0) {
        emptySlots.push({
          conceptName: c.name,
          stationLabel: slot.label,
          missing,
        });
      }
    });
  });
  const totalEmpty = emptySlots.reduce((a, s) => a + s.missing, 0);

  return (
    <div className="container mx-auto max-w-7xl p-4 md:p-6 space-y-4">
      <FestivalBackBar />
      <StaffEmailsCard
        festivalId={festivalId}
        initialEmails={(festivalQ.data as any)?.staff_emails ?? ""}
        onSaved={() => qc.invalidateQueries({ queryKey: ["festival-by-slug", slug] })}
      />
      <ImportFromPreviousCard
        cardLabel="staff"
        tables={CARD_TABLES.staff}
        currentFestivalId={festivalId ?? ""}
        onCommitted={() => window.location.reload()}
      />
      <CrewRegisterCard
        festivalId={festivalId}
        initialUrl={festivalQ.data?.crew_register_url ?? ""}
        initialUsername={festivalQ.data?.crew_register_username ?? ""}
        initialPassword={festivalQ.data?.crew_register_password ?? ""}
        onSaved={() => qc.invalidateQueries({ queryKey: ["festival-by-slug", slug] })}
      />


      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/festivals/${slug}`}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <h1 className="font-heading text-2xl font-semibold">Staff</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/festivals/${slug}/staff/export`}>
              <FileDown className="h-4 w-4 mr-1" /> Export
            </Link>
          </Button>
          <AddStaffMenu
            festivalId={festivalId!}
            isDraft={draftMode}
            workDates={dayWindow.filter((d) => d.isFestivalDay).map((d) => d.iso)}
          />

        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All <span className="opacity-60">({allRows.length})</span>
        </FilterChip>
        <FilterChip active={filter === "unconfirmed"} onClick={() => setFilter("unconfirmed")}>
          Unconfirmed <span className="opacity-60">({unconfirmedCount})</span>
        </FilterChip>
        <FilterChip active={filter === "unassigned"} onClick={() => setFilter("unassigned")}>
          Not assigned <span className="opacity-60">({unassignedCount})</span>
        </FilterChip>

        <div className="h-5 w-px bg-border mx-1" />

        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All cities</SelectItem>
            {cityOptions.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FilterChip active={accomFilter === "any"} onClick={() => setAccomFilter("any")}>
          Any accom.
        </FilterChip>
        <FilterChip active={accomFilter === "yes"} onClick={() => setAccomFilter("yes")}>
          Needs accom.
        </FilterChip>
        <FilterChip active={accomFilter === "no"} onClick={() => setAccomFilter("no")}>
          No accom.
        </FilterChip>

        <span className="ml-auto text-muted-foreground">
          ✓ {confirmedCount} confirmed
        </span>
      </div>

      {totalEmpty > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-amber-900">
              Empty slots · {totalEmpty}
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {emptySlots.map((e, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 rounded bg-white border border-amber-200"
              >
                <strong>{e.conceptName}</strong> · {e.stationLabel} ×{e.missing}
              </span>
            ))}
          </div>
        </div>
      )}


      <div className="rounded-lg border bg-card overflow-hidden">
        <Table className="text-xs [&_th]:px-2 [&_td]:px-2 [&_th]:py-2 [&_td]:py-1.5">
          <TableHeader>
            <TableRow>
              <TableHead className="w-7 text-[10px]">#</TableHead>
              <TableHead className="min-w-[220px] text-sm">Name</TableHead>
              <TableHead className="w-[80px] text-[10px]">Transport Place</TableHead>
              {!hideAccom && <TableHead className="text-center text-[10px]">Accom.</TableHead>}
              <TableHead className="w-[100px] text-[10px]">Concept</TableHead>
              <TableHead className="text-center text-[10px]">Work days</TableHead>
              <TableHead className="text-center w-10">✓</TableHead>
              <TableHead className="w-[140px]">Notes</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s, i) => (
              <StaffRow
                key={s.id}
                staff={s}
                index={i + 1}
                concepts={concepts}
                dayWindow={dayWindow}
                hideAccom={hideAccom}
                onPatch={(patch) => updateStaff.mutate({ id: s.id, patch })}
                onDelete={() => {
                  if (confirm(`Delete ${s.name || "this person"}?`)) deleteStaff.mutate(s.id);
                }}
              />
            ))}
            {rows.length === 0 && !staffQ.isLoading && (
              <TableRow>
                <TableCell colSpan={hideAccom ? 8 : 9} className="text-center text-muted-foreground py-8">
                  No staff yet. Click "Add person" to start.
                </TableCell>
              </TableRow>
            )}

          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="font-heading text-lg font-semibold mb-3">Crew by concept</h2>

        {(() => {
          const assignmentMap = new Map<string, { conceptName: string; stationLabel: string }>();
          allRows.forEach((p) => {
            // Management is informative only — never lock them out of position slots.
            if (p.role === "management") return;
            if (p.concept_id && p.station) {
              // Only treat as "locked in a position" if their station actually
              // matches a real position slot in that concept's plan.
              const planSlots = planByConcept.get(p.concept_id);
              const inRealSlot = !!planSlots?.some((s) => s.stationCode === p.station);
              if (!inRealSlot) return;
              const cName = concepts.find((c) => c.id === p.concept_id)?.name ?? "—";
              assignmentMap.set(p.id, {
                conceptName: cName,
                stationLabel: STATION_LABEL[p.station] ?? p.station,
              });
            }
          });

          // Include management folks too — they can also fill a position slot if needed.
          const crewPool = allRows;

          const groups = [
            ...concepts.map((c) => ({
              id: c.id,
              name: c.name,
              people: allRows.filter((s) => s.concept_id === c.id && s.role !== "management"),
            })),
            { id: "__mgmt__", name: "Management", people: allRows.filter((s) => s.role === "management") },
            { id: "__none__", name: "Not assigned", people: allRows.filter((s) => !s.concept_id && s.role !== "management") },
          ];

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
              {groups.map((group) => {
                const isMgmt = group.id === "__mgmt__";
                const isNone = group.id === "__none__";
                const slots: PlanSlot[] | undefined = !isMgmt && !isNone
                  ? (planByConcept.get(group.id) ?? [])
                  : undefined;
                const hasPlan = !isMgmt && !isNone;

                const totalSlots = slots?.reduce((a, s) => a + s.count, 0) ?? 0;
                const filledTotal = slots
                  ? slots.reduce((acc, slot) => {
                      const count = group.people.filter((p) => p.station === slot.stationCode).length;
                      return acc + Math.min(count, slot.count);
                    }, 0)
                  : group.people.length;

                const availableStations = !isMgmt && !isNone
                  ? (stationsByConcept.get(group.id) ?? [])
                  : [];

                return (
                  <div key={group.id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b">
                      <h3 className="font-heading font-semibold text-base">{group.name}</h3>
                      <div className="flex items-center gap-2">
                        {hasPlan ? (
                          <span className="text-xs font-medium text-muted-foreground tabular-nums">
                            {filledTotal}/{totalSlots}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {group.people.length}
                          </span>
                        )}
                        {!isMgmt && !isNone && (
                          <StationsEditorPopover
                            conceptId={group.id}
                            conceptName={group.name}
                            slots={slots ?? []}
                            availableStations={availableStations}
                            onAdd={(stationId) => addSlot.mutate({ conceptId: group.id, stationId })}
                            onRemove={(stationId) => removeSlot.mutate({ conceptId: group.id, stationId })}
                            currentFestivalId={festivalId!}
                            onImport={(fromFestivalId) => importSlots.mutate({ conceptId: group.id, fromFestivalId })}
                            importPending={importSlots.isPending}
                          />
                        )}
                      </div>
                    </div>

                    {hasPlan ? (
                      slots && slots.length > 0 ? (
                        (() => {
                          const usedHere = new Set<string>();
                          return (
                            <div className="space-y-3">
                              {slots.map((slot) => {
                                const occupants = group.people
                                  .filter((p) => p.station === slot.stationCode)
                                  .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
                                return (
                                  <div key={slot.stationId} className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                                        {slot.label}
                                      </div>
                                      <span className="text-[10px] text-muted-foreground tabular-nums">
                                        {Math.min(occupants.length, slot.count)}/{slot.count}
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      {Array.from({ length: slot.count }).map((_, idx) => {
                                        const current = occupants[idx];
                                        if (current) usedHere.add(current.id);
                                        return (
                                          <SlotPicker
                                            key={`${slot.stationId}-${idx}`}
                                            current={current}
                                            crewPool={crewPool}
                                            assignmentMap={assignmentMap}
                                            onAssign={(personId) => {
                                              if (personId === "__empty__") {
                                                if (current) {
                                                  updateStaff.mutate({
                                                    id: current.id,
                                                    patch: { station: null, concept_id: null },
                                                  });
                                                }
                                                return;
                                              }
                                              updateStaff.mutate({
                                                id: personId,
                                                patch: {
                                                  concept_id: group.id,
                                                  station: slot.stationCode,
                                                  role: "crew",
                                                },
                                              });
                                            }}
                                          />
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}

                              {(() => {
                                const extras = group.people.filter((p) => !usedHere.has(p.id));
                                if (extras.length === 0) return null;
                                return (
                                  <div className="pt-2 border-t">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">
                                      Extra · {extras.length}
                                    </div>
                                    <ul className="space-y-1">
                                      {extras.map((p) => (
                                        <li key={p.id} className="text-sm flex items-center justify-between gap-2">
                                          <span className="truncate">{p.name || <em className="text-muted-foreground">Unnamed</em>}</span>
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted shrink-0">
                                            {p.station ? (STATION_LABEL[p.station] ?? p.station) : "no station"}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          No stations yet — click the pencil to add some, or import from a previous festival.
                        </p>
                      )
                    ) : group.people.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No one assigned</p>
                    ) : (
                      <ul className="space-y-1">
                        {group.people.map((p) => (
                          <li key={p.id} className="flex items-center justify-between text-sm gap-2">
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                                  p.confirmed ? "bg-emerald-500" : "bg-amber-400"
                                }`}
                              />
                              <span className="truncate">{p.name || <em className="text-muted-foreground">Unnamed</em>}</span>
                            </span>
                            {p.home_location && (
                              <span className="text-[10px] text-muted-foreground shrink-0">{p.home_location}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>



      <div>
        <h2 className="font-heading text-lg font-semibold mb-3">Crew by station</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(() => {
            // Only show stations that are actually configured for this festival's concepts
            const festivalStationCodes = new Set<string>();
            planByConcept.forEach((slots) => {
              slots.forEach((s) => festivalStationCodes.add(s.stationCode));
            });
            // Also include any station that staff are already assigned to (avoid hiding existing data)
            allRows.forEach((p) => {
              if (p.station) festivalStationCodes.add(p.station);
            });
            return [
              ...STATION_OPTIONS
                .filter((s) => festivalStationCodes.has(s.value))
                .map((s) => ({
                  id: s.value,
                  name: s.label,
                  people: allRows.filter((p) => p.station === s.value),
                })),
              { id: "__none__", name: "No station", people: allRows.filter((p) => !p.station) },
            ];
          })().map((group) => (
            <div key={group.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm">{group.name}</h3>
                <span className="text-xs text-muted-foreground">{group.people.length}</span>
              </div>
              {group.people.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No one assigned</p>
              ) : (
                <ul className="space-y-1">
                  {group.people.map((p) => {
                    const conceptName =
                      p.role === "management"
                        ? "Management"
                        : concepts.find((c) => c.id === p.concept_id)?.name ?? "—";
                    return (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${
                              p.confirmed ? "bg-emerald-500" : "bg-amber-400"
                            }`}
                          />
                          <span>{p.name || <em className="text-muted-foreground">Unnamed</em>}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{conceptName}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>


      <p className="text-xs text-muted-foreground print:hidden">
        This list is shared across Transport, Setup and other festival sections.
      </p>
    </div>
  );
}

function StationsEditorPopover({
  conceptId,
  conceptName,
  slots,
  availableStations,
  onAdd,
  onRemove,
  currentFestivalId,
  onImport,
  importPending,
}: {
  conceptId: string;
  conceptName: string;
  slots: PlanSlot[];
  availableStations: StationRow[];
  onAdd: (stationId: string) => void;
  onRemove: (stationId: string) => void;
  currentFestivalId: string;
  onImport: (fromFestivalId: string) => void;
  importPending: boolean;
}) {
  const [pendingStationId, setPendingStationId] = useState<string>("");
  const [importFestivalId, setImportFestivalId] = useState<string>("");

  // Build a quick lookup of current counts by stationId
  const countById = new Map<string, number>();
  slots.forEach((s) => countById.set(s.stationId, s.count));

  // Stations not yet in plan
  const notInPlan = availableStations.filter((s) => !countById.has(s.id));

  // Other festivals that have stations configured for this concept
  const importSourcesQ = useQuery({
    queryKey: ["staff-import-sources", conceptId, currentFestivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_schedule_position")
        .select("festival_id, festivals:festival_id(id, name, start_date)")
        .eq("concept_id", conceptId)
        .neq("festival_id", currentFestivalId);
      if (error) throw error;
      const seen = new Map<string, { id: string; name: string; start_date: string | null }>();
      (data ?? []).forEach((r: any) => {
        const f = r.festivals;
        if (f && !seen.has(f.id)) seen.set(f.id, f);
      });
      return Array.from(seen.values()).sort((a, b) =>
        (b.start_date ?? "").localeCompare(a.start_date ?? ""),
      );
    },
  });
  const importSources = importSourcesQ.data ?? [];


  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={`Edit stations for ${conceptName}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide mb-2 text-foreground/80">
          Stations · {conceptName}
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          Slots here drive the Schedule grid and Crew Portal.
        </p>
        <div className="space-y-1.5 mb-3">
          {slots.length === 0 && (
            <p className="text-xs italic text-muted-foreground">No stations yet.</p>
          )}
          {slots.map((s) => (
            <div key={s.stationId} className="flex items-center justify-between gap-2">
              <span className="text-sm truncate">{s.label}</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onRemove(s.stationId)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="text-xs w-5 text-center tabular-nums">{s.count}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onAdd(s.stationId)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        {notInPlan.length > 0 && (
          <div className="border-t pt-2 space-y-2">
            <div className="text-[11px] uppercase font-semibold text-muted-foreground">
              Add a station
            </div>
            <div className="flex items-center gap-1.5">
              <Select value={pendingStationId} onValueChange={setPendingStationId}>
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue placeholder="Pick station…" />
                </SelectTrigger>
                <SelectContent>
                  {notInPlan.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!pendingStationId}
                onClick={() => {
                  if (!pendingStationId) return;
                  onAdd(pendingStationId);
                  setPendingStationId("");
                }}
              >
                Add
              </Button>
            </div>
          </div>
        )}
        {importSources.length > 0 && (
          <div className="border-t pt-2 mt-2 space-y-2">
            <div className="text-[11px] uppercase font-semibold text-muted-foreground">
              Import from previous festival
            </div>
            <p className="text-[10px] text-muted-foreground">
              Replaces current stations for {conceptName}.
            </p>
            <div className="flex items-center gap-1.5">
              <Select value={importFestivalId} onValueChange={setImportFestivalId}>
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue placeholder="Pick festival…" />
                </SelectTrigger>
                <SelectContent>
                  {importSources.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={!importFestivalId || importPending}
                onClick={() => {
                  if (!importFestivalId) return;
                  if (slots.length > 0 && !confirm(`Replace current ${conceptName} stations with the ones from the selected festival?`)) return;
                  onImport(importFestivalId);
                  setImportFestivalId("");
                }}
              >
                {importPending ? "…" : "Import"}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full border text-xs transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted border-border text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StaffRow({
  staff,
  index,
  concepts,
  dayWindow,
  hideAccom,
  onPatch,
  onDelete,
}: {
  staff: Staff;
  index: number;
  concepts: Concept[];
  dayWindow: { iso: string; label: string; isFestivalDay: boolean }[];
  hideAccom?: boolean;
  onPatch: (patch: Partial<Staff>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(staff.name ?? "");
  const [location, setLocation] = useState(staff.home_location ?? "");
  const [notes, setNotes] = useState(staff.notes ?? "");

  const workDatesSet = new Set(staff.work_dates ?? []);
  const accomDatesSet = new Set(staff.accom_dates ?? []);

  const toggleDate = (
    field: "work_dates" | "accom_dates",
    iso: string,
  ) => {
    const current = (field === "work_dates" ? staff.work_dates : staff.accom_dates) ?? [];
    const has = current.includes(iso);
    const next = has ? current.filter((d) => d !== iso) : [...current, iso].sort();
    const patch: Partial<Staff> = { [field]: next } as Partial<Staff>;
    if (field === "accom_dates") {
      patch.needs_accommodation = next.length > 0;
    }
    onPatch(patch);
  };

  return (
    <TableRow>
      <TableCell className="text-muted-foreground text-xs">{index}</TableCell>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== (staff.name ?? "")) onPatch({ name });
          }}
          placeholder="Name"
          className="h-8 text-sm font-medium px-2"
        />
      </TableCell>
      <TableCell>
        <Select
          value={staff.staff_source}
          onValueChange={(v) => onPatch({ staff_source: v })}
        >
          <SelectTrigger className="h-7 text-xs px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      {!hideAccom && (
        <TableCell>
          <DayPickerCell
            selected={staff.accom_dates ?? []}
            dayWindow={dayWindow}
            variant="accom"
            title="Accommodation nights"
            onChange={(next) =>
              onPatch({ accom_dates: next, needs_accommodation: next.length > 0 } as Partial<Staff>)
            }
          />
        </TableCell>
      )}

      <TableCell>
        <Select
          value={staff.role === "management" ? "__mgmt__" : (staff.concept_id ?? "__none__")}
          onValueChange={(v) => {
            // Concept here is just a suggestion — clear any station lock so the
            // person isn't shown as occupying a position slot.
            if (v === "__mgmt__") onPatch({ role: "management", concept_id: null, station: null });
            else if (v === "__none__") onPatch({ role: "crew", concept_id: null, station: null });
            else if (v !== staff.concept_id) onPatch({ role: "crew", concept_id: v, station: null });
            else onPatch({ role: "crew", concept_id: v });
          }}
        >
          <SelectTrigger className="h-7 text-xs px-2">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            <SelectItem value="__mgmt__">Management</SelectItem>
            {concepts.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <DayPickerCell
          selected={staff.work_dates ?? []}
          dayWindow={dayWindow}
          variant="work"
          title="Work days"
          onChange={(next) => onPatch({ work_dates: next } as Partial<Staff>)}
        />
      </TableCell>

      <TableCell className="text-center">
        <button
          onClick={() => onPatch({ confirmed: !staff.confirmed })}
          className={`inline-flex items-center justify-center h-7 w-7 rounded-full border ${
            staff.confirmed
              ? "bg-emerald-100 border-emerald-300 text-emerald-700"
              : "bg-amber-50 border-amber-200 text-amber-700"
          }`}
          title={staff.confirmed ? "Confirmed" : "Unconfirmed"}
        >
          {staff.confirmed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
      </TableCell>
      <TableCell>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (staff.notes ?? "")) onPatch({ notes: notes || null });
          }}
          placeholder="Notes"
          className="h-7 text-xs px-2"
        />
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SlotPicker({
  current,
  crewPool,
  assignmentMap,
  onAssign,
}: {
  current?: Staff;
  crewPool: Staff[];
  assignmentMap: Map<string, { conceptName: string; stationLabel: string }>;
  onAssign: (personId: string) => void;
}) {
  const value = current?.id ?? "__empty__";
  const sorted = [...crewPool].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return (
    <Select value={value} onValueChange={onAssign}>
      <SelectTrigger
        className={`h-8 text-sm ${
          current ? "border-emerald-300 bg-emerald-50/50" : "border-dashed text-muted-foreground"
        }`}
      >
        <SelectValue placeholder="— Empty slot —">
          {current ? (
            <span className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  current.confirmed ? "bg-emerald-500" : "bg-amber-400"
                }`}
              />
              <span className="truncate">{current.name || "Unnamed"}</span>
            </span>
          ) : (
            <span className="italic">— Empty slot —</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="__empty__">
          <span className="italic text-muted-foreground">— Empty slot —</span>
        </SelectItem>
        {sorted.map((p) => {
          const assigned = assignmentMap.get(p.id);
          const isCurrent = current?.id === p.id;
          const isElsewhere = !!assigned && !isCurrent;
          return (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    p.confirmed ? "bg-emerald-500" : "bg-amber-400"
                  }`}
                />
                <span className={isElsewhere ? "text-destructive line-through" : ""}>
                  {p.name || "Unnamed"}
                </span>
                {isElsewhere && (
                  <span className="text-[10px] text-destructive ml-1">
                    ({assigned!.conceptName}{assigned!.stationLabel ? ` · ${assigned!.stationLabel}` : ""})
                  </span>
                )}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

// ============ Day picker cell (work / accom dates) ============
//
// Compact cell that shows ONLY the currently-selected dates as chips.
// A pencil button opens a popover listing every day in the festival window
// (with festival days highlighted vs. buffer days), where the user toggles
// which days apply. Unselected days are not visible until you open the editor.

function DayPickerCell({
  selected,
  dayWindow,
  variant,
  title,
  onChange,
}: {
  selected: string[];
  dayWindow: { iso: string; label: string; isFestivalDay: boolean }[];
  variant: "work" | "accom";
  title: string;
  onChange: (next: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  const festivalDays = dayWindow.filter((d) => d.isFestivalDay);
  const extraDays = dayWindow.filter((d) => !d.isFestivalDay);

  // Visible rows: every festival day + any selected non-festival day
  // (incl. legacy dates outside the current window).
  const visibleRows = [
    ...festivalDays,
    ...extraDays.filter((d) => selectedSet.has(d.iso)),
    ...selected
      .filter((iso) => !dayWindow.some((d) => d.iso === iso))
      .map((iso) => ({ iso, label: iso.slice(5), isFestivalDay: false })),
  ].sort((a, b) => a.iso.localeCompare(b.iso));

  // Extra days not yet selected — available in the "+" picker.
  const availableExtras = extraDays.filter((d) => !selectedSet.has(d.iso));

  const activeClasses =
    variant === "work"
      ? "bg-emerald-600 text-white border-emerald-600"
      : "bg-primary text-primary-foreground border-primary";
  const inactiveClasses =
    "bg-background text-muted-foreground border-border hover:bg-muted";

  const toggle = (iso: string, checked: boolean) => {
    const next = checked
      ? [...selected, iso].sort()
      : selected.filter((x) => x !== iso);
    onChange(next);
  };

  return (
    <div className="flex flex-row items-center justify-center gap-1 flex-nowrap whitespace-nowrap">
      {visibleRows.map((d) => {
        const checked = selectedSet.has(d.iso);
        return (
          <button
            key={d.iso}
            type="button"
            onClick={() => toggle(d.iso, !checked)}
            title={d.iso}
            className={`inline-flex items-center justify-center h-6 px-2 rounded-md border text-[11px] font-medium tabular-nums transition-colors ${
              checked ? activeClasses : inactiveClasses
            }`}
          >
            {d.label}
          </button>
        );
      })}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-dashed border-border text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            title={`Remove ${title.toLowerCase()}`}
            disabled={selected.length === 0}
          >
            <Minus className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="end">
          <div className="text-xs font-semibold mb-2">Remove {title.toLowerCase()}</div>
          {selected.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">
              No days to remove.
            </div>
          ) : (
            <div className="space-y-1">
              {visibleRows.map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => toggle(d.iso, false)}
                  className="w-full flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-red-50 hover:text-red-600"
                >
                  <span className="tabular-nums">{d.label}</span>
                  <span className="text-[9px] uppercase text-muted-foreground">remove</span>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-dashed border-border text-muted-foreground hover:bg-muted"
            title={`Add ${title.toLowerCase()}`}
          >
            <Plus className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="end">
          <div className="text-xs font-semibold mb-2">Add {title.toLowerCase()}</div>
          {availableExtras.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">
              No extra days available.
            </div>
          ) : (
            <div className="space-y-1">
              {availableExtras.map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => toggle(d.iso, true)}
                  className="w-full flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-muted"
                >
                  <span className="tabular-nums">{d.label}</span>
                  <span className="text-[9px] uppercase text-muted-foreground">add</span>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============ Shift groups editor (Fish & Gyros) ============

type ShiftRow = {
  id: string;
  concept_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
};

const WORK_DAYS = ["2026-05-21", "2026-05-22", "2026-05-23"]; // Thu, Fri, Sat
const LATE_END = "02:00:00";
const EARLY_END = "23:00:00";

function ShiftGroupsEditor({
  festivalId,
  concepts,
}: {
  festivalId: string;
  concepts: Concept[];
}) {
  const qc = useQueryClient();
  const { draftMode } = useDraftMode();
  const conceptIds = concepts.map((c) => c.id);

  const shiftsQ = useQuery({
    queryKey: ["shift-groups", festivalId, conceptIds.join(","), draftMode],
    enabled: conceptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_shifts")
        .select("id, concept_id, shift_date, start_time, end_time, notes")
        .eq("festival_id", festivalId)
        .in("concept_id", conceptIds)
        .in("shift_date", WORK_DAYS)
        .not("notes", "is", null);
      if (error) throw error;
      return (data ?? []) as ShiftRow[];
    },
  });

  const swap = useMutation({
    mutationFn: async ({
      conceptId,
      name,
      target,
    }: {
      conceptId: string;
      name: string;
      target: "late" | "early";
    }) => {
      const rows = (shiftsQ.data ?? []).filter(
        (r) => r.concept_id === conceptId && (r.notes ?? "").trim() === name
      );
      for (const r of rows) {
        const isThu = r.shift_date === "2026-05-21";
        const newStart = target === "late" ? "11:00:00" : isThu ? "11:00:00" : "10:00:00";
        const newEnd = target === "late" ? LATE_END : EARLY_END;
        const { error } = await supabase
          .from("festival_shifts")
          .update({
            start_time: newStart,
            end_time: newEnd,
            crosses_midnight: target === "late",
          })
          .eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-groups", festivalId, draftMode] });
      toast.success("Shift updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Swap failed"),
  });

  if (concepts.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Shift groups · Thu–Sat</h2>
        <p className="text-xs text-muted-foreground">
          Swap people between late closers (until 02:00) and early out (until 23:00). Sunday is unchanged.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {concepts.map((c) => {
          const rows = (shiftsQ.data ?? []).filter((r) => r.concept_id === c.id);
          const byName = new Map<string, ShiftRow[]>();
          rows.forEach((r) => {
            const n = (r.notes ?? "").trim();
            if (!n) return;
            if (!byName.has(n)) byName.set(n, []);
            byName.get(n)!.push(r);
          });

          const late: string[] = [];
          const early: string[] = [];
          Array.from(byName.entries()).forEach(([name, rs]) => {
            const thu = rs.find((r) => r.shift_date === "2026-05-21") ?? rs[0];
            if ((thu?.end_time ?? "").startsWith("02")) late.push(name);
            else if ((thu?.end_time ?? "").startsWith("23")) early.push(name);
          });
          late.sort();
          early.sort();

          return (
            <div key={c.id} className="rounded-lg border bg-background p-3 space-y-3">
              <h3 className="font-semibold text-sm border-b pb-1">{c.name}</h3>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-foreground/80 mb-1.5">
                  Late closers · until 02:00 ({late.length})
                </div>
                {late.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">—</p>
                ) : (
                  <ul className="space-y-1">
                    {late.map((n) => (
                      <li key={n} className="flex items-center justify-between text-sm">
                        <span className="truncate">{n}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          disabled={swap.isPending}
                          onClick={() =>
                            swap.mutate({ conceptId: c.id, name: n, target: "early" })
                          }
                        >
                          → Early
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-foreground/80 mb-1.5">
                  Early out · until 23:00 ({early.length})
                </div>
                {early.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">—</p>
                ) : (
                  <ul className="space-y-1">
                    {early.map((n) => (
                      <li key={n} className="flex items-center justify-between text-sm">
                        <span className="truncate">{n}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          disabled={swap.isPending}
                          onClick={() =>
                            swap.mutate({ conceptId: c.id, name: n, target: "late" })
                          }
                        >
                          → Late
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ Shift schedule card (Thu–Sun grid per person) ============

const SCHEDULE_DAYS = [
  { date: "2026-05-21", label: "Thu 21" },
  { date: "2026-05-22", label: "Fri 22" },
  { date: "2026-05-23", label: "Sat 23" },
  { date: "2026-05-24", label: "Sun 24" },
] as const;

function fmt(t: string | null | undefined) {
  if (!t) return "—";
  return t.slice(0, 5);
}

function hoursBetween(start: string, end: string, crosses: boolean) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0 || crosses) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

function ShiftScheduleCard({
  festivalId,
  concepts,
}: {
  festivalId: string;
  concepts: Concept[];
}) {
  const { draftMode } = useDraftMode();
  const conceptIds = concepts.map((c) => c.id);
  const dates = SCHEDULE_DAYS.map((d) => d.date);

  const shiftsQ = useQuery({
    queryKey: ["shift-schedule", festivalId, conceptIds.join(","), draftMode],
    enabled: conceptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_shifts")
        .select("id, concept_id, shift_date, start_time, end_time, crosses_midnight, notes")
        .eq("festival_id", festivalId)
        .in("concept_id", conceptIds)
        .in("shift_date", dates)
        .not("notes", "is", null);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (concepts.length === 0) return null;

  const rows = shiftsQ.data ?? [];

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-card p-4 md:p-5 space-y-5 print:border-0 print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <div>
          <h2 className="font-heading text-xl font-semibold">Shift schedule · Thu–Sun</h2>
          <p className="text-xs text-muted-foreground">
            Per-person hours for Fish & Chips and Gyros. Sunday closes 24:00.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          Print / PDF
        </Button>
      </div>

      <div className="space-y-6">
        {concepts.map((c) => {
          const conceptRows = rows.filter(
            (r) => r.concept_id === c.id && (r.notes ?? "").trim()
          );
          const byName = new Map<string, any[]>();
          conceptRows.forEach((r) => {
            const n = (r.notes ?? "").trim();
            if (!byName.has(n)) byName.set(n, []);
            byName.get(n)!.push(r);
          });

          const names = Array.from(byName.keys()).sort((a, b) => {
            // late closers (Thu end 02:00) first, then early
            const aLate = (byName.get(a)!.find((r) => r.shift_date === "2026-05-21")?.end_time ?? "").startsWith("02");
            const bLate = (byName.get(b)!.find((r) => r.shift_date === "2026-05-21")?.end_time ?? "").startsWith("02");
            if (aLate !== bLate) return aLate ? -1 : 1;
            return a.localeCompare(b);
          });

          let conceptTotal = 0;

          return (
            <div key={c.id} className="space-y-2">
              <h3 className="font-heading text-base font-semibold">{c.name}</h3>
              <div className="overflow-x-auto rounded-lg border bg-background">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      {SCHEDULE_DAYS.map((d) => (
                        <th key={d.date} className="text-center px-2 py-2 font-medium">
                          {d.label}
                        </th>
                      ))}
                      <th className="text-center px-3 py-2 font-medium tabular-nums">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {names.map((name) => {
                      const personRows = byName.get(name)!;
                      let personTotal = 0;
                      return (
                        <tr key={name} className="border-t">
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{name}</td>
                          {SCHEDULE_DAYS.map((d) => {
                            const r = personRows.find((x) => x.shift_date === d.date);
                            if (!r) {
                              return (
                                <td key={d.date} className="text-center px-2 py-2 text-muted-foreground">
                                  —
                                </td>
                              );
                            }
                            const h = hoursBetween(r.start_time, r.end_time, !!r.crosses_midnight);
                            personTotal += h;
                            const isLate = (r.end_time ?? "").startsWith("02");
                            return (
                              <td key={d.date} className="text-center px-2 py-2 tabular-nums">
                                <div className={isLate ? "text-foreground font-medium" : "text-foreground"}>
                                  {fmt(r.start_time)}–{fmt(r.end_time)}
                                </div>
                                <div className="text-[10px] text-muted-foreground">{h}h</div>
                              </td>
                            );
                          })}
                          <td className="text-center px-3 py-2 tabular-nums font-semibold">
                            {(conceptTotal += personTotal, personTotal)}h
                          </td>
                        </tr>
                      );
                    })}
                    {names.length === 0 && (
                      <tr>
                        <td colSpan={SCHEDULE_DAYS.length + 2} className="text-center text-muted-foreground py-6 text-xs">
                          No shifts yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {names.length > 0 && (
                    <tfoot className="bg-muted/30">
                      <tr className="border-t">
                        <td className="px-3 py-2 font-semibold text-xs uppercase tracking-wide">
                          {c.name} total
                        </td>
                        <td colSpan={SCHEDULE_DAYS.length} />
                        <td className="text-center px-3 py-2 tabular-nums font-bold">
                          {Math.round(conceptTotal * 10) / 10}h
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CrewRegisterCard({
  festivalId,
  initialUrl,
  initialUsername,
  initialPassword,
  onSaved,
}: {
  festivalId: string | undefined;
  initialUrl: string;
  initialUsername: string;
  initialPassword: string;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState(initialPassword);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setUrl(initialUrl); }, [initialUrl]);
  useEffect(() => { setUsername(initialUsername); }, [initialUsername]);
  useEffect(() => { setPassword(initialPassword); }, [initialPassword]);

  const dirty =
    url !== initialUrl ||
    username !== initialUsername ||
    password !== initialPassword;

  const save = async () => {
    if (!festivalId) return;
    setSaving(true);
    const { error } = await supabase
      .from("festivals")
      .update({
        crew_register_url: url || null,
        crew_register_username: username || null,
        crew_register_password: password || null,
      })
      .eq("id", festivalId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Crew register saved");
      onSaved();
    }
  };

  const copy = async (val: string, label: string) => {
    if (!val) return;
    await navigator.clipboard.writeText(val);
    toast.success(`${label} copied`);
  };

  const normalizedUrl = url && !/^https?:\/\//i.test(url) ? `https://${url}` : url;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-heading font-semibold text-base">Crew register access</h2>
        </div>
        {normalizedUrl && (
          <Button size="sm" variant="outline" asChild>
            <a href={normalizedUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
            </a>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-3">
          <label className="text-xs font-medium text-muted-foreground">Link</label>
          <div className="flex gap-1 mt-1">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://crew-register.example.com/..."
            />
            <Button type="button" size="icon" variant="ghost" onClick={() => copy(url, "Link")} disabled={!url}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Username</label>
          <div className="flex gap-1 mt-1">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com"
              autoComplete="off"
            />
            <Button type="button" size="icon" variant="ghost" onClick={() => copy(username, "Username")} disabled={!username}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Password</label>
          <div className="flex gap-1 mt-1">
            <Input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="off"
            />
            <Button type="button" size="icon" variant="ghost" onClick={() => setShowPw((v) => !v)}>
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => copy(password, "Password")} disabled={!password}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={save} disabled={!dirty || saving || !festivalId}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

function StaffEmailsCard({
  festivalId,
  initialEmails,
  onSaved,
}: {
  festivalId: string | undefined;
  initialEmails: string;
  onSaved: () => void;
}) {
  const [emails, setEmails] = useState(initialEmails);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setEmails(initialEmails); }, [initialEmails]);

  const dirty = emails !== initialEmails;

  const save = async () => {
    if (!festivalId) return;
    setSaving(true);
    const { error } = await supabase
      .from("festivals")
      .update({ staff_emails: emails || null })
      .eq("id", festivalId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Staff emails saved");
      onSaved();
    }
  };

  const copy = async () => {
    if (!emails) return;
    await navigator.clipboard.writeText(emails);
    toast.success("Emails copied");
  };

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="font-heading font-semibold text-base">Staff email addresses</h2>
        <Button type="button" size="sm" variant="ghost" onClick={copy} disabled={!emails}>
          <Copy className="h-4 w-4 mr-1" /> Copy
        </Button>
      </div>
      <Textarea
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        placeholder="Paste or write all staff email addresses, separated by commas or new lines..."
        rows={4}
      />
      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={save} disabled={!dirty || saving || !festivalId}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
