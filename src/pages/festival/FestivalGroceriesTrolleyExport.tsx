import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import {
  buildStallDistribution, resolveTrolleys, type StallDistributionRow, type Stall, type VirtualTrolley,
} from "./FestivalGroceriesTrolleys";
import { normalizeForPdf } from "@/lib/textNormalize";
import { computeAutoOil, fetchFestivalFryerEquipment } from "@/lib/groceriesAutoOil";

// Trolley PDF export — grouped by trolley (not stall).
// Route params:
//   /festivals/:slug/groceries/trolleys/export             → all trolleys + freezer pull sheet
//   /festivals/:slug/groceries/trolley/:stallId/export     → single trolley (param may be a trolley group id, or "stall:<uuid>" for unassigned stalls)

export default function FestivalGroceriesTrolleyExport() {
  const { slug = "", stallId } = useParams();

  const festQ = useQuery({
    queryKey: ["trolley-export-fest", slug],
    queryFn: async () => {
      const { data } = await supabase.from("festivals")
        .select("id,name,start_date,end_date,slug").eq("slug", slug).maybeSingle();
      return data;
    },
  });
  const festival = festQ.data;

  const dataQ = useQuery({
    queryKey: ["trolley-export-data", festival?.id],
    enabled: !!festival?.id,
    queryFn: async () => {
      const [ing, sup, rec, ri, pkg, est, set, cons, stalls, se, tg, tgs] = await Promise.all([
        supabase.from("grocery_ingredients").select("*"),
        supabase.from("grocery_suppliers").select("*"),
        supabase.from("grocery_recipes").select("*"),
        supabase.from("grocery_recipe_items").select("*"),
        supabase.from("grocery_recipe_packaging").select("*"),
        supabase.from("grocery_estimates").select("*").eq("festival_id", festival!.id),
        supabase.from("grocery_settings").select("*").eq("festival_id", festival!.id).maybeSingle(),
        supabase.from("grocery_festival_consumables").select("*").eq("festival_id", festival!.id),
        supabase.from("festival_grocery_stall").select("*").eq("festival_id", festival!.id),
        supabase.from("festival_grocery_stall_estimate").select("*").eq("festival_id", festival!.id),
        supabase.from("festival_trolley_group").select("*").eq("festival_id", festival!.id).order("sort_order"),
        supabase.from("festival_trolley_group_stall").select("*"),
      ]);
      const groups = (tg.data ?? []) as any[];
      const groupIds = new Set(groups.map(g => g.id));
      const links = ((tgs.data ?? []) as any[]).filter(l => groupIds.has(l.group_id));
      return {
        ingredients: (ing.data ?? []) as any[],
        suppliers: (sup.data ?? []) as any[],
        recipes: (rec.data ?? []) as any[],
        items: (ri.data ?? []) as any[],
        packaging: (pkg.data ?? []) as any[],
        estimates: (est.data ?? []) as any[],
        consumables: (cons.data ?? []) as any[],
        stalls: (stalls.data ?? []) as any[],
        stallEstimates: (se.data ?? []) as any[],
        groups,
        links,
        margin: (set.data?.safety_margin_pct ?? 10) as number,
      };
    },
  });

  const days = useMemo(() => {
    if (!festival?.start_date || !festival?.end_date) return [];
    const out: string[] = [];
    const [ys, ms, ds] = festival.start_date.slice(0, 10).split("-").map(Number);
    const [ye, me, de] = festival.end_date.slice(0, 10).split("-").map(Number);
    const s = new Date(ys, ms - 1, ds);
    const e = new Date(ye, me - 1, de);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${day}`);
    }
    return out;
  }, [festival?.start_date, festival?.end_date]);

  const distribution: StallDistributionRow[] = useMemo(() => {
    if (!dataQ.data || days.length === 0) return [];
    return buildStallDistribution({
      stalls: dataQ.data.stalls,
      stallEstimates: dataQ.data.stallEstimates,
      estimates: dataQ.data.estimates,
      recipes: dataQ.data.recipes,
      items: dataQ.data.items,
      packaging: dataQ.data.packaging,
      ingredients: dataQ.data.ingredients,
      suppliers: dataQ.data.suppliers,
      consumables: dataQ.data.consumables,
      margin: dataQ.data.margin,
      days,
    });
  }, [dataQ.data, days]);

  // Opening stock at festival start (for FROM STOCK/DAILY label)
  const openingStockQ = useQuery({
    queryKey: ["trolley-export-opening", festival?.id],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data: link } = await supabase.from("grocery_stock_pool_festival")
        .select("pool_id").eq("festival_id", festival!.id).maybeSingle();
      if (!link?.pool_id || !festival?.start_date) return { inPool: false, opening: new Map<string, number>() };
      const { data: deliveries } = await supabase.from("grocery_stock_delivery")
        .select("ingredient_id, packs, delivery_date")
        .eq("pool_id", link.pool_id)
        .lt("delivery_date", festival.start_date);
      const opening = new Map<string, number>();
      for (const d of (deliveries ?? []) as any[]) {
        opening.set(d.ingredient_id, (opening.get(d.ingredient_id) ?? 0) + (Number(d.packs) || 0));
      }
      return { inPool: true, opening };
    },
  });
  const inPool = !!openingStockQ.data?.inPool;
  const opening = openingStockQ.data?.opening ?? new Map<string, number>();

  const rowSource = (ing: string, stallIdx: number, row: StallDistributionRow): "stock" | "daily" | "mixed" => {
    let stockLeft = opening.get(ing) ?? 0;
    for (let i = 0; i <= stallIdx; i++) {
      const packs = row.perStallPacks[i].packs;
      if (i === stallIdx) {
        if (packs === 0) return "daily";
        if (stockLeft >= packs) return "stock";
        if (stockLeft <= 0) return "daily";
        return "mixed";
      }
      stockLeft = Math.max(0, stockLeft - packs);
    }
    return "daily";
  };

  useEffect(() => {
    if (dataQ.data && festival) setTimeout(() => window.print(), 400);
  }, [dataQ.data, festival]);

  if (!festival) return <div className="p-8">Loading…</div>;

  const stalls: Stall[] = dataQ.data?.stalls ?? [];
  const groups = dataQ.data?.groups ?? [];
  const links = dataQ.data?.links ?? [];
  const allTrolleys: VirtualTrolley[] = resolveTrolleys(stalls, groups, links);
  const focusedTrolley = stallId ? allTrolleys.find(t => t.id === stallId) : null;
  const trolleyList = focusedTrolley ? [focusedTrolley] : allTrolleys;
  const dateRange = festival.start_date && festival.end_date ? formatDateRange(festival.start_date, festival.end_date) : "";

  const CONCEPT_LABEL: Record<string, string> = {
    fish: "Fish & Chips", gyros: "Gyros", creperie: "Creperie", chicksbuns: "Chicks & Buns", other: "Other", shared: "Shared",
  };

  // Per-trolley totals per ingredient
  const trolleyTotals = new Map<string, Map<string, number>>();
  for (const row of distribution) {
    const m = new Map<string, number>();
    for (const tr of allTrolleys) {
      let sum = 0;
      for (const s of tr.stalls) {
        const entry = row.perStallPacks.find(x => x.stall.id === s.id);
        if (entry) sum += entry.packs;
      }
      if (sum > 0) m.set(tr.id, sum);
    }
    trolleyTotals.set(row.ingredient.id, m);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto text-sm print:p-0">
      <style>{`@media print { @page { margin: 1.5cm; } .page-break { page-break-before: always; } }`}</style>
      <header className="mb-6 border-b pb-4">
        <div className="text-xl font-bold">{normalizeForPdf(festival.name)} — Trolleys</div>
        <div className="text-muted-foreground">{dateRange}</div>
        <div className="text-xs mt-2">Physical flow: Order to freezer to trolleys. Packs sum equals order total per ingredient.</div>
      </header>

      {/* Freezer pull sheet only in combined export */}
      {!focusedTrolley && (
        <section className="mb-8 break-inside-avoid">
          <h2 className="text-lg font-semibold mb-2">Freezer pull sheet — per trolley</h2>
          <table className="w-full border-collapse mb-6">
            <thead>
              <tr className="border-b bg-gray-100">
                <th className="text-left p-2">Ingredient</th>
                <th className="text-right p-2">Ordered</th>
                {allTrolleys.map(t => (
                  <th key={t.id} className="text-right p-2">{normalizeForPdf(t.name)}</th>
                ))}
                <th className="text-left p-2">Pack</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map(row => {
                const tot = trolleyTotals.get(row.ingredient.id);
                return (
                  <tr key={row.ingredient.id} className="border-b align-top">
                    <td className="p-2">{normalizeForPdf(row.ingredient.name)}</td>
                    <td className="p-2 text-right">{row.orderedPacks}</td>
                    {allTrolleys.map(t => (
                      <td key={t.id} className="p-2 text-right">{tot?.get(t.id) ?? ""}</td>
                    ))}
                    <td className="p-2">{normalizeForPdf(row.packLabel)}</td>
                  </tr>
                );
              })}
              {distribution.length === 0 && (
                <tr><td colSpan={3 + allTrolleys.length} className="p-4 text-center text-muted-foreground">No distribution yet.</td></tr>
              )}
            </tbody>
          </table>

          <h3 className="text-sm font-semibold mb-2">Per-stall detail (verification)</h3>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-gray-100">
                <th className="text-left p-2">Ingredient</th>
                <th className="text-right p-2">Ordered</th>
                <th className="text-left p-2">Split</th>
                <th className="text-left p-2">Pack</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map(row => (
                <tr key={row.ingredient.id} className="border-b align-top">
                  <td className="p-2">{normalizeForPdf(row.ingredient.name)}</td>
                  <td className="p-2 text-right">{row.orderedPacks}</td>
                  <td className="p-2">
                    {row.perStallPacks.filter(x => x.packs > 0).map(x => (
                      <span key={x.stall.id} className="inline-block mr-3">
                        {normalizeForPdf(x.stall.name)}: <b>{x.packs}</b>
                        {x.reserve && <span className="text-xs"> (reserve)</span>}
                      </span>
                    ))}
                  </td>
                  <td className="p-2">{normalizeForPdf(row.packLabel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {trolleyList.map((tr, tIdx) => {
        type TRow = { row: StallDistributionRow; total: number; perStall: { stall: Stall; packs: number; reserve: boolean }[]; concept: string; src: "stock" | "daily" | "mixed" | null };
        const trRows: TRow[] = [];
        for (const row of distribution) {
          const perStall = row.perStallPacks.filter(p => tr.stalls.some(s => s.id === p.stall.id) && p.packs > 0);
          if (perStall.length === 0) continue;
          const total = perStall.reduce((a, b) => a + b.packs, 0);
          const concepts = new Set(perStall.map(p => p.stall.concept));
          const concept = concepts.size === 1 ? [...concepts][0] : "shared";
          // Source: use first perStall entry's row-level index
          const idx = row.perStallPacks.findIndex(x => x.stall.id === perStall[0].stall.id);
          const src = inPool ? rowSource(row.ingredient.id, idx, row) : null;
          trRows.push({ row, total, perStall, concept, src });
        }
        const byConcept = new Map<string, TRow[]>();
        for (const r of trRows) {
          const arr = byConcept.get(r.concept) ?? [];
          arr.push(r); byConcept.set(r.concept, arr);
        }
        for (const arr of byConcept.values()) arr.sort((a, b) => a.row.ingredient.name.localeCompare(b.row.ingredient.name));
        const conceptOrder = ["fish", "gyros", "creperie", "chicksbuns", "other", "shared"].filter(c => byConcept.has(c));
        const memberNames = tr.stalls.map(s => s.name).join(" + ");
        return (
          <section key={tr.id} className={`mb-8 break-inside-avoid ${tIdx > 0 || !focusedTrolley ? "page-break" : ""}`}>
            <h2 className="text-lg font-semibold mb-1">{normalizeForPdf(tr.name)} — packing list</h2>
            {tr.isGroup && (
              <div className="text-xs text-muted-foreground mb-2">Stalls: {normalizeForPdf(memberNames)}</div>
            )}
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left p-2">Ingredient</th>
                  <th className="text-right p-2">Packs</th>
                  {tr.stalls.length > 1 && <th className="text-left p-2">Per stall</th>}
                  <th className="text-left p-2">Source</th>
                  <th className="text-left p-2">Pack</th>
                </tr>
              </thead>
              <tbody>
                {conceptOrder.map(concept => (
                  <>
                    <tr key={`h-${concept}`} className="bg-gray-50">
                      <td colSpan={tr.stalls.length > 1 ? 5 : 4} className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
                        {CONCEPT_LABEL[concept] ?? concept}
                      </td>
                    </tr>
                    {byConcept.get(concept)!.map(({ row, total, perStall, src }) => {
                      const anyReserve = perStall.some(p => p.reserve);
                      return (
                        <tr key={`${tr.id}-${row.ingredient.id}`} className="border-b align-top">
                          <td className="p-2">{normalizeForPdf(row.ingredient.name)}</td>
                          <td className="p-2 text-right">
                            {total}{anyReserve && <span className="text-xs"> (reserve)</span>}
                          </td>
                          {tr.stalls.length > 1 && (
                            <td className="p-2 text-xs">
                              {perStall.map(p => (
                                <span key={p.stall.id} className="inline-block mr-2">
                                  {normalizeForPdf(p.stall.name)}: <b>{p.packs}</b>
                                  {p.reserve && <span> (r)</span>}
                                </span>
                              ))}
                            </td>
                          )}
                          <td className="p-2 text-xs font-semibold">
                            {src === "stock" ? "FROM STOCK" : src === "mixed" ? "MIXED" : src === "daily" ? "FROM DAILY ORDER" : "—"}
                          </td>
                          <td className="p-2">{normalizeForPdf(row.packLabel)}</td>
                        </tr>
                      );
                    })}
                  </>
                ))}
                {trRows.length === 0 && (
                  <tr><td colSpan={tr.stalls.length > 1 ? 5 : 4} className="p-4 text-center text-muted-foreground">No items assigned.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
