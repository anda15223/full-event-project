import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Package, AlertTriangle, Download, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  projectStock, type StockDay,
} from "@/lib/groceriesCalc";
import type { StallDistributionRow } from "@/pages/festival/FestivalGroceriesTrolleys";

// ----------------------- types -----------------------
type Ingredient = { id: string; name: string; supplier_id: string | null; pack_size: number | null; pack_label: string | null; unit: "g" | "stk" };
type Supplier = { id: string; name: string };
type Festival = { id: string; slug: string; name: string; start_date: string | null; end_date: string | null };
type Pool = { id: string; name: string; notes: string | null };
type PoolMember = { pool_id: string; festival_id: string; sort_order: number };
type Delivery = {
  id: string; pool_id: string; ingredient_id: string; packs: number;
  delivery_date: string | null; note: string | null;
  source_order_supplier_id: string | null; source_order_festival_id: string | null;
};

const num = (v: any) => Number(v) || 0;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function daysBetween(a: string, b: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = a.slice(0, 10).split("-").map(Number);
  const [ye, me, de] = b.slice(0, 10).split("-").map(Number);
  if (!ys || !ye) return out;
  const s = new Date(ys, ms - 1, ds);
  const e = new Date(ye, me - 1, de);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(ymd(d));
  return out;
}

// ================================================================
// Hooks
// ================================================================
export function usePoolForFestival(festivalId: string | null | undefined) {
  return useQuery({
    queryKey: ["grocery_stock_pool_for_festival", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: link } = await supabase
        .from("grocery_stock_pool_festival")
        .select("pool_id")
        .eq("festival_id", festivalId!)
        .maybeSingle();
      if (!link?.pool_id) return null;
      const { data: pool } = await supabase
        .from("grocery_stock_pool")
        .select("*")
        .eq("id", link.pool_id)
        .maybeSingle();
      return (pool ?? null) as Pool | null;
    },
  });
}

// ================================================================
// Compute opening stock at each festival's start (used by Trolley source labels)
// ================================================================
export function useOpeningStockForFestival(
  festivalId: string | null | undefined,
  distribution: StallDistributionRow[],
) {
  return useQuery({
    queryKey: ["grocery_stock_opening", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: link } = await supabase
        .from("grocery_stock_pool_festival")
        .select("pool_id")
        .eq("festival_id", festivalId!)
        .maybeSingle();
      if (!link?.pool_id) return { poolId: null as string | null, opening: new Map<string, number>() };

      const { data: members } = await supabase
        .from("grocery_stock_pool_festival")
        .select("festival_id, sort_order")
        .eq("pool_id", link.pool_id);
      const { data: fests } = await supabase
        .from("festivals").select("id, start_date, end_date")
        .in("id", (members ?? []).map((m: any) => m.festival_id));
      const meRow = fests?.find((f: any) => f.id === festivalId);
      if (!meRow?.start_date) return { poolId: link.pool_id, opening: new Map<string, number>() };

      const { data: deliveries } = await supabase
        .from("grocery_stock_delivery")
        .select("ingredient_id, packs, delivery_date")
        .eq("pool_id", link.pool_id)
        .lt("delivery_date", meRow.start_date);

      // Prior festivals in this pool that end before current festival starts consume stock.
      // We approximate consumption as festival ordered packs of prior festivals (which
      // equals the trolley total for each). This is a safe upper-bound proxy —
      // more granular per-day math not needed for opening-balance labeling.
      // For now, we only subtract deliveries dated before current start; consumption
      // from prior festivals is subtracted in the coverage table via projectStock.
      const opening = new Map<string, number>();
      for (const d of deliveries ?? []) {
        opening.set(d.ingredient_id, (opening.get(d.ingredient_id) ?? 0) + num((d as any).packs));
      }
      return { poolId: link.pool_id, opening };
    },
  });
}

// ================================================================
// Stock tab
// ================================================================
export default function GroceryStockTab({
  festival, ingredients, suppliers, distribution, festivalDailyConsumption,
}: {
  festival: Festival;
  ingredients: Ingredient[];
  suppliers: Supplier[];
  distribution: StallDistributionRow[];
  // ingredient_id -> day -> packs consumed on that day at this festival
  festivalDailyConsumption: Map<string, Map<string, number>>;
}) {
  const qc = useQueryClient();

  // ------------------- Pool + members -------------------
  const poolLinkQ = useQuery({
    queryKey: ["grocery_stock_pool_link", festival.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("grocery_stock_pool_festival")
        .select("pool_id")
        .eq("festival_id", festival.id)
        .maybeSingle();
      return data?.pool_id ?? null;
    },
  });
  const poolId = poolLinkQ.data ?? null;

  const poolsQ = useQuery({
    queryKey: ["grocery_stock_pools"],
    queryFn: async () => {
      const { data } = await supabase.from("grocery_stock_pool").select("*").order("name");
      return (data ?? []) as Pool[];
    },
  });

  const membersQ = useQuery({
    queryKey: ["grocery_stock_pool_members", poolId],
    enabled: !!poolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("grocery_stock_pool_festival")
        .select("pool_id, festival_id, sort_order")
        .eq("pool_id", poolId!)
        .order("sort_order");
      return (data ?? []) as PoolMember[];
    },
  });

  const memberFestivalsQ = useQuery({
    queryKey: ["grocery_stock_pool_member_festivals", poolId, membersQ.data?.length ?? 0],
    enabled: !!poolId && (membersQ.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (membersQ.data ?? []).map(m => m.festival_id);
      const { data } = await supabase.from("festivals")
        .select("id, slug, name, start_date, end_date").in("id", ids);
      return (data ?? []) as Festival[];
    },
  });

  const deliveriesQ = useQuery({
    queryKey: ["grocery_stock_deliveries", poolId],
    enabled: !!poolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("grocery_stock_delivery")
        .select("*")
        .eq("pool_id", poolId!)
        .order("delivery_date", { ascending: true });
      return (data ?? []) as Delivery[];
    },
  });

  const pool = poolsQ.data?.find(p => p.id === poolId) ?? null;
  const members = membersQ.data ?? [];
  const memberFestivals = memberFestivalsQ.data ?? [];
  const deliveries = deliveriesQ.data ?? [];

  // ordered festivals (chronological)
  const orderedFestivals = useMemo(() => {
    const arr = memberFestivals.slice();
    arr.sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));
    return arr;
  }, [memberFestivals]);

  const tourDays = useMemo(() => {
    const days: { day: string; festival: Festival }[] = [];
    for (const f of orderedFestivals) {
      if (!f.start_date || !f.end_date) continue;
      for (const d of daysBetween(f.start_date, f.end_date)) days.push({ day: d, festival: f });
    }
    return days;
  }, [orderedFestivals]);

  // ------------------- Consumption across tour -------------------
  // For the CURRENT festival we have festivalDailyConsumption from parent.
  // For OTHER festivals in the pool, we'd need the same per-day allocation.
  // Simplification: fetch each other festival's grocery data lazily is heavy.
  // For now, subtract only current festival's consumption in projection; prior/next
  // festivals contribute delivery events but no consumption (this over-estimates
  // remaining for other festivals). This is a known trade-off — coverage table
  // is authoritative for the current festival only; a future pass can aggregate
  // across the pool once the same distribution is precomputed per festival.
  const consumption = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const [ing, dayMap] of festivalDailyConsumption) {
      const inner = new Map(dayMap);
      m.set(ing, inner);
    }
    return m;
  }, [festivalDailyConsumption]);

  const ingredientIds = useMemo(() => {
    const set = new Set<string>();
    for (const d of deliveries) set.add(d.ingredient_id);
    for (const [ing] of consumption) set.add(ing);
    return Array.from(set);
  }, [deliveries, consumption]);

  const projection = useMemo(() => projectStock({
    ingredientIds,
    tourDays: tourDays.map(t => t.day),
    deliveries: deliveries.map(d => ({ ingredient_id: d.ingredient_id, packs: num(d.packs), delivery_date: d.delivery_date })),
    consumption,
  }), [ingredientIds, tourDays, deliveries, consumption]);

  // ------------------- Handlers -------------------
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["grocery_stock_pool_link", festival.id] });
    qc.invalidateQueries({ queryKey: ["grocery_stock_pool_for_festival", festival.id] });
    qc.invalidateQueries({ queryKey: ["grocery_stock_pool_members", poolId] });
    qc.invalidateQueries({ queryKey: ["grocery_stock_pool_member_festivals", poolId] });
    qc.invalidateQueries({ queryKey: ["grocery_stock_deliveries", poolId] });
    qc.invalidateQueries({ queryKey: ["grocery_stock_opening", festival.id] });
  };

  const joinPool = async (targetPoolId: string) => {
    const nextOrder = (members[members.length - 1]?.sort_order ?? -1) + 1;
    const { error } = await supabase.from("grocery_stock_pool_festival")
      .upsert({ pool_id: targetPoolId, festival_id: festival.id, sort_order: nextOrder }, { onConflict: "festival_id" });
    if (error) { toast.error(error.message); return; }
    invalidateAll();
  };
  const leavePool = async () => {
    if (!confirm("Remove this festival from the stock pool?")) return;
    const { error } = await supabase.from("grocery_stock_pool_festival").delete().eq("festival_id", festival.id);
    if (error) { toast.error(error.message); return; }
    invalidateAll();
  };
  const createPool = async (name: string) => {
    if (!name.trim()) return;
    const { data, error } = await supabase.from("grocery_stock_pool").insert({ name: name.trim() }).select().single();
    if (error) { toast.error(error.message); return; }
    await joinPool(data!.id);
    qc.invalidateQueries({ queryKey: ["grocery_stock_pools"] });
  };

  const addDelivery = async (row: { ingredient_id: string; packs: number; delivery_date: string; note?: string }) => {
    if (!poolId) return;
    const { error } = await supabase.from("grocery_stock_delivery").insert({
      pool_id: poolId, ingredient_id: row.ingredient_id, packs: row.packs,
      delivery_date: row.delivery_date, note: row.note ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Delivery recorded");
    invalidateAll();
  };
  const deleteDelivery = async (id: string) => {
    const { error } = await supabase.from("grocery_stock_delivery").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidateAll();
  };

  // Top-up generation: shortage = max negative remaining per ingredient
  const shortages = useMemo(() => {
    type Sh = { ing: Ingredient; packs: number; onDay: string; festivalName: string };
    const out: Sh[] = [];
    const ingById = new Map(ingredients.map(i => [i.id, i]));
    const dayToFestName = new Map(tourDays.map(t => [t.day, t.festival.name]));
    for (const [ingId, days] of projection) {
      let worst = 0; let worstDay = ""; let worstFest = "";
      for (const dd of days) {
        if (dd.remaining < worst) { worst = dd.remaining; worstDay = dd.day; worstFest = dayToFestName.get(dd.day) ?? ""; }
      }
      const ing = ingById.get(ingId);
      if (worst < 0 && ing) out.push({ ing, packs: Math.ceil(-worst), onDay: worstDay, festivalName: worstFest });
    }
    return out;
  }, [projection, ingredients, tourDays]);

  const generateTopUp = async () => {
    if (!poolId) return;
    if (shortages.length === 0) { toast.info("No shortages — nothing to top up."); return; }
    const bySupplier = new Map<string, { supplier_id: string; date: string; items: { ingredient_id: string; packs: number }[] }>();
    for (const s of shortages) {
      const supId = s.ing.supplier_id;
      if (!supId) continue;
      // Deliver the day before the first short day
      const [y, m, d] = s.onDay.split("-").map(Number);
      const dt = new Date(y, m - 1, d - 1);
      const dateStr = ymd(dt);
      const key = `${supId}|${dateStr}`;
      const entry = bySupplier.get(key) ?? { supplier_id: supId, date: dateStr, items: [] };
      entry.items.push({ ingredient_id: s.ing.id, packs: s.packs });
      bySupplier.set(key, entry);
    }
    for (const e of bySupplier.values()) {
      const { data: t, error } = await supabase.from("grocery_stock_topup")
        .insert({ pool_id: poolId, supplier_id: e.supplier_id, delivery_date: e.date, status: "draft" })
        .select().single();
      if (error) { toast.error(error.message); continue; }
      const items = e.items.map(it => ({ topup_id: t!.id, ingredient_id: it.ingredient_id, packs: it.packs }));
      const { error: iErr } = await supabase.from("grocery_stock_topup_item").insert(items);
      if (iErr) toast.error(iErr.message);
    }
    toast.success(`Generated ${bySupplier.size} top-up draft(s)`);
    qc.invalidateQueries({ queryKey: ["grocery_stock_topups", poolId] });
  };

  // ---- Top-up drafts panel ----
  const topupsQ = useQuery({
    queryKey: ["grocery_stock_topups", poolId],
    enabled: !!poolId,
    queryFn: async () => {
      const { data: t } = await supabase.from("grocery_stock_topup")
        .select("*").eq("pool_id", poolId!).order("delivery_date");
      const ids = (t ?? []).map((x: any) => x.id);
      const { data: items } = ids.length
        ? await supabase.from("grocery_stock_topup_item").select("*").in("topup_id", ids)
        : { data: [] as any[] };
      return { topups: (t ?? []) as any[], items: (items ?? []) as any[] };
    },
  });

  const markTopupSent = async (topup: any, items: any[]) => {
    if (!poolId) return;
    // Convert items into deliveries
    const rows = items.filter(it => it.topup_id === topup.id).map(it => ({
      pool_id: poolId, ingredient_id: it.ingredient_id, packs: it.packs,
      delivery_date: topup.delivery_date, note: `Top-up from ${suppliers.find(s => s.id === topup.supplier_id)?.name ?? "supplier"}`,
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("grocery_stock_delivery").insert(rows);
      if (error) { toast.error(error.message); return; }
    }
    const { error: uErr } = await supabase.from("grocery_stock_topup").update({ status: "sent" }).eq("id", topup.id);
    if (uErr) { toast.error(uErr.message); return; }
    toast.success("Top-up received into stock");
    invalidateAll();
    qc.invalidateQueries({ queryKey: ["grocery_stock_topups", poolId] });
  };

  const deleteTopup = async (id: string) => {
    if (!confirm("Delete this top-up draft?")) return;
    const { error } = await supabase.from("grocery_stock_topup").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["grocery_stock_topups", poolId] });
  };

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------
  if (!poolId) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium">This festival is not in a stock pool</div>
              <div className="text-sm text-muted-foreground">
                Nothing changes — orders and trolleys work normally. Add this festival to a shared stock pool to reuse deliveries across a tour.
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Select onValueChange={(v) => joinPool(v)}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Join an existing pool…" /></SelectTrigger>
              <SelectContent>
                {(poolsQ.data ?? []).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
                {(poolsQ.data ?? []).length === 0 && (
                  <div className="text-xs text-muted-foreground p-2">No pools yet.</div>
                )}
              </SelectContent>
            </Select>
            <NewPoolButton onCreate={createPool} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Stock pool</div>
          <div className="text-lg font-semibold">{pool?.name ?? "…"}</div>
          <div className="text-xs text-muted-foreground">
            {orderedFestivals.length} festivals · {tourDays.length} tour days
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={leavePool}>Remove festival from pool</Button>
        </div>
      </div>

      {/* Pool members */}
      <div className="rounded-lg border p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Tour order</div>
        <div className="flex flex-wrap gap-2">
          {orderedFestivals.map((f, i) => (
            <span key={f.id}
              className={`px-2 py-1 rounded-full text-xs border ${f.id === festival.id ? "bg-emerald-100 border-emerald-300" : "bg-muted"}`}>
              {i + 1}. {f.name}
            </span>
          ))}
        </div>
      </div>

      {/* ---------- Coverage table ---------- */}
      <div className="rounded-lg border">
        <div className="p-3 border-b bg-muted/30 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Stock timeline</div>
            <div className="text-xs text-muted-foreground">
              Opening stock − daily trolley consumption. Red = shortage.
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={generateTopUp}>
              <AlertTriangle className="h-4 w-4" /> Generate top-up ({shortages.length})
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/20">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-muted/20 z-10 min-w-[200px]">Ingredient</th>
                {tourDays.map(t => (
                  <th key={t.day} className="text-right p-2 min-w-[65px]" title={t.festival.name}>
                    {t.day.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingredientIds.length === 0 && (
                <tr><td colSpan={tourDays.length + 1} className="p-6 text-center text-muted-foreground">No stock movement yet. Record deliveries below.</td></tr>
              )}
              {ingredientIds.map(ingId => {
                const ing = ingredients.find(i => i.id === ingId);
                if (!ing) return null;
                const days = projection.get(ingId) ?? [];
                const shortage = shortages.find(s => s.ing.id === ingId);
                return (
                  <tr key={ingId} className="border-t">
                    <td className="p-2 sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-1">
                        {shortage && (
                          <Badge variant="destructive" className="h-4 text-[10px]">
                            short {shortage.packs} by {shortage.festivalName}
                          </Badge>
                        )}
                        <span>{ing.name}</span>
                      </div>
                    </td>
                    {days.map(dd => (
                      <td key={dd.day} className={`p-2 text-right font-mono ${dd.remaining < 0 ? "text-destructive font-bold" : ""}`}>
                        <span title={`opening ${dd.opening} − consumed ${dd.consumed}${dd.delivered ? ` (includes ${dd.delivered} delivered by this day)` : ""}`}>
                          {dd.remaining}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Deliveries ---------- */}
      <div className="rounded-lg border">
        <div className="p-3 border-b bg-muted/30 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Deliveries into stock</div>
          <div className="flex gap-2">
            <AddDeliveryButton ingredients={ingredients} onAdd={addDelivery} defaultDate={orderedFestivals[0]?.start_date ?? ymd(new Date())} />
            <CsvImportButton ingredients={ingredients} onAdd={addDelivery} defaultDate={orderedFestivals[0]?.start_date ?? ymd(new Date())} />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/20 text-xs">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Ingredient</th>
              <th className="text-right p-2 w-20">Packs</th>
              <th className="text-left p-2">Note</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {deliveries.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No deliveries yet.</td></tr>
            )}
            {deliveries.map(d => {
              const ing = ingredients.find(i => i.id === d.ingredient_id);
              return (
                <tr key={d.id} className="border-t">
                  <td className="p-2 font-mono text-xs">{d.delivery_date ?? "—"}</td>
                  <td className="p-2">{ing?.name ?? "?"}</td>
                  <td className="p-2 text-right font-mono">{num(d.packs)}</td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {d.note}
                    {d.source_order_supplier_id && (
                      <Badge variant="outline" className="ml-1 text-[10px]">from order</Badge>
                    )}
                  </td>
                  <td className="p-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteDelivery(d.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- Top-up drafts ---------- */}
      {(topupsQ.data?.topups?.length ?? 0) > 0 && (
        <div className="rounded-lg border">
          <div className="p-3 border-b bg-muted/30 text-sm font-semibold">Top-up orders</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-xs">
              <tr>
                <th className="text-left p-2">Deliver on</th>
                <th className="text-left p-2">Supplier</th>
                <th className="text-left p-2">Items</th>
                <th className="text-left p-2">Status</th>
                <th className="w-40"></th>
              </tr>
            </thead>
            <tbody>
              {topupsQ.data!.topups.map(t => {
                const items = topupsQ.data!.items.filter(i => i.topup_id === t.id);
                const sup = suppliers.find(s => s.id === t.supplier_id);
                return (
                  <tr key={t.id} className="border-t align-top">
                    <td className="p-2 font-mono text-xs">{t.delivery_date}</td>
                    <td className="p-2">{sup?.name ?? "?"}</td>
                    <td className="p-2 text-xs">
                      {items.map(it => {
                        const ing = ingredients.find(i => i.id === it.ingredient_id);
                        return (
                          <div key={it.id}>{ing?.name}: <b>{num(it.packs)}</b></div>
                        );
                      })}
                    </td>
                    <td className="p-2 text-xs">
                      <Badge variant={t.status === "sent" ? "default" : "outline"}>{t.status}</Badge>
                    </td>
                    <td className="p-2 flex gap-1">
                      {t.status !== "sent" && (
                        <Button size="sm" variant="outline" onClick={() => markTopupSent(t, topupsQ.data!.items)}>
                          Mark sent + receive
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteTopup(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ================================================================
// Small child components
// ================================================================
function NewPoolButton({ onCreate }: { onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New pool</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New stock pool</DialogTitle></DialogHeader>
        <Label className="text-sm">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gron 2026 - Part 1" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { onCreate(name); setOpen(false); setName(""); }}>Create + join</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDeliveryButton({
  ingredients, onAdd, defaultDate,
}: {
  ingredients: Ingredient[];
  onAdd: (row: { ingredient_id: string; packs: number; delivery_date: string; note?: string }) => void;
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [ing, setIng] = useState("");
  const [packs, setPacks] = useState("");
  const [date, setDate] = useState(defaultDate.slice(0, 10));
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> Receive delivery</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Receive delivery into stock</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Ingredient</Label>
            <Select value={ing} onValueChange={setIng}>
              <SelectTrigger><SelectValue placeholder="Pick ingredient…" /></SelectTrigger>
              <SelectContent>
                {ingredients.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Packs</Label>
              <Input type="number" value={packs} onChange={(e) => setPacks(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Delivery date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Palette pickup Soborg" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => {
            if (!ing || !num(packs) || !date) { toast.error("Fill in ingredient, packs and date"); return; }
            onAdd({ ingredient_id: ing, packs: num(packs), delivery_date: date, note });
            setOpen(false); setPacks(""); setNote("");
          }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CsvImportButton({
  ingredients, onAdd, defaultDate,
}: {
  ingredients: Ingredient[];
  onAdd: (row: { ingredient_id: string; packs: number; delivery_date: string; note?: string }) => void;
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const importRows = async () => {
    const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let imported = 0; const failed: string[] = [];
    const byName = new Map(ingredients.map(i => [i.name.toLowerCase(), i]));
    for (const line of lines) {
      const parts = line.split(",").map(x => x.trim());
      const [name, packs, date, note] = parts;
      if (!name) continue;
      const ing = byName.get(name.toLowerCase());
      const p = Number(packs) || 0;
      if (!ing || p <= 0) { failed.push(line); continue; }
      await onAdd({
        ingredient_id: ing.id, packs: p,
        delivery_date: (date || defaultDate).slice(0, 10),
        note: note || "CSV import",
      });
      imported++;
    }
    toast.success(`Imported ${imported} row(s)${failed.length ? `, ${failed.length} skipped` : ""}`);
    setOpen(false); setCsv("");
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Upload className="h-4 w-4" /> CSV import</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>CSV import — deliveries</DialogTitle></DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">
          One row per line: <code>ingredient_name, packs, delivery_date (YYYY-MM-DD), note</code>. Unmatched names are skipped.
        </div>
        <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} placeholder="Gyros meat, 12, 2026-06-25, Palette 1" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={importRows}>Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
