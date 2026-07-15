# Groceries — Trolley Distribution Layer

Trolleys **distribute** the ordered packs. Orders remain the single source of truth and are untouched.

Physical flow: **Order → Freezer → Trolleys**.

---

## 1. Database (migration)

```text
festival_grocery_stall
  id, festival_id, concept, name, sort_order, created_at, updated_at
  UNIQUE (festival_id, concept, name)

festival_grocery_stall_estimate
  id, festival_id, stall_id (FK cascade), product_id, day, qty numeric default 0,
  created_at, updated_at
  UNIQUE (stall_id, product_id, day)
```

RLS + GRANTs matching sibling `grocery_*` tables. No seed rows — a concept with no stall rows behaves as one implicit stall (existing behavior unchanged).

## 2. Estimates tab — stall config + per-stall split

`FestivalGroceries.tsx` Estimates section:

- Per-concept **Stalls** popover: add / rename / delete / reorder. Default pill "1 stall".
- When a concept has ≥2 stalls, each product row gets an expand chevron revealing a `stall × day` qty matrix.
- Default fill = even integer split of the existing `grocery_estimates` total (remainder to first stalls so sum matches exactly).
- Parent product/day total = `SUM(stall qty)` written back to `grocery_estimates` so Calculation and Orders keep working unchanged.
- `NULL qty → 0` guard everywhere (matches the `batch_g` guard in `FestivalGroceriesExport.tsx`).

## 3. New "Trolleys" tab — distribution, not recomputation

Tab between Calculation and Orders. Orders are the fixed total; trolleys only split them.

For each ingredient on the order list:

1. `orderedPacks` = pack count from Orders (never recomputed).
2. Build **stall demand** by exploding each stall's per-stall estimates through recipes (reusing recipe/sub-recipe logic from `FestivalGroceriesExport.tsx`, wrapped as `computeStallDemand(stallId) → Map<ingredient_id, grams|stk>`). Demand is used **only as a ratio**.
3. **Largest-remainder allocation**: `share_i = orderedPacks × demand_i / sum(demand)`; assign `floor(share_i)` to each stall, then distribute the remaining packs one-by-one to stalls with the largest fractional remainders. Stall packs **sum exactly to `orderedPacks`** — never more, never less.
4. Any pack awarded during the remainder step (i.e. beyond `floor(share_i)`) gets a **"reserve" badge** on that stall's row. Ties broken by highest raw demand, then `sort_order`, then name — deterministic.
5. Ingredients whose demand comes from a single concept are distributed only across that concept's stalls (filter stall list before running the distributor; unrelated stalls get 0).
6. Ingredients with `orderedPacks = 0` skipped. Ingredients without `pack_size` (raw units) use the same largest-remainder algorithm on the raw required amount.
7. **Zero-demand fallback**: if `orderedPacks > 0` but total demand is 0, distribute evenly across the stalls of concepts that use the ingredient; extras flagged reserve.

Shared calc extracted to `src/lib/groceriesCalc.ts` (per-stall demand + largest-remainder distributor). Existing export refactored to use the same core; verified against Grøn Tårnby for no drift.

**UI:**

- **Freezer pull sheet** at top: one row per ingredient — `Ordered packs → Fish 1: x, Fish 2: y, Gyros 1: z, Gyros 2: w`. Reserve packs marked with a small badge on the stall's number.
- **Per-stall packing list card**: `Ingredient | Packs | Pack label`, reserve packs flagged.

## 4. Orders tab

**Unchanged.** No "Use trolley totals" toggle. Orders remain authoritative; trolleys read from them.

## 5. Exports

- `/f/:slug/groceries/trolley/:stallId/export` — single stall packing list.
- `/f/:slug/groceries/trolleys/export` — combined: freezer pull sheet page + one page per stall.
- Reuses `ReportTemplate`. Spelling: `facade`, `Soborg` (already normalized by `normalizeForPdf`).
- Buttons: per-stall "Export" on each stall card + "Export all" at the top of the Trolleys tab.

---

## Technical notes

- **Distribution invariant**: `SUM(stall packs) == orderedPacks` for every ingredient. Enforced by largest-remainder and covered by a unit test in `src/test/`.
- **Reserve tagging**: exactly `orderedPacks − Σ floor(share_i)` stalls receive a reserve pack per ingredient.
- **Single-concept filter**: applied before ratio math so unrelated stalls never receive fish, gyros meat, etc.
- Types regenerated after the migration; UI ships in the same turn as the code that reads them.

## Out of scope

- No changes to Estimates totals when a concept has 1 stall.
- No changes to Calculation tab.
- No changes to Orders tab.
- No changes to supplier grouping or supplier PDF export.

Approve to build.