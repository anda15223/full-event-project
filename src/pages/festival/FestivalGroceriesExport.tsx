import { useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";

const safeCeil = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6);

type Ingredient = {
  id: string; name: string; supplier_id: string | null; unit: "g" | "stk";
  pack_size: number | null; pack_label: string | null; price_per_pack: number | null;
};
type Recipe = { id: string; name: string; type: string; concept: string; batch_g: number | null; active: boolean; location_only?: boolean };
type RecipeItem = { id: string; recipe_id: string; ingredient_id: string | null; subrecipe_id: string | null; qty_g: number | null; qty_stk: number | null };
type Estimate = { id: string; recipe_id: string; units: number };
type Supplier = { id: string; name: string; contact_email: string | null };

export default function FestivalGroceriesExport() {
  const { slug = "" } = useParams();
  const [sp] = useSearchParams();
  const supplierFilter = sp.get("supplier");

  const festQ = useQuery({
    queryKey: ["gr-export-fest", slug],
    queryFn: async () => {
      const { data } = await supabase.from("festivals").select("id,name,start_date,end_date,slug").eq("slug", slug).maybeSingle();
      return data;
    },
  });
  const festival = festQ.data;

  const dataQ = useQuery({
    queryKey: ["gr-export-data", festival?.id],
    enabled: !!festival?.id,
    queryFn: async () => {
      const [ing, sup, rec, ri, pkg, est, set, cons] = await Promise.all([
        supabase.from("grocery_ingredients").select("*"),
        supabase.from("grocery_suppliers").select("*"),
        supabase.from("grocery_recipes").select("*"),
        supabase.from("grocery_recipe_items").select("*"),
        supabase.from("grocery_recipe_packaging").select("*"),
        supabase.from("grocery_estimates").select("*").eq("festival_id", festival!.id),
        supabase.from("grocery_settings").select("*").eq("festival_id", festival!.id).maybeSingle(),
        supabase.from("grocery_festival_consumables").select("*").eq("festival_id", festival!.id),
      ]);
      return {
        ingredients: (ing.data ?? []) as Ingredient[],
        suppliers: (sup.data ?? []) as Supplier[],
        recipes: (rec.data ?? []) as Recipe[],
        items: (ri.data ?? []) as RecipeItem[],
        packaging: (pkg.data ?? []) as any[],
        estimates: (est.data ?? []) as Estimate[],
        consumables: (cons.data ?? []) as any[],
        margin: (set.data?.safety_margin_pct ?? 10) as number,
      };
    },
  });

  const calc = useMemo(() => {
    if (!dataQ.data) return new Map<string, { g: number; stk: number }>();
    const { items, recipes, ingredients, estimates, packaging, consumables, margin, suppliers } = dataQ.data;
    const req = new Map<string, { g: number; stk: number }>();
    const itemsByRecipe = new Map<string, RecipeItem[]>();
    items.forEach(it => { const a = itemsByRecipe.get(it.recipe_id) ?? []; a.push(it); itemsByRecipe.set(it.recipe_id, a); });
    const packByRecipe = new Map<string, any[]>();
    packaging.forEach((p: any) => { const a = packByRecipe.get(p.recipe_id) ?? []; a.push(p); packByRecipe.set(p.recipe_id, a); });
    const recipeById = new Map(recipes.map(r => [r.id, r]));
    const ingById = new Map(ingredients.map(i => [i.id, i]));
    const locationOnly = new Set(recipes.filter(r => r.location_only).map(r => r.id));
    const packSupIds = new Set(suppliers.filter((s: any) => s.name === "Triple Trading" || s.name === "Kollek").map((s: any) => s.id));
    const bumpedIng = new Set(ingredients.filter(i => i.supplier_id && packSupIds.has(i.supplier_id)).map(i => i.id));
    const addIng = (id: string, g: number, stk: number) => {
      const c = req.get(id) ?? { g: 0, stk: 0 };
      req.set(id, { g: c.g + g, stk: c.stk + stk });
    };
    const unitsByRecipe = new Map<string, number>();
    for (const e of estimates) unitsByRecipe.set(e.recipe_id, (unitsByRecipe.get(e.recipe_id) ?? 0) + (e.units || 0));
    for (const [rid, u] of unitsByRecipe) {
      if (u <= 0) continue;
      const its = itemsByRecipe.get(rid) ?? [];
      for (const it of its) {
        if (it.ingredient_id) addIng(it.ingredient_id, (it.qty_g ?? 0) * u, (it.qty_stk ?? 0) * u);
        else if (it.subrecipe_id) {
          const sub = recipeById.get(it.subrecipe_id);
          if (!sub) continue;
          const grams = (it.qty_g ?? 0) * u;
          const batch = sub.batch_g && sub.batch_g > 0 ? sub.batch_g : 1;
          const subItems = itemsByRecipe.get(sub.id) ?? [];
          for (const si of subItems) if (si.ingredient_id) addIng(si.ingredient_id, grams * ((si.qty_g ?? 0) / batch), 0);
        }
      }
      for (const p of packByRecipe.get(rid) ?? []) {
        const ing: any = ingById.get(p.ingredient_id);
        if (!ing) continue;
        const q = (p.qty_per_unit || 0) * u;
        if (ing.unit === "stk") addIng(p.ingredient_id, 0, q);
        else addIng(p.ingredient_id, q, 0);
      }
    }
    const m = 1 + margin / 100;
    for (const [k, v] of req) req.set(k, { g: v.g * m, stk: v.stk * m });
    for (const c of consumables as any[]) {
      const ing: any = ingById.get(c.ingredient_id);
      if (!ing) continue;
      let g = 0, stk = 0;
      if (c.unit_mode === "packs" && ing.pack_size) {
        if (ing.unit === "stk") stk = c.qty * ing.pack_size; else g = c.qty * ing.pack_size;
      } else {
        if (ing.unit === "stk") stk = c.qty; else g = c.qty;
      }
      addIng(c.ingredient_id, g, stk);
    }
    return req;
  }, [dataQ.data]);

  const grouped = useMemo(() => {
    if (!dataQ.data) return [];
    const { ingredients, suppliers } = dataQ.data;
    const map = new Map<string, { supplier: Supplier; rows: { ing: Ingredient; required: number; packs: number | null }[] }>();
    for (const [ingId, need] of calc) {
      const ing = ingredients.find(i => i.id === ingId);
      if (!ing || !ing.supplier_id) continue;
      if (supplierFilter && ing.supplier_id !== supplierFilter) continue;
      const sup = suppliers.find(s => s.id === ing.supplier_id);
      if (!sup) continue;
      const required = ing.unit === "g" ? need.g : need.stk;
      if (required <= 0) continue;
      const packs = ing.pack_size ? safeCeil(required / ing.pack_size) : null;
      const entry = map.get(sup.id) ?? { supplier: sup, rows: [] };
      entry.rows.push({ ing, required, packs });
      map.set(sup.id, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
  }, [calc, dataQ.data, supplierFilter]);

  useEffect(() => {
    if (dataQ.data && festival) setTimeout(() => window.print(), 400);
  }, [dataQ.data, festival]);

  if (!festival) return <div className="p-8">Loading…</div>;

  const dateRange = festival.start_date && festival.end_date ? formatDateRange(festival.start_date, festival.end_date) : "";

  return (
    <div className="p-8 max-w-4xl mx-auto text-sm print:p-0">
      <style>{`@media print { @page { margin: 1.5cm; } }`}</style>
      <header className="mb-6 border-b pb-4">
        <div className="text-xl font-bold">{festival.name} — Groceries order</div>
        <div className="text-muted-foreground">{dateRange}</div>
        <div className="text-xs mt-2">From: Fidibus Team / The Fish Project — aa@thefishproject.dk</div>
      </header>
      {grouped.map(({ supplier, rows }) => (
        <section key={supplier.id} className="mb-8 break-inside-avoid">
          <h2 className="text-lg font-semibold mb-1">{supplier.name}</h2>
          {supplier.contact_email && <div className="text-xs text-muted-foreground mb-2">{supplier.contact_email}</div>}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-gray-100">
                <th className="text-left p-2">Ingredient</th>
                <th className="text-right p-2">Required</th>
                <th className="text-right p-2">Packs</th>
                <th className="text-left p-2">Pack</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ ing, required, packs }) => (
                <tr key={ing.id} className="border-b">
                  <td className="p-2">{ing.name}</td>
                  <td className="p-2 text-right">
                    {ing.unit === "g" ? `${(required / 1000).toFixed(1)} kg` : `${safeCeil(required)} stk`}
                  </td>
                  <td className="p-2 text-right">{packs ?? "—"}</td>
                  <td className="p-2">{ing.pack_size ? `${ing.pack_size} ${ing.pack_label ?? ing.unit}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {grouped.length === 0 && <p>No orders to display.</p>}
    </div>
  );
}
