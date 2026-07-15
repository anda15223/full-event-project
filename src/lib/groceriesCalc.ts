// Shared grocery calculation helpers used by the Trolleys tab and the trolley
// PDF exports. Reuses the recipe expansion logic that already lives in
// FestivalGroceriesExport.tsx so the two paths never drift.

export type CalcIngredient = {
  id: string; name: string; supplier_id: string | null; unit: "g" | "stk";
  pack_size: number | null; pack_label: string | null;
};
export type CalcRecipe = {
  id: string; name: string; type: string; concept: string;
  batch_g: number | null; active: boolean; location_only?: boolean;
};
export type CalcRecipeItem = {
  id: string; recipe_id: string; ingredient_id: string | null;
  subrecipe_id: string | null; qty_g: number | null; qty_stk: number | null;
};
export type CalcPackaging = {
  id: string; recipe_id: string; ingredient_id: string; qty_per_unit: number;
};
export type CalcSupplier = { id: string; name: string };

export type StallEstimateRow = { stall_id: string; product_id: string; day: string; qty: number };
export type Need = { g: number; stk: number };

/**
 * Ceil with floating-point tolerance so 220.0000000000003 → 220, not 221.
 */
export function safeCeil(x: number): number {
  return Math.ceil(Math.round(x * 1e6) / 1e6);
}

/**
 * Explode a set of (recipe_id, units) rows through recipes/subrecipes/packaging,
 * apply safety margin, and merge consumables. Mirrors the logic in
 * FestivalGroceriesExport.tsx one-for-one. Result is un-packed raw need
 * (grams or stk per ingredient).
 *
 * NULL qty guarded like the batch_g guard: warn + skip, never fall back to 1.
 */
export function computeDemand(opts: {
  unitsByRecipe: Map<string, number>;
  recipes: CalcRecipe[];
  items: CalcRecipeItem[];
  packaging: CalcPackaging[];
  ingredients: CalcIngredient[];
  suppliers: CalcSupplier[];
  margin: number; // percent, e.g. 10
  consumables?: Array<{ ingredient_id: string; qty: number; unit_mode: "packs" | "units" }>;
}): Map<string, Need> {
  const {
    unitsByRecipe, recipes, items, packaging, ingredients, suppliers, margin,
    consumables = [],
  } = opts;

  const req = new Map<string, Need>();
  const itemsByRecipe = new Map<string, CalcRecipeItem[]>();
  items.forEach(it => {
    const arr = itemsByRecipe.get(it.recipe_id) ?? [];
    arr.push(it);
    itemsByRecipe.set(it.recipe_id, arr);
  });
  const packByRecipe = new Map<string, CalcPackaging[]>();
  packaging.forEach(p => {
    const arr = packByRecipe.get(p.recipe_id) ?? [];
    arr.push(p);
    packByRecipe.set(p.recipe_id, arr);
  });
  const recipeById = new Map(recipes.map(r => [r.id, r]));
  const ingById = new Map(ingredients.map(i => [i.id, i]));
  const locationOnly = new Set(recipes.filter(r => r.location_only).map(r => r.id));

  const packSupIds = new Set(
    suppliers.filter(s => s.name === "Triple Trading" || s.name === "Kollek").map(s => s.id),
  );
  const bumpedIng = new Set(
    ingredients.filter(i => i.supplier_id && packSupIds.has(i.supplier_id)).map(i => i.id),
  );

  const add = (id: string, g: number, stk: number) => {
    const c = req.get(id) ?? { g: 0, stk: 0 };
    req.set(id, { g: c.g + g, stk: c.stk + stk });
  };

  for (const [rid, u] of unitsByRecipe) {
    if (!u || u <= 0) continue;
    if (locationOnly.has(rid)) continue;
    const its = itemsByRecipe.get(rid) ?? [];
    for (const it of its) {
      if (it.ingredient_id) {
        add(it.ingredient_id, (it.qty_g ?? 0) * u, (it.qty_stk ?? 0) * u);
      } else if (it.subrecipe_id) {
        const sub = recipeById.get(it.subrecipe_id);
        if (!sub) continue;
        const grams = (it.qty_g ?? 0) * u;
        const subItems = itemsByRecipe.get(sub.id) ?? [];
        if (sub.type === "product") {
          const totalG = subItems.reduce((a, si) => a + (si.qty_g ?? 0), 0);
          if (totalG <= 0) {
            console.warn(`[Trolleys] Skipping sub-recipe "${sub.name}" — total grams is 0.`);
            continue;
          }
          const scale = grams / totalG;
          for (const si of subItems) {
            if (si.ingredient_id) add(si.ingredient_id, (si.qty_g ?? 0) * scale, 0);
          }
        } else {
          if (!sub.batch_g || sub.batch_g <= 0) {
            console.warn(`[Trolleys] Skipping sub-recipe "${sub.name}" — missing batch_g.`);
            continue;
          }
          for (const si of subItems) {
            if (si.ingredient_id) add(si.ingredient_id, grams * ((si.qty_g ?? 0) / sub.batch_g), 0);
          }
        }
      }
    }
    for (const p of packByRecipe.get(rid) ?? []) {
      const ing = ingById.get(p.ingredient_id);
      if (!ing) continue;
      const q = (p.qty_per_unit || 0) * u;
      if (ing.unit === "stk") add(p.ingredient_id, 0, q);
      else add(p.ingredient_id, q, 0);
    }
  }

  const foodM = 1 + (margin || 0) / 100;
  for (const [k, v] of req) {
    const m = bumpedIng.has(k) ? 1.2 : foodM;
    req.set(k, { g: v.g * m, stk: v.stk * m });
  }

  for (const c of consumables) {
    const ing = ingById.get(c.ingredient_id);
    if (!ing) continue;
    let g = 0, stk = 0;
    if (c.unit_mode === "packs" && ing.pack_size) {
      if (ing.unit === "stk") stk = c.qty * ing.pack_size; else g = c.qty * ing.pack_size;
    } else {
      if (ing.unit === "stk") stk = c.qty; else g = c.qty;
    }
    add(c.ingredient_id, g, stk);
  }

  return req;
}

/**
 * Largest-remainder allocation:
 * given an integer `total` and non-negative `shares` (in the same units, any scale),
 * return integer allocations that SUM EXACTLY to `total`.
 *
 * Returns { alloc, reserveIdx } — reserveIdx is the set of indices that received
 * a rounding-up pack (i.e. beyond floor(fair_share)).
 *
 * If sum(shares) === 0 and total > 0, the function distributes evenly (extras
 * flagged as reserve). Ties broken by original index order (caller controls sort).
 */
export function largestRemainder(
  total: number,
  shares: number[],
): { alloc: number[]; reserveIdx: Set<number> } {
  const n = shares.length;
  if (n === 0 || total <= 0) return { alloc: new Array(n).fill(0), reserveIdx: new Set() };
  const sum = shares.reduce((a, b) => a + b, 0);
  const reserveIdx = new Set<number>();

  if (sum <= 0) {
    // Zero-demand fallback: even distribution, extras flagged reserve.
    const base = Math.floor(total / n);
    const rem = total - base * n;
    const alloc = new Array(n).fill(base);
    for (let i = 0; i < rem; i++) {
      alloc[i] += 1;
      reserveIdx.add(i);
    }
    return { alloc, reserveIdx };
  }

  const fair = shares.map(s => (total * s) / sum);
  const alloc = fair.map(f => Math.floor(f));
  let assigned = alloc.reduce((a, b) => a + b, 0);
  let remaining = total - assigned;

  if (remaining > 0) {
    const order = fair
      .map((f, i) => ({ i, frac: f - Math.floor(f), demand: shares[i] }))
      .sort((a, b) => b.frac - a.frac || b.demand - a.demand || a.i - b.i);
    for (let k = 0; k < remaining; k++) {
      const idx = order[k % n].i;
      alloc[idx] += 1;
      reserveIdx.add(idx);
    }
  }
  return { alloc, reserveIdx };
}

// ================================================================
// Stock-layer helpers
// ================================================================

/**
 * Split a festival's ordered packs across its festival days using largest-remainder,
 * where the daily demand ratio is derived from per-stall estimates on that day.
 *
 * Returns `Map<ingredient_id, Map<day, packs>>`. Sum over days equals the festival's
 * ordered packs exactly.
 */
export function allocateFestivalPacksByDay(opts: {
  festivalOrderedPacks: Map<string, number>;   // ingredient_id -> packs for whole festival
  perDayDemand: Map<string, Map<string, number>>; // ingredient_id -> (day -> raw demand)
  days: string[];
}): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const [ingId, ordered] of opts.festivalOrderedPacks) {
    const dayMap = new Map<string, number>();
    if (ordered <= 0) { out.set(ingId, dayMap); continue; }
    const demand = opts.perDayDemand.get(ingId) ?? new Map();
    const shares = opts.days.map(d => demand.get(d) ?? 0);
    const { alloc } = largestRemainder(ordered, shares);
    opts.days.forEach((d, i) => dayMap.set(d, alloc[i]));
    out.set(ingId, dayMap);
  }
  return out;
}

/**
 * Project running stock balance across a tour timeline.
 *
 * Input:
 *   - deliveries per ingredient (packs, delivery_date)
 *   - consumption per ingredient per day
 *   - ordered days across the whole tour
 *
 * Output per ingredient: [{ day, opening, delivered, consumed, remaining }].
 * Deliveries dated on or before a tour day are added to that day's opening
 * stock BEFORE consumption, so pre-tour deliveries count as opening stock.
 */
export type StockDay = { day: string; opening: number; delivered: number; consumed: number; remaining: number };

export function projectStock(opts: {
  ingredientIds: string[];
  tourDays: string[]; // chronological
  deliveries: { ingredient_id: string; packs: number; delivery_date: string | null }[];
  consumption: Map<string, Map<string, number>>; // ing -> day -> packs
}): Map<string, StockDay[]> {
  const out = new Map<string, StockDay[]>();
  const deliveryByIng = new Map<string, { day: string; packs: number }[]>();
  for (const d of opts.deliveries) {
    const day = (d.delivery_date ?? "").slice(0, 10);
    if (!day) continue;
    const per = deliveryByIng.get(d.ingredient_id) ?? [];
    per.push({ day, packs: Number(d.packs) || 0 });
    deliveryByIng.set(d.ingredient_id, per);
  }
  for (const per of deliveryByIng.values()) {
    per.sort((a, b) => a.day.localeCompare(b.day));
  }
  for (const ing of opts.ingredientIds) {
    let running = 0;
    let deliveryIdx = 0;
    const days: StockDay[] = [];
    const dRows = deliveryByIng.get(ing) ?? [];
    const cMap = opts.consumption.get(ing) ?? new Map<string, number>();
    for (const day of opts.tourDays) {
      let delivered = 0;
      while (deliveryIdx < dRows.length && dRows[deliveryIdx].day <= day) {
        delivered += dRows[deliveryIdx].packs;
        deliveryIdx += 1;
      }
      const opening = running + delivered;
      const consumed = cMap.get(day) ?? 0;
      running = opening - consumed;
      days.push({ day, opening, delivered, consumed, remaining: running });
    }
    out.set(ing, days);
  }
  return out;
}

