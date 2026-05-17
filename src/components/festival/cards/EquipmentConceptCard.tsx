import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ExternalLink, Plus, Trash2, Zap, Truck, MapPin, FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  ALL_CATEGORIES, CATEGORY_META, EquipCategory, EquipmentRow,
  computeConceptEquipmentStatus, groupByCategory, summarizeConceptEquipment,
} from "@/lib/equipmentStatus";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";
import { useFestivalVehicles } from "@/hooks/useFestivalVehicles";

type Vehicle = { id: string; vehicle_type: string };

const STATUS_PILL: Record<string, string> = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  gray:  "bg-muted text-muted-foreground border",
};

export interface EquipmentConceptCardProps {
  festivalId: string;
  festivalSlug: string;
  conceptSlug: ConceptSlug;
  conceptName: string;
  contractId: string;
  powerId: string;
  assignedVehicleId: string | null;
  rows: EquipmentRow[];
}

export function EquipmentConceptCard(props: EquipmentConceptCardProps) {
  const { festivalId, conceptSlug, conceptName, contractId, powerId, assignedVehicleId, rows } = props;
  const qc = useQueryClient();
  const { vehicles } = useFestivalVehicles(festivalId);
  const status = computeConceptEquipmentStatus(rows);
  const summary = summarizeConceptEquipment(rows);
  const grouped = groupByCategory(rows);
  const vehicle = vehicles.find((v) => v.id === assignedVehicleId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["equipment-page"] });
  };

  async function setVehicle(id: string | null) {
    const { error } = await supabase.from("festival_contracts")
      .update({ assigned_vehicle_id: id }).eq("id", contractId);
    if (error) return toast.error(error.message);
    invalidate();
  }

  return (
    <Card className="overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="space-y-3 pb-4 border-b bg-gradient-to-br from-card to-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl">{CONCEPT_EMOJI[conceptSlug] ?? "🍽️"}</span>
            <div className="min-w-0">
              <h3 className="font-semibold text-base truncate">{conceptName}</h3>
              <Link to={`/festivals/${props.festivalSlug}/power`}
                className="text-[11px] text-muted-foreground hover:underline inline-flex items-center gap-1">
                Power demand → <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`/festivals/${props.festivalSlug}/equipment/export?concept=${conceptSlug}`}
              target="_blank" rel="noopener noreferrer"
              title={`Export full ${conceptName} equipment card`}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border hover:bg-muted"
            >
              <FileDown className="h-3 w-3" /> Export
            </a>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_PILL[status.status]}`}>
              {status.status === "green" ? "✅" : status.status === "amber" ? "⚠️" : "—"} {status.label}
            </span>
          </div>
        </div>

        {/* Pack into vehicle */}
        <div className="flex items-center gap-2 text-xs">
          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Pack into:</span>
          <Select value={assignedVehicleId ?? "none"} onValueChange={(v) => setVehicle(v === "none" ? null : v)}>
            <SelectTrigger className="h-7 text-xs w-auto min-w-[160px] border-dashed">
              <SelectValue placeholder="— unassigned —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— unassigned —</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.vehicle_type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-2 pt-1">
          <Stat label="Items" value={summary.items} />
          <Stat label="Powered" value={summary.powered} />
          <Stat label="kW" value={summary.kw.toFixed(1)} accent="amber" />
          <Stat label="Travels with" value={vehicle ? vehicle.vehicle_type.split(" ").slice(0, 2).join(" ") : "—"} small />
        </div>
      </CardHeader>

      <CardContent className="p-0 divide-y">
        {grouped.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No equipment yet
            <div className="mt-3"><AddRow powerId={powerId} category="cooking" onAdded={invalidate} /></div>
          </div>
        ) : (
          grouped.map(([cat, items]) => (
            <CategoryBlock key={cat} cat={cat} items={items} powerId={powerId} onChange={invalidate} />
          ))
        )}
        {grouped.length > 0 && (
          <div className="p-3 bg-muted/20">
            <AddRow powerId={powerId} category="other" onAdded={invalidate} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string | number; accent?: "amber"; small?: boolean }) {
  return (
    <div className="rounded-md border bg-background/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${small ? "text-xs truncate" : "text-sm"} ${accent === "amber" ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function CategoryBlock({ cat, items, powerId, onChange }:
  { cat: EquipCategory; items: EquipmentRow[]; powerId: string; onChange: () => void }) {
  const meta = CATEGORY_META[cat] ?? { label: cat, emoji: "▫️", order: 99 };
  const types = items.length;
  const totalQty = items.reduce((s, r) => s + r.quantity, 0);
  const [adding, setAdding] = useState(false);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <span className="text-sm">{meta.emoji}</span>
          {meta.label}
          <span className="text-muted-foreground/70 font-normal normal-case">
            ({types} type{types === 1 ? "" : "s"}, {totalQty} item{totalQty === 1 ? "" : "s"})
          </span>
        </div>
        <button onClick={() => setAdding((v) => !v)}
          className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      <div className="space-y-1">
        {items.map((r) => <EquipmentRowItem key={r.id} row={r} onChange={onChange} />)}
      </div>
      {adding && (
        <div className="mt-2 pt-2 border-t border-dashed">
          <AddRow powerId={powerId} category={cat} onAdded={() => { setAdding(false); onChange(); }} compact />
        </div>
      )}
    </div>
  );
}

function EquipmentRowItem({ row, onChange }: { row: EquipmentRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.equipment_name);
  const [qty, setQty] = useState(String(row.quantity));
  const [kw, setKw] = useState(row.power_kw == null ? "" : String(row.power_kw));
  const [powered, setPowered] = useState(row.is_powered);
  const [soborg, setSoborg] = useState(row.loads_from_soborg);

  async function save() {
    const { error } = await supabase.from("festival_power_equipment").update({
      equipment_name: name.trim() || row.equipment_name,
      quantity: Math.max(1, parseInt(qty) || 1),
      power_kw: powered && kw ? Number(kw) : null,
      is_powered: powered,
      loads_from_soborg: soborg,
    }).eq("id", row.id);
    if (error) return toast.error(error.message);
    setEditing(false);
    onChange();
  }
  async function del() {
    if (!confirm(`Delete ${row.equipment_name}?`)) return;
    const { error } = await supabase.from("festival_power_equipment").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    onChange();
  }

  if (editing) {
    return (
      <div className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-2">
        <div className="grid grid-cols-12 gap-2 items-center text-xs">
          <Input className="h-7 col-span-5 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input className="h-7 col-span-2 text-xs" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" type="number" min={1} />
          <Input className="h-7 col-span-3 text-xs" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="kW" type="number" step="0.1" disabled={!powered} />
          <div className="col-span-2 flex justify-end gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={save}>Save</Button>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <label className="inline-flex items-center gap-1.5"><Switch checked={powered} onCheckedChange={setPowered} /> Powered</label>
          <label className="inline-flex items-center gap-1.5"><Switch checked={soborg} onCheckedChange={setSoborg} /> Søborg</label>
          <button onClick={del} className="ml-auto text-destructive hover:underline inline-flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
          <button onClick={() => setEditing(false)} className="hover:underline">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full text-left grid grid-cols-12 gap-2 items-center px-2 py-1.5 rounded hover:bg-muted/60 transition-colors text-xs group"
    >
      <span className="col-span-6 truncate font-medium">{row.equipment_name}</span>
      <span className="col-span-1 tabular-nums text-muted-foreground">×{row.quantity}</span>
      <span className="col-span-2 tabular-nums">
        {row.is_powered ? (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Zap className="h-3 w-3" />{row.power_kw ? `${row.power_kw} kW` : "?"}
          </span>
        ) : <span className="text-muted-foreground/50">—</span>}
      </span>
      <span className="col-span-3 text-right">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${
          row.loads_from_soborg
            ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
        }`}>
          <MapPin className="h-2.5 w-2.5" />{row.loads_from_soborg ? "Søborg" : "On-site"}
        </span>
      </span>
    </button>
  );
}

function AddRow({ powerId, category, onAdded, compact }:
  { powerId: string; category: EquipCategory; onAdded: () => void; compact?: boolean }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [cat, setCat] = useState<EquipCategory>(category);
  const [kw, setKw] = useState("");
  const [powered, setPowered] = useState(true);
  const [soborg, setSoborg] = useState(true);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    const { error } = await supabase.from("festival_power_equipment").insert({
      festival_power_id: powerId,
      equipment_name: name.trim(),
      quantity: Math.max(1, parseInt(qty) || 1),
      category: cat,
      is_powered: powered,
      power_kw: powered && kw ? Number(kw) : null,
      loads_from_soborg: soborg,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setName(""); setQty("1"); setKw("");
    onAdded();
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 items-center">
        <Input className="h-7 col-span-5 text-xs" placeholder="Equipment name"
          value={name} onChange={(e) => setName(e.target.value)} />
        <Input className="h-7 col-span-1 text-xs" placeholder="Qty" type="number" min={1}
          value={qty} onChange={(e) => setQty(e.target.value)} />
        {!compact && (
          <Select value={cat} onValueChange={(v) => setCat(v as EquipCategory)}>
            <SelectTrigger className="h-7 col-span-3 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_META[c].emoji} {CATEGORY_META[c].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input className={`h-7 ${compact ? "col-span-4" : "col-span-1"} text-xs`} placeholder="kW"
          type="number" step="0.1" value={kw} onChange={(e) => setKw(e.target.value)} disabled={!powered} />
        <Button size="sm" className="h-7 text-xs col-span-2" onClick={add} disabled={busy}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground px-1">
        <label className="inline-flex items-center gap-1.5"><Switch checked={powered} onCheckedChange={setPowered} /> Powered</label>
        <label className="inline-flex items-center gap-1.5"><Switch checked={soborg} onCheckedChange={setSoborg} /> Søborg</label>
      </div>
    </div>
  );
}
