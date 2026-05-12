import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toIsoDate } from "@/lib/parseDate";
import {
  Upload, FileText, Download, Loader2, AlertTriangle, ChevronDown, ChevronRight, Plus, Trash2,
} from "lucide-react";
import {
  computePowerStatus, POWER_STATUS_PILL, computeDemandKw,
} from "@/lib/powerStatus";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";

export interface PowerRow {
  id: string;
  festival_contract_id: string;
  status: string;
  allocated_kw: number | null;
  total_kw_estimate: number | null;
  supplier: string | null;
  order_reference: string | null;
  delivery_date: string | null;
  pickup_date: string | null;
  connections_16a_240v: number | null;
  connections_16a_400v: number | null;
  connections_32a: number | null;
  connections_63a: number | null;
  connections_125a: number | null;
  power_drawing_file_path: string | null;
  power_drawing_uploaded_at: string | null;
  last_parsed_at: string | null;
  parse_summary: string | null;
  notes: string | null;
}

export interface PowerEquipmentRow {
  id: string;
  festival_power_id: string;
  equipment_name: string;
  quantity: number | null;
  power_kw: number | null;
  power_type: string | null;
  is_powered: boolean | null;
}

interface Props {
  festivalId: string;
  festivalSlug: string;
  conceptSlug: string;
  conceptName: string;
  power: PowerRow;
  equipment: PowerEquipmentRow[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function InlineNumber({
  value, onSave, suffix, className,
}: { value: number | null; onSave: (v: number | null) => void; suffix?: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value?.toString() ?? "");
  if (!editing) {
    return (
      <button
        onClick={() => { setV(value?.toString() ?? ""); setEditing(true); }}
        className={cn("hover:underline text-left tabular-nums", className)}
      >
        {value != null && value !== 0 ? `${fmt(Number(value))}${suffix ?? ""}` : (value === 0 ? `0${suffix ?? ""}` : "—")}
      </button>
    );
  }
  return (
    <Input
      type="number" autoFocus value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); onSave(v === "" ? null : parseFloat(v)); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={cn("h-7 text-sm tabular-nums w-20", className)}
    />
  );
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
      onBlur={() => { setEditing(false); onSave(v.trim() || null); }}
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
        {value ? new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
      </button>
    );
  }
  return (
    <Input type="date" autoFocus value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); onSave(v || null); }}
      className="h-7 text-sm" />
  );
}

const CONNECTION_TYPES = [
  { key: "connections_16a_240v", label: "16A 240V", kw: 3.7 },   // 16 * 230 / 1000
  { key: "connections_16a_400v", label: "16A 400V", kw: 11.0 },  // 16 * 400 * √3 / 1000
  { key: "connections_32a", label: "32A", kw: 22.0 },            // 32 * 400 * √3 / 1000
  { key: "connections_63a", label: "63A", kw: 43.6 },
  { key: "connections_125a", label: "125A", kw: 86.6 },
] as const;

export function PowerConceptCard({
  festivalId, festivalSlug, conceptSlug, conceptName, power, equipment,
}: Props) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [notesDraft, setNotesDraft] = useState(power.notes ?? "");
  const [eqOpen, setEqOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const demand_kw = computeDemandKw(equipment);
  const allocated = Number(power.allocated_kw ?? 0);
  const status = computePowerStatus({
    status: power.status, allocated_kw: power.allocated_kw, demand_kw,
  });
  const emoji = CONCEPT_EMOJI[conceptSlug as ConceptSlug] ?? "🎪";
  const isShort = allocated > 0 && demand_kw > allocated;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["power-page", festivalSlug] });
    qc.invalidateQueries({ queryKey: ["power-equipment", festivalSlug] });
  };

  const update = useMutation({
    mutationFn: async (patch: Partial<PowerRow>) => {
      const { error } = await supabase.from("festival_power")
        .update(patch as any).eq("id", power.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${festivalId}/${conceptSlug}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from("power-drawings").upload(path, file);
      if (error) throw error;
      await supabase.from("festival_power").update({
        power_drawing_file_path: path,
        power_drawing_uploaded_at: new Date().toISOString(),
      } as any).eq("id", power.id);
      toast.success("Uploaded — parsing with AI…");
      invalidate();

      try {
        const { data: signed } = await supabase.storage.from("power-drawings").createSignedUrl(path, 600);
        if (signed?.signedUrl) {
          const { data: parsed } = await supabase.functions.invoke("parse-document", {
            body: { fileUrl: signed.signedUrl, documentType: "electricity" },
          });
          if (parsed?.ok && parsed.parsed) {
            const p = parsed.parsed as any;
            const upd: any = { last_parsed_at: new Date().toISOString() };
            if (p.supplier && !power.supplier) upd.supplier = String(p.supplier).slice(0, 200);
            if (p.order_reference && !power.order_reference) upd.order_reference = String(p.order_reference).slice(0, 100);
            { const v = toIsoDate(p.delivery_date); if (v && !power.delivery_date) upd.delivery_date = v; }
            { const v = toIsoDate(p.pickup_date); if (v && !power.pickup_date) upd.pickup_date = v; }
            if (p.total_kw_allocated != null && (!power.allocated_kw || power.allocated_kw === 0)) {
              upd.allocated_kw = Number(p.total_kw_allocated);
            }
            if (Array.isArray(p.connections)) {
              const sums: Record<string, number> = {};
              for (const c of p.connections) {
                const t = String(c.type ?? "").toLowerCase().replace(/\s+/g, "");
                const qty = Number(c.count ?? c.quantity ?? 1);
                if (!qty) continue;
                if (t.includes("16") && (t.includes("240") || t.includes("1ph") || t.includes("schuko"))) sums.connections_16a_240v = (sums.connections_16a_240v ?? 0) + qty;
                else if (t.includes("16") && (t.includes("400") || t.includes("3ph"))) sums.connections_16a_400v = (sums.connections_16a_400v ?? 0) + qty;
                else if (t.includes("32")) sums.connections_32a = (sums.connections_32a ?? 0) + qty;
                else if (t.includes("63")) sums.connections_63a = (sums.connections_63a ?? 0) + qty;
                else if (t.includes("125")) sums.connections_125a = (sums.connections_125a ?? 0) + qty;
              }
              for (const [k, v] of Object.entries(sums)) {
                if ((power as any)[k] == null || (power as any)[k] === 0) (upd as any)[k] = v;
              }
            }
            if (p.raw_notes || p.summary) upd.parse_summary = String(p.raw_notes ?? p.summary).slice(0, 500);
            await supabase.from("festival_power").update(upd).eq("id", power.id);
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

  const openDrawing = async () => {
    if (!power.power_drawing_file_path) return;
    const { data } = await supabase.storage.from("power-drawings")
      .createSignedUrl(power.power_drawing_file_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl">{emoji}</span>
          <h3 className="text-xl font-bold truncate">{conceptName}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={power.status ?? "drawing"} onValueChange={(v) => update.mutate({ status: v })}>
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="drawing">Drawing</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="installed">Installed</SelectItem>
              <SelectItem value="tested">Tested</SelectItem>
            </SelectContent>
          </Select>
          <span className={cn(
            "inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border",
            POWER_STATUS_PILL[status.status],
          )}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Shortage banner */}
      {isShort && (
        <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 flex items-start gap-2 text-sm text-rose-900 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            Equipment demand ({fmt(demand_kw)} kW) exceeds allocated ({fmt(allocated)} kW) by{" "}
            <strong>{fmt(demand_kw - allocated)} kW</strong>. Request additional capacity or remove equipment.
          </div>
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Allocated</div>
          <div className="text-lg font-semibold tabular-nums">
            <InlineNumber value={power.allocated_kw} onSave={(v) => update.mutate({ allocated_kw: v })} suffix=" kW" />
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Demand</div>
          <div className={cn("text-lg font-semibold tabular-nums", isShort && "text-rose-600 dark:text-rose-400")}>
            {fmt(demand_kw)} kW
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Supplier</div>
          <div><InlineText value={power.supplier} onSave={(v) => update.mutate({ supplier: v })} placeholder="—" /></div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Delivery</div>
          <div><InlineDate value={power.delivery_date} onSave={(v) => update.mutate({ delivery_date: v })} /></div>
        </div>
      </div>

      {/* Connections */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Connections ordered</h4>
        <div className="grid grid-cols-5 gap-2">
          {CONNECTION_TYPES.map((c) => {
            const v = (power as any)[c.key] as number | null;
            return (
              <div key={c.key} className="rounded-lg border bg-muted/30 p-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
                <div className="text-lg font-bold mt-0.5">
                  <InlineNumber value={v ?? 0} onSave={(nv) => update.mutate({ [c.key]: nv ?? 0 } as any)} className="text-center" />
                </div>
              </div>
            );
          })}
        </div>
        {(() => {
          const orderedKw = CONNECTION_TYPES.reduce(
            (sum, c) => sum + (Number((power as any)[c.key] ?? 0) * c.kw), 0,
          );
          if (orderedKw === 0 && demand_kw === 0) return null;
          const diff = orderedKw - demand_kw;
          const ok = diff >= 0;
          // Suggest extra 32A 3ph circuits if short
          const extra32 = ok ? 0 : Math.ceil(Math.abs(diff) / 22.0);
          return (
            <div className={cn(
              "mt-2 rounded-lg border p-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1",
              ok
                ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200"
                : "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200",
            )}>
              <span className="tabular-nums">Ordered ≈ <strong>{fmt(orderedKw)} kW</strong></span>
              <span className="tabular-nums">Equipment needs <strong>{fmt(demand_kw)} kW</strong></span>
              {ok ? (
                <span className="tabular-nums">→ surplus {fmt(diff)} kW ✓</span>
              ) : (
                <span className="tabular-nums">
                  → short <strong>{fmt(-diff)} kW</strong> · order ≈ {extra32}× 32A 3ph more
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* Equipment */}
      <div>
        <button
          onClick={() => setEqOpen((o) => !o)}
          className="flex items-center gap-1 text-sm font-semibold w-full"
        >
          {eqOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Powered equipment ({equipment.filter((e) => e.is_powered !== false).length} items)
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{fmt(demand_kw)} kW</span>
        </button>
        {eqOpen && (
          <div className="mt-2 rounded-lg border divide-y text-xs">
            {equipment.filter((e) => e.is_powered !== false).length === 0 ? (
              <div className="p-3 text-muted-foreground italic">No powered equipment yet — manage on /equipment.</div>
            ) : (
              equipment.filter((e) => e.is_powered !== false).map((e) => {
                const total = Number(e.power_kw ?? 0) * Number(e.quantity ?? 1);
                return (
                  <div key={e.id} className="grid grid-cols-12 gap-2 p-2 items-center">
                    <div className="col-span-6 truncate">{e.equipment_name}</div>
                    <div className="col-span-2 text-right tabular-nums">×{e.quantity ?? 1}</div>
                    <div className="col-span-2 text-right tabular-nums text-muted-foreground">{fmt(Number(e.power_kw ?? 0))} kW</div>
                    <div className="col-span-2 text-right tabular-nums font-medium">{fmt(total)} kW</div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Upload */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Power order PDF / email / Excel</h4>
        {power.power_drawing_file_path ? (
          <div className="rounded-lg border p-2 flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{power.power_drawing_file_path.split("/").pop()}</span>
              {power.last_parsed_at && (
                <span className="text-[10px] text-muted-foreground italic">· AI parsed {timeAgo(power.last_parsed_at)}</span>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={openDrawing}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2"
                onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace"}
              </Button>
            </div>
            <input ref={fileRef} type="file"
              accept=".pdf,.docx,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.eml,application/pdf,image/*"
              className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        ) : (
          <label
            className="block border-2 border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); }}
          >
            <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
            {uploading ? "Uploading…" : "Drop electricity order — AI will extract supplier, kW total, connection breakdown"}
            <input type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.eml,application/pdf,image/*"
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
            if (notesDraft !== (power.notes ?? ""))
              update.mutate({ notes: notesDraft || null });
          }}
          placeholder="Order reference, contact, special requirements…"
          rows={3}
        />
        {power.parse_summary && (
          <div className="text-[11px] text-muted-foreground italic mt-1">
            AI summary: {power.parse_summary}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t text-xs">
        <span className="text-muted-foreground italic">
          {power.last_parsed_at ? `AI parsed ${timeAgo(power.last_parsed_at)}` : ""}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7" disabled={!power.power_drawing_file_path} onClick={openDrawing}>
            Download order
          </Button>
          <Button asChild size="sm" variant="outline" className="h-7">
            <a href={`/festivals/${festivalSlug}/power/export`} target="_blank" rel="noopener noreferrer">Export report</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
