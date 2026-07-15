import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import {
  buildStallDistribution, type StallDistributionRow,
} from "./FestivalGroceriesTrolleys";
import { normalizeForPdf } from "@/lib/textNormalize";

// Combined + single-stall trolley PDF export.
// Route params:
//   /festivals/:slug/groceries/trolleys/export           → all + freezer pull sheet
//   /festivals/:slug/groceries/trolley/:stallId/export   → one stall

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
      const [ing, sup, rec, ri, pkg, est, set, cons, stalls, se] = await Promise.all([
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
      ]);
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

  useEffect(() => {
    if (dataQ.data && festival) setTimeout(() => window.print(), 400);
  }, [dataQ.data, festival]);

  if (!festival) return <div className="p-8">Loading…</div>;

  const stalls = dataQ.data?.stalls ?? [];
  const focusedStall = stallId ? stalls.find(s => s.id === stallId) : null;
  const stallList = focusedStall ? [focusedStall] : stalls;
  const dateRange = festival.start_date && festival.end_date ? formatDateRange(festival.start_date, festival.end_date) : "";

  return (
    <div className="p-8 max-w-4xl mx-auto text-sm print:p-0">
      <style>{`@media print { @page { margin: 1.5cm; } .page-break { page-break-before: always; } }`}</style>
      <header className="mb-6 border-b pb-4">
        <div className="text-xl font-bold">{normalizeForPdf(festival.name)} — Trolleys</div>
        <div className="text-muted-foreground">{dateRange}</div>
        <div className="text-xs mt-2">Physical flow: Order to freezer to trolleys. Packs sum equals order total per ingredient.</div>
      </header>

      {/* Freezer pull sheet only in combined export */}
      {!focusedStall && (
        <section className="mb-8 break-inside-avoid">
          <h2 className="text-lg font-semibold mb-2">Freezer pull sheet</h2>
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
              {distribution.length === 0 && (
                <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No distribution yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {stallList.map((stall, idx) => {
        const rows = distribution
          .map(d => ({ d, entry: d.perStallPacks.find(x => x.stall.id === stall.id) }))
          .filter(x => x.entry && x.entry.packs > 0);
        return (
          <section key={stall.id} className={`mb-8 break-inside-avoid ${idx > 0 || !focusedStall ? "page-break" : ""}`}>
            <h2 className="text-lg font-semibold mb-2">{normalizeForPdf(stall.name)} — packing list</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left p-2">Ingredient</th>
                  <th className="text-right p-2">Packs</th>
                  <th className="text-left p-2">Pack</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ d, entry }) => (
                  <tr key={d.ingredient.id} className="border-b">
                    <td className="p-2">{normalizeForPdf(d.ingredient.name)}</td>
                    <td className="p-2 text-right">
                      {entry!.packs}{entry!.reserve && <span className="text-xs"> (reserve)</span>}
                    </td>
                    <td className="p-2">{normalizeForPdf(d.packLabel)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No items assigned.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
