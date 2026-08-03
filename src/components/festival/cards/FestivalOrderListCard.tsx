import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Loader2, Plus, Trash2, Save, Sparkles, Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderItem {
  id: string;
  festival_power_id: string;
  category: string | null;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
  notes: string | null;
  position: number;
}

const CATEGORIES = [
  "tent", "electricity", "water", "waste", "furniture", "lighting",
  "decor", "signage", "kitchen", "cleaning", "security", "internet", "other",
];

const CONNECTION_KW: Record<string, number> = {
  connections_16a_240v: 3.7,
  connections_16a_400v: 11.0,
  connections_32a: 22.0,
  connections_63a: 43.6,
  connections_125a: 86.6,
};

/** Turn parsed order rows into the electricity order (connection counts, kW, cost). */
function deriveElectricityOrder(
  rows: { category: string | null; item_name: string; quantity: number | null; unit: string | null; notes: string | null; total_price: number | null; currency: string | null }[],
) {
  const counts = {
    connections_16a_240v: 0,
    connections_16a_400v: 0,
    connections_32a: 0,
    connections_63a: 0,
    connections_125a: 0,
  };
  let cost = 0;
  let sawElectricity = false;
  let hasConnections = false;

  for (const r of rows) {
    const raw = `${r.item_name ?? ""} ${r.unit ?? ""} ${r.notes ?? ""}`.toLowerCase();
    const text = raw.replace(/\s+/g, "");
    const isElectric =
      r.category === "electricity" ||
      /\d+a\b|amp|ampere|kw|str[oø]m|power|el-|stik|schuko|cee/.test(text);
    if (!isElectric) continue;
    sawElectricity = true;
    if (r.total_price != null) cost += Number(r.total_price);

    const qty = Math.max(1, Math.round(Number(r.quantity ?? 1)));
    // Pick the largest amp figure mentioned and snap it to the nearest
    // standard connection size (e.g. "64 A" → 63A, "125A" → 125A).
    const amps = Array.from(raw.matchAll(/(\d{1,3})\s*a(?:mp(?:ere)?)?(?![a-z0-9])/g))
      .map((m) => Number(m[1]))
      .filter((n) => n >= 6 && n <= 400);
    const amp = amps.length ? Math.max(...amps) : null;
    let key: keyof typeof counts | null = null;
    if (amp != null) {
      if (amp >= 90) key = "connections_125a";
      else if (amp >= 45) key = "connections_63a";
      else if (amp >= 24) key = "connections_32a";
      else {
        key = /400|3ph|3-ph|trefaset/.test(text)
          ? "connections_16a_400v"
          : "connections_16a_240v";
      }
    }

    if (key) {
      counts[key] += qty;
      hasConnections = true;
    }
  }

  const allocated_kw = hasConnections
    ? Number(
        Object.entries(counts)
          .reduce((sum, [k, n]) => sum + n * (CONNECTION_KW[k] ?? 0), 0)
          .toFixed(1),
      )
    : null;

  return {
    ...counts,
    hasConnections,
    allocated_kw,
    cost_dkk: sawElectricity && cost > 0 ? Number(cost.toFixed(2)) : null,
  };
}

interface Props {
  festivalId: string;
  conceptSlug: string;
  conceptName: string;
  powerId: string;
  orderListFilePath: string | null;
  orderListParsedAt: string | null;
  onPowerUpdated?: () => void;
}

export function FestivalOrderListCard({
  festivalId, conceptSlug, conceptName, powerId, orderListFilePath, orderListParsedAt,
  onPowerUpdated,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("festival_power_order_items")
      .select("*")
      .eq("festival_power_id", powerId)
      .order("position", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data as OrderItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [powerId, orderListFilePath, orderListParsedAt]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${festivalId}/${conceptSlug}/order-list/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from("power-drawings").upload(path, file);
      if (error) throw error;
      await supabase.from("festival_power")
        .update({ order_list_file_path: path } as any)
        .eq("id", powerId);

      // Find tent-mates: other concepts sharing the same tent on this festival.
      // We use festival_contracts.tent_primary_contract_id to detect tent groups.
      const { data: myPow } = await supabase
        .from("festival_power")
        .select("festival_contract_id")
        .eq("id", powerId)
        .maybeSingle();
      const myContractId = (myPow as any)?.festival_contract_id as string | undefined;

      const { data: myContract } = myContractId
        ? await supabase
            .from("festival_contracts")
            .select("id, tent_primary_contract_id")
            .eq("id", myContractId)
            .maybeSingle()
        : { data: null as any };
      const primaryId =
        (myContract as any)?.tent_primary_contract_id ?? (myContract as any)?.id ?? null;

      // All sibling contracts in the same tent group (primary + secondaries) on this festival
      type Sibling = {
        contract_id: string;
        concept_name: string;
        concept_slug: string | null;
        power_id: string;
      };
      const siblings: Sibling[] = [];
      if (primaryId) {
        const { data: sibContracts } = await supabase
          .from("festival_contracts")
          .select("id, concept_id, tent_primary_contract_id, concepts:concept_id(name, slug)")
          .eq("festival_id", festivalId)
          .eq("is_active", true)
          .or(`id.eq.${primaryId},tent_primary_contract_id.eq.${primaryId}`);
        const contractIds = (sibContracts ?? []).map((c: any) => c.id);
        const { data: sibPowers } = contractIds.length
          ? await supabase
              .from("festival_power")
              .select("id, festival_contract_id")
              .in("festival_contract_id", contractIds)
          : { data: [] as any[] };
        const powerByContract = new Map<string, string>();
        (sibPowers ?? []).forEach((p: any) =>
          powerByContract.set(p.festival_contract_id, p.id),
        );
        (sibContracts ?? []).forEach((c: any) => {
          const pid = powerByContract.get(c.id);
          if (pid && c.concepts?.name) {
            siblings.push({
              contract_id: c.id,
              concept_name: c.concepts.name,
              concept_slug: c.concepts.slug ?? null,
              power_id: pid,
            });
          }
        });
      }
      if (!siblings.some((s) => s.power_id === powerId)) {
        siblings.push({
          contract_id: myContractId ?? powerId,
          concept_name: conceptName,
          concept_slug: conceptSlug,
          power_id: powerId,
        });
      }
      const tentMates = siblings
        .filter((s) => s.power_id !== powerId)
        .map((s) => ({ name: s.concept_name, slug: s.concept_slug }));

      toast.success("Uploaded — parsing with AI…");

      setParsing(true);
      const { data: signed } = await supabase.storage.from("power-drawings").createSignedUrl(path, 600);
      if (!signed?.signedUrl) throw new Error("Could not sign upload");

      const { data: parsed, error: pErr } = await supabase.functions.invoke("parse-document", {
        body: {
          fileUrl: signed.signedUrl,
          documentType: "festival_order",
          context: {
            concept_name: conceptName,
            concept_slug: conceptSlug,
            tent_mates: tentMates,
          },
        },
      });
      if (pErr) throw pErr;
      if (!parsed?.ok) throw new Error(parsed?.message ?? "Parse failed");

      const rawItems = (parsed.parsed?.items ?? []) as any[];
      const filteredItems = rawItems.filter((it) => Number(it.quantity ?? 1) > 0);
      if (filteredItems.length === 0) {
        toast.message(
          rawItems.length > 0
            ? "The form looks blank — no filled-in quantities found. Add items manually."
            : "AI parsed but found no items — add manually",
        );
      } else {


        // Build {normalized concept name/slug/aliases -> power_id} for routing
        const normalize = (s: string) =>
          (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const powerByConcept = new Map<string, string>();
        const addConceptAlias = (alias: string | null | undefined, pid: string) => {
          const key = normalize(alias ?? "");
          if (key) powerByConcept.set(key, pid);
        };
        siblings.forEach((s) => {
          addConceptAlias(s.concept_name, s.power_id);
          addConceptAlias(s.concept_slug, s.power_id);
          s.concept_name.split(/&|\+|\/|\band\b|\bog\b/i).forEach((part) =>
            addConceptAlias(part, s.power_id),
          );
        });
        powerByConcept.set(normalize(conceptName), powerId);
        powerByConcept.set(normalize(conceptSlug), powerId);

        // Group items by target power_id
        const groups = new Map<string, any[]>();
        filteredItems.forEach((it) => {
          const target =
            (it.concept_name && powerByConcept.get(normalize(String(it.concept_name)))) ||
            powerId;
          if (!groups.has(target)) groups.set(target, []);
          groups.get(target)!.push(it);
        });

        // Insert per group, set source_file_path on each, positions per group
        let importedTotal = 0;
        for (const [targetPowerId, list] of groups.entries()) {
          // Get current item count for that power to continue position
          const { count } = await supabase
            .from("festival_power_order_items")
            .select("*", { count: "exact", head: true })
            .eq("festival_power_id", targetPowerId);
          const startPos = count ?? 0;
          const rows = list.map((it, i) => ({
            festival_power_id: targetPowerId,
            category: typeof it.category === "string" ? it.category.toLowerCase().slice(0, 40) : "other",
            item_name: String(it.item_name ?? "Unnamed").slice(0, 200),
            quantity: it.quantity != null ? Number(it.quantity) : 1,
            unit: it.unit ? String(it.unit).slice(0, 20) : null,
            unit_price: it.unit_price != null ? Number(it.unit_price) : null,
            total_price: it.total_price != null ? Number(it.total_price) : null,
            currency: it.currency ? String(it.currency).slice(0, 8) : null,
            notes: it.notes ? String(it.notes).slice(0, 400) : null,
            source_file_path: path,
            position: startPos + i,
          }));
          const { error: insErr } = await supabase
            .from("festival_power_order_items")
            .insert(rows as any);
          if (insErr) throw insErr;
          importedTotal += rows.length;

          // Derive the electricity order (connections, kW, cost) from the parsed rows
          const elec = deriveElectricityOrder(rows);
          const powerPatch: Record<string, any> = {
            order_list_parsed_at: new Date().toISOString(),
            ...(targetPowerId !== powerId ? { order_list_file_path: path } : {}),
          };
          if (elec.hasConnections) {
            powerPatch.connections_16a_240v = elec.connections_16a_240v;
            powerPatch.connections_16a_400v = elec.connections_16a_400v;
            powerPatch.connections_32a = elec.connections_32a;
            powerPatch.connections_63a = elec.connections_63a;
            powerPatch.connections_125a = elec.connections_125a;
            powerPatch.allocated_kw = elec.allocated_kw;
          }
          if (elec.cost_dkk != null) powerPatch.cost_dkk = elec.cost_dkk;
          await supabase.from("festival_power").update(powerPatch as any).eq("id", targetPowerId);
        }

        const groupCount = groups.size;
        toast.success(
          groupCount > 1
            ? `Imported ${importedTotal} items across ${groupCount} stands — please review`
            : `Imported ${importedTotal} items — please review`,
        );
      }
      await supabase.from("festival_power")
        .update({ order_list_parsed_at: new Date().toISOString() } as any)
        .eq("id", powerId);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload/parse failed");
    } finally {
      setUploading(false);
      setParsing(false);
    }
  };

  const openFile = async () => {
    if (!orderListFilePath) return;
    const { data } = await supabase.storage.from("power-drawings")
      .createSignedUrl(orderListFilePath, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const recalculate = async () => {
    setRecalculating(true);
    try {
      const elec = deriveElectricityOrder(items);
      const patch: Record<string, any> = {
        connections_16a_240v: elec.connections_16a_240v,
        connections_16a_400v: elec.connections_16a_400v,
        connections_32a: elec.connections_32a,
        connections_63a: elec.connections_63a,
        connections_125a: elec.connections_125a,
        allocated_kw: elec.allocated_kw,
        cost_dkk: elec.cost_dkk,
      };
      const { error } = await supabase.from("festival_power").update(patch as any).eq("id", powerId);
      if (error) throw error;
      onPowerUpdated?.();
      toast.success(
        elec.hasConnections
          ? `Electricity order updated — ${elec.allocated_kw} kW${elec.cost_dkk ? `, ${elec.cost_dkk.toLocaleString()} DKK` : ""}`
          : "No electricity lines found — connections cleared",
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Recalculate failed");
    } finally {
      setRecalculating(false);
    }
  };

  const addRow = async () => {
    const nextPos = items.reduce((m, x) => Math.max(m, x.position), -1) + 1;
    const { error } = await supabase.from("festival_power_order_items").insert({
      festival_power_id: powerId,
      item_name: "New item",
      category: "other",
      quantity: 1,
      position: nextPos,
    } as any);
    if (error) toast.error(error.message); else load();
  };


  const totalAll = items.reduce((s, it) => s + Number(it.total_price ?? 0), 0);
  const currency = items.find((i) => i.currency)?.currency ?? "DKK";

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-bold">Festival order list</h3>
          {orderListParsedAt && (
            <span className="text-[11px] text-muted-foreground italic">
              AI parsed {new Date(orderListParsedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {orderListFilePath && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openFile}>
              <Download className="h-3.5 w-3.5" /> Source
            </Button>
          )}
          <Button
            size="sm" variant="outline" className="h-7 text-xs gap-1"
            disabled={recalculating || loading || uploading || parsing}
            onClick={recalculate}
            title="Recompute connections, allocated kW and cost from the list below"
          >
            {recalculating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Recalculate electricity order
          </Button>

          <input
            ref={fileRef} type="file" className="hidden"
            accept=".pdf,.xlsx,.xls,.csv,.docx,.eml,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <Button
            size="sm" className="h-7 text-xs gap-1"
            disabled={uploading || parsing}
            onClick={() => fileRef.current?.click()}
          >
            {uploading || parsing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Upload className="h-3.5 w-3.5" />}
            {parsing ? "Parsing…" : uploading ? "Uploading…" : "Upload order list"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Upload the festival's order document (PDF, Excel, Word, email). AI extracts every line — tent, electricity, water, etc. — and you can edit before saving.
      </p>

      {loading ? (
        <div className="text-sm text-muted-foreground italic">Loading…</div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span>Order items</span>
              {items.length > 0 && <span>{items.length} lines</span>}
            </div>
            {items.length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground italic">
                No items yet — upload an order list above or add rows manually.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((it) => (
                  <ItemRow key={it.id} row={it} onChanged={load} />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button size="sm" variant="outline" className="h-9 w-full gap-2 sm:w-auto" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </Button>
            {totalAll > 0 && (
              <div className="text-right text-base font-semibold tabular-nums">
                Total: {totalAll.toLocaleString()} {currency}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function parseNum(v: string): number | null {
  if (v.trim() === "") return null;
  const cleaned = v.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function ItemRow({ row, onChanged }: { row: OrderItem; onChanged: () => void }) {
  const [r, setR] = useState(row);
  const [qtyStr, setQtyStr] = useState(row.quantity?.toString() ?? "");
  const [unitPriceStr, setUnitPriceStr] = useState(row.unit_price?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setR(row);
    setQtyStr(row.quantity?.toString() ?? "");
    setUnitPriceStr(row.unit_price?.toString() ?? "");
  }, [row.id]);

  const qty = parseNum(qtyStr);
  const unitPrice = parseNum(unitPriceStr);
  const computedTotal = qty != null && unitPrice != null ? qty * unitPrice : r.total_price;

  const dirty =
    r.category !== row.category ||
    r.item_name !== row.item_name ||
    qty !== row.quantity ||
    r.unit !== row.unit ||
    unitPrice !== row.unit_price ||
    computedTotal !== row.total_price ||
    r.notes !== row.notes;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("festival_power_order_items").update({
      category: r.category,
      item_name: r.item_name,
      quantity: qty,
      unit: r.unit,
      unit_price: unitPrice,
      total_price: computedTotal,
      notes: r.notes,
    } as any).eq("id", r.id);
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Saved"); onChanged(); }
  };

  const remove = async () => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("festival_power_order_items").delete().eq("id", r.id);
    if (error) toast.error(error.message); else onChanged();
  };

  const noSpin = "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
  const labelClass = "text-[10px] font-medium uppercase tracking-wider text-muted-foreground";
  const inputClass = "h-10 text-sm";

  return (
    <div className={cn("rounded-lg border bg-card p-3 space-y-3", dirty && "border-primary/30 bg-accent/20")}>
      <div className="grid gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className={labelClass}>Category</div>
        <Select value={r.category ?? "other"} onValueChange={(v) => setR({ ...r, category: v })}>
            <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
        <label className="space-y-1.5 min-w-0">
          <div className={labelClass}>Item</div>
          <Input className={inputClass} value={r.item_name}
            onChange={(e) => setR({ ...r, item_name: e.target.value })} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5 min-w-0">
          <div className={labelClass}>Quantity</div>
          <Input className={cn(inputClass, "text-right tabular-nums", noSpin)}
            type="text" inputMode="decimal" placeholder="0"
            value={qtyStr} onChange={(e) => setQtyStr(e.target.value)} />
        </label>
        <label className="space-y-1.5 min-w-0">
          <div className={labelClass}>Unit</div>
          <Input className={inputClass} value={r.unit ?? ""}
            onChange={(e) => setR({ ...r, unit: e.target.value || null })} />
        </label>
        <label className="space-y-1.5 min-w-0">
          <div className={labelClass}>Unit price</div>
          <Input className={cn(inputClass, "text-right tabular-nums", noSpin)}
            type="text" inputMode="decimal" placeholder="0.00"
            value={unitPriceStr} onChange={(e) => setUnitPriceStr(e.target.value)} />
        </label>
        <div className="space-y-1.5 min-w-0">
          <div className={labelClass}>Total</div>
          <div className="flex h-10 items-center justify-end rounded-md border bg-muted/40 px-3 text-sm tabular-nums text-foreground" title="Auto = quantity × unit price">
            {computedTotal != null ? computedTotal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="space-y-1.5 min-w-0">
          <div className={labelClass}>Notes</div>
          <Input className={inputClass} value={r.notes ?? ""}
            onChange={(e) => setR({ ...r, notes: e.target.value || null })} />
        </label>
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" className="h-10 gap-2" disabled={!dirty || saving} onClick={save} title="Save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
        </Button>
          <Button size="sm" variant="ghost" className="h-10 w-10 p-0 text-destructive" onClick={remove} title="Delete">
            <Trash2 className="h-4 w-4" />
        </Button>
        </div>
      </div>
    </div>
  );
}
