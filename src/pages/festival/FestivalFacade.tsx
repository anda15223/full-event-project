import { useMemo, useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConceptCardGrid, type ConceptContract } from "@/components/concept/ConceptCardGrid";
import { CONCEPT_EMOJI } from "@/components/concept/types";
import { cn } from "@/lib/utils";
import {
  FACADE_STATUSES, FACADE_STATUS_META, MATERIAL_TYPES, MATERIAL_ORDER_STATUSES,
  type FacadeRow, type FacadeStatus, type MaterialType, type MaterialOrderStatus,
  fmtDate, deadlineColor, pushHistory,
} from "@/lib/facade";
import { Upload, FileText, Recycle, Copy, Pencil, Trash2 } from "lucide-react";

type Festival = { id: string; slug: string; name: string; start_date: string; end_date: string };

function StatusPill({ status }: { status: FacadeStatus }) {
  const m = FACADE_STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] uppercase font-semibold px-2 py-0.5 rounded border", m.classes)}>
      <span aria-hidden>{m.emoji}</span>{m.label}
    </span>
  );
}

export default function FestivalFacade() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();

  const { data: festival } = useQuery({
    queryKey: ["festival", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals")
        .select("id,slug,name,start_date,end_date").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });

  const festivalId = festival?.id ?? "";

  const { data: facades = [] } = useQuery({
    queryKey: ["facades", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: contracts } = await supabase.from("festival_contracts")
        .select("id").eq("festival_id", festivalId);
      const ids = (contracts ?? []).map((c: any) => c.id);
      if (!ids.length) return [];
      const { data, error } = await supabase.from("festival_facade")
        .select("*").in("festival_contract_id", ids);
      if (error) throw error;
      return (data ?? []) as FacadeRow[];
    },
  });

  const facadesByContract = useMemo(() => {
    const m = new Map<string, FacadeRow>();
    facades.forEach((f) => m.set(f.festival_contract_id, f));
    return m;
  }, [facades]);

  // Status summary
  const summary = useMemo(() => {
    const s = { approved: 0, in_review: 0, in_design: 0, not_started: 0, reused: 0, printed: 0, installed: 0, damaged: 0 };
    facades.forEach((f) => {
      if (f.design_status === "festival_approved") s.approved++;
      else if (f.design_status === "in_review") s.in_review++;
      else if (f.design_status === "in_design") s.in_design++;
      else if (f.design_status === "not_started") s.not_started++;
      else if (f.design_status === "reused_from_2025") s.reused++;
      else if (f.design_status === "printed") s.printed++;
      else if (f.design_status === "installed") s.installed++;
      else if (f.design_status === "damaged_replace_needed") s.damaged++;
    });
    return s;
  }, [facades]);

  // Critical alerts: print_deadline within 14d AND status not in (printed,installed)
  const criticalCount = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const cut = new Date(today.getTime() + 14 * 86400000);
    return facades.filter((f) => {
      if (!f.print_deadline) return false;
      if (["printed", "installed"].includes(f.design_status)) return false;
      const d = new Date(f.print_deadline + "T00:00:00");
      return d <= cut;
    }).length;
  }, [facades]);

  const [bulkOpen, setBulkOpen] = useState(false);

  const renderBody = (concept: any, _data: any, _mgr: any, contract?: ConceptContract) => {
    if (!contract) return null;
    const facade = facadesByContract.get(contract.contract_id);
    return (
      <FacadeBody
        festivalSlug={slug}
        festivalId={festivalId}
        contract={contract}
        conceptSlug={concept.slug}
        facade={facade}
      />
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link to={`/festivals/${slug}`} className="text-xs text-muted-foreground hover:underline">
          ← Back to festival
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            <Recycle className="h-4 w-4 mr-1" /> Bulk reuse from 2025
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/festivals/${slug}/facade/export`}>Export PDF</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h1 className="text-2xl font-bold tracking-tight">{festival?.name ?? slug}</h1>
        <p className="text-sm text-muted-foreground">Facade design & production</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {summary.approved > 0 && <Stat label="Approved" value={summary.approved} tone="emerald" />}
          {summary.in_review > 0 && <Stat label="In review" value={summary.in_review} tone="yellow" />}
          {summary.in_design > 0 && <Stat label="In design" value={summary.in_design} tone="blue" />}
          {summary.reused > 0 && <Stat label="Reused" value={summary.reused} tone="teal" />}
          {summary.printed > 0 && <Stat label="Printed" value={summary.printed} tone="emerald" />}
          {summary.installed > 0 && <Stat label="Installed" value={summary.installed} tone="emerald" />}
          {summary.not_started > 0 && <Stat label="Not started" value={summary.not_started} tone="muted" />}
          {summary.damaged > 0 && <Stat label="Damaged" value={summary.damaged} tone="destructive" />}
        </div>
        {criticalCount > 0 && (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            🚨 {criticalCount} facade{criticalCount === 1 ? "" : "s"} with print deadline within 14 days and not yet printed.
          </div>
        )}
      </div>

      {festivalId && (
        <ConceptCardGrid festivalId={festivalId} conceptData={{}} renderConceptBody={renderBody} enableManagerEdit={false} showVehicleSelector />
      )}

      {bulkOpen && festival && (
        <BulkReuseDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          festivalName={festival.name}
          facades={facades}
          onDone={() => qc.invalidateQueries({ queryKey: ["facades", festivalId] })}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const toneCls: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    muted: "border-border bg-muted text-muted-foreground",
    destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border", toneCls[tone])}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="uppercase tracking-wide text-[10px]">{label}</span>
    </span>
  );
}

// ---------- Body per-concept ----------
function FacadeBody({
  festivalSlug, festivalId, contract, conceptSlug, facade,
}: {
  festivalSlug: string;
  festivalId: string;
  contract: ConceptContract;
  conceptSlug: string;
  facade: FacadeRow | undefined;
}) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const ensureRow = useMutation({
    mutationFn: async () => {
      if (facade) return facade;
      const { data, error } = await supabase.from("festival_facade")
        .insert({ festival_contract_id: contract.contract_id })
        .select().single();
      if (error) throw error;
      return data as FacadeRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["facades", festivalId] }),
  });

  if (!facade) {
    return (
      <div className="rounded border border-dashed p-3 text-sm text-muted-foreground flex items-center justify-between">
        <span>No facade record yet.</span>
        <Button size="sm" variant="outline" onClick={() => ensureRow.mutate()}>Create</Button>
      </div>
    );
  }

  const previewPath = facade.design_preview_path;
  const filePath = facade.design_file_path;

  const openPreview = async () => {
    if (!previewPath) return;
    const { data } = await supabase.storage.from("facade-designs").createSignedUrl(previewPath, 3600);
    if (data?.signedUrl) setPreviewUrl(data.signedUrl);
  };
  const downloadFile = async () => {
    if (!filePath) return;
    const { data } = await supabase.storage.from("facade-designs").createSignedUrl(filePath, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const printOverdue = facade.print_deadline && new Date(facade.print_deadline + "T00:00:00") < new Date();
  const approvalNeeded = facade.festival_approval_required && !facade.festival_approval_received_at;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill status={facade.design_status} />
        {facade.material_type && (
          <span className="text-[10px] uppercase border px-2 py-0.5 rounded text-muted-foreground">
            {facade.material_type.replace("_", " ")}
          </span>
        )}
        {facade.panel_count > 1 && (
          <span className="text-[10px] uppercase border px-2 py-0.5 rounded text-muted-foreground">
            {facade.panel_count} panels
          </span>
        )}
        {facade.reused_from && (
          <span className="text-[10px] border px-2 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30">
            ♻️ {facade.reused_from}
          </span>
        )}
      </div>

      {facade.design_concept_note && (
        <p className="text-sm italic text-muted-foreground">{facade.design_concept_note}</p>
      )}

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Design</div>
          {previewPath ? (
            <button onClick={openPreview} className="block text-xs text-primary hover:underline">View preview</button>
          ) : (
            <div className="text-xs text-muted-foreground">No preview uploaded</div>
          )}
          {filePath ? (
            <button onClick={downloadFile} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <FileText className="h-3 w-3" /> {filePath.split("/").pop()}
            </button>
          ) : (
            <div className="text-xs text-muted-foreground">No design file</div>
          )}
          <UploadButton
            festivalSlug={festivalSlug}
            facade={facade}
            onUploaded={() => qc.invalidateQueries({ queryKey: ["facades", festivalId] })}
          />
        </div>

        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Production</div>
          <div className="text-xs">Supplier: <span className="font-medium">{facade.material_supplier ?? "—"}</span></div>
          <div className="text-xs">
            Dimensions: <span className="font-medium">
              {facade.dimensions_text ?? (facade.dimensions_w_cm && facade.dimensions_h_cm ? `${facade.dimensions_w_cm}×${facade.dimensions_h_cm} cm` : "—")}
            </span>
          </div>
          <div className="text-xs">
            Material order: <span className="font-medium">{facade.material_orders_status ?? "—"}</span>
          </div>
          <div className={cn("text-xs", deadlineColor(facade.material_deadline))}>
            Material deadline: {fmtDate(facade.material_deadline)}
          </div>
          <div className={cn("text-xs", deadlineColor(facade.print_deadline))}>
            Print deadline: {fmtDate(facade.print_deadline)}{printOverdue && " (overdue)"}
          </div>
        </div>
      </div>

      {facade.festival_approval_required && (
        <div className={cn(
          "rounded border p-2 text-xs",
          facade.festival_approval_received_at
            ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
            : "bg-yellow-500/5 border-yellow-500/30 text-yellow-700 dark:text-yellow-300"
        )}>
          {facade.festival_approval_received_at
            ? <>✅ Festival approved on {fmtDate(facade.festival_approval_received_at.slice(0,10))}</>
            : <>⏳ Awaiting festival approval</>}
        </div>
      )}

      {(facade.cost_dkk || facade.installation_notes || facade.notes) && (
        <div className="text-xs space-y-1 pt-1">
          {facade.cost_dkk != null && <div>Cost: <span className="font-medium">{facade.cost_dkk.toLocaleString("da-DK")} DKK</span></div>}
          {facade.installation_notes && <div className="text-muted-foreground">Install: {facade.installation_notes}</div>}
          {facade.notes && <div className="text-muted-foreground">Note: {facade.notes}</div>}
        </div>
      )}

      <div className="flex items-center gap-1 pt-1">
        <Button variant="ghost" size="sm" onClick={() => setStatusOpen(true)}>📝 Update status</Button>
        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit specs</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">More ▾</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDuplicateOpen(true)}><Copy className="h-3.5 w-3.5 mr-1" />Duplicate to another festival</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={async () => {
              if (!confirm("Delete facade record?")) return;
              const { error } = await supabase.from("festival_facade").delete().eq("id", facade.id);
              if (error) toast.error(error.message); else {
                toast.success("Deleted");
                qc.invalidateQueries({ queryKey: ["facades", festivalId] });
              }
            }}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editOpen && (
        <EditDrawer open={editOpen} onOpenChange={setEditOpen} facade={facade}
          onSaved={() => qc.invalidateQueries({ queryKey: ["facades", festivalId] })} />
      )}
      {statusOpen && (
        <StatusDrawer open={statusOpen} onOpenChange={setStatusOpen} facade={facade}
          contract={contract}
          onSaved={() => qc.invalidateQueries({ queryKey: ["facades", festivalId] })} />
      )}
      {duplicateOpen && (
        <DuplicateDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}
          facade={facade} sourceConceptSlug={conceptSlug}
          onDone={() => toast.success("Duplicated to target festival")} />
      )}

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Facade preview</DialogTitle></DialogHeader>
          {previewUrl && <img src={previewUrl} alt="Facade preview" className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Upload ----------
function UploadButton({
  festivalSlug, facade, onUploaded,
}: { festivalSlug: string; facade: FacadeRow; onUploaded: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const previewInput = useRef<HTMLInputElement>(null);

  const handle = async (file: File, kind: "design" | "preview") => {
    if (file.size > 50 * 1024 * 1024) { toast.error("Max 50MB"); return; }
    const folder = kind === "design" ? "design" : "preview";
    const path = `${festivalSlug}/${facade.festival_contract_id}/${folder}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("facade-designs").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const update: any = kind === "design" ? { design_file_path: path } : { design_preview_path: path };
    const { error: e2 } = await supabase.from("festival_facade").update(update).eq("id", facade.id);
    if (e2) { toast.error(e2.message); return; }
    toast.success(`${kind === "design" ? "Design" : "Preview"} uploaded`);
    onUploaded();
  };

  return (
    <div className="flex items-center gap-1">
      <input ref={fileInput} type="file" hidden accept=".pdf,.ai,.psd,.png,.jpg,.jpeg,.svg"
        onChange={(e) => e.target.files?.[0] && handle(e.target.files[0], "design")} />
      <input ref={previewInput} type="file" hidden accept=".png,.jpg,.jpeg,.webp"
        onChange={(e) => e.target.files?.[0] && handle(e.target.files[0], "preview")} />
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInput.current?.click()}>
        <Upload className="h-3 w-3 mr-1" /> Design
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => previewInput.current?.click()}>
        <Upload className="h-3 w-3 mr-1" /> Preview
      </Button>
    </div>
  );
}

// ---------- Edit specs drawer ----------
function EditDrawer({ open, onOpenChange, facade, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; facade: FacadeRow; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<FacadeRow>>({ ...facade });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("festival_facade").update({
        design_concept_note: form.design_concept_note ?? null,
        material_type: (form.material_type as MaterialType) ?? null,
        material_supplier: form.material_supplier ?? null,
        material_deadline: form.material_deadline || null,
        print_deadline: form.print_deadline || null,
        dimensions_text: form.dimensions_text ?? null,
        dimensions_w_cm: form.dimensions_w_cm ?? null,
        dimensions_h_cm: form.dimensions_h_cm ?? null,
        panel_count: form.panel_count ?? 1,
        cost_dkk: form.cost_dkk ?? null,
        festival_approval_required: !!form.festival_approval_required,
        installation_notes: form.installation_notes ?? null,
        notes: form.notes ?? null,
      }).eq("id", facade.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); onOpenChange(false); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit facade specs</SheetTitle>
          <SheetDescription>Material, dimensions, deadlines, and notes.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 py-4">
          <Field label="Design concept note">
            <Textarea value={form.design_concept_note ?? ""} onChange={(e) => setForm({ ...form, design_concept_note: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Material">
              <Select value={form.material_type ?? "__none"} onValueChange={(v) => setForm({ ...form, material_type: v === "__none" ? null : (v as MaterialType) })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {MATERIAL_TYPES.map((m) => <SelectItem key={m} value={m}>{m.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Supplier">
              <Input value={form.material_supplier ?? ""} onChange={(e) => setForm({ ...form, material_supplier: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Width (cm)">
              <Input type="number" value={form.dimensions_w_cm ?? ""} onChange={(e) => setForm({ ...form, dimensions_w_cm: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Height (cm)">
              <Input type="number" value={form.dimensions_h_cm ?? ""} onChange={(e) => setForm({ ...form, dimensions_h_cm: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Panels">
              <Input type="number" value={form.panel_count ?? 1} onChange={(e) => setForm({ ...form, panel_count: Number(e.target.value) || 1 })} />
            </Field>
          </div>
          <Field label="Dimensions (free text)">
            <Input value={form.dimensions_text ?? ""} placeholder="3m × 2m × 4 panels" onChange={(e) => setForm({ ...form, dimensions_text: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Material deadline">
              <Input type="date" value={form.material_deadline ?? ""} onChange={(e) => setForm({ ...form, material_deadline: e.target.value })} />
            </Field>
            <Field label="Print deadline">
              <Input type="date" value={form.print_deadline ?? ""} onChange={(e) => setForm({ ...form, print_deadline: e.target.value })} />
            </Field>
          </div>
          <Field label="Cost (DKK)">
            <Input type="number" value={form.cost_dkk ?? ""} onChange={(e) => setForm({ ...form, cost_dkk: e.target.value ? Number(e.target.value) : null })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!form.festival_approval_required} onCheckedChange={(v) => setForm({ ...form, festival_approval_required: !!v })} />
            Festival approval required
          </label>
          <Field label="Installation notes">
            <Textarea value={form.installation_notes ?? ""} onChange={(e) => setForm({ ...form, installation_notes: e.target.value })} />
          </Field>
          <Field label="General notes">
            <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ---------- Status flow drawer ----------
function StatusDrawer({ open, onOpenChange, facade, contract, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; facade: FacadeRow;
  contract: ConceptContract; onSaved: () => void;
}) {
  const [next, setNext] = useState<FacadeStatus>(facade.design_status);
  const [extra, setExtra] = useState<Record<string, any>>({});

  const apply = useMutation({
    mutationFn: async () => {
      const update: any = {
        design_status: next,
        status_history: pushHistory(facade.status_history ?? [], facade.design_status, next, extra),
      };

      switch (next) {
        case "in_review":
          update.notes = (facade.notes ? facade.notes + " | " : "") + `Sent to ${extra.sent_to ?? "festival"} ${new Date().toISOString().slice(0,10)}`;
          if (extra.approval_expected_by) {
            await supabase.from("festival_action_items").insert({
              festival_id: (await supabase.from("festival_contracts").select("festival_id").eq("id", contract.contract_id).single()).data?.festival_id,
              title: `Chase facade approval — ${contract.concept_alias ?? "concept"}`,
              due_date: extra.approval_expected_by,
              priority: "high",
              source: "facade_status",
              source_ref: facade.id,
              contract_id: contract.contract_id,
            });
          }
          break;
        case "festival_approved":
          update.festival_approval_received_at = (extra.approval_date ?? new Date().toISOString().slice(0,10)) + "T12:00:00Z";
          update.material_orders_status = facade.material_orders_status ?? "not_ordered";
          break;
        case "reused_from_2025":
          update.reused_from = extra.reused_from ?? facade.reused_from;
          update.reuse_modifications = extra.reuse_modifications ?? facade.reuse_modifications;
          break;
        case "printed":
          if (extra.material_delivered) update.material_orders_status = "delivered";
          break;
        case "installed":
          update.material_orders_status = "installed";
          break;
        case "damaged_replace_needed":
          update.notes = (facade.notes ? facade.notes + " | " : "") + `DAMAGED: ${extra.damage_description ?? ""}`;
          await supabase.from("festival_action_items").insert({
            festival_id: (await supabase.from("festival_contracts").select("festival_id").eq("id", contract.contract_id).single()).data?.festival_id,
            title: `🚨 Replace damaged facade — ${contract.concept_alias ?? "concept"}`,
            description: extra.damage_description ?? "",
            priority: "critical",
            source: "facade_status",
            source_ref: facade.id,
            contract_id: contract.contract_id,
          });
          break;
      }

      const { error } = await supabase.from("festival_facade").update(update).eq("id", facade.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); onSaved(); onOpenChange(false); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Update facade status</SheetTitle>
          <SheetDescription>Current: {FACADE_STATUS_META[facade.design_status].label}</SheetDescription>
        </SheetHeader>
        <div className="py-4 space-y-3">
          <Field label="New status">
            <Select value={next} onValueChange={(v) => { setNext(v as FacadeStatus); setExtra({}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FACADE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{FACADE_STATUS_META[s].emoji} {FACADE_STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {next === "in_design" && (
            <>
              <Field label="Designer assigned"><Input value={extra.designer ?? ""} onChange={(e) => setExtra({ ...extra, designer: e.target.value })} /></Field>
              <Field label="Expected completion"><Input type="date" value={extra.expected_completion ?? ""} onChange={(e) => setExtra({ ...extra, expected_completion: e.target.value })} /></Field>
            </>
          )}
          {next === "in_review" && (
            <>
              <Field label="Sent to (contact)"><Input value={extra.sent_to ?? ""} onChange={(e) => setExtra({ ...extra, sent_to: e.target.value })} /></Field>
              <Field label="Approval expected by"><Input type="date" value={extra.approval_expected_by ?? ""} onChange={(e) => setExtra({ ...extra, approval_expected_by: e.target.value })} /></Field>
              <p className="text-xs text-muted-foreground">An action item will be auto-created to chase if not approved by this date.</p>
            </>
          )}
          {next === "festival_approved" && (
            <>
              <Field label="Approved by"><Input value={extra.approved_by ?? ""} onChange={(e) => setExtra({ ...extra, approved_by: e.target.value })} /></Field>
              <Field label="Approval date"><Input type="date" value={extra.approval_date ?? new Date().toISOString().slice(0,10)} onChange={(e) => setExtra({ ...extra, approval_date: e.target.value })} /></Field>
            </>
          )}
          {next === "reused_from_2025" && (
            <>
              <Field label="Source festival (e.g. '2025 Jelling')"><Input value={extra.reused_from ?? facade.reused_from ?? ""} onChange={(e) => setExtra({ ...extra, reused_from: e.target.value })} /></Field>
              <Field label="Modifications needed"><Textarea value={extra.reuse_modifications ?? ""} onChange={(e) => setExtra({ ...extra, reuse_modifications: e.target.value })} /></Field>
            </>
          )}
          {next === "printed" && (
            <>
              <Field label="Print date"><Input type="date" value={extra.print_date ?? new Date().toISOString().slice(0,10)} onChange={(e) => setExtra({ ...extra, print_date: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!extra.material_delivered} onCheckedChange={(v) => setExtra({ ...extra, material_delivered: !!v })} />
                Material delivered
              </label>
            </>
          )}
          {next === "installed" && (
            <Field label="Install date"><Input type="date" value={extra.install_date ?? new Date().toISOString().slice(0,10)} onChange={(e) => setExtra({ ...extra, install_date: e.target.value })} /></Field>
          )}
          {next === "damaged_replace_needed" && (
            <Field label="Damage description (required)">
              <Textarea required value={extra.damage_description ?? ""} onChange={(e) => setExtra({ ...extra, damage_description: e.target.value })} />
            </Field>
          )}
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => apply.mutate()} disabled={apply.isPending || (next === "damaged_replace_needed" && !extra.damage_description)}>
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Bulk reuse from 2025 ----------
function BulkReuseDialog({ open, onOpenChange, festivalName, facades, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  festivalName: string; facades: FacadeRow[]; onDone: () => void;
}) {
  const { data: contracts = [] } = useQuery({
    queryKey: ["bulk-reuse-contracts", facades.map((f) => f.festival_contract_id).join(",")],
    queryFn: async () => {
      const ids = facades.map((f) => f.festival_contract_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("festival_contracts")
        .select("id, concept_alias, festival_id, concept:concepts!concept_id(slug, name)").in("id", ids);
      return data ?? [];
    },
  });

  const [picks, setPicks] = useState<Record<string, { check: boolean; source: string; mods: string }>>({});

  const submit = useMutation({
    mutationFn: async () => {
      const selected = Object.entries(picks).filter(([_, v]) => v.check);
      if (!selected.length) throw new Error("Select at least one");
      for (const [contractId, v] of selected) {
        const facade = facades.find((f) => f.festival_contract_id === contractId);
        if (!facade) continue;
        await supabase.from("festival_facade").update({
          design_status: "reused_from_2025",
          reused_from: v.source || "2025 archive",
          reuse_modifications: v.mods || null,
          status_history: pushHistory(facade.status_history ?? [], facade.design_status, "reused_from_2025", { bulk: true }),
        }).eq("id", facade.id);
      }
      // single action item for archive verification
      const fid = (contracts[0] as any)?.festival_id;
      if (fid) {
        await supabase.from("festival_action_items").insert({
          festival_id: fid,
          title: `Verify 2025 facade archive accessibility for ${festivalName}`,
          priority: "high",
          source: "facade_bulk_reuse",
        });
      }
      // open question if any modifications
      const anyMods = selected.some(([_, v]) => v.mods.trim().length > 0);
      if (anyMods && fid) {
        await supabase.from("festival_open_questions").insert({
          festival_id: fid,
          question: `Confirm 2025 facade modifications for ${festivalName}`,
          context: selected.filter(([_, v]) => v.mods).map(([_, v]) => `• ${v.source}: ${v.mods}`).join("\n"),
          priority: "medium",
        });
      }
    },
    onSuccess: () => { toast.success("Bulk reuse applied"); onDone(); onOpenChange(false); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk reuse from 2025</DialogTitle>
          <DialogDescription>Mark which facades to reuse, with optional modifications.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {(contracts as any[]).map((c) => {
            const k = c.id;
            const cur = picks[k] ?? { check: false, source: "", mods: "" };
            const emoji = c.concept?.slug ? CONCEPT_EMOJI[c.concept.slug as keyof typeof CONCEPT_EMOJI] : "🍽️";
            const label = `${emoji} ${c.concept?.name ?? ""}${c.concept_alias ? ` — ${c.concept_alias}` : ""}`;
            return (
              <div key={k} className="rounded border p-2 space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox checked={cur.check} onCheckedChange={(v) => setPicks({ ...picks, [k]: { ...cur, check: !!v } })} />
                  {label}
                </label>
                {cur.check && (
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    <Input placeholder="2025 source (e.g. '2025 Jelling')" value={cur.source} onChange={(e) => setPicks({ ...picks, [k]: { ...cur, source: e.target.value } })} />
                    <Input placeholder="Modifications needed (optional)" value={cur.mods} onChange={(e) => setPicks({ ...picks, [k]: { ...cur, mods: e.target.value } })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>Apply reuse</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Duplicate to another festival ----------
function DuplicateDialog({ open, onOpenChange, facade, sourceConceptSlug, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; facade: FacadeRow;
  sourceConceptSlug: string; onDone: () => void;
}) {
  const [targetContractId, setTargetContractId] = useState<string>("");
  const { data: targets = [] } = useQuery({
    queryKey: ["dup-targets", sourceConceptSlug, facade.festival_contract_id],
    queryFn: async () => {
      const { data } = await supabase.from("festival_contracts")
        .select("id, concept_alias, festival_id, festival:festivals!festival_id(name, slug), concept:concepts!concept_id(slug, name)")
        .neq("id", facade.festival_contract_id);
      return (data ?? []).filter((c: any) => c.concept?.slug === sourceConceptSlug);
    },
  });

  const dup = useMutation({
    mutationFn: async () => {
      if (!targetContractId) throw new Error("Pick a target");
      // upsert facade row for target
      const { data: existing } = await supabase.from("festival_facade")
        .select("id").eq("festival_contract_id", targetContractId).maybeSingle();
      const payload: any = {
        design_status: "in_design",
        design_file_path: facade.design_file_path,
        design_preview_path: facade.design_preview_path,
        material_type: facade.material_type,
        panel_count: facade.panel_count,
        dimensions_text: facade.dimensions_text,
        dimensions_w_cm: facade.dimensions_w_cm,
        dimensions_h_cm: facade.dimensions_h_cm,
        design_concept_note: `Duplicated from another festival; ${facade.design_concept_note ?? ""}`.trim(),
      };
      if (existing) {
        await supabase.from("festival_facade").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("festival_facade").insert({ ...payload, festival_contract_id: targetContractId });
      }
    },
    onSuccess: () => { onDone(); onOpenChange(false); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate design to another festival</DialogTitle>
          <DialogDescription>Only same-concept stalls are shown. Approval status will not be copied.</DialogDescription>
        </DialogHeader>
        <Select value={targetContractId} onValueChange={setTargetContractId}>
          <SelectTrigger><SelectValue placeholder="Pick target stall" /></SelectTrigger>
          <SelectContent>
            {(targets as any[]).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.festival?.name}{t.concept_alias ? ` — ${t.concept_alias}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => dup.mutate()} disabled={!targetContractId || dup.isPending}>Duplicate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
