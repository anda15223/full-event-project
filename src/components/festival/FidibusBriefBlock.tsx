import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import BuildOutPicker, { PickedItem, PickerCategory } from "@/components/festival/BuildOutPicker";

const sb = supabase as any;

const CATEGORIES = [
  "tent","power","water","gas","cooling","daka","tables","facade","other",
  "contacts","hours","equipment","trolleys","power_order","order_list","soborg","info_doc",
] as const;
type Category = typeof CATEGORIES[number];

// Categories whose "Add" button opens the database picker.
const PICKER_CATS = new Set<Category>([
  "tent","power","cooling",
  "contacts","hours","equipment","trolleys",
  "power_order","order_list","facade","soborg","info_doc",
]);

type Run = {
  id: string;
  scope_summary: string | null;
  access_address: string | null;
  access_gate: string | null;
  checkin_contact: string | null;
  checkin_phone: string | null;
  driving_windows: string | null;
  driving_rules: string | null;
  escort_required: boolean | null;
  gas_check_at: string | null;
  fire_inspection_at: string | null;
  teardown_start_at: string | null;
  teardown_window: string | null;
  fidibus_notes: string | null;
};

type Buildout = {
  id: string;
  festival_id: string;
  category: Category;
  area: string | null;
  concept_id: string | null;
  label: string | null;
  spec: string | null;
  qty: number | null;
  dimensions: string | null;
  position_notes: string | null;
  display_order: number;
  source_festival_id: string | null;
};

type Concept = { id: string; name: string; display_order: number | null };
type FestivalLite = { id: string; name: string };

type SourceFilter = "all" | "imported" | "manual";


const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => v ? new Date(v).toISOString() : null;

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-6 space-y-3">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export default function FidibusBriefBlock({
  runId, festivalId, run,
}: { runId: string; festivalId: string; run: Run }) {
  const qc = useQueryClient();

  const conceptsQ = useQuery({
    queryKey: ["fidibus-concepts"],
    queryFn: async () => {
      const { data } = await sb.from("concepts")
        .select("id, name, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true, nullsFirst: false });
      return (data ?? []) as Concept[];
    },
  });
  const concepts = conceptsQ.data ?? [];

  const buildoutQ = useQuery({
    queryKey: ["fidibus-buildout", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await sb.from("fep_fidibus_buildout")
        .select("*").eq("festival_id", festivalId)
        .order("category").order("display_order");
      if (error) throw error;
      return (data ?? []) as Buildout[];
    },
  });
  const buildout = buildoutQ.data ?? [];

  // Lookup names for source-festival badges.
  const sourceIds = useMemo(
    () => Array.from(new Set(buildout.map((b) => b.source_festival_id).filter(Boolean))) as string[],
    [buildout],
  );
  const sourceFestivalsQ = useQuery({
    queryKey: ["fidibus-source-festivals", sourceIds.sort().join(",")],
    enabled: sourceIds.length > 0,
    queryFn: async () => {
      const { data } = await sb.from("festivals").select("id, name").in("id", sourceIds);
      return (data ?? []) as FestivalLite[];
    },
  });
  const sourceFestivalName = useMemo(() => {
    const m = new Map<string, string>();
    (sourceFestivalsQ.data ?? []).forEach((f) => m.set(f.id, f.name));
    return m;
  }, [sourceFestivalsQ.data]);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");


  const invalidateBuildout = () => qc.invalidateQueries({ queryKey: ["fidibus-buildout", festivalId] });
  const invalidateRun = () => qc.invalidateQueries({ queryKey: ["setup-run", festivalId] });

  const updateRun = useMutation({
    mutationFn: async (patch: Partial<Run>) => {
      const { error } = await sb.from("setup_runs").update(patch).eq("id", runId);
      if (error) throw error;
    },
    onSuccess: invalidateRun,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const addRow = useMutation({
    mutationFn: async ({ category, item }: { category: Category; item?: PickedItem }) => {
      const maxOrder = buildout
        .filter((b) => b.category === category)
        .reduce((m, b) => Math.max(m, b.display_order), -1);
      const { error } = await sb.from("fep_fidibus_buildout").insert({
        festival_id: festivalId,
        category,
        display_order: maxOrder + 1,
        label: item?.label ?? null,
        spec: item?.spec ?? null,
        qty: item?.qty ?? null,
        dimensions: item?.dimensions ?? null,
        area: item?.area ?? null,
        concept_id: item?.concept_id ?? null,
        position_notes: item?.position_notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidateBuildout,
    onError: (e: any) => toast.error(e?.message ?? "Add failed"),
  });

  const patchRow = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Buildout> }) => {
      const { error } = await sb.from("fep_fidibus_buildout").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateBuildout,
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("fep_fidibus_buildout").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateBuildout,
  });

  const moveRow = useMutation({
    mutationFn: async ({ row, dir }: { row: Buildout; dir: -1 | 1 }) => {
      const siblings = buildout.filter((b) => b.category === row.category)
        .sort((a, b) => a.display_order - b.display_order);
      const idx = siblings.findIndex((s) => s.id === row.id);
      const swap = idx + dir;
      if (swap < 0 || swap >= siblings.length) return;
      const a = siblings[idx], b = siblings[swap];
      await sb.from("fep_fidibus_buildout").update({ display_order: b.display_order }).eq("id", a.id);
      await sb.from("fep_fidibus_buildout").update({ display_order: a.display_order }).eq("id", b.id);
    },
    onSuccess: invalidateBuildout,
  });

  const importedCount = useMemo(() => buildout.filter((b) => !!b.source_festival_id).length, [buildout]);

  const deleteImported = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("fep_fidibus_buildout")
        .delete()
        .eq("festival_id", festivalId)
        .not("source_festival_id", "is", null);
      if (error) throw error;
    },
    onSuccess: () => { invalidateBuildout(); toast.success("Imported rows deleted"); },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const filteredBuildout = useMemo(() => {
    if (sourceFilter === "imported") return buildout.filter((b) => !!b.source_festival_id);
    if (sourceFilter === "manual") return buildout.filter((b) => !b.source_festival_id);
    return buildout;
  }, [buildout, sourceFilter]);

  const grouped = useMemo(() => {
    const m = new Map<Category, Buildout[]>();
    for (const c of CATEGORIES) m.set(c, []);
    filteredBuildout.forEach((b) => m.get(b.category)?.push(b));
    return m;
  }, [filteredBuildout]);


  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 uppercase tracking-wide">
          Fidibus brief
        </span>
        <p className="text-xs text-muted-foreground">
          Contractor-facing brief — appears on the exported PDF.
        </p>
      </div>

      {/* 1. Scope & contacts */}
      <SectionCard title="Scope & contacts">
        <Field label="Scope summary">
          <Textarea
            defaultValue={run.scope_summary ?? ""}
            onBlur={(e) => { const v = e.target.value || null; if (v !== run.scope_summary) updateRun.mutate({ scope_summary: v }); }}
            placeholder="What Fidibus is responsible for and what we (Fish Project) cover…"
            className="text-xs min-h-[60px]"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Check-in contact">
            <Input
              defaultValue={run.checkin_contact ?? ""}
              onBlur={(e) => { const v = e.target.value || null; if (v !== run.checkin_contact) updateRun.mutate({ checkin_contact: v }); }}
              placeholder="e.g. Cater team (Jonas & Jan)"
              className="h-9 text-xs"
            />
          </Field>
          <Field label="Check-in phone">
            <Input
              defaultValue={run.checkin_phone ?? ""}
              onBlur={(e) => { const v = e.target.value || null; if (v !== run.checkin_phone) updateRun.mutate({ checkin_phone: v }); }}
              placeholder="+45 …"
              className="h-9 text-xs"
            />
          </Field>
        </div>
      </SectionCard>

      {/* 2. Access & driving */}
      <SectionCard title="Access & driving">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Access address">
            <Input
              defaultValue={run.access_address ?? ""}
              onBlur={(e) => { const v = e.target.value || null; if (v !== run.access_address) updateRun.mutate({ access_address: v }); }}
              className="h-9 text-xs"
            />
          </Field>
          <Field label="Access gate(s)">
            <Input
              defaultValue={run.access_gate ?? ""}
              onBlur={(e) => { const v = e.target.value || null; if (v !== run.access_gate) updateRun.mutate({ access_gate: v }); }}
              className="h-9 text-xs"
            />
          </Field>
        </div>
        <Field label="Driving windows">
          <Textarea
            defaultValue={run.driving_windows ?? ""}
            onBlur={(e) => { const v = e.target.value || null; if (v !== run.driving_windows) updateRun.mutate({ driving_windows: v }); }}
            className="text-xs min-h-[50px]"
          />
        </Field>
        <Field label="Driving rules">
          <Textarea
            defaultValue={run.driving_rules ?? ""}
            onBlur={(e) => { const v = e.target.value || null; if (v !== run.driving_rules) updateRun.mutate({ driving_rules: v }); }}
            className="text-xs min-h-[50px]"
          />
        </Field>
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
          <div className="text-xs">
            <div className="font-medium">Escort required</div>
            <div className="text-muted-foreground">Crewkontoret must escort vehicles onto site.</div>
          </div>
          <Switch
            checked={!!run.escort_required}
            onCheckedChange={(v) => updateRun.mutate({ escort_required: v })}
          />
        </div>
      </SectionCard>

      {/* 3. Setup timeline (extra) */}
      <SectionCard title="Setup timeline (extra)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Gas check">
            <Input type="datetime-local" className="h-9 text-xs"
              defaultValue={toLocalInput(run.gas_check_at)}
              onBlur={(e) => { const v = fromLocalInput(e.target.value); if (v !== run.gas_check_at) updateRun.mutate({ gas_check_at: v }); }}
            />
          </Field>
          <Field label="Fire inspection">
            <Input type="datetime-local" className="h-9 text-xs"
              defaultValue={toLocalInput(run.fire_inspection_at)}
              onBlur={(e) => { const v = fromLocalInput(e.target.value); if (v !== run.fire_inspection_at) updateRun.mutate({ fire_inspection_at: v }); }}
            />
          </Field>
          <Field label="Teardown start">
            <Input type="datetime-local" className="h-9 text-xs"
              defaultValue={toLocalInput(run.teardown_start_at)}
              onBlur={(e) => { const v = fromLocalInput(e.target.value); if (v !== run.teardown_start_at) updateRun.mutate({ teardown_start_at: v }); }}
            />
          </Field>
          <Field label="Teardown window">
            <Input className="h-9 text-xs"
              defaultValue={run.teardown_window ?? ""}
              onBlur={(e) => { const v = e.target.value || null; if (v !== run.teardown_window) updateRun.mutate({ teardown_window: v }); }}
              placeholder="e.g. Sun 21 June 09:00-19:00"
            />
          </Field>
        </div>
      </SectionCard>

      {/* 4. Build-out */}
      <SectionCard title="Build-out (Fidibus places)">
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <div className="inline-flex rounded-md border bg-muted/20 p-0.5 text-[11px]">
            {(["all","imported","manual"] as SourceFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setSourceFilter(f)}
                className={
                  "px-2 py-0.5 rounded transition-colors capitalize " +
                  (sourceFilter === f ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")
                }
              >
                {f}{f === "imported" && importedCount > 0 ? ` (${importedCount})` : ""}
              </button>
            ))}
          </div>
          {importedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-destructive hover:text-destructive"
              onClick={() => { if (confirm(`Delete all ${importedCount} imported build-out row(s)?`)) deleteImported.mutate(); }}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Delete imported rows
            </Button>
          )}
        </div>
        {buildoutQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const rows = grouped.get(cat) ?? [];
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                      {cat}
                    </div>
                    {(["tent","power","cooling"] as const).includes(cat as any) ? (
                      <BuildOutPicker
                        category={cat as PickerCategory}
                        festivalId={festivalId}
                        label={`Add ${cat}`}
                        onPick={(item) => addRow.mutate({ category: cat, item })}
                      />
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => addRow.mutate({ category: cat })}>
                        <Plus className="h-3 w-3 mr-1" /> Add {cat}
                      </Button>
                    )}
                  </div>
                  {rows.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground italic px-1">— none —</div>
                  ) : (
                    rows.map((row, idx) => (
                      <div key={row.id} className={"rounded-lg border p-2 space-y-2 " + (row.source_festival_id ? "bg-amber-50/40 border-amber-200/60 dark:bg-amber-500/5" : "bg-muted/20")}>
                        {row.source_festival_id && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
                            <Sparkles className="h-2.5 w-2.5" />
                            <span className="uppercase tracking-wide font-medium">
                              imported · {sourceFestivalName.get(row.source_festival_id) ?? "another festival"}
                            </span>
                          </div>
                        )}
                        <div className="grid grid-cols-12 gap-2">

                          <Input
                            className="col-span-5 h-8 text-xs"
                            defaultValue={row.label ?? ""}
                            placeholder="Label (e.g. Main tent)"
                            onBlur={(e) => { const v = e.target.value || null; if (v !== row.label) patchRow.mutate({ id: row.id, patch: { label: v } }); }}
                          />
                          <Input
                            className="col-span-4 h-8 text-xs"
                            defaultValue={row.spec ?? ""}
                            placeholder="Spec (e.g. 400V/32A)"
                            onBlur={(e) => { const v = e.target.value || null; if (v !== row.spec) patchRow.mutate({ id: row.id, patch: { spec: v } }); }}
                          />
                          <Input
                            type="number"
                            className="col-span-1 h-8 text-xs"
                            defaultValue={row.qty ?? ""}
                            placeholder="Qty"
                            onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== row.qty) patchRow.mutate({ id: row.id, patch: { qty: v } }); }}
                          />
                          <div className="col-span-2 flex items-center justify-end gap-0.5">
                            <button className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              disabled={idx === 0} onClick={() => moveRow.mutate({ row, dir: -1 })}>
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              disabled={idx === rows.length - 1} onClick={() => moveRow.mutate({ row, dir: 1 })}>
                              <ArrowDown className="h-3 w-3" />
                            </button>
                            <button onClick={() => { if (confirm("Delete?")) deleteRow.mutate(row.id); }}
                              className="p-1 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <Input
                            className="col-span-3 h-8 text-xs"
                            defaultValue={row.area ?? ""}
                            placeholder="Area (e.g. INSIDE)"
                            onBlur={(e) => { const v = e.target.value || null; if (v !== row.area) patchRow.mutate({ id: row.id, patch: { area: v } }); }}
                          />
                          <Select
                            value={row.concept_id ?? "__none__"}
                            onValueChange={(v) => patchRow.mutate({ id: row.id, patch: { concept_id: v === "__none__" ? null : v } })}
                          >
                            <SelectTrigger className="col-span-3 h-8 text-xs"><SelectValue placeholder="Concept" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— shared —</SelectItem>
                              {concepts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input
                            className="col-span-2 h-8 text-xs"
                            defaultValue={row.dimensions ?? ""}
                            placeholder="Dimensions"
                            onBlur={(e) => { const v = e.target.value || null; if (v !== row.dimensions) patchRow.mutate({ id: row.id, patch: { dimensions: v } }); }}
                          />
                          <Input
                            className="col-span-4 h-8 text-xs"
                            defaultValue={row.position_notes ?? ""}
                            placeholder="Position notes"
                            onBlur={(e) => { const v = e.target.value || null; if (v !== row.position_notes) patchRow.mutate({ id: row.id, patch: { position_notes: v } }); }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* 5. Fidibus notes */}
      <SectionCard title="Fidibus notes">
        <Textarea
          defaultValue={run.fidibus_notes ?? ""}
          onBlur={(e) => { const v = e.target.value || null; if (v !== run.fidibus_notes) updateRun.mutate({ fidibus_notes: v }); }}
          placeholder="Any constraints, brand rules, restrictions Fidibus must follow…"
          className="text-xs min-h-[80px]"
        />
      </SectionCard>
    </div>
  );
}
