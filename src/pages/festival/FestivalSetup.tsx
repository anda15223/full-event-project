import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, Calendar, Upload, Loader2, FileText, Plus, Sparkles, Download,
} from "lucide-react";
import {
  SetupPhaseCard, type SetupPhaseRow, type VehicleOption,
} from "@/components/festival/cards/SetupPhaseCard";
import { SetupChatBox } from "@/components/festival/cards/SetupChatBox";
import { computeSetupStatus, SETUP_STATUS_PILL } from "@/lib/setupStatus";
import { useFestivalVehicles } from "@/hooks/useFestivalVehicles";
import { cn } from "@/lib/utils";

const sb = supabase as any;
const BUCKET = "festival-setup-docs";

type Festival = {
  id: string; slug: string; name: string;
  start_date: string | null; end_date: string | null;
  setup_date: string | null; breakdown_date: string | null;
  setup_plan_pdf_path: string | null;
  setup_plan_uploaded_at: string | null;
  setup_last_parsed_at: string | null;
  setup_parse_summary: string | null;
};

function toLocalDateInput(d: string | null): string {
  return d ? d.slice(0, 10) : "";
}

export default function FestivalSetup() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPhases, setPreviewPhases] = useState<{ phase_type: string; title: string; scheduled_at: string | null; location: string | null; crew_assigned: string[]; tasks: string[]; notes: string | null; checked: boolean }[]>([]);

  const festivalQ = useQuery({
    queryKey: ["festival-setup-festival", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals")
        .select("id,slug,name,start_date,end_date,setup_date,breakdown_date,setup_plan_pdf_path,setup_plan_uploaded_at,setup_last_parsed_at,setup_parse_summary")
        .eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });

  const festival = festivalQ.data;
  const festivalId = festival?.id ?? "";
  const { vehicles } = useFestivalVehicles(festivalId);

  const pageQ = useQuery({
    queryKey: ["setup-page", slug],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await sb.from("festival_setup")
        .select("*")
        .eq("festival_id", festivalId)
        .order("display_order", { ascending: true })
        .order("scheduled_start_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as SetupPhaseRow[];
    },
  });

  const phases = pageQ.data ?? [];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const setupStarts = festival?.setup_date ? new Date(`${festival.setup_date}T00:00:00`) : null;
  const daysUntilSetup = setupStarts
    ? Math.round((setupStarts.getTime() - today.getTime()) / 86400000)
    : null;

  const status = computeSetupStatus({ phaseCount: phases.length, daysUntilSetup });

  const summary = useMemo(() => {
    const done = phases.filter((p) => (p.status ?? "").toLowerCase() === "done").length;
    const inProgress = phases.filter((p) => (p.status ?? "").toLowerCase() === "in_progress").length;
    const planned = phases.length - done - inProgress;
    const crewSet = new Set<string>();
    const vehicleSet = new Set<string>();
    phases.forEach((p) => {
      (p.crew_assigned ?? []).forEach((c) => crewSet.add(c));
      if (p.crew_lead) crewSet.add(p.crew_lead);
      (p.vehicles_assigned ?? []).forEach((v) => vehicleSet.add(v));
    });
    return { done, inProgress, planned, crew: crewSet.size, vehicles: vehicleSet.size };
  }, [phases]);

  const updateFestival = useMutation({
    mutationFn: async (patch: Partial<Festival>) => {
      const { error } = await sb.from("festivals").update(patch).eq("id", festivalId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival-setup-festival", slug] }),
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const addPhase = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("festival_setup").insert({
        festival_id: festivalId,
        work_type: "setup",
        description: "New phase",
        status: "planned",
        display_order: phases.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["setup-page", slug] }); toast.success("Phase added"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${festivalId}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;
      await updateFestival.mutateAsync({
        setup_plan_pdf_path: path,
        setup_plan_uploaded_at: new Date().toISOString(),
      } as any);
      toast.message("Parsing setup plan…");

      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
      if (!signed?.signedUrl) throw new Error("Could not sign URL");
      const { data: parsed, error: pErr } = await supabase.functions.invoke("parse-document", {
        body: { fileUrl: signed.signedUrl, documentType: "setup" },
      });
      if (pErr) throw pErr;
      const p = parsed?.parsed as any;

      const setupPatch: any = {
        setup_last_parsed_at: new Date().toISOString(),
        setup_parse_summary: `Parsed ${(p?.phases ?? []).length} phases`,
      };
      if (p?.setup_date) setupPatch.setup_date = p.setup_date;
      if (p?.teardown_date) setupPatch.breakdown_date = p.teardown_date;
      await sb.from("festivals").update(setupPatch).eq("id", festivalId);
      qc.invalidateQueries({ queryKey: ["festival-setup-festival", slug] });

      const items = Array.isArray(p?.phases) ? p.phases : [];
      if (items.length === 0) {
        toast.message("Uploaded — AI found no phases");
        return;
      }
      setPreviewPhases(items.map((it: any) => ({
        phase_type: String(it.phase_type ?? "setup"),
        title: String(it.title ?? "").trim(),
        scheduled_at: it.scheduled_at ?? null,
        location: it.location ?? null,
        crew_assigned: Array.isArray(it.crew_assigned) ? it.crew_assigned : [],
        tasks: Array.isArray(it.tasks) ? it.tasks : [],
        notes: it.notes ?? null,
        checked: true,
      })).filter((it: any) => it.title));
      setPreviewOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const insertParsed = useMutation({
    mutationFn: async () => {
      const chosen = previewPhases.filter((p) => p.checked);
      if (chosen.length === 0) return 0;
      const baseOrder = phases.length;
      const inserts = chosen.map((it, i) => ({
        festival_id: festivalId,
        work_type: it.phase_type,
        description: it.title,
        scheduled_start_at: it.scheduled_at,
        location: it.location,
        crew_assigned: it.crew_assigned,
        tasks: it.tasks,
        notes: it.notes,
        status: "planned",
        display_order: baseOrder + i + 1,
      }));
      const { error } = await sb.from("festival_setup").insert(inserts);
      if (error) throw error;
      return chosen.length;
    },
    onSuccess: (n) => {
      toast.success(`Added ${n} phase${n === 1 ? "" : "s"}`);
      setPreviewOpen(false);
      setPreviewPhases([]);
      qc.invalidateQueries({ queryKey: ["setup-page", slug] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Insert failed"),
  });

  const openDoc = async () => {
    if (!festival?.setup_plan_pdf_path) return;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(festival.setup_plan_pdf_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (festivalQ.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

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
            <span className={cn("ml-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border", SETUP_STATUS_PILL[status.status])}>
              {status.label}
            </span>
          </div>
          <a href={`/festivals/${slug}/setup/export`} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-muted">
            Export PDF
          </a>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Setup phases from load-out at Søborg through teardown and return. Crew and vehicles per phase. Ask the planner AI for suggestions.
        </p>
      </div>

      {/* Festival-wide overview */}
      <div className="rounded-2xl border bg-card p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <Field label="Setup starts">
            <Input
              type="date"
              value={toLocalDateInput(festival.setup_date)}
              onChange={(e) => updateFestival.mutate({ setup_date: e.target.value || null } as any)}
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Teardown ends">
            <Input
              type="date"
              value={toLocalDateInput(festival.breakdown_date)}
              onChange={(e) => updateFestival.mutate({ breakdown_date: e.target.value || null } as any)}
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Days to setup">
            <span className={cn(
              "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border",
              daysUntilSetup === null ? "bg-muted border" :
              daysUntilSetup < 0 ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" :
              daysUntilSetup <= 7 ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
              "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
            )}>
              {daysUntilSetup === null ? "—" : daysUntilSetup < 0 ? "Past" : `${daysUntilSetup} days`}
            </span>
          </Field>
          <Field label="Total crew">
            <span className="text-base font-bold">{summary.crew}</span>
          </Field>
          <Field label="Vehicles used">
            <span className="text-base font-bold">{summary.vehicles}</span>
          </Field>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition cursor-pointer p-5 flex items-center gap-3"
        >
          <input
            ref={fileRef} type="file" className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }}
          />
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">
              {uploading ? "Parsing…" : "Drop setup plan PDF — AI extracts phases, crew, vehicles"}
            </div>
            {festival.setup_plan_pdf_path && (
              <div className="text-xs text-muted-foreground truncate flex items-center gap-2 mt-0.5">
                <FileText className="h-3 w-3" />
                <button onClick={(e) => { e.stopPropagation(); openDoc(); }} className="hover:underline truncate">
                  {festival.setup_plan_pdf_path.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "")}
                </button>
                {festival.setup_parse_summary && <span>· {festival.setup_parse_summary}</span>}
              </div>
            )}
          </div>
          {festival.setup_plan_pdf_path && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openDoc(); }}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Pill>{phases.length} phases</Pill>
        <Pill tone="emerald">{summary.done} done</Pill>
        <Pill tone="amber">{summary.inProgress} in progress</Pill>
        <Pill>{summary.planned} planned</Pill>
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {pageQ.isLoading ? (
            <>
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </>
          ) : phases.length === 0 ? (
            <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
              No setup phases yet. Drop a setup plan above, or add the first phase.
            </div>
          ) : (
            phases.map((p) => (
              <SetupPhaseCard
                key={p.id}
                festivalId={festivalId}
                festivalSlug={slug}
                phase={p}
                vehicles={vehicles as VehicleOption[]}
              />
            ))
          )}
          <Button
            variant="outline"
            className="w-full h-12 border-dashed"
            onClick={() => addPhase.mutate()}
          >
            <Plus className="h-4 w-4 mr-2" /> Add phase
          </Button>
        </div>

        <div className="lg:col-span-1">
          <SetupChatBox festivalId={festivalId} festivalSlug={slug} />
        </div>
      </div>

      {/* Parse preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Review parsed phases
            </DialogTitle>
            <DialogDescription>
              AI extracted {previewPhases.length} phase{previewPhases.length === 1 ? "" : "s"}. Uncheck any you don't want.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {previewPhases.map((it, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                <Checkbox
                  checked={it.checked}
                  onCheckedChange={(c) => setPreviewPhases((arr) => arr.map((x, idx) => idx === i ? { ...x, checked: !!c } : x))}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{it.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.phase_type}{it.scheduled_at ? ` · ${new Date(it.scheduled_at).toLocaleString()}` : ""}{it.location ? ` · ${it.location}` : ""}
                  </div>
                  {it.crew_assigned.length > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-1">Crew: {it.crew_assigned.join(", ")}</div>
                  )}
                  {it.tasks.length > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">Tasks: {it.tasks.length}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>Cancel</Button>
            <Button onClick={() => insertParsed.mutate()} disabled={insertParsed.isPending}>
              {insertParsed.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
              Add {previewPhases.filter((p) => p.checked).length} phase{previewPhases.filter((p) => p.checked).length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "amber" | "emerald" }) {
  const cls =
    tone === "amber"   ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
    tone === "emerald" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" :
                         "bg-muted text-muted-foreground border";
  return <span className={`px-2.5 py-1 rounded-full border ${cls}`}>{children}</span>;
}
