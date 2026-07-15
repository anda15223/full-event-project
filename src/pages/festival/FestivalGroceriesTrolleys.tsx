import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, ChevronRight, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  computeDemand, largestRemainder, safeCeil,
  type CalcIngredient, type CalcRecipe, type CalcRecipeItem,
  type CalcPackaging, type CalcSupplier,
} from "@/lib/groceriesCalc";

// ---------------- types ----------------
type Stall = { id: string; festival_id: string; concept: string; name: string; sort_order: number };
type StallEstimate = { id: string; festival_id: string; stall_id: string; product_id: string; day: string; qty: number };
type Estimate = { id: string; festival_id: string; recipe_id: string; day: string | null; units: number };
type Consumable = { id: string; ingredient_id: string; qty: number; unit_mode: "packs" | "units" };

const CONCEPT_LABEL: Record<string, string> = {
  fish: "Fish & Chips", gyros: "Gyros", creperie: "Creperie", chicksbuns: "Chicks & Buns", other: "Other",
};

// ================================================================
// Public hooks
// ================================================================
export function useStalls(festivalId: string | null | undefined) {
  return useQuery({
    queryKey: ["grocery_stalls", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_grocery_stall")
        .select("*")
        .eq("festival_id", festivalId!)
        .order("concept").order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as Stall[];
    },
  });
}

export function useStallEstimates(festivalId: string | null | undefined) {
  return useQuery({
    queryKey: ["grocery_stall_estimates", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_grocery_stall_estimate")
        .select("*")
        .eq("festival_id", festivalId!);
      if (error) throw error;
      return (data ?? []) as StallEstimate[];
    },
  });
}

// ================================================================
// Distribution — pure. Exported so the export component reuses it.
// ================================================================
export type StallDistributionRow = {
  ingredient: CalcIngredient;
  orderedPacks: number;
  perStallPacks: { stall: Stall; packs: number; reserve: boolean }[];
  packLabel: string;
};

export function buildStallDistribution(opts: {
  stalls: Stall[];
  stallEstimates: StallEstimate[];
  estimates: Estimate[];
  recipes: CalcRecipe[];
  items: CalcRecipeItem[];
  packaging: CalcPackaging[];
  ingredients: CalcIngredient[];
  suppliers: CalcSupplier[];
  consumables: Consumable[];
  margin: number;
  days: string[];
}): StallDistributionRow[] {
  const {
    stalls, stallEstimates, estimates, recipes, items, packaging,
    ingredients, suppliers, consumables, margin, days,
  } = opts;

  const recipeConcept = new Map(recipes.map(r => [r.id, r.concept]));

  // Group stalls by concept. Concepts with 0 stalls get an implicit single stall.
  const stallsByConcept = new Map<string, Stall[]>();
  for (const s of stalls) {
    const arr = stallsByConcept.get(s.concept) ?? [];
    arr.push(s);
    stallsByConcept.set(s.concept, arr);
  }
  for (const arr of stallsByConcept.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }

  // ---------------- (A) festival-wide demand → ordered packs per ingredient ----------------
  const daySet = new Set(days);
  const unitsByRecipe = new Map<string, number>();
  for (const e of estimates) {
    if (e.day == null || !daySet.has(e.day.slice(0, 10))) continue;
    unitsByRecipe.set(e.recipe_id, (unitsByRecipe.get(e.recipe_id) ?? 0) + (e.units ?? 0));
  }
  const festivalReq = computeDemand({
    unitsByRecipe, recipes, items, packaging, ingredients, suppliers, margin, consumables,
  });

  // ---------------- (B) per-stall demand (ratio only) ----------------
  const stallReq = new Map<string, Map<string, { g: number; stk: number }>>();
  for (const stall of stalls) {
    const perRecipe = new Map<string, number>();
    for (const se of stallEstimates) {
      if (se.stall_id !== stall.id) continue;
      if (!daySet.has(se.day.slice(0, 10))) continue;
      perRecipe.set(se.product_id, (perRecipe.get(se.product_id) ?? 0) + (Number(se.qty) || 0));
    }
    stallReq.set(stall.id, computeDemand({
      unitsByRecipe: perRecipe,
      recipes, items, packaging, ingredients, suppliers,
      margin,
      // consumables are festival-wide; split them proportionally to stalls of related concepts
      consumables: [],
    }));
  }

  // ---------------- (C) allocate ordered packs across stalls ----------------
  const rows: StallDistributionRow[] = [];
  for (const ing of ingredients) {
    const need = festivalReq.get(ing.id);
    if (!need) continue;
    const raw = ing.unit === "g" ? need.g : need.stk;
    if (raw <= 0) continue;
    const packSize = ing.pack_size ?? 0;
    const orderedPacks = packSize > 0 ? safeCeil(raw / packSize) : safeCeil(raw);
    if (orderedPacks <= 0) continue;

    // Which concepts contribute demand for this ingredient? Filter stalls to those concepts.
    const contributingConcepts = new Set<string>();
    for (const stall of stalls) {
      const sn = stallReq.get(stall.id)?.get(ing.id);
      const v = sn ? (ing.unit === "g" ? sn.g : sn.stk) : 0;
      if (v > 0) contributingConcepts.add(stall.concept);
    }
    // If no stall demand at all (e.g. consumable) → fall back to all stalls with recipes for that ingredient's concept usage.
    let stallList: Stall[];
    if (contributingConcepts.size > 0) {
      stallList = stalls.filter(s => contributingConcepts.has(s.concept));
    } else {
      stallList = stalls.slice();
    }
    if (stallList.length === 0) continue;

    const shares = stallList.map(s => {
      const sn = stallReq.get(s.id)?.get(ing.id);
      return sn ? (ing.unit === "g" ? sn.g : sn.stk) : 0;
    });
    // Sort stallList by concept/sort_order for stable output; keep shares aligned
    const paired = stallList.map((s, i) => ({ s, share: shares[i] }))
      .sort((a, b) => a.s.concept.localeCompare(b.s.concept) || a.s.sort_order - b.s.sort_order || a.s.name.localeCompare(b.s.name));
    const orderedShares = paired.map(p => p.share);
    const orderedStalls = paired.map(p => p.s);

    const { alloc, reserveIdx } = largestRemainder(orderedPacks, orderedShares);

    rows.push({
      ingredient: ing,
      orderedPacks,
      perStallPacks: orderedStalls.map((stall, i) => ({
        stall, packs: alloc[i], reserve: reserveIdx.has(i),
      })),
      packLabel: ing.pack_size ? `${ing.pack_size} ${ing.pack_label ?? ing.unit}` : (ing.pack_label ?? ing.unit),
    });
  }

  rows.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name));
  return rows;
}

// ================================================================
// Stall manager popover — per-concept
// ================================================================
export function StallManagerPopover({
  festivalId, concept, stalls,
}: {
  festivalId: string; concept: string; stalls: Stall[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const list = stalls.filter(s => s.concept === concept)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const nextOrder = (list[list.length - 1]?.sort_order ?? -1) + 1;
    const { error } = await supabase.from("festival_grocery_stall").insert({
      festival_id: festivalId, concept, name: n, sort_order: nextOrder,
    });
    if (error) { toast.error(error.message); return; }
    setName("");
    qc.invalidateQueries({ queryKey: ["grocery_stalls", festivalId] });
  };
  const rename = async (id: string, newName: string) => {
    const n = newName.trim();
    if (!n) return;
    const { error } = await supabase.from("festival_grocery_stall").update({ name: n }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["grocery_stalls", festivalId] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this stall? Per-stall estimates for it will also be removed.")) return;
    const { error } = await supabase.from("festival_grocery_stall").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["grocery_stalls", festivalId] });
    qc.invalidateQueries({ queryKey: ["grocery_stall_estimates", festivalId] });
  };

  const label = list.length <= 1 ? `${Math.max(list.length, 1)} stall` : `${list.length} stalls`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs">{label}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="text-sm font-medium mb-2">{CONCEPT_LABEL[concept] ?? concept} stalls</div>
        <div className="space-y-2 mb-3">
          {list.map(s => (
            <StallRow key={s.id} stall={s} onRename={rename} onDelete={remove} />
          ))}
          {list.length === 0 && (
            <div className="text-xs text-muted-foreground">
              No custom stalls — behaves as a single implicit stall.
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={`e.g. ${CONCEPT_LABEL[concept]?.split(" ")[0] ?? "Stall"} 1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={add}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StallRow({ stall, onRename, onDelete }: {
  stall: Stall;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(stall.name);
  if (editing) {
    return (
      <div className="flex gap-1 items-center">
        <Input value={v} onChange={(e) => setV(e.target.value)} className="h-7 text-sm" />
        <Button size="sm" variant="ghost" onClick={() => { onRename(stall.id, v); setEditing(false); }}>Save</Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{stall.name}</span>
      <div className="flex gap-0.5">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDelete(stall.id)}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// ================================================================
// Per-stall estimate matrix for a single product row
// ================================================================
export function StallEstimateMatrix({
  festivalId, productId, days, stalls, stallEstimates, productDayTotals,
}: {
  festivalId: string;
  productId: string;
  days: string[];
  stalls: Stall[];  // already filtered to this concept
  stallEstimates: StallEstimate[];
  productDayTotals: Record<string, number>; // day → current festival total for the product
}) {
  const qc = useQueryClient();

  const cell = (stallId: string, day: string) =>
    stallEstimates.find(se => se.stall_id === stallId && se.product_id === productId && se.day.slice(0, 10) === day)?.qty ?? null;

  const save = async (stallId: string, day: string, qty: number) => {
    const existing = stallEstimates.find(se => se.stall_id === stallId && se.product_id === productId && se.day.slice(0, 10) === day);
    if (existing) {
      const { error } = await supabase.from("festival_grocery_stall_estimate").update({ qty }).eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("festival_grocery_stall_estimate").insert({
        festival_id: festivalId, stall_id: stallId, product_id: productId, day, qty,
      });
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["grocery_stall_estimates", festivalId] });
  };

  const evenSplit = (day: string) => {
    const total = productDayTotals[day] ?? 0;
    if (stalls.length === 0) return;
    const base = Math.floor(total / stalls.length);
    const rem = total - base * stalls.length;
    stalls.forEach((s, i) => save(s.id, day, base + (i < rem ? 1 : 0)));
  };

  return (
    <div className="p-3 bg-muted/20 border-t">
      <div className="text-xs font-medium mb-2 text-muted-foreground">Per-stall split</div>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-left p-1 pr-3">Stall</th>
              {days.map(d => <th key={d} className="text-right p-1 min-w-[70px]">{d.slice(5)}</th>)}
            </tr>
          </thead>
          <tbody>
            {stalls.map(s => (
              <tr key={s.id}>
                <td className="p-1 pr-3">{s.name}</td>
                {days.map(d => (
                  <td key={d} className="p-1">
                    <MatrixCell
                      value={cell(s.id, d)}
                      onSave={(v) => save(s.id, d, v)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t text-muted-foreground">
              <td className="p-1 pr-3">Sum / total</td>
              {days.map(d => {
                const sum = stalls.reduce((a, s) => a + (cell(s.id, d) ?? 0), 0);
                const total = productDayTotals[d] ?? 0;
                const mismatch = sum !== total;
                return (
                  <td key={d} className="p-1 text-right">
                    <span className={mismatch ? "text-amber-600" : ""}>{sum} / {total}</span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-2">
        <Button size="sm" variant="outline" className="h-7 text-xs"
          onClick={() => days.forEach(evenSplit)}>
          Even split from totals
        </Button>
      </div>
    </div>
  );
}

function MatrixCell({ value, onSave }: { value: number | null; onSave: (v: number) => void }) {
  const [v, setV] = useState(value === null ? "" : String(value));
  return (
    <Input
      type="number"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v) || 0;
        if (n !== (value ?? 0)) onSave(n);
      }}
      className="h-7 w-16 text-right text-xs ml-auto"
      placeholder="—"
    />
  );
}

// ================================================================
// Trolleys tab — top-level
// ================================================================
export default function TrolleysTab({
  festivalId, slug, distribution, stalls,
}: {
  festivalId: string;
  slug: string;
  distribution: StallDistributionRow[];
  stalls: Stall[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const openingStockQ = useOpeningStockForFestival(festivalId);
  const openingStock = openingStockQ.data?.opening ?? new Map<string, number>();
  const inPool = !!openingStockQ.data?.poolId;

  // Compute per-ingredient FROM STOCK vs FROM DAILY ORDER counters.
  // Consume stock in stall order across the ingredient's per-stall packs.
  const perRowSource = new Map<string, Map<string, "stock" | "daily">[]>();
  for (const row of distribution) {
    let stockLeft = openingStock.get(row.ingredient.id) ?? 0;
    const labels: ("stock" | "daily")[] = row.perStallPacks.map(x => {
      const stallLabels: ("stock" | "daily")[] = [];
      for (let i = 0; i < x.packs; i++) {
        if (stockLeft > 0) { stallLabels.push("stock"); stockLeft -= 1; }
        else stallLabels.push("daily");
      }
      // Row-level: if ANY pack from daily → mark daily unless all stock
      const anyDaily = stallLabels.includes("daily");
      const anyStock = stallLabels.includes("stock");
      return anyDaily && !anyStock ? "daily" : anyStock && !anyDaily ? "stock" : (stallLabels.includes("stock") ? "mixed" as any : "daily");
    });
    perRowSource.set(row.ingredient.id, labels.map(l => new Map([["_", l as any]])));
  }
  const sourceOf = (ingId: string, stallIdx: number): "stock" | "daily" | "mixed" => {
    const arr = perRowSource.get(ingId);
    return (arr?.[stallIdx]?.get("_") as any) ?? "daily";
  };


  if (stalls.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        No stalls configured. Add 2+ stalls to a concept on the Estimates tab to enable trolley splitting.
      </div>
    );
  }
  if (distribution.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Nothing to distribute yet — add product estimates first.
      </div>
    );
  }

  // Group by concept for per-stall packing lists
  const stallsByConcept = new Map<string, Stall[]>();
  for (const s of stalls) {
    const arr = stallsByConcept.get(s.concept) ?? [];
    arr.push(s); stallsByConcept.set(s.concept, arr);
  }

  return (
    <div className="space-y-6">
      {/* -------- Header + export -------- */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Trolleys</h2>
          <p className="text-xs text-muted-foreground">
            Distributes each ingredient's <b>ordered packs</b> across stalls by demand share. Sum per ingredient always equals the order total. Physical flow: Order → freezer → trolleys.
          </p>
        </div>
        <Button asChild size="sm">
          <a href={`/festivals/${slug}/groceries/trolleys/export`} target="_blank" rel="noopener noreferrer">
            <Download className="h-4 w-4" /> Export all trolleys
          </a>
        </Button>
      </div>

      {/* -------- Freezer pull sheet -------- */}
      <div className="rounded-lg border">
        <div className="p-3 border-b bg-muted/30">
          <div className="text-sm font-semibold">Freezer pull sheet</div>
          <div className="text-xs text-muted-foreground">Ordered packs → per-stall split.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/20">
              <tr>
                <th className="text-left p-2">Ingredient</th>
                <th className="text-right p-2 w-24">Ordered</th>
                <th className="text-left p-2">Split</th>
                <th className="text-left p-2 w-32">Pack</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map(row => (
                <tr key={row.ingredient.id} className="border-t">
                  <td className="p-2 font-medium">{row.ingredient.name}</td>
                  <td className="p-2 text-right font-mono">{row.orderedPacks}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {row.perStallPacks.filter(x => x.packs > 0).map(x => (
                        <span key={x.stall.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-xs">
                          <span className="font-medium">{x.stall.name}:</span>
                          <span className="font-mono">{x.packs}</span>
                          {x.reserve && (
                            <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] border-amber-500 text-amber-700">reserve</Badge>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{row.packLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------- Per-stall packing lists -------- */}
      {Array.from(stallsByConcept.entries()).map(([concept, group]) => (
        <div key={concept} className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {CONCEPT_LABEL[concept] ?? concept}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {group.map(stall => {
              const rows = distribution
                .map(d => ({ d, entry: d.perStallPacks.find(x => x.stall.id === stall.id) }))
                .filter(x => x.entry && x.entry.packs > 0);
              const isOpen = expanded[stall.id] ?? true;
              return (
                <div key={stall.id} className="rounded-lg border">
                  <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/20">
                    <button className="flex items-center gap-1 text-sm font-semibold"
                      onClick={() => setExpanded(prev => ({ ...prev, [stall.id]: !isOpen }))}>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {stall.name}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{rows.length} items</span>
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <a href={`/festivals/${slug}/groceries/trolley/${stall.id}/export`} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5" /> Export
                        </a>
                      </Button>
                    </div>
                  </div>
                  {isOpen && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground">
                          <th className="text-left p-2">Ingredient</th>
                          <th className="text-right p-2 w-20">Packs</th>
                          <th className="text-left p-2 w-32">Pack</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ d, entry }) => (
                          <tr key={d.ingredient.id} className="border-t">
                            <td className="p-2">{d.ingredient.name}</td>
                            <td className="p-2 text-right font-mono">
                              {entry!.packs}
                              {entry!.reserve && (
                                <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] border-amber-500 text-amber-700 align-middle">reserve</Badge>
                              )}
                            </td>
                            <td className="p-2 text-xs text-muted-foreground">{d.packLabel}</td>
                          </tr>
                        ))}
                        {rows.length === 0 && (
                          <tr><td colSpan={3} className="p-4 text-center text-xs text-muted-foreground">No items assigned to this stall.</td></tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
