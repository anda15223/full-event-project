import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Calendar, CalendarIcon, Upload, Loader2, FileText, Plus, Trash2,
  ArrowUp, ArrowDown, AlertCircle, Link2, X,
} from "lucide-react";
import SetupSourcePicker, { PhasePatch, SourceSnapshot } from "./SetupSourcePicker";

type PhaseSource = {
  id: string;
  setup_phase_id: string;
  source_table: string;
  source_id: string;
  label: string | null;
  detail: string | null;
};

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) {
    out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return out;
})();

const sb = supabase as any;
const BUCKET = "festival-setup-docs";

const CONCEPTS = ["fish", "gyros", "creperie", "chicks", "all"] as const;
type Concept = typeof CONCEPTS[number];

const SEQUENCE_PRESETS = [
  "Drive to festival",
  "Setup at festival",
  "Arriving cooling",
  "Arriving goods",
  "Place goods in freezers",
  "Wrap up",
  "Driving home",
] as const;

const DRIVE_PRESETS = new Set<string>(["Drive to festival", "Driving home"]);
const isDrivePhase = (name: string | null) => !name || DRIVE_PRESETS.has(name) || !SEQUENCE_PRESETS.includes(name as any);

type Festival = {
  id: string; slug: string; name: string;
  address?: string | null; city?: string | null;
};

type SetupRun = {
  id: string;
  festival_id: string;
  setup_date: string | null;
  soborg_meet_time: string | null;
  destination_address: string | null;
  arrival_time: string | null;
};

type SetupPhase = {
  id: string;
  setup_run_id: string;
  sort_order: number;
  phase_name: string;
  concept: Concept | null;
  transport_allocation_id: string | null;
  planned_time: string | null;
  planned_date: string | null;
  from_location: string | null;
  to_location: string | null;
  driver_name: string | null;
  notes: string | null;
};

type Allocation = {
  id: string;
  vehicle_name: string;
  driver_staff_id: string | null;
  driver_name: string | null;
};

type Attachment = {
  id: string;
  setup_run_id: string;
  setup_phase_id: string | null;
  concept: Concept | null;
  file_path: string;
  file_name: string;
  mime_type: string | null;
};

type StaffOpt = { id: string; name: string };

export default function FestivalSetup() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();

  /* ---------- Festival ---------- */
  const festivalQ = useQuery({
    queryKey: ["festival-setup-festival-v2", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals")
        .select("id,slug,name,address,city")
        .eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });
  const festival = festivalQ.data;
  const festivalId = festival?.id ?? "";

  /* ---------- Run (one per festival, auto-create) ---------- */
  const runQ = useQuery({
    queryKey: ["setup-run", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await sb.from("setup_runs")
        .select("*").eq("festival_id", festivalId).maybeSingle();
      if (error) throw error;
      if (data) return data as SetupRun;
      const defaultAddr = [festival?.address, festival?.city].filter(Boolean).join(", ") || null;
      const { data: inserted, error: insErr } = await sb.from("setup_runs")
        .insert({ festival_id: festivalId, destination_address: defaultAddr })
        .select("*").single();
      if (insErr) throw insErr;
      return inserted as SetupRun;
    },
  });
  const run = runQ.data;

  /* ---------- Allocations (vehicle + driver from Transport master) ---------- */
  const allocQ = useQuery({
    queryKey: ["setup-allocations", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: vehicles, error } = await sb.from("festival_staff_vehicles")
        .select("id, vehicle_name, driver_staff_id")
        .eq("festival_id", festivalId)
        .order("vehicle_name");
      if (error) throw error;
      const driverIds = (vehicles ?? []).map((v: any) => v.driver_staff_id).filter(Boolean);
      let nameMap = new Map<string, string>();
      if (driverIds.length) {
        const { data: staff } = await sb.from("festival_staff")
          .select("id, name").in("id", driverIds);
        (staff ?? []).forEach((s: any) => nameMap.set(s.id, s.name ?? "Unnamed"));
      }
      return (vehicles ?? []).map((v: any): Allocation => ({
        id: v.id,
        vehicle_name: v.vehicle_name,
        driver_staff_id: v.driver_staff_id,
        driver_name: v.driver_staff_id ? (nameMap.get(v.driver_staff_id) ?? null) : null,
      }));
    },
  });
  const allocations = allocQ.data ?? [];

  /* ---------- Phases ---------- */
  const phasesQ = useQuery({
    queryKey: ["setup-phases", run?.id],
    enabled: !!run?.id,
    queryFn: async () => {
      const { data, error } = await sb.from("setup_phases")
        .select("*").eq("setup_run_id", run!.id).order("sort_order");
      if (error) throw error;
      return (data ?? []) as SetupPhase[];
    },
  });
  const phases = phasesQ.data ?? [];

  /* ---------- Phase sources ---------- */
  const phaseIds = phases.map((p) => p.id);
  const sourcesQ = useQuery({
    queryKey: ["setup-phase-sources", run?.id, phaseIds.join(",")],
    enabled: !!run?.id && phaseIds.length > 0,
    queryFn: async () => {
      const { data, error } = await sb.from("setup_phase_sources")
        .select("*").in("setup_phase_id", phaseIds).order("position");
      if (error) throw error;
      return (data ?? []) as PhaseSource[];
    },
  });
  const sourcesByPhase = useMemo(() => {
    const m = new Map<string, PhaseSource[]>();
    (sourcesQ.data ?? []).forEach((s) => {
      const arr = m.get(s.setup_phase_id) ?? [];
      arr.push(s); m.set(s.setup_phase_id, arr);
    });
    return m;
  }, [sourcesQ.data]);

  /* ---------- Attachments ---------- */
  const attQ = useQuery({
    queryKey: ["setup-attachments", run?.id],
    enabled: !!run?.id,
    queryFn: async () => {
      const { data, error } = await sb.from("setup_attachments")
        .select("*").eq("setup_run_id", run!.id).order("created_at");
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });
  const allAttachments = attQ.data ?? [];
  const attachments = allAttachments.filter((a) => !a.setup_phase_id);
  const attachmentsByPhase = useMemo(() => {
    const m = new Map<string, Attachment[]>();
    allAttachments.forEach((a) => {
      if (!a.setup_phase_id) return;
      const arr = m.get(a.setup_phase_id) ?? [];
      arr.push(a); m.set(a.setup_phase_id, arr);
    });
    return m;
  }, [allAttachments]);

  /* ---------- Electricity (Power) summary for this festival ---------- */
  const powerQ = useQuery({
    queryKey: ["setup-power-summary", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: contracts, error: cErr } = await sb.from("festival_contracts")
        .select("id, concept_name, is_active").eq("festival_id", festivalId).eq("is_active", true);
      if (cErr) throw cErr;
      const ids = (contracts ?? []).map((c: any) => c.id);
      if (!ids.length) return [] as any[];
      const { data: power, error: pErr } = await sb.from("festival_power")
        .select("festival_contract_id, connections_16a_240v, connections_16a_400v, connections_32a, connections_63a, connections_125a, total_kw_estimate, tableau_required, tableau_count, status, power_drawing_file_path, notes")
        .in("festival_contract_id", ids);
      if (pErr) throw pErr;
      const byContract = new Map((contracts ?? []).map((c: any) => [c.id, c.concept_name]));
      return (power ?? []).map((p: any) => ({ ...p, concept_name: byContract.get(p.festival_contract_id) ?? "—" }));
    },
  });
  const powerRows = powerQ.data ?? [];

  /* ---------- Staff (driver picker) ---------- */
  const staffQ = useQuery({
    queryKey: ["festival-staff-list", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await sb.from("festival_staff")
        .select("id, name").eq("festival_id", festivalId).order("name");
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((s) => s.name)
        .map((s): StaffOpt => ({ id: s.id, name: s.name }));
    },
  });
  const staff = staffQ.data ?? [];

  /* ---------- Mutations ---------- */
  const invalidateRun = () => qc.invalidateQueries({ queryKey: ["setup-run", festivalId] });
  const invalidatePhases = () => qc.invalidateQueries({ queryKey: ["setup-phases", run?.id] });
  const invalidateAtt = () => qc.invalidateQueries({ queryKey: ["setup-attachments", run?.id] });
  const invalidateAlloc = () => qc.invalidateQueries({ queryKey: ["setup-allocations", festivalId] });

  const updateRun = useMutation({
    mutationFn: async (patch: Partial<SetupRun>) => {
      const { error } = await sb.from("setup_runs").update(patch).eq("id", run!.id);
      if (error) throw error;
    },
    onSuccess: invalidateRun,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const addPhase = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("setup_phases").insert({
        setup_run_id: run!.id,
        sort_order: phases.length,
        phase_name: "New phase",
        concept: "all",
      });
      if (error) throw error;
    },
    onSuccess: invalidatePhases,
    onError: (e: any) => toast.error(e?.message ?? "Add failed"),
  });

  const updatePhase = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SetupPhase> }) => {
      const { error } = await sb.from("setup_phases").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidatePhases,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const deletePhase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("setup_phases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidatePhases,
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const reorder = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const idx = phases.findIndex((p) => p.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= phases.length) return;
      const a = phases[idx], b = phases[swap];
      // swap sort_order
      await sb.from("setup_phases").update({ sort_order: b.sort_order }).eq("id", a.id);
      await sb.from("setup_phases").update({ sort_order: a.sort_order }).eq("id", b.id);
    },
    onSuccess: invalidatePhases,
  });

  /* ---------- Source picker ---------- */
  const [pickerPhaseId, setPickerPhaseId] = useState<string | null>(null);
  const invalidateSources = () => qc.invalidateQueries({ queryKey: ["setup-phase-sources", run?.id] });

  const applySource = useMutation({
    mutationFn: async ({ phaseId, patch, snap }: { phaseId: string; patch: PhasePatch; snap: SourceSnapshot }) => {
      const phase = phases.find((p) => p.id === phaseId);
      // Only overwrite phase_name if currently empty/default
      const cleanPatch: any = { ...patch };
      if (phase && phase.phase_name && phase.phase_name !== "New phase") delete cleanPatch.phase_name;
      if (phase?.from_location) delete cleanPatch.from_location;
      if (phase?.to_location) delete cleanPatch.to_location;
      if (phase?.planned_time) delete cleanPatch.planned_time;
      if (phase?.driver_name) delete cleanPatch.driver_name;

      if (Object.keys(cleanPatch).length) {
        const { error } = await sb.from("setup_phases").update(cleanPatch).eq("id", phaseId);
        if (error) throw error;
      }
      const existing = sourcesByPhase.get(phaseId) ?? [];
      const { error: insErr } = await sb.from("setup_phase_sources").insert({
        setup_phase_id: phaseId,
        source_table: snap.source_table,
        source_id: snap.source_id,
        label: snap.label,
        detail: snap.detail,
        position: existing.length,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => { invalidatePhases(); invalidateSources(); toast.success("Source attached"); },
    onError: (e: any) => toast.error(e?.message ?? "Attach failed"),
  });

  const removeSource = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("setup_phase_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateSources,
  });
  const [correctingAllocId, setCorrectingAllocId] = useState<string | null>(null);
  const [pickedDriver, setPickedDriver] = useState<string>("");

  const correctDriver = useMutation({
    mutationFn: async () => {
      if (!correctingAllocId || !pickedDriver) return;
      const { error } = await sb.from("festival_staff_vehicles")
        .update({ driver_staff_id: pickedDriver })
        .eq("id", correctingAllocId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Driver allocated in Transport master");
      setCorrectingAllocId(null);
      setPickedDriver("");
      invalidateAlloc();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  /* ---------- Attachments ---------- */
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadConcept, setUploadConcept] = useState<Concept>("all");
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File, phaseId: string | null = null) => {
    if (!run) return;
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${festivalId}/${run.id}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await sb.from("setup_attachments").insert({
        setup_run_id: run.id,
        setup_phase_id: phaseId,
        concept: phaseId ? null : uploadConcept,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
      });
      if (insErr) throw insErr;
      toast.success("Attachment uploaded");
      invalidateAtt();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = useMutation({
    mutationFn: async (a: Attachment) => {
      await supabase.storage.from(BUCKET).remove([a.file_path]);
      const { error } = await sb.from("setup_attachments").delete().eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: invalidateAtt,
  });

  const openAttachment = async (a: Attachment) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.file_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  /* ---------- Render ---------- */
  const allocLookup = useMemo(() => {
    const m = new Map<string, Allocation>();
    allocations.forEach((a) => m.set(a.id, a));
    return m;
  }, [allocations]);

  if (festivalQ.isLoading || runQ.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  const phaseCount = phases.length;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> {festival.name}
        </Link>
        <div className="flex items-center justify-between gap-3 mt-2">
          <div className="flex items-center gap-3">
            <Calendar className="h-7 w-7 text-emerald-500" />
            <h1 className="text-3xl font-bold tracking-tight">Setup</h1>
            <span className="ml-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border bg-muted/40">
              {phaseCount} {phaseCount === 1 ? "phase" : "phases"}
            </span>
          </div>
          <a href={`/festivals/${slug}/setup/export`} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-muted">
            Export PDF
          </a>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Manually build the Søborg → Jelling setup sequence. Vehicle &amp; driver allocations come from the Transport master.
        </p>
      </div>

      {/* Block 1 — Run header */}
      <div className="rounded-2xl border bg-card p-6 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <Field label="Setup date">
          {(() => {
            const dateStr = (run?.setup_date ?? "").slice(0, 10);
            const dateVal = dateStr ? parseISO(dateStr) : undefined;
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left text-xs font-normal",
                      !dateVal && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{dateVal ? format(dateVal, "PP") : "Pick a date"}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={dateVal}
                    onSelect={(d) =>
                      updateRun.mutate({ setup_date: d ? format(d, "yyyy-MM-dd") : null })
                    }
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            );
          })()}
        </Field>
        <Field label="Søborg meet time">
          <Select
            value={(run?.soborg_meet_time ?? "").slice(0, 5) || undefined}
            onValueChange={(v) => updateRun.mutate({ soborg_meet_time: v || null })}
          >
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick time" /></SelectTrigger>
            <SelectContent className="max-h-64">
              {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Arrival at Jelling">
          <Select
            value={(run?.arrival_time ?? "").slice(0, 5) || undefined}
            onValueChange={(v) => updateRun.mutate({ arrival_time: v || null })}
          >
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick time" /></SelectTrigger>
            <SelectContent className="max-h-64">
              {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Destination address">
          <Input
            value={run?.destination_address ?? ""}
            onChange={(e) => updateRun.mutate({ destination_address: e.target.value || null })}
            placeholder="Address…"
            className="h-9 text-xs"
          />
        </Field>
      </div>

      {/* Block 2 — Sequence */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sequence</h2>
        </div>

        {phasesQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : phases.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            No phases yet. Click <strong>Add phase</strong> to start building the sequence.
          </div>
        ) : (
          phases.map((p, idx) => {
            const alloc = p.transport_allocation_id ? allocLookup.get(p.transport_allocation_id) : null;
            const driverMissing = !!alloc && !alloc.driver_staff_id;
            const isDrive = isDrivePhase(p.phase_name);
            const showPower = p.phase_name === "Setup at festival";
            const phaseAttachments = attachmentsByPhase.get(p.id) ?? [];
            return (
              <div key={p.id} className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col">
                    <button className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={idx === 0} onClick={() => reorder.mutate({ id: p.id, dir: -1 })}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={idx === phases.length - 1} onClick={() => reorder.mutate({ id: p.id, dir: 1 })}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 space-y-2">
                    {/* Row 1: sequence type + phase name + concept */}
                    <div className="grid grid-cols-12 gap-2">
                      <Select
                        value={SEQUENCE_PRESETS.includes(p.phase_name as any) ? p.phase_name : ""}
                        onValueChange={(v) => updatePhase.mutate({ id: p.id, patch: { phase_name: v } })}
                      >
                        <SelectTrigger className="col-span-4 h-9 text-xs"><SelectValue placeholder="Sequence type…" /></SelectTrigger>
                        <SelectContent>
                          {SEQUENCE_PRESETS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        className="col-span-5 h-9 text-sm font-medium"
                        defaultValue={p.phase_name}
                        key={p.phase_name}
                        onBlur={(e) => { if (e.target.value !== p.phase_name) updatePhase.mutate({ id: p.id, patch: { phase_name: e.target.value } }); }}
                        placeholder="Phase name"
                      />
                      <Select
                        value={p.concept ?? ""}
                        onValueChange={(v) => updatePhase.mutate({ id: p.id, patch: { concept: v as Concept } })}
                      >
                        <SelectTrigger className="col-span-3 h-9 text-xs"><SelectValue placeholder="Concept" /></SelectTrigger>
                        <SelectContent>
                          {CONCEPTS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Row 2: leaving point → destination point */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Field label="Leaving from">
                        <Input
                          className="h-9 text-xs"
                          defaultValue={p.from_location ?? ""}
                          onBlur={(e) => { const v = e.target.value || null; if (v !== p.from_location) updatePhase.mutate({ id: p.id, patch: { from_location: v } }); }}
                          placeholder="e.g. Søborg HQ"
                        />
                      </Field>
                      <Field label="Destination">
                        <Input
                          className="h-9 text-xs"
                          defaultValue={p.to_location ?? ""}
                          onBlur={(e) => { const v = e.target.value || null; if (v !== p.to_location) updatePhase.mutate({ id: p.id, patch: { to_location: v } }); }}
                          placeholder="e.g. Jelling site – Fish stand"
                        />
                      </Field>
                    </div>

                    {/* Row 3: vehicle + driver name + time */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      <Field label="Car">
                        <Select
                          value={p.transport_allocation_id ?? "__none__"}
                          onValueChange={(v) => updatePhase.mutate({ id: p.id, patch: { transport_allocation_id: v === "__none__" ? null : v } })}
                        >
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Vehicle" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— No vehicle —</SelectItem>
                            {allocations.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.vehicle_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Driver name">
                        <Input
                          className="h-9 text-xs sm:col-span-2"
                          defaultValue={p.driver_name ?? ""}
                          placeholder="Type driver name…"
                          onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== p.driver_name) updatePhase.mutate({ id: p.id, patch: { driver_name: v } }); }}
                        />
                      </Field>
                      <Field label="Planned date">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "h-9 text-xs justify-start font-normal",
                                !p.planned_date && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-1.5 h-3.5 w-3.5 opacity-60" />
                              {p.planned_date ? format(parseISO(p.planned_date), "MMM d, yyyy") : "Pick date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarPicker
                              mode="single"
                              selected={p.planned_date ? parseISO(p.planned_date) : undefined}
                              onSelect={(d) => {
                                const v = d ? format(d, "yyyy-MM-dd") : null;
                                if (v !== p.planned_date) updatePhase.mutate({ id: p.id, patch: { planned_date: v } });
                              }}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </Field>
                      <Field label="Planned time">
                        <Select
                          value={p.planned_time ? p.planned_time.slice(0, 5) : undefined}
                          onValueChange={(v) => updatePhase.mutate({ id: p.id, patch: { planned_time: v || null } })}
                        >
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick time" /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    {/* Row 4: attached sources */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {(sourcesByPhase.get(p.id) ?? []).map((s) => (
                        <span key={s.id}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-muted/40">
                          <span className="font-medium">{s.label}</span>
                          {s.detail ? <span className="text-muted-foreground">· {s.detail}</span> : null}
                          <button onClick={() => removeSource.mutate(s.id)}
                            className="ml-0.5 text-muted-foreground hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2"
                        onClick={() => setPickerPhaseId(p.id)}>
                        <Link2 className="h-3 w-3 mr-1" /> Attach source
                      </Button>
                    </div>
                  </div>

                  <button onClick={() => { if (confirm("Delete this phase?")) deletePhase.mutate(p.id); }}
                    className="p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {alloc && (
                  <div className="text-xs text-muted-foreground pl-7">
                    Vehicle: <strong>{alloc.vehicle_name}</strong>
                    {" · "}Driver: {alloc.driver_name ?? <em className="text-rose-600">unallocated</em>}
                  </div>
                )}

                {driverMissing && (
                  <div className="ml-7 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>🔴 {alloc!.vehicle_name} has no driver — allocate in the Transport card.</span>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => { setCorrectingAllocId(alloc!.id); setPickedDriver(""); }}>
                      Correct
                    </Button>
                  </div>
                )}

                <Textarea
                  className="ml-7 text-xs min-h-[60px]"
                  defaultValue={p.notes ?? ""}
                  onBlur={(e) => { if ((e.target.value || null) !== p.notes) updatePhase.mutate({ id: p.id, patch: { notes: e.target.value || null } }); }}
                  placeholder="Notes…"
                />
              </div>
            );
          })
        )}

        <Button variant="outline" className="w-full h-12 border-dashed" onClick={() => addPhase.mutate()}>
          <Plus className="h-4 w-4 mr-2" /> Add phase
        </Button>
      </div>

      {/* Block 3 — Fidibus attachments */}
      <div className="rounded-2xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Fidibus / layout plans</h2>
          <div className="flex items-center gap-2">
            <Select value={uploadConcept} onValueChange={(v) => setUploadConcept(v as Concept)}>
              <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONCEPTS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.currentTarget.value = ""; }} />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              Upload
            </Button>
          </div>
        </div>

        {attachments.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            No layout plans uploaded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-2 rounded-lg border bg-muted/30">
                <button className="flex items-center gap-2 min-w-0 flex-1 text-left hover:underline" onClick={() => openAttachment(a)}>
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate">{a.file_name}</span>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                    {a.concept ?? "—"}
                  </span>
                </button>
                <button onClick={() => deleteAttachment.mutate(a)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Driver correction dialog */}
      <Dialog open={!!correctingAllocId} onOpenChange={(o) => { if (!o) { setCorrectingAllocId(null); setPickedDriver(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Allocate driver</DialogTitle>
            <DialogDescription>
              Writes to the Transport master ({correctingAllocId && allocLookup.get(correctingAllocId)?.vehicle_name}).
              Clears the red flag everywhere this vehicle is used.
            </DialogDescription>
          </DialogHeader>
          <Select value={pickedDriver} onValueChange={setPickedDriver}>
            <SelectTrigger><SelectValue placeholder="Pick driver…" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCorrectingAllocId(null); setPickedDriver(""); }}>Cancel</Button>
            <Button onClick={() => correctDriver.mutate()} disabled={!pickedDriver || correctDriver.isPending}>
              {correctDriver.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Source picker */}
      <SetupSourcePicker
        open={!!pickerPhaseId}
        onOpenChange={(o) => { if (!o) setPickerPhaseId(null); }}
        festivalId={festivalId}
        soborgDefault="Søborg HQ"
        destinationDefault={run?.destination_address ?? ""}
        currentNotes={pickerPhaseId ? (phases.find((p) => p.id === pickerPhaseId)?.notes ?? null) : null}
        onApply={(patch, snap) => {
          if (!pickerPhaseId) return;
          applySource.mutate({ phaseId: pickerPhaseId, patch, snap });
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
