import { Fragment as FragmentGroup, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Printer, ShoppingCart, Plus, Pencil, Trash2,
  Upload, AlertTriangle, Copy, Check, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";
import { formatDateRange } from "@/lib/dateFormat";
import { copyTextToClipboard } from "@/lib/clipboard";

// ---------- types ----------
type Festival = { id: string; slug: string; name: string; start_date: string | null; end_date: string | null };
type Supplier = { id: string; name: string; contact_email: string | null; phone: string | null; notes: string | null };
type Ingredient = {
  id: string; name: string; supplier_id: string | null; sku: string | null;
  unit: "g" | "stk"; pack_size: number | null; pack_label: string | null;
  price_per_pack: number | null; eco: boolean; notes: string | null;
};
type Recipe = {
  id: string; name: string; type: "product" | "subrecipe";
  concept: "fish" | "gyros" | "creperie" | "chicksbuns" | "other";
  batch_g: number | null; active: boolean;
};
type RecipeItem = {
  id: string; recipe_id: string; ingredient_id: string | null;
  subrecipe_id: string | null; qty_g: number | null; qty_stk: number | null; sort_order: number;
};
type RecipePackaging = {
  id: string; recipe_id: string; ingredient_id: string; qty_per_unit: number; sort_order: number;
};
type Consumable = {
  id: string; festival_id: string; ingredient_id: string;
  qty: number; unit_mode: "packs" | "units"; note: string | null;
};
type Estimate = { id: string; festival_id: string; recipe_id: string; day: string | null; units: number };

const CONCEPT_LABEL: Record<Recipe["concept"], string> = {
  fish: "Fish & Chips", gyros: "Gyros", creperie: "Creperie", chicksbuns: "Chicks & Buns", other: "Other",
};

function daysBetween(a: string, b: string): string[] {
  const out: string[] = [];
  const s = new Date(a + "T00:00:00");
  const e = new Date(b + "T00:00:00");
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
function fmtDayShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ============================================================
export default function FestivalGroceries() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();

  const festivalQ = useQuery({
    queryKey: ["groceries-festival", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals")
        .select("id,slug,name,start_date,end_date").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });
  const festival = festivalQ.data;

  const suppliersQ = useQuery({
    queryKey: ["grocery_suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grocery_suppliers").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });
  const ingredientsQ = useQuery({
    queryKey: ["grocery_ingredients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grocery_ingredients").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Ingredient[];
    },
  });
  const recipesQ = useQuery({
    queryKey: ["grocery_recipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grocery_recipes").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Recipe[];
    },
  });
  const itemsQ = useQuery({
    queryKey: ["grocery_recipe_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grocery_recipe_items").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as RecipeItem[];
    },
  });
  const packagingQ = useQuery({
    queryKey: ["grocery_recipe_packaging"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grocery_recipe_packaging").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as RecipePackaging[];
    },
  });
  const consumablesQ = useQuery({
    queryKey: ["grocery_festival_consumables", festival?.id],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("grocery_festival_consumables").select("*").eq("festival_id", festival!.id);
      if (error) throw error;
      return (data ?? []) as Consumable[];
    },
  });
  const estimatesQ = useQuery({
    queryKey: ["grocery_estimates", festival?.id],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("grocery_estimates").select("*").eq("festival_id", festival!.id);
      if (error) throw error;
      return (data ?? []) as Estimate[];
    },
  });
  const settingsQ = useQuery({
    queryKey: ["grocery_settings", festival?.id],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("grocery_settings").select("*").eq("festival_id", festival!.id).maybeSingle();
      if (error) throw error;
      return data as { festival_id: string; safety_margin_pct: number } | null;
    },
  });
  const orderStatusQ = useQuery({
    queryKey: ["grocery_order_status", festival?.id],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("grocery_order_status").select("*").eq("festival_id", festival!.id);
      if (error) throw error;
      return (data ?? []) as { id: string; supplier_id: string; status: "draft" | "sent" }[];
    },
  });

  const suppliers = suppliersQ.data ?? [];
  const ingredients = ingredientsQ.data ?? [];
  const recipes = recipesQ.data ?? [];
  const items = itemsQ.data ?? [];
  const packaging = packagingQ.data ?? [];
  const consumables = consumablesQ.data ?? [];
  const estimates = estimatesQ.data ?? [];
  const safetyMargin = settingsQ.data?.safety_margin_pct ?? 10;

  const days = useMemo(() => {
    if (festival?.start_date && festival?.end_date) return daysBetween(festival.start_date, festival.end_date);
    return [];
  }, [festival?.start_date, festival?.end_date]);

  const productRecipes = useMemo(() => recipes.filter(r => r.type === "product" && r.active), [recipes]);

  // Calculation ------------------------------------------------------
  // Returns per-ingredient totals (merged food + packaging + consumables)
  // plus a flag set of ingredients that received a consumables contribution.
  const calculation = useMemo(() => {
    const req = new Map<string, { g: number; stk: number }>();
    const fromConsumable = new Set<string>();
    const itemsByRecipe = new Map<string, RecipeItem[]>();
    items.forEach(it => {
      const arr = itemsByRecipe.get(it.recipe_id) ?? [];
      arr.push(it); itemsByRecipe.set(it.recipe_id, arr);
    });
    const packByRecipe = new Map<string, RecipePackaging[]>();
    packaging.forEach(p => {
      const arr = packByRecipe.get(p.recipe_id) ?? [];
      arr.push(p); packByRecipe.set(p.recipe_id, arr);
    });
    const recipeById = new Map(recipes.map(r => [r.id, r]));
    const ingredientById = new Map(ingredients.map(i => [i.id, i]));

    const addIng = (ingId: string, g: number, stk: number) => {
      const cur = req.get(ingId) ?? { g: 0, stk: 0 };
      cur.g += g; cur.stk += stk;
      req.set(ingId, cur);
    };

    // Sum food + packaging driven by estimates (subject to safety margin)
    const unitsByRecipe = new Map<string, number>();
    for (const e of estimates) unitsByRecipe.set(e.recipe_id, (unitsByRecipe.get(e.recipe_id) ?? 0) + (e.units || 0));
    for (const [rid, u] of unitsByRecipe) {
      if (u <= 0) continue;
      // food items
      for (const it of itemsByRecipe.get(rid) ?? []) {
        if (it.ingredient_id) {
          addIng(it.ingredient_id, (it.qty_g ?? 0) * u, (it.qty_stk ?? 0) * u);
        } else if (it.subrecipe_id) {
          const sub = recipeById.get(it.subrecipe_id);
          if (!sub) continue;
          const gramsNeeded = (it.qty_g ?? 0) * u;
          const batch = sub.batch_g && sub.batch_g > 0 ? sub.batch_g : 1;
          for (const si of itemsByRecipe.get(sub.id) ?? []) {
            if (si.ingredient_id) {
              const scale = (si.qty_g ?? 0) / batch;
              addIng(si.ingredient_id, gramsNeeded * scale, (si.qty_stk ?? 0) * gramsNeeded / batch);
            }
          }
        }
      }
      // packaging items — always stk (add to whichever unit the ingredient uses)
      for (const p of packByRecipe.get(rid) ?? []) {
        const ing = ingredientById.get(p.ingredient_id);
        if (!ing) continue;
        const q = (p.qty_per_unit || 0) * u;
        if (ing.unit === "stk") addIng(p.ingredient_id, 0, q);
        else addIng(p.ingredient_id, q, 0);
      }
    }

    // Apply safety margin to everything so far
    const margin = 1 + (safetyMargin || 0) / 100;
    for (const [k, v] of req) req.set(k, { g: v.g * margin, stk: v.stk * margin });

    // Add consumables (fixed, no margin)
    for (const c of consumables) {
      const ing = ingredientById.get(c.ingredient_id);
      if (!ing) continue;
      let g = 0, stk = 0;
      if (c.unit_mode === "packs" && ing.pack_size) {
        if (ing.unit === "stk") stk = c.qty * ing.pack_size;
        else g = c.qty * ing.pack_size;
      } else {
        if (ing.unit === "stk") stk = c.qty;
        else g = c.qty;
      }
      addIng(c.ingredient_id, g, stk);
      fromConsumable.add(c.ingredient_id);
    }

    return { req, fromConsumable };
  }, [items, packaging, recipes, ingredients, estimates, consumables, safetyMargin]);

  const totalPacksAllSuppliers = useMemo(() => {
    let n = 0;
    for (const [ingId, need] of calculation.req) {
      const ing = ingredients.find(i => i.id === ingId);
      if (!ing?.pack_size) continue;
      const r = ing.unit === "g" ? need.g : need.stk;
      if (r > 0) n += Math.ceil(r / ing.pack_size);
    }
    return n;
  }, [calculation, ingredients]);

  // ---------- Estimates tab: save handler ----------
  const saveEstimate = async (recipeId: string, day: string | null, units: number) => {
    if (!festival?.id) return;
    // upsert by unique (festival_id, recipe_id, day)
    const existing = estimates.find(e => e.recipe_id === recipeId && (e.day ?? null) === (day ?? null));
    if (existing) {
      const { error } = await supabase.from("grocery_estimates").update({ units }).eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("grocery_estimates").insert({
        festival_id: festival.id, recipe_id: recipeId, day, units,
      });
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["grocery_estimates", festival.id] });
  };

  const saveSafetyMargin = async (val: number) => {
    if (!festival?.id) return;
    const { error } = await supabase.from("grocery_settings")
      .upsert({ festival_id: festival.id, safety_margin_pct: val }, { onConflict: "festival_id" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["grocery_settings", festival.id] });
  };

  const setOrderStatus = async (supplierId: string, status: "draft" | "sent") => {
    if (!festival?.id) return;
    const { error } = await supabase.from("grocery_order_status")
      .upsert({ festival_id: festival.id, supplier_id: supplierId, status }, { onConflict: "festival_id,supplier_id" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["grocery_order_status", festival.id] });
  };

  const dateHeader = festival?.start_date && festival?.end_date
    ? formatDateRange(festival.start_date, festival.end_date)
    : "";

  const productsEstimated = useMemo(() => {
    const set = new Set<string>();
    for (const e of estimates) if ((e.units ?? 0) > 0) set.add(e.recipe_id);
    return set.size;
  }, [estimates]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <FestivalBackBar />

      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> {festival?.name ?? slug}
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Screen print
            </Button>
            <Button asChild size="sm">
              <a href={`/festivals/${slug}/groceries/export`} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" /> Export PDF
              </a>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Groceries</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Estimate sales per product per day, calculate ingredient requirements, and generate supplier orders. {dateHeader}
        </p>
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
          {productRecipes.length} products
        </span>
        <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
          {productsEstimated} estimated
        </span>
        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 border">
          {totalPacksAllSuppliers} packs to order
        </span>
        <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
          {ingredients.length} ingredients · {suppliers.length} suppliers
        </span>
      </div>

      <Tabs defaultValue="estimates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="estimates">Estimates</TabsTrigger>
          <TabsTrigger value="calculation">Calculation</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="consumables">Consumables</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
        </TabsList>

        {/* ============ ESTIMATES ============ */}
        <TabsContent value="estimates" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-sm">Safety margin</Label>
            <Input type="number" className="w-24" value={safetyMargin}
              onChange={(e) => saveSafetyMargin(Number(e.target.value) || 0)} />
            <span className="text-xs text-muted-foreground">% added to food & packaging (not consumables)</span>
          </div>
          <EstimatesGrid
            days={days}
            productRecipes={productRecipes}
            estimates={estimates}
            onSave={saveEstimate}
          />
        </TabsContent>

        {/* ============ CALCULATION ============ */}
        <TabsContent value="calculation" className="space-y-4">
          <CalculationView
            req={calculation.req}
            fromConsumable={calculation.fromConsumable}
            ingredients={ingredients}
            suppliers={suppliers}
            onIngredientUpdated={() => qc.invalidateQueries({ queryKey: ["grocery_ingredients"] })}
          />
        </TabsContent>

        {/* ============ ORDERS ============ */}
        <TabsContent value="orders" className="space-y-4">
          <OrdersView
            festival={festival ?? null}
            req={calculation.req}
            fromConsumable={calculation.fromConsumable}
            ingredients={ingredients}
            suppliers={suppliers}
            orderStatus={orderStatusQ.data ?? []}
            onSetStatus={setOrderStatus}
          />
        </TabsContent>

        {/* ============ CONSUMABLES ============ */}
        <TabsContent value="consumables" className="space-y-4">
          <ConsumablesView
            festivalId={festival?.id ?? null}
            consumables={consumables}
            ingredients={ingredients}
            suppliers={suppliers}
            onChange={() => {
              qc.invalidateQueries({ queryKey: ["grocery_festival_consumables", festival?.id] });
              qc.invalidateQueries({ queryKey: ["grocery_ingredients"] });
            }}
          />
        </TabsContent>

        {/* ============ LIBRARY ============ */}
        <TabsContent value="library" className="space-y-4">
          <LibraryView
            suppliers={suppliers}
            ingredients={ingredients}
            recipes={recipes}
            items={items}
            packaging={packaging}
            onChange={() => {
              qc.invalidateQueries({ queryKey: ["grocery_suppliers"] });
              qc.invalidateQueries({ queryKey: ["grocery_ingredients"] });
              qc.invalidateQueries({ queryKey: ["grocery_recipes"] });
              qc.invalidateQueries({ queryKey: ["grocery_recipe_items"] });
              qc.invalidateQueries({ queryKey: ["grocery_recipe_packaging"] });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Estimates grid
// ============================================================
function EstimatesGrid({
  days, productRecipes, estimates, onSave,
}: {
  days: string[];
  productRecipes: Recipe[];
  estimates: Estimate[];
  onSave: (recipeId: string, day: string | null, units: number) => void;
}) {
  const cols: (string | null)[] = days.length > 0 ? days : [null]; // null = Total column
  const groups = useMemo(() => {
    const map = new Map<Recipe["concept"], Recipe[]>();
    for (const r of productRecipes) {
      const arr = map.get(r.concept) ?? [];
      arr.push(r); map.set(r.concept, arr);
    }
    return Array.from(map.entries());
  }, [productRecipes]);

  const cellVal = (rid: string, day: string | null) =>
    estimates.find(e => e.recipe_id === rid && (e.day ?? null) === (day ?? null))?.units ?? 0;

  if (productRecipes.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        No active product recipes yet. Go to the Library tab and import or create recipes first.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left p-2 sticky left-0 bg-muted/40 min-w-[220px]">Product</th>
            {cols.map((d, i) => (
              <th key={i} className="text-right p-2 min-w-[90px]">
                {d ? fmtDayShort(d) : "Total"}
              </th>
            ))}
            <th className="text-right p-2 min-w-[90px] bg-muted">Row total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([concept, recipes]) => (
            <FragmentGroup key={concept}>
              <tr className="bg-muted/20">
                <td colSpan={cols.length + 2} className="p-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {CONCEPT_LABEL[concept]}
                </td>
              </tr>
              {recipes.map(r => {
                const rowTotal = cols.reduce((s, d) => s + cellVal(r.id, d), 0);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 sticky left-0 bg-card">{r.name}</td>
                    {cols.map((d, i) => (
                      <td key={i} className="p-1 text-right">
                        <EstimateCell
                          value={cellVal(r.id, d)}
                          onSave={(v) => onSave(r.id, d, v)}
                        />
                      </td>
                    ))}
                    <td className="p-2 text-right font-medium bg-muted/30">{rowTotal}</td>
                  </tr>
                );
              })}
            </FragmentGroup>
          ))}
          <tr className="border-t bg-muted/40 font-semibold">
            <td className="p-2 sticky left-0 bg-muted/40">Grand total</td>
            {cols.map((d, i) => (
              <td key={i} className="p-2 text-right">
                {productRecipes.reduce((s, r) => s + cellVal(r.id, d), 0)}
              </td>
            ))}
            <td className="p-2 text-right">
              {productRecipes.reduce((s, r) => s + cols.reduce((ss, d) => ss + cellVal(r.id, d), 0), 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function EstimateCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value || ""));
  return (
    <Input
      type="number"
      className="h-8 w-20 text-right ml-auto"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v) || 0;
        if (n !== value) onSave(n);
      }}
    />
  );
}

// ============================================================
// Calculation view
// ============================================================
function CalculationView({
  req, fromConsumable, ingredients, suppliers, onIngredientUpdated,
}: {
  req: Map<string, { g: number; stk: number }>;
  fromConsumable: Set<string>;
  ingredients: Ingredient[];
  suppliers: Supplier[];
  onIngredientUpdated: () => void;
}) {
  const rows = useMemo(() => {
    const arr: {
      ing: Ingredient;
      required: number;
      packs: number | null;
      estCost: number | null;
      isEvent: boolean;
    }[] = [];
    for (const [ingId, need] of req) {
      const ing = ingredients.find(i => i.id === ingId);
      if (!ing) continue;
      const required = ing.unit === "g" ? need.g : need.stk;
      if (required <= 0) continue;
      const packs = ing.pack_size ? Math.ceil(required / ing.pack_size) : null;
      const estCost = packs != null && ing.price_per_pack != null ? packs * ing.price_per_pack : null;
      arr.push({ ing, required, packs, estCost, isEvent: fromConsumable.has(ing.id) });
    }
    return arr;
  }, [req, fromConsumable, ingredients]);

  const bySupplier = useMemo(() => {
    const map = new Map<string | null, typeof rows>();
    for (const r of rows) {
      const key = r.ing.supplier_id;
      const arr = map.get(key) ?? [];
      arr.push(r); map.set(key, arr);
    }
    return Array.from(map.entries()).map(([sid, items]) => ({
      supplier: suppliers.find(s => s.id === sid) ?? null,
      items: items.sort((a, b) => a.ing.name.localeCompare(b.ing.name)),
    })).sort((a, b) => (a.supplier?.name ?? "zzz").localeCompare(b.supplier?.name ?? "zzz"));
  }, [rows, suppliers]);

  if (rows.length === 0) {
    return <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
      Enter estimates or add consumables to see calculated requirements.
    </div>;
  }

  return (
    <div className="space-y-6">
      {bySupplier.map(({ supplier, items }) => (
        <div key={supplier?.id ?? "unknown"} className="rounded-lg border">
          <div className="p-3 border-b bg-muted/30 font-medium">
            {supplier?.name ?? "(no supplier)"}
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Ingredient</th>
                <th className="text-right p-2">Required</th>
                <th className="text-left p-2">Pack</th>
                <th className="text-right p-2">Packs</th>
                <th className="text-right p-2">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ ing, required, packs, estCost, isEvent }) => {
                const missingPack = !ing.pack_size;
                return (
                  <tr key={ing.id} className={cn("border-t", missingPack && "bg-amber-500/10")}>
                    <td className="p-2">
                      {ing.name}
                      {ing.eco && <span className="text-emerald-600 text-xs"> · ECO</span>}
                      {isEvent && <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full bg-blue-500/10 text-blue-700 border border-blue-500/30">event</span>}
                    </td>
                    <td className="p-2 text-right">
                      {ing.unit === "g"
                        ? `${(required / 1000).toFixed(1)} kg`
                        : `${Math.ceil(required)} stk`}
                    </td>
                    <td className="p-2">
                      {missingPack ? (
                        <PackSizeEditor ing={ing} onSaved={onIngredientUpdated} />
                      ) : (
                        <span>{ing.pack_size} {ing.pack_label ?? ing.unit}</span>
                      )}
                    </td>
                    <td className="p-2 text-right">{packs ?? "—"}</td>
                    <td className="p-2 text-right">{estCost != null ? `${estCost.toFixed(2)} kr` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function PackSizeEditor({ ing, onSaved }: { ing: Ingredient; onSaved: () => void }) {
  const [size, setSize] = useState("");
  const [label, setLabel] = useState(ing.pack_label ?? "");
  const save = async () => {
    const n = Number(size);
    if (!n || n <= 0) return;
    const { error } = await supabase.from("grocery_ingredients")
      .update({ pack_size: n, pack_label: label || null }).eq("id", ing.id);
    if (error) { toast.error(error.message); return; }
    onSaved();
  };
  return (
    <div className="flex gap-1 items-center">
      <Input type="number" placeholder="size" className="h-7 w-20" value={size} onChange={(e) => setSize(e.target.value)} />
      <Input placeholder="label" className="h-7 w-20" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Button size="sm" variant="outline" className="h-7" onClick={save}>Save</Button>
    </div>
  );
}

// ============================================================
// Orders view
// ============================================================
function OrdersView({
  festival, req, fromConsumable, ingredients, suppliers, orderStatus, onSetStatus,
}: {
  festival: Festival | null;
  req: Map<string, { g: number; stk: number }>;
  fromConsumable: Set<string>;
  ingredients: Ingredient[];
  suppliers: Supplier[];
  orderStatus: { supplier_id: string; status: "draft" | "sent" }[];
  onSetStatus: (supplierId: string, status: "draft" | "sent") => void;
}) {
  const bySupplier = useMemo(() => {
    const map = new Map<string, { ing: Ingredient; required: number; packs: number | null; isEvent: boolean }[]>();
    for (const [ingId, need] of req) {
      const ing = ingredients.find(i => i.id === ingId);
      if (!ing || !ing.supplier_id) continue;
      const required = ing.unit === "g" ? need.g : need.stk;
      if (required <= 0) continue;
      const packs = ing.pack_size ? Math.ceil(required / ing.pack_size) : null;
      const arr = map.get(ing.supplier_id) ?? [];
      arr.push({ ing, required, packs, isEvent: fromConsumable.has(ing.id) });
      map.set(ing.supplier_id, arr);
    }
    return Array.from(map.entries()).map(([sid, items]) => ({
      supplier: suppliers.find(s => s.id === sid) ?? null,
      items: items.sort((a, b) => a.ing.name.localeCompare(b.ing.name)),
    })).filter(g => g.supplier);
  }, [req, fromConsumable, ingredients, suppliers]);

  const dateRange = festival?.start_date && festival?.end_date
    ? formatDateRange(festival.start_date, festival.end_date) : "";

  const buildText = (supplier: Supplier, items: { ing: Ingredient; required: number; packs: number | null }[]) => {
    const lines: string[] = [];
    lines.push(`Order for ${supplier.name}`);
    lines.push(`${festival?.name ?? ""} — ${dateRange}`);
    lines.push(`From: Fidibus Team / The Fish Project — aa@thefishproject.dk`);
    lines.push("");
    for (const { ing, required, packs } of items) {
      const req = ing.unit === "g" ? `${(required/1000).toFixed(1)} kg` : `${Math.ceil(required)} stk`;
      const packStr = ing.pack_size ? ` — ${packs} × ${ing.pack_size} ${ing.pack_label ?? ing.unit}` : "";
      lines.push(`• ${ing.name}: ${req}${packStr}`);
    }
    return lines.join("\n");
  };

  if (bySupplier.length === 0) {
    return <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
      No orders yet — assign suppliers to ingredients and add estimates.
    </div>;
  }

  return (
    <div className="space-y-4">
      {bySupplier.map(({ supplier, items }) => {
        const status = orderStatus.find(o => o.supplier_id === supplier.id)?.status ?? "draft";
        return (
          <div key={supplier.id} className="rounded-lg border">
            <div className="p-3 border-b flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-medium">{supplier.name}</div>
                {supplier.contact_email && <div className="text-xs text-muted-foreground">{supplier.contact_email}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "px-2 py-0.5 text-xs rounded-full border",
                  status === "sent" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-amber-500/10 text-amber-700 border-amber-500/30"
                )}>{status}</span>
                <Button size="sm" variant="outline" onClick={() => onSetStatus(supplier.id, status === "sent" ? "draft" : "sent")}>
                  Mark {status === "sent" ? "draft" : "sent"}
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  const ok = await copyTextToClipboard(buildText(supplier, items));
                  if (ok) toast.success("Copied");
                }}>
                  <Copy className="h-4 w-4" /> Copy as text
                </Button>
                <Button size="sm" onClick={() => {
                  const url = `/festivals/${festival?.slug}/groceries/export?supplier=${supplier.id}`;
                  window.open(url, "_blank");
                }}>
                  <Download className="h-4 w-4" /> Export PDF
                </Button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Ingredient</th>
                  <th className="text-right p-2">Required</th>
                  <th className="text-right p-2">Packs</th>
                  <th className="text-left p-2">Pack label</th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ ing, required, packs, isEvent }) => (
                  <tr key={ing.id} className="border-t">
                    <td className="p-2">
                      {ing.name}
                      {isEvent && <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full bg-blue-500/10 text-blue-700 border border-blue-500/30">event</span>}
                    </td>
                    <td className="p-2 text-right">
                      {ing.unit === "g" ? `${(required/1000).toFixed(1)} kg` : `${Math.ceil(required)} stk`}
                    </td>
                    <td className="p-2 text-right">{packs ?? "—"}</td>
                    <td className="p-2">
                      {ing.pack_size ? `${ing.pack_size} ${ing.pack_label ?? ing.unit}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Library view
// ============================================================
function LibraryView({
  suppliers, ingredients, recipes, items, packaging, onChange,
}: {
  suppliers: Supplier[]; ingredients: Ingredient[]; recipes: Recipe[];
  items: RecipeItem[]; packaging: RecipePackaging[];
  onChange: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [editIng, setEditIng] = useState<Ingredient | null>(null);
  const [newIng, setNewIng] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [newRecipe, setNewRecipe] = useState(false);

  const itemsByRecipe = useMemo(() => {
    const m = new Map<string, RecipeItem[]>();
    items.forEach(it => {
      const a = m.get(it.recipe_id) ?? [];
      a.push(it); m.set(it.recipe_id, a);
    });
    return m;
  }, [items]);

  const packagingByRecipe = useMemo(() => {
    const m = new Map<string, RecipePackaging[]>();
    packaging.forEach(p => {
      const a = m.get(p.recipe_id) ?? [];
      a.push(p); m.set(p.recipe_id, a);
    });
    return m;
  }, [packaging]);

  const violations = useMemo(() => {
    const set = new Set<string>();
    const ingById = new Map(ingredients.map(i => [i.id, i]));
    const recById = new Map(recipes.map(r => [r.id, r]));
    for (const r of recipes) {
      if (r.type !== "product") continue;
      const foodItems = itemsByRecipe.get(r.id) ?? [];
      const packItems = packagingByRecipe.get(r.id) ?? [];
      const foodIngNames: string[] = [];
      const subNames: string[] = [];
      foodItems.forEach(it => {
        if (it.ingredient_id) {
          const ing = ingById.get(it.ingredient_id);
          if (ing) foodIngNames.push(ing.name.toLowerCase());
        } else if (it.subrecipe_id) {
          const sub = recById.get(it.subrecipe_id);
          if (sub) subNames.push(sub.name.toLowerCase());
        }
      });
      const packNames = packItems
        .map(p => ingById.get(p.ingredient_id)?.name.toLowerCase())
        .filter((n): n is string => !!n);

      const hasWrap = packNames.some(n => n.includes("wrapping paper"));
      const hasBox = packNames.some(n => n.includes("take away box") || n.includes("takeaway box"));
      const hasFries = [...foodIngNames, ...subNames].some(n => n.includes("fries") || n.includes("chips"));
      const isFish = r.concept === "fish";
      const isGyros = r.concept === "gyros";
      const isFriesProduct = r.name.toLowerCase().includes("fries");
      const isComboGyros = isGyros && (r.name.toLowerCase().includes("combo") || hasFries);

      if ((isFish || isGyros || isFriesProduct) && !hasWrap) set.add(r.id);
      if (hasFries && !hasBox) {
        if (!(isGyros && !isComboGyros)) set.add(r.id);
      }
    }
    return set;
  }, [recipes, items, packaging, ingredients, itemsByRecipe, packagingByRecipe]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Import recipes JSON
        </Button>
      </div>

      {/* Ingredients */}
      <section className="rounded-lg border">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-medium">Ingredients ({ingredients.length})</h3>
          <Button size="sm" onClick={() => setNewIng(true)}><Plus className="h-4 w-4" /> New</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Supplier</th>
                <th className="text-left p-2">SKU</th>
                <th className="text-left p-2">Unit</th>
                <th className="text-right p-2">Pack</th>
                <th className="text-right p-2">Price</th>
                <th className="text-left p-2">Eco</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map(ing => (
                <tr key={ing.id} className="border-t">
                  <td className="p-2">{ing.name}</td>
                  <td className="p-2">{suppliers.find(s => s.id === ing.supplier_id)?.name ?? "—"}</td>
                  <td className="p-2">{ing.sku ?? "—"}</td>
                  <td className="p-2">{ing.unit}</td>
                  <td className="p-2 text-right">{ing.pack_size ? `${ing.pack_size} ${ing.pack_label ?? ""}` : "—"}</td>
                  <td className="p-2 text-right">{ing.price_per_pack != null ? `${ing.price_per_pack} kr` : "—"}</td>
                  <td className="p-2">{ing.eco ? "✓" : ""}</td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditIng(ing)}><Pencil className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recipes */}
      <section className="rounded-lg border">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-medium">Recipes ({recipes.length})</h3>
          <Button size="sm" onClick={() => setNewRecipe(true)}><Plus className="h-4 w-4" /> New</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Concept</th>
                <th className="text-left p-2">Type</th>
                <th className="text-right p-2">Batch (g)</th>
                <th className="text-right p-2">Items</th>
                <th className="text-left p-2">Warning</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recipes.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{CONCEPT_LABEL[r.concept]}</td>
                  <td className="p-2">{r.type}</td>
                  <td className="p-2 text-right">{r.batch_g ?? "—"}</td>
                  <td className="p-2 text-right">
                    {(itemsByRecipe.get(r.id) ?? []).length}
                    {(packagingByRecipe.get(r.id) ?? []).length > 0 && (
                      <span className="text-muted-foreground"> · {(packagingByRecipe.get(r.id) ?? []).length} pkg</span>
                    )}
                  </td>
                  <td className="p-2">
                    {violations.has(r.id) && (
                      <span title="Missing wrapping paper or take-away box" className="inline-flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="h-4 w-4" /> packaging
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditRecipe(r)}><Pencil className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dialogs */}
      {(editIng || newIng) && (
        <IngredientDialog
          ingredient={editIng}
          suppliers={suppliers}
          onClose={() => { setEditIng(null); setNewIng(false); }}
          onSaved={() => { setEditIng(null); setNewIng(false); onChange(); }}
        />
      )}
      {(editRecipe || newRecipe) && (
        <RecipeDialog
          recipe={editRecipe}
          ingredients={ingredients}
          recipes={recipes}
          existingItems={editRecipe ? (itemsByRecipe.get(editRecipe.id) ?? []) : []}
          onClose={() => { setEditRecipe(null); setNewRecipe(false); }}
          onSaved={() => { setEditRecipe(null); setNewRecipe(false); onChange(); }}
        />
      )}
      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onDone={() => { setImportOpen(false); onChange(); }}
        />
      )}
    </div>
  );
}

// ---------- Ingredient dialog ----------
function IngredientDialog({
  ingredient, suppliers, onClose, onSaved,
}: {
  ingredient: Ingredient | null; suppliers: Supplier[];
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(ingredient?.name ?? "");
  const [supplierId, setSupplierId] = useState<string | null>(ingredient?.supplier_id ?? null);
  const [sku, setSku] = useState(ingredient?.sku ?? "");
  const [unit, setUnit] = useState<"g" | "stk">(ingredient?.unit ?? "g");
  const [packSize, setPackSize] = useState(ingredient?.pack_size?.toString() ?? "");
  const [packLabel, setPackLabel] = useState(ingredient?.pack_label ?? "");
  const [price, setPrice] = useState(ingredient?.price_per_pack?.toString() ?? "");
  const [eco, setEco] = useState(ingredient?.eco ?? false);

  const save = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    const payload = {
      name: name.trim(),
      supplier_id: supplierId,
      sku: sku || null,
      unit,
      pack_size: packSize ? Number(packSize) : null,
      pack_label: packLabel || null,
      price_per_pack: price ? Number(price) : null,
      eco,
    };
    const { error } = ingredient
      ? await supabase.from("grocery_ingredients").update(payload).eq("id", ingredient.id)
      : await supabase.from("grocery_ingredients").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onSaved();
  };

  const del = async () => {
    if (!ingredient) return;
    if (!confirm(`Delete ${ingredient.name}?`)) return;
    const { error } = await supabase.from("grocery_ingredients").delete().eq("id", ingredient.id);
    if (error) { toast.error(error.message); return; }
    onSaved();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{ingredient ? "Edit" : "New"} ingredient</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div>
            <Label>Supplier</Label>
            <Select value={supplierId ?? "__none"} onValueChange={v => setSupplierId(v === "__none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">(none)</SelectItem>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>SKU</Label><Input value={sku} onChange={e => setSku(e.target.value)} /></div>
            <div>
              <Label>Unit</Label>
              <Select value={unit} onValueChange={v => setUnit(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="stk">stk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Pack size</Label><Input type="number" value={packSize} onChange={e => setPackSize(e.target.value)} /></div>
            <div><Label>Pack label</Label><Input value={packLabel} onChange={e => setPackLabel(e.target.value)} /></div>
            <div><Label>Price/pack</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={eco} onCheckedChange={v => setEco(!!v)} id="eco" />
            <Label htmlFor="eco">Eco</Label>
          </div>
        </div>
        <DialogFooter>
          {ingredient && <Button variant="destructive" onClick={del}><Trash2 className="h-4 w-4" /> Delete</Button>}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Recipe dialog ----------
type DraftItem = { key: string; ingredient_id: string | null; subrecipe_id: string | null; qty_g: string; qty_stk: string };

function RecipeDialog({
  recipe, ingredients, recipes, existingItems, onClose, onSaved,
}: {
  recipe: Recipe | null;
  ingredients: Ingredient[]; recipes: Recipe[];
  existingItems: RecipeItem[];
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [type, setType] = useState<"product" | "subrecipe">(recipe?.type ?? "product");
  const [concept, setConcept] = useState<Recipe["concept"]>(recipe?.concept ?? "fish");
  const [batchG, setBatchG] = useState(recipe?.batch_g?.toString() ?? "");
  const [active, setActive] = useState(recipe?.active ?? true);
  const [draftItems, setDraftItems] = useState<DraftItem[]>(
    existingItems.length > 0
      ? existingItems.map((it, i) => ({
          key: it.id,
          ingredient_id: it.ingredient_id,
          subrecipe_id: it.subrecipe_id,
          qty_g: it.qty_g?.toString() ?? "",
          qty_stk: it.qty_stk?.toString() ?? "",
        }))
      : [],
  );

  const save = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    const payload = {
      name: name.trim(), type, concept,
      batch_g: batchG ? Number(batchG) : null, active,
    };
    let recipeId = recipe?.id;
    if (recipe) {
      const { error } = await supabase.from("grocery_recipes").update(payload).eq("id", recipe.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("grocery_recipes").insert(payload).select().single();
      if (error) { toast.error(error.message); return; }
      recipeId = data.id;
    }
    // Replace items
    await supabase.from("grocery_recipe_items").delete().eq("recipe_id", recipeId!);
    const toInsert = draftItems
      .filter(d => d.ingredient_id || d.subrecipe_id)
      .map((d, i) => ({
        recipe_id: recipeId!,
        ingredient_id: d.ingredient_id,
        subrecipe_id: d.subrecipe_id,
        qty_g: d.qty_g ? Number(d.qty_g) : null,
        qty_stk: d.qty_stk ? Number(d.qty_stk) : null,
        sort_order: i,
      }));
    if (toInsert.length > 0) {
      const { error } = await supabase.from("grocery_recipe_items").insert(toInsert);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saved");
    onSaved();
  };

  const del = async () => {
    if (!recipe) return;
    if (!confirm(`Delete recipe ${recipe.name}?`)) return;
    const { error } = await supabase.from("grocery_recipes").delete().eq("id", recipe.id);
    if (error) { toast.error(error.message); return; }
    onSaved();
  };

  const addItem = () => setDraftItems([...draftItems, { key: Math.random().toString(36), ingredient_id: null, subrecipe_id: null, qty_g: "", qty_stk: "" }]);
  const removeItem = (k: string) => setDraftItems(draftItems.filter(d => d.key !== k));
  const updateItem = (k: string, patch: Partial<DraftItem>) => setDraftItems(draftItems.map(d => d.key === k ? { ...d, ...patch } : d));

  const subrecipes = recipes.filter(r => r.type === "subrecipe" && r.id !== recipe?.id);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{recipe ? "Edit" : "New"} recipe</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div>
              <Label>Concept</Label>
              <Select value={concept} onValueChange={v => setConcept(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONCEPT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={v => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">product</SelectItem>
                  <SelectItem value="subrecipe">subrecipe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Batch (g)</Label><Input type="number" value={batchG} onChange={e => setBatchG(e.target.value)} /></div>
            <div className="flex items-end gap-2">
              <Checkbox id="active" checked={active} onCheckedChange={v => setActive(!!v)} />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm">Items</h4>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-4 w-4" /> Add item</Button>
            </div>
            <div className="space-y-2">
              {draftItems.map(d => (
                <div key={d.key} className="grid grid-cols-12 gap-2 items-center">
                  <Select
                    value={d.subrecipe_id ? `sub:${d.subrecipe_id}` : d.ingredient_id ? `ing:${d.ingredient_id}` : ""}
                    onValueChange={(v) => {
                      if (v.startsWith("sub:")) updateItem(d.key, { subrecipe_id: v.slice(4), ingredient_id: null });
                      else if (v.startsWith("ing:")) updateItem(d.key, { ingredient_id: v.slice(4), subrecipe_id: null });
                    }}
                  >
                    <SelectTrigger className="col-span-6"><SelectValue placeholder="Select ingredient or subrecipe" /></SelectTrigger>
                    <SelectContent>
                      {subrecipes.length > 0 && (
                        <>
                          <div className="text-xs px-2 py-1 text-muted-foreground">Subrecipes</div>
                          {subrecipes.map(s => <SelectItem key={s.id} value={`sub:${s.id}`}>↳ {s.name}</SelectItem>)}
                        </>
                      )}
                      <div className="text-xs px-2 py-1 text-muted-foreground">Ingredients</div>
                      {ingredients.map(i => <SelectItem key={i.id} value={`ing:${i.id}`}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="qty g" type="number" className="col-span-2" value={d.qty_g}
                    onChange={e => updateItem(d.key, { qty_g: e.target.value })} />
                  <Input placeholder="qty stk" type="number" className="col-span-2" value={d.qty_stk}
                    onChange={e => updateItem(d.key, { qty_stk: e.target.value })} />
                  <Button size="sm" variant="ghost" className="col-span-2" onClick={() => removeItem(d.key)}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          {recipe && <Button variant="destructive" onClick={del}><Trash2 className="h-4 w-4" /> Delete</Button>}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Import dialog ----------
function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    let json: any;
    try { json = JSON.parse(text); } catch (e: any) { toast.error("Invalid JSON: " + e.message); return; }
    setBusy(true);
    try {
      await runImport(json);
      toast.success("Import complete");
      onDone();
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Import recipes JSON</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Format: {`{"suppliers":[...],"recipes":[{"sheet":"...","name":"...","type":"product|subrecipe","concept":"fish|gyros|creperie|sub","batch_g":null,"items":[{"name":"...","subrecipe":false,"qty_g":115.0,"qty_note":null,"source":"Jeka Fish","eco":true,"cost_per_unit_dkk":12.07}]}]}`}
        </p>
        <Textarea className="min-h-[300px] font-mono text-xs" value={text} onChange={e => setText(e.target.value)} placeholder='{"suppliers":[],"recipes":[]}' />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={busy}>{busy ? "Importing..." : "Import"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Idempotent import
async function runImport(json: any) {
  const supplierNames: string[] = json.suppliers ?? [];
  const recipesIn: any[] = json.recipes ?? [];

  // Ensure special suppliers exist
  const specialSuppliers = new Set<string>(supplierNames);
  specialSuppliers.add("BC Catering Roskilde");
  specialSuppliers.add("Internal / Ask Marius");
  // Collect source-derived suppliers
  for (const r of recipesIn) for (const it of (r.items ?? [])) {
    const src = it.source;
    if (typeof src === "string" && src && !/^\d+$/.test(src)) {
      if (src === "Homemade" || src === "Ask Marius") specialSuppliers.add("Internal / Ask Marius");
      else specialSuppliers.add(src);
    }
  }

  // upsert suppliers
  const supplierMap = new Map<string, string>();
  {
    const { data: existing } = await supabase.from("grocery_suppliers").select("id,name");
    for (const s of existing ?? []) supplierMap.set(s.name, s.id);
    const toInsert = [...specialSuppliers].filter(n => !supplierMap.has(n)).map(n => ({ name: n }));
    if (toInsert.length > 0) {
      const { data, error } = await supabase.from("grocery_suppliers").insert(toInsert).select("id,name");
      if (error) throw error;
      for (const s of data ?? []) supplierMap.set(s.name, s.id);
    }
  }

  const resolveSupplier = (source: any): { supplierId: string | null; sku: string | null } => {
    if (source == null) return { supplierId: supplierMap.get("Internal / Ask Marius") ?? null, sku: null };
    if (typeof source === "number" || (typeof source === "string" && /^\d+$/.test(source))) {
      return { supplierId: supplierMap.get("BC Catering Roskilde") ?? null, sku: String(source) };
    }
    if (source === "Homemade" || source === "Ask Marius") {
      return { supplierId: supplierMap.get("Internal / Ask Marius") ?? null, sku: null };
    }
    return { supplierId: supplierMap.get(source) ?? null, sku: null };
  };

  // Upsert ingredients from items
  const ingredientMap = new Map<string, string>();
  {
    const { data: existing } = await supabase.from("grocery_ingredients").select("id,name");
    for (const i of existing ?? []) ingredientMap.set(i.name, i.id);
  }

  const isPackaging = (name: string) => {
    const n = name.toLowerCase();
    return n.includes("wrapping paper") || n.includes("take away box") || n.includes("takeaway box");
  };

  for (const r of recipesIn) {
    for (const it of (r.items ?? [])) {
      if (it.subrecipe) continue;
      const name: string = it.name;
      if (!name) continue;
      const { supplierId, sku } = resolveSupplier(it.source);
      const forcedStk = isPackaging(name);
      const isStkByNote = it.qty_g == null && it.qty_note && /stk|^\d+\s*stk/i.test(String(it.qty_note));
      const unit: "g" | "stk" = forcedStk || isStkByNote ? "stk" : "g";
      const payload: any = {
        name, supplier_id: supplierId, sku,
        unit, eco: !!it.eco,
        price_per_pack: typeof it.cost_per_unit_dkk === "number" ? it.cost_per_unit_dkk : null,
      };
      if (ingredientMap.has(name)) {
        const id = ingredientMap.get(name)!;
        await supabase.from("grocery_ingredients").update(payload).eq("id", id);
      } else {
        const { data, error } = await supabase.from("grocery_ingredients").insert(payload).select("id").single();
        if (error) throw error;
        ingredientMap.set(name, data.id);
      }
    }
  }

  // Upsert recipes: subrecipes first
  const recipeMap = new Map<string, string>();
  {
    const { data: existing } = await supabase.from("grocery_recipes").select("id,name");
    for (const r of existing ?? []) recipeMap.set(r.name, r.id);
  }
  const mapConcept = (c: any, t: string): Recipe["concept"] => {
    if (c === "sub") return "other";
    if (["fish", "gyros", "creperie", "chicksbuns", "other"].includes(c)) return c;
    return "other";
  };
  const mapType = (t: any, c: any): "product" | "subrecipe" => {
    if (c === "sub") return "subrecipe";
    if (t === "subrecipe" || t === "product") return t;
    return "product";
  };

  const sorted = [...recipesIn].sort((a, b) => {
    const at = mapType(a.type, a.concept), bt = mapType(b.type, b.concept);
    if (at === bt) return 0;
    return at === "subrecipe" ? -1 : 1;
  });

  for (const r of sorted) {
    const payload = {
      name: r.name, type: mapType(r.type, r.concept), concept: mapConcept(r.concept, r.type),
      batch_g: r.batch_g ?? null, active: true,
    };
    if (recipeMap.has(r.name)) {
      const id = recipeMap.get(r.name)!;
      await supabase.from("grocery_recipes").update(payload).eq("id", id);
    } else {
      const { data, error } = await supabase.from("grocery_recipes").insert(payload).select("id").single();
      if (error) throw error;
      recipeMap.set(r.name, data.id);
    }
  }

  // Replace items per recipe
  for (const r of sorted) {
    const rid = recipeMap.get(r.name)!;
    await supabase.from("grocery_recipe_items").delete().eq("recipe_id", rid);
    const rows: any[] = [];
    let idx = 0;
    for (const it of (r.items ?? [])) {
      let ingredient_id: string | null = null;
      let subrecipe_id: string | null = null;
      if (it.subrecipe) {
        subrecipe_id = recipeMap.get(it.name) ?? null;
        if (!subrecipe_id) continue;
      } else {
        ingredient_id = ingredientMap.get(it.name) ?? null;
        if (!ingredient_id) continue;
      }
      const isPack = ingredient_id && isPackaging(it.name);
      const isStkByNote = it.qty_g == null && it.qty_note && /stk|^\d+\s*stk/i.test(String(it.qty_note));
      const qty_g = it.qty_g != null ? Number(it.qty_g) : null;
      const qty_stk = (isPack || isStkByNote) && qty_g == null ? 1 : null;
      rows.push({
        recipe_id: rid, ingredient_id, subrecipe_id,
        qty_g, qty_stk, sort_order: idx++,
      });
    }
    if (rows.length > 0) {
      const { error } = await supabase.from("grocery_recipe_items").insert(rows);
      if (error) throw error;
    }
  }
}
