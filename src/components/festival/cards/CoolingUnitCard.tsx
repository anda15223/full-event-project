import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toIsoDate } from "@/lib/parseDate";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Snowflake, Upload, FileText, Download, Loader2, Trash2, Plus, X,
} from "lucide-react";
import { computeCoolingUnitStatus, COOLING_STATUS_PILL } from "@/lib/coolingStatus";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";

export interface CoolingUnitRow {
  id: string;
  festival_id: string;
  unit_label: string;
  cooling_model: string;
  container_type: string | null;
  unit_size: string | null;
  supplier: string | null;
  delivery_date: string | null;
  pickup_date: string | null;
  power_required_kw: number | null;
  cost_dkk: number | null;
  status: string;
  notes: string | null;
  order_pdf_path: string | null;
  order_pdf_uploaded_at: string | null;
  last_parsed_at: string | null;
  parse_summary: string | null;
  order_reference: string | null;
}

export interface AssignedConcept {
  contractId: string;
  conceptSlug: string;
  conceptName: string;
  isActive: boolean;
}

interface Props {
  festivalId: string;
  festivalSlug: string;
  unit: CoolingUnitRow;
  assignedConcepts: AssignedConcept[];
  unassignedContracts: { contractId: string; conceptSlug: string; conceptName: string }[];
}

const STATUS_OPTIONS = [
  { value: "not_ordered", label: "Not ordered" },
  { value: "ordered", label: "Ordered" },
  { value: "confirmed", label: "Confirmed" },
  { value: "delivered", label: "Delivered" },
  { value: "returned", label: "Returned" },
];
const TYPE_OPTIONS = [
  { value: "container", label: "Container" },
  { value: "trailer", label: "Trailer" },
  { value: "pallet_rental", label: "Pallet rental" },
  { value: "festival_provided", label: "Festival provided" },
];

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function InlineText({
  value, onSave, placeholder,
}: { value: string | null; onSave: (v: string | null) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? "");
  if (!editing) {
    return (
      <button onClick={() => { setV(value ?? ""); setEditing(true); }}
        className="hover:underline text-left truncate w-full">
        {value || <span className="text-muted-foreground">{placeholder ?? "—"}</span>}
      </button>
    );
  }
  return (
    <Input autoFocus value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); onSave(v.trim() === "" ? null : v.trim()); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-7 text-sm" />
  );
}

function InlineDate({
  value, onSave,
}: { value: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? "");
  if (!editing) {
    return (
      <button onClick={() => { setV(value ?? ""); setEditing(true); }}
        className="hover:underline text-left tabular-nums">
        {fmtDate(value)}
      </button>
    );
  }
  return (
    <Input type="date" autoFocus value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); onSave(v === "" ? null : v); }}
      className="h-7 text-sm" />
  );
}

function InlineNumber({
  value, onSave, suffix,
}: { value: number | null; onSave: (v: number | null) => void; suffix?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value?.toString() ?? "");
  if (!editing) {
    return (
      <button onClick={() => { setV(value?.toString() ?? ""); setEditing(true); }}
        className="hover:underline text-left">
        {value != null ? `${value}${suffix ?? ""}` : "—"}
      </button>
    );
  }
  return (
    <Input type="number" step="0.1" autoFocus value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); onSave(v === "" ? null : parseFloat(v)); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-7 text-sm" />
  );
}

export function CoolingUnitCard({
  festivalId, festivalSlug, unit, assignedConcepts, unassignedContracts,
}: Props) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [notesDraft, setNotesDraft] = useState(unit.notes ?? "");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const status = computeCoolingUnitStatus(unit);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cooling-page", festivalSlug] });
  };

  const updateUnit = useMutation({
    mutationFn: async (patch: Partial<CoolingUnitRow>) => {
      const { error } = await supabase.from("festival_cooling_unit")
        .update(patch as any).eq("id", unit.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const assignConcept = useMutation({
    mutationFn: async (contractId: string) => {
      const { error } = await supabase.from("festival_cooling_unit_concepts")
        .insert({ cooling_unit_id: unit.id, festival_contract_id: contractId } as any);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Assign failed"),
  });

  const unassignConcept = useMutation({
    mutationFn: async (contractId: string) => {
      const { error } = await supabase.from("festival_cooling_unit_concepts")
        .delete()
        .eq("cooling_unit_id", unit.id)
        .eq("festival_contract_id", contractId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Remove failed"),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("festival_cooling_unit").delete().eq("id", unit.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cooling unit deleted"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${festivalId}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("festival-cooling-docs").upload(path, file);
      if (upErr) throw upErr;
      await supabase.from("festival_cooling_unit").update({
        order_pdf_path: path,
        order_pdf_uploaded_at: new Date().toISOString(),
      } as any).eq("id", unit.id);
      toast.success("Uploaded — parsing with AI…");
      invalidate();

      try {
        const { data: signed } = await supabase.storage.from("festival-cooling-docs").createSignedUrl(path, 600);
        if (signed?.signedUrl) {
          const { data: parsed } = await supabase.functions.invoke("parse-document", {
            body: { fileUrl: signed.signedUrl, documentType: "cooling" },
          });
          if (parsed?.ok && parsed.parsed) {
            const p = parsed.parsed as any;
            const upd: any = { last_parsed_at: new Date().toISOString() };
            if (!unit.supplier && p.supplier) upd.supplier = p.supplier;
            if (!unit.cooling_model && p.unit_type) upd.cooling_model = p.unit_type;
            if (!unit.unit_size && p.unit_size) upd.unit_size = p.unit_size;
            if (!unit.container_type && p.container_type) upd.container_type = p.container_type;
            { const v = toIsoDate(p.delivery_date); if (v && !unit.delivery_date) upd.delivery_date = v; }
            { const v = toIsoDate(p.pickup_date); if (v && !unit.pickup_date) upd.pickup_date = v; }
            if (unit.power_required_kw == null && p.power_required_kw != null) upd.power_required_kw = p.power_required_kw;
            if (!unit.order_reference && p.order_reference) upd.order_reference = p.order_reference;
            if (unit.cost_dkk == null && p.cost_total != null) {
              const cur = String(p.currency ?? "DKK").toUpperCase();
              if (cur === "DKK") upd.cost_dkk = p.cost_total;
            }
            const ev = p._extraction_evidence;
            const evNote = ev?.matched_text ? `[${ev.evidence_type ?? "ai"}] ${ev.matched_text}` : null;
            const summary = [evNote, p.raw_notes].filter(Boolean).join(" — ");
            if (summary) upd.parse_summary = summary.slice(0, 500);
            await supabase.from("festival_cooling_unit").update(upd).eq("id", unit.id);
            toast.success("AI parse complete — please review");
            invalidate();
          }
        }
      } catch (pe: any) {
        console.warn("parse-document failed", pe);
        toast.message("Uploaded — AI parse skipped");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const openDoc = async () => {
    if (!unit.order_pdf_path) return;
    const { data } = await supabase.storage.from("festival-cooling-docs")
      .createSignedUrl(unit.order_pdf_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const typeLabel = TYPE_OPTIONS.find((t) => t.value === unit.cooling_model)?.label ?? unit.cooling_model;

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Snowflake className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-bold truncate">{unit.unit_label}</h3>
            {unit.container_type && (
              <p className="text-xs text-muted-foreground truncate">{unit.container_type}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={unit.status} onValueChange={(v) => updateUnit.mutate({ status: v })}>
            <SelectTrigger className={cn(
              "h-8 px-3 rounded-full text-sm font-medium border w-auto gap-2",
              COOLING_STATUS_PILL[status.status],
            )}>
              <SelectValue>{status.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Type</div>
          <Select value={unit.cooling_model} onValueChange={(v) => updateUnit.mutate({ cooling_model: v })}>
            <SelectTrigger className="h-7 text-sm border-0 px-0 hover:underline focus:ring-0 shadow-none">
              <SelectValue>{typeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Size</div>
          <InlineText value={unit.unit_size} onSave={(v) => updateUnit.mutate({ unit_size: v })} placeholder="e.g. 20ft" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Supplier</div>
          <InlineText value={unit.supplier} onSave={(v) => updateUnit.mutate({ supplier: v })} placeholder="—" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Power</div>
          <div className="tabular-nums">
            <InlineNumber value={unit.power_required_kw} onSave={(v) => updateUnit.mutate({ power_required_kw: v })} suffix=" kW" />
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Delivery</div>
          <InlineDate value={unit.delivery_date} onSave={(v) => updateUnit.mutate({ delivery_date: v })} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pickup</div>
          <InlineDate value={unit.pickup_date} onSave={(v) => updateUnit.mutate({ pickup_date: v })} />
        </div>
      </div>

      {/* Used by concepts */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Used by</h4>
        <div className="flex flex-wrap items-center gap-1.5">
          {assignedConcepts.length === 0 && (
            <span className="text-xs text-muted-foreground italic">No concepts assigned yet</span>
          )}
          {assignedConcepts.map((c) => {
            const emoji = CONCEPT_EMOJI[c.conceptSlug as ConceptSlug] ?? "🎪";
            return (
              <span key={c.contractId}
                className={cn(
                  "group inline-flex items-center gap-1 rounded-full px-3 py-1 bg-muted text-sm",
                  !c.isActive && "opacity-50 grayscale line-through",
                )}>
                <span aria-hidden>{emoji}</span>
                <span>{c.conceptName}{!c.isActive && " (disabled)"}</span>
                <button
                  onClick={() => unassignConcept.mutate(c.contractId)}
                  className="ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive transition"
                  aria-label="Remove">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          {unassignedContracts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1 rounded-full px-3 py-1 border border-dashed text-xs text-muted-foreground hover:bg-muted">
                  <Plus className="h-3 w-3" /> Assign concept
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {unassignedContracts.map((c) => {
                  const emoji = CONCEPT_EMOJI[c.conceptSlug as ConceptSlug] ?? "🎪";
                  return (
                    <DropdownMenuItem key={c.contractId}
                      onClick={() => assignConcept.mutate(c.contractId)}>
                      {emoji} {c.conceptName}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Upload zone */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Order PDF / email</h4>
        {unit.order_pdf_path ? (
          <div className="rounded-lg border p-2 flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{unit.order_pdf_path.split("/").pop()}</span>
              {unit.last_parsed_at && (
                <span className="text-[10px] text-muted-foreground italic">· AI parsed {timeAgo(unit.last_parsed_at)}</span>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={openDoc}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2"
                onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace"}
              </Button>
            </div>
            <input ref={fileRef} type="file"
              accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.eml,application/pdf,image/*"
              className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        ) : (
          <label
            className="block border-2 border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); }}
          >
            <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
            {uploading ? "Uploading…" : "Drop cooling order — AI will extract supplier, type, size, dates"}
            <input type="file"
              accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.eml,application/pdf,image/*"
              className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        )}
      </div>

      {/* Notes */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Notes</h4>
        <Textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            if (notesDraft !== (unit.notes ?? ""))
              updateUnit.mutate({ notes: notesDraft || null });
          }}
          placeholder="Order reference, special instructions, etc."
          rows={2}
        />
        {unit.parse_summary && (
          <div className="text-[11px] text-muted-foreground italic mt-1">
            AI summary: {unit.parse_summary}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t text-xs">
        <span className="text-muted-foreground italic">
          {unit.last_parsed_at ? `AI parsed ${timeAgo(unit.last_parsed_at)}` : ""}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7" disabled={!unit.order_pdf_path} onClick={openDoc}>
            Download order
          </Button>
          <Button asChild size="sm" variant="outline" className="h-7">
            <a href={`/festivals/${festivalSlug}/cooling/export`} target="_blank" rel="noopener noreferrer">Export report</a>
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cooling unit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also remove all concept assignments for "{unit.unit_label}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
