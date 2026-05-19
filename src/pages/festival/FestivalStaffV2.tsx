import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Users, Upload, Loader2, CheckCircle2, PlusCircle, AlertTriangle,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toIsoDate } from "@/lib/parseDate";
import {
  ParsedRoster, PlanRow, StationRow,
  mapConceptGroup, isNotAssigned, matchOrCreatePlan,
  resolveStation, computeShiftHours, buildDayDateMap,
} from "@/lib/staffImport";
import PositionsPanel from "@/components/staff/PositionsPanel";
import ScheduleGrid, {
  GridShift, GridStaff,
} from "@/components/staff/ScheduleGrid";
import ShiftDrawer, { EditingShift } from "@/components/staff/ShiftDrawer";
import { festivalDays } from "@/lib/staffGrid";

interface Festival { id: string; slug: string; name: string; start_date: string; end_date: string; }
interface Concept { id: string; slug: string; name: string; }
interface ExistingStaffRow { id: string; full_name: string; display_name: string | null; }

interface ProposedStation {
  key: string;
  label: string;
  conceptSlug: string | null;
  suggestedCode: string;
  approve: boolean;
}

export default function FestivalStaffV2() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();

  // ---- Core data ---------------------------------------------------------
  const festivalQ = useQuery({
    queryKey: ["fest-v2", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, slug, name, start_date, end_date")
        .eq("slug", slug!).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
    enabled: !!slug,
  });
  const fest = festivalQ.data;

  const conceptsQ = useQuery({
    queryKey: ["concepts-v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concepts").select("id, slug, name").order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Concept[];
    },
  });

  const stationsQ = useQuery({
    queryKey: ["stations-v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("station").select("id, concept_id, code, label, display_order").eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as (StationRow & { display_order: number | null })[];
    },
  });

  const staffQ = useQuery({
    queryKey: ["staff-existing-v2"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff")
        .select("id, full_name, display_name").eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as ExistingStaffRow[];
    },
  });

  const skillsQ = useQuery({
    queryKey: ["staff-skills-v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_station_skill").select("staff_id, station_id");
      if (error) throw error;
      return (data ?? []) as { staff_id: string; station_id: string }[];
    },
  });

  // Festival-scoped: assignments, positions, shifts, contracts
  const assignmentsQ = useQuery({
    queryKey: ["fsa", fest?.id],
    enabled: !!fest?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_staff_assignment")
        .select("id, staff_id, primary_concept_id, station_id")
        .eq("festival_id", fest!.id);
      if (error) throw error;
      return (data ?? []) as { id: string; staff_id: string; primary_concept_id: string | null; station_id: string | null }[];
    },
  });

  const positionsQ = useQuery({
    queryKey: ["fp", fest?.id],
    enabled: !!fest?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_position")
        .select("id, concept_id, station_id, slots_needed")
        .eq("festival_id", fest!.id);
      if (error) throw error;
      return (data ?? []) as { id: string; concept_id: string | null; station_id: string; slots_needed: number | null }[];
    },
  });

  const shiftsQ = useQuery({
    queryKey: ["fss", fest?.id, assignmentsQ.data?.length ?? 0],
    enabled: !!fest?.id && !!assignmentsQ.data,
    queryFn: async () => {
      const ids = (assignmentsQ.data ?? []).map((a) => a.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("festival_staff_shift")
        .select("id, assignment_id, shift_date, station_id, start_time, end_time, crosses_midnight, computed_hours, shift_label")
        .in("assignment_id", ids);
      if (error) throw error;
      return (data ?? []);
    },
  });

  const contractsQ = useQuery({
    queryKey: ["fc-active", fest?.id],
    enabled: !!fest?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select("concept_id, is_active")
        .eq("festival_id", fest!.id);
      if (error) throw error;
      return (data ?? []) as { concept_id: string; is_active: boolean }[];
    },
  });

  // ---- Derived data ------------------------------------------------------
  const days = useMemo(
    () => fest ? festivalDays(fest.start_date, fest.end_date) : [],
    [fest],
  );

  const activeConceptIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of contractsQ.data ?? []) {
      if (c.is_active) ids.add(c.concept_id);
    }
    // If no contracts at all, fall back to all concepts active
    if ((contractsQ.data ?? []).length === 0) {
      for (const c of conceptsQ.data ?? []) ids.add(c.id);
    }
    return ids;
  }, [contractsQ.data, conceptsQ.data]);

  const gridStaff = useMemo<GridStaff[]>(() => {
    const byId = new Map((staffQ.data ?? []).map((s) => [s.id, s]));
    return (assignmentsQ.data ?? [])
      .map((a) => {
        const s = byId.get(a.staff_id);
        if (!s) return null;
        return {
          id: s.id,
          full_name: s.full_name,
          display_name: s.display_name,
          primaryConceptId: a.primary_concept_id,
          assignedStationId: a.station_id ?? null,
        } as GridStaff;
      })
      .filter((x): x is GridStaff => !!x);
  }, [assignmentsQ.data, staffQ.data]);

  const gridShifts = useMemo<GridShift[]>(() => {
    const assnById = new Map((assignmentsQ.data ?? []).map((a) => [a.id, a]));
    return (shiftsQ.data ?? []).map((sh: any) => {
      const a = assnById.get(sh.assignment_id);
      return {
        id: sh.id,
        assignmentId: sh.assignment_id,
        staffId: a?.staff_id ?? "",
        conceptId: a?.primary_concept_id ?? null,
        stationId: sh.station_id ?? null,
        shiftDate: sh.shift_date,
        startTime: sh.start_time,
        endTime: sh.end_time,
        hours: Number(sh.computed_hours ?? 0),
        shiftLabel: sh.shift_label,
        crossesMidnight: !!sh.crosses_midnight,
      } as GridShift;
    });
  }, [shiftsQ.data, assignmentsQ.data]);

  // shift duty (for positions panel filled count + auto-suggest)
  const shiftDuty = useMemo(
    () => gridShifts.map((s) => ({ staff_id: s.staffId, primary_concept_id: s.conceptId, station_id: s.stationId })),
    [gridShifts],
  );

  // ---- Drawer state ------------------------------------------------------
  const [viewMode, setViewMode] = useState<"position" | "person">("position");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInitial, setDrawerInitial] = useState<{
    mode: "create" | "edit";
    editing?: EditingShift;
    defaults?: { staffId?: string | null; conceptId?: string | null; stationId?: string | null; dayIso?: string | null };
  }>({ mode: "create" });

  const allStaffForDrawer = useMemo(() => {
    const skilledByStaff = new Map<string, Set<string>>();
    for (const s of skillsQ.data ?? []) {
      if (!skilledByStaff.has(s.staff_id)) skilledByStaff.set(s.staff_id, new Set());
      skilledByStaff.get(s.staff_id)!.add(s.station_id);
    }
    const assignedIds = new Map((assignmentsQ.data ?? []).map((a) => [a.staff_id, a]));
    return (staffQ.data ?? []).map((s) => {
      const a = assignedIds.get(s.id);
      return {
        id: s.id,
        full_name: s.full_name,
        display_name: s.display_name,
        hasAssignment: !!a,
        assignmentId: a?.id ?? null,
        primaryConceptId: a?.primary_concept_id ?? null,
        skilledStationIds: skilledByStaff.get(s.id) ?? new Set<string>(),
      };
    });
  }, [staffQ.data, assignmentsQ.data, skillsQ.data]);

  const drawerStations = useMemo(
    () => (stationsQ.data ?? []).map((s) => ({ id: s.id, label: s.label, conceptId: s.concept_id })),
    [stationsQ.data],
  );

  function refreshFestivalData() {
    qc.invalidateQueries({ queryKey: ["fsa", fest?.id] });
    qc.invalidateQueries({ queryKey: ["fp", fest?.id] });
    qc.invalidateQueries({ queryKey: ["fss", fest?.id] });
    qc.invalidateQueries({ queryKey: ["staff-existing-v2"] });
  }

  // ---- Roster importer (parked but kept) ---------------------------------
  const [importerOpen, setImporterOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedRoster | null>(null);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [proposedStations, setProposedStations] = useState<ProposedStation[]>([]);
  const [reviewChoices, setReviewChoices] = useState<Record<number, { mode: "create_new" | "link"; staffId?: string }>>({});
  const [importing, setImporting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [importReport, setImportReport] = useState<string | null>(null);

  const handleParse = async () => {
    if (!file) { toast.error("Pick a PDF first"); return; }
    setParsing(true); setImportReport(null);
    try {
      const path = `${slug}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const up = await supabase.storage.from("parse-test-uploads").upload(path, file, { upsert: true });
      if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
      const signed = await supabase.storage.from("parse-test-uploads").createSignedUrl(path, 600);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Signed URL failed");

      const { data, error } = await supabase.functions.invoke("parse-document", {
        body: {
          fileUrl: signed.data.signedUrl,
          documentType: "staff_roster",
          context: fest ? { festival_name: fest.name, festival_start: fest.start_date, festival_end: fest.end_date } : undefined,
        },
      });
      if (error) throw new Error(error.message);
      const res = data as { ok: boolean; parsed?: ParsedRoster; error?: string; message?: string };
      if (!res.ok || !res.parsed) throw new Error(res.message || res.error || "Parse failed");

      const roster = res.parsed;
      setParsed(roster);

      const existing = (staffQ.data ?? []).map((s) => ({ id: s.id, full_name: s.full_name }));
      const p = matchOrCreatePlan(roster.people, existing);
      setPlan(p);

      const choices: Record<number, { mode: "create_new" | "link"; staffId?: string }> = {};
      p.forEach((row, i) => { if (row.status === "needs_review") choices[i] = { mode: "create_new" }; });
      setReviewChoices(choices);

      const concepts = conceptsQ.data ?? [];
      const stations = (stationsQ.data ?? []) as StationRow[];
      const propMap = new Map<string, ProposedStation>();
      for (const person of roster.people) {
        const conceptSlug = mapConceptGroup(person.concept_group);
        const conceptId = concepts.find((c) => c.slug === conceptSlug)?.id ?? null;
        const r = resolveStation(person.station, conceptId, stations, conceptSlug);
        if (r.kind === "propose") {
          const key = `${r.conceptSlug ?? "_"}|${r.label.toLowerCase()}`;
          if (!propMap.has(key)) {
            propMap.set(key, { key, label: r.label, conceptSlug: r.conceptSlug, suggestedCode: r.suggestedCode, approve: true });
          }
        }
      }
      setProposedStations([...propMap.values()]);
      setShowModal(true);
      toast.success(`Parsed ${roster.people.length} people`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const groupedPlan = useMemo(() => {
    const reuse: { row: PlanRow; idx: number }[] = [];
    const create: { row: PlanRow; idx: number }[] = [];
    const review: { row: PlanRow; idx: number }[] = [];
    plan.forEach((row, idx) => {
      if (row.status === "reuse") reuse.push({ row, idx });
      else if (row.status === "create_new") create.push({ row, idx });
      else review.push({ row, idx });
    });
    return { reuse, create, review };
  }, [plan]);

  const handleImport = async () => {
    if (!parsed || !fest) return;
    setImporting(true);
    const concepts = conceptsQ.data ?? [];
    const errors: string[] = [];
    const counts = { stationsAdded: 0, staffCreated: 0, staffReused: 0, assignments: 0, shifts: 0, skills: 0 };
    try {
      const approvedNewStations = proposedStations.filter((p) => p.approve);
      const stationLookup: StationRow[] = [...(stationsQ.data ?? []) as StationRow[]];
      for (const ps of approvedNewStations) {
        const conceptId = ps.conceptSlug ? (concepts.find((c) => c.slug === ps.conceptSlug)?.id ?? null) : null;
        const { data, error } = await supabase
          .from("station").insert({ concept_id: conceptId, code: ps.suggestedCode, label: ps.label })
          .select("id, concept_id, code, label").single();
        if (error) {
          const { data: existing } = await supabase
            .from("station").select("id, concept_id, code, label").eq("code", ps.suggestedCode);
          const found = (existing ?? []).find((s) => s.concept_id === conceptId);
          if (found) stationLookup.push(found as StationRow);
          else errors.push(`Station "${ps.label}": ${error.message}`);
        } else if (data) {
          stationLookup.push(data as StationRow);
          counts.stationsAdded++;
        }
      }

      const dayDates = buildDayDateMap(fest.start_date, fest.end_date);

      for (let i = 0; i < plan.length; i++) {
        const row = plan[i];
        const p = row.parsed;
        try {
          let staffId: string | null = null;
          if (row.status === "reuse" && row.matchedStaffId) {
            staffId = row.matchedStaffId; counts.staffReused++;
          } else if (row.status === "needs_review") {
            const choice = reviewChoices[i];
            if (choice?.mode === "link" && choice.staffId) {
              staffId = choice.staffId; counts.staffReused++;
            } else {
              const { data, error } = await supabase.from("staff").insert({
                full_name: p.full_name, display_name: p.full_name,
                home_location: p.home_location, source: mapSource(p.source),
              }).select("id").single();
              if (error) throw new Error(`staff insert: ${error.message}`);
              staffId = data!.id; counts.staffCreated++;
            }
          } else {
            const { data, error } = await supabase.from("staff").insert({
              full_name: p.full_name, display_name: p.full_name,
              home_location: p.home_location, source: mapSource(p.source),
            }).select("id").single();
            if (error) throw new Error(`staff insert: ${error.message}`);
            staffId = data!.id; counts.staffCreated++;
          }
          if (!staffId) throw new Error("no staff id resolved");

          const conceptSlug = mapConceptGroup(p.concept_group);
          const conceptId = conceptSlug ? (concepts.find((c) => c.slug === conceptSlug)?.id ?? null) : null;

          const existingAssn = await supabase
            .from("festival_staff_assignment").select("id")
            .eq("festival_id", fest.id).eq("staff_id", staffId).maybeSingle();

          const assnPayload = {
            festival_id: fest.id, staff_id: staffId, primary_concept_id: conceptId,
            works_thu: !!p.works?.thu, works_fri: !!p.works?.fri,
            works_sat: !!p.works?.sat, works_sun: !!p.works?.sun,
            needs_accom_thu: !!p.needs_accom?.thu, needs_accom_fri: !!p.needs_accom?.fri,
            needs_accom_sat: !!p.needs_accom?.sat, needs_accom_sun: !!p.needs_accom?.sun,
            confirmed: !!p.confirmed,
            notes: isNotAssigned(p.concept_group) ? "Not assigned in roster" : null,
          };

          let assignmentId: string;
          if (existingAssn.data?.id) {
            assignmentId = existingAssn.data.id;
            const { error } = await supabase.from("festival_staff_assignment").update(assnPayload).eq("id", assignmentId);
            if (error) throw new Error(`assignment update: ${error.message}`);
            await supabase.from("festival_staff_shift").delete().eq("assignment_id", assignmentId);
          } else {
            const { data, error } = await supabase.from("festival_staff_assignment")
              .insert(assnPayload).select("id").single();
            if (error) throw new Error(`assignment insert: ${error.message}`);
            assignmentId = data!.id;
          }
          counts.assignments++;

          const stationRes = resolveStation(p.station, conceptId, stationLookup, conceptSlug);
          const primaryStationId = stationRes.kind === "found" ? stationRes.stationId
            : (stationRes.kind === "propose"
                ? stationLookup.find((s) => s.code === slugifySafe(p.station ?? "") && s.concept_id === conceptId)?.id ?? null
                : null);

          for (const sh of p.shifts ?? []) {
            const shiftDateIso = toIsoDate(dayDates[sh.day]);
            if (!shiftDateIso) continue;
            const { hours, crossesMidnight } = computeShiftHours(sh.start, sh.end);
            const { error } = await supabase.from("festival_staff_shift").insert({
              assignment_id: assignmentId, shift_date: shiftDateIso,
              station_id: primaryStationId, start_time: sh.start, end_time: sh.end,
              crosses_midnight: crossesMidnight, computed_hours: hours, shift_label: sh.label,
            });
            if (error) errors.push(`${p.full_name} shift ${sh.day}: ${error.message}`);
            else counts.shifts++;
          }

          if (primaryStationId) {
            const { error } = await supabase.from("staff_station_skill").upsert(
              { staff_id: staffId, station_id: primaryStationId, proficiency: "trained" },
              { onConflict: "staff_id,station_id" },
            );
            if (!error) counts.skills++;
          }
        } catch (e) {
          errors.push(`${p.full_name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const lines = [
        `Imported staff for ${fest.name}.`,
        `Stations added: ${counts.stationsAdded}`,
        `Staff created: ${counts.staffCreated} · reused: ${counts.staffReused}`,
        `Assignments: ${counts.assignments}`,
        `Shifts: ${counts.shifts}`,
        `Station skills: ${counts.skills}`,
      ];
      if (errors.length) {
        lines.push("", `Errors (${errors.length}):`);
        lines.push(...errors.map((e) => "  - " + e));
      }
      setImportReport(lines.join("\n"));
      toast.success(`Imported ${counts.assignments} assignments`);
      setShowModal(false);
      refreshFestivalData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // ---- Render ------------------------------------------------------------
  if (festivalQ.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading festival…</div>;
  }
  if (!fest) {
    return <div className="p-8 text-sm">Festival not found.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to festival
      </Link>

      <header className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
          <Users className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold">Staff (new)</h1>
          <p className="text-sm text-muted-foreground">
            Manual scheduling — assign people to positions and set shifts. Parallel to the old staff page until verified.
          </p>
        </div>
      </header>

      {/* Positions panel */}
      <PositionsPanel
        festivalId={fest.id}
        concepts={conceptsQ.data ?? []}
        stations={(stationsQ.data ?? []).map((s) => ({ id: s.id, concept_id: s.concept_id, label: s.label, display_order: s.display_order }))}
        positions={positionsQ.data ?? []}
        activeConceptIds={activeConceptIds}
        shiftDuty={shiftDuty}
        onChanged={refreshFestivalData}
      />

      {/* View toggle */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("position")}
            className={`px-3 py-1.5 text-sm rounded ${viewMode === "position" ? "bg-sky-100 text-sky-800" : "text-muted-foreground hover:text-foreground"}`}
          >By Position</button>
          <button
            type="button"
            onClick={() => setViewMode("person")}
            className={`px-3 py-1.5 text-sm rounded ${viewMode === "person" ? "bg-sky-100 text-sky-800" : "text-muted-foreground hover:text-foreground"}`}
          >By Person</button>
        </div>
        <div className="text-xs text-muted-foreground">
          {days.length} days · {gridStaff.length} assigned people · {gridShifts.length} shifts
        </div>
      </div>

      {/* Grid */}
      <ScheduleGrid
        viewMode={viewMode}
        days={days}
        concepts={conceptsQ.data ?? []}
        stations={(stationsQ.data ?? []).map((s) => ({ id: s.id, concept_id: s.concept_id, label: s.label }))}
        positions={positionsQ.data ?? []}
        staff={gridStaff}
        shifts={gridShifts}
        activeConceptIds={activeConceptIds}
        onAddShift={(ctx) => {
          setDrawerInitial({ mode: "create", defaults: ctx });
          setDrawerOpen(true);
        }}
        onEditShift={(s) => {
          setDrawerInitial({
            mode: "edit",
            editing: {
              id: s.id,
              assignmentId: s.assignmentId,
              staffId: s.staffId,
              shiftDate: s.shiftDate,
              stationId: s.stationId,
              startTime: s.startTime,
              endTime: s.endTime,
              shiftLabel: s.shiftLabel,
            },
          });
          setDrawerOpen(true);
        }}
      />

      {/* Drawer */}
      <ShiftDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={refreshFestivalData}
        festivalId={fest.id}
        days={days}
        staffOptions={allStaffForDrawer}
        stations={drawerStations}
        concepts={conceptsQ.data ?? []}
        initial={drawerInitial}
      />

      {/* Importer — demoted */}
      <section className="rounded-2xl border bg-card">
        <Collapsible open={importerOpen} onOpenChange={setImporterOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center gap-2 p-4 text-left">
              {importerOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <div className="flex-1">
                <h2 className="font-heading text-sm font-semibold">Import roster (beta)</h2>
                <p className="text-xs text-muted-foreground">
                  Parse a roster PDF and import staff + shifts in one go. Optional — the schedule above is the primary tool.
                </p>
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3">
              <Label>Roster PDF</Label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border file:border-input file:bg-background file:text-foreground file:cursor-pointer"
              />
              <Button onClick={handleParse} disabled={parsing || !file}>
                {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Parse roster
              </Button>
              {importReport && (
                <div className="rounded-md border p-3 bg-muted/40">
                  <h3 className="text-xs font-semibold mb-2">Import report</h3>
                  <pre className="text-xs whitespace-pre-wrap font-mono">{importReport}</pre>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </section>

      {importReport && (
        <section className="rounded-2xl border bg-card p-4">
          <h3 className="font-heading text-sm font-semibold mb-2">Import report</h3>
          <pre className="text-xs whitespace-pre-wrap font-mono">{importReport}</pre>
        </section>
      )}

      <Dialog open={showModal} onOpenChange={(open) => { if (!importing) setShowModal(open); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Review before import — nothing has been saved yet
            </DialogTitle>
            {parsed && (
              <p className="text-sm text-muted-foreground">
                {parsed.people.length} people parsed · {parsed.summary?.confirmed ?? 0} confirmed · {parsed.summary?.need_accom ?? 0} need accom.
                Click <strong>Confirm import</strong> below to write, or <strong>Cancel</strong> to discard.
              </p>
            )}
          </DialogHeader>

          <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-xs px-3 py-2">
            This is a preview. No staff, assignments or shifts have been written to the database yet.
          </div>

          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Will reuse existing ({groupedPlan.reuse.length})
              </h3>
              {groupedPlan.reuse.length === 0 ? <p className="text-xs text-muted-foreground">None.</p> : (
                <ul className="text-sm space-y-1">
                  {groupedPlan.reuse.map(({ row, idx }) => (
                    <li key={idx} className="text-muted-foreground">
                      <span className="text-foreground">{row.parsed.full_name}</span> → matches existing staff record
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <PlusCircle className="h-4 w-4 text-sky-600" />
                Will create new ({groupedPlan.create.length})
              </h3>
              {groupedPlan.create.length === 0 ? <p className="text-xs text-muted-foreground">None.</p> : (
                <ul className="text-sm space-y-1">
                  {groupedPlan.create.map(({ row, idx }) => (
                    <li key={idx}>
                      <span className="font-medium">{row.parsed.full_name}</span>
                      <span className="text-muted-foreground">
                        {" "}· {row.parsed.concept_group}
                        {row.parsed.station ? ` · ${row.parsed.station}` : ""}
                        {row.parsed.source ? ` · ${row.parsed.source}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Needs your review ({groupedPlan.review.length})
              </h3>
              {groupedPlan.review.length === 0 ? <p className="text-xs text-muted-foreground">None — no ambiguous names.</p> : (
                <ul className="space-y-3">
                  {groupedPlan.review.map(({ row, idx }) => (
                    <li key={idx} className="rounded-md border p-3">
                      <div className="font-medium text-sm">{row.parsed.full_name}</div>
                      <div className="text-xs text-amber-700 mb-2">{row.ambiguityReason}</div>
                      <RadioGroup
                        value={reviewChoices[idx]?.mode === "link" ? `link:${reviewChoices[idx]?.staffId ?? ""}` : "create_new"}
                        onValueChange={(v) => {
                          if (v === "create_new") setReviewChoices((prev) => ({ ...prev, [idx]: { mode: "create_new" } }));
                          else if (v.startsWith("link:")) setReviewChoices((prev) => ({ ...prev, [idx]: { mode: "link", staffId: v.slice(5) } }));
                        }}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value="create_new" id={`new-${idx}`} />
                          <Label htmlFor={`new-${idx}`} className="font-normal">Create as new person</Label>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <RadioGroupItem
                            value={reviewChoices[idx]?.mode === "link" && reviewChoices[idx]?.staffId
                              ? `link:${reviewChoices[idx]?.staffId}` : "link:"}
                            id={`link-${idx}`}
                          />
                          <Label htmlFor={`link-${idx}`} className="font-normal">Link to existing:</Label>
                          <Select
                            value={reviewChoices[idx]?.mode === "link" ? reviewChoices[idx]?.staffId ?? "" : ""}
                            onValueChange={(v) => setReviewChoices((prev) => ({ ...prev, [idx]: { mode: "link", staffId: v } }))}
                          >
                            <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Choose existing staff…" /></SelectTrigger>
                            <SelectContent>
                              {(staffQ.data ?? []).map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </RadioGroup>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {proposedStations.length > 0 && (
              <section className="rounded-md bg-muted/40 p-3">
                <h4 className="text-sm font-semibold mb-2">New stations to add</h4>
                <ul className="space-y-1.5">
                  {proposedStations.map((ps) => (
                    <li key={ps.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={`stn-${ps.key}`}
                        checked={ps.approve}
                        onCheckedChange={(v) =>
                          setProposedStations((prev) => prev.map((p) => p.key === ps.key ? { ...p, approve: !!v } : p))
                        }
                      />
                      <Label htmlFor={`stn-${ps.key}`} className="font-normal">
                        <span className="font-medium">{ps.label}</span>
                        <span className="text-muted-foreground"> · {ps.conceptSlug ?? "no concept"}</span>
                      </Label>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={importing}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function mapSource(s: string | null | undefined): string | null {
  if (!s) return null;
  const k = s.trim().toLowerCase();
  if (k.startsWith("søb") || k.startsWith("sob")) return "soborg";
  if (k === "local") return "local";
  if (k === "unknown") return "unknown";
  return null;
}

function slugifySafe(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
