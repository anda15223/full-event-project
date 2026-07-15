# Groceries — Stock Pool Layer

Adds an upstream stock layer above the existing Trolleys allocation. A **stock pool** groups a sequence of festivals sharing a central freezer. Deliveries flow in; trolley allocations flow out day-by-day. Festivals without a pool are untouched.

---

## 1. Database

```text
grocery_stock_pool
  id, name, notes, created_at, updated_at

grocery_stock_pool_festival
  pool_id (FK, ON DELETE CASCADE),
  festival_id (FK, ON DELETE CASCADE),
  sort_order int,
  PRIMARY KEY (pool_id, festival_id)

grocery_stock_delivery
  id, pool_id (FK, ON DELETE CASCADE),
  ingredient_id (FK -> grocery_ingredients),
  packs numeric NOT NULL DEFAULT 0,
  delivery_date date,
  source_order_supplier_id uuid NULL,   -- traces back to grocery_order_status row
  source_order_festival_id uuid NULL,
  note text,
  created_at, updated_at
```

RLS + GRANTs matching sibling `grocery_*` tables (permissive `authenticated`). `updated_at` triggers.

## 2. New "Stock" tab in `FestivalGroceries.tsx`

Between **Trolleys** and **Orders**.

- **Pool selector** at top: current festival's pool, or "No pool — add to pool" dropdown. Managing pool members (add/remove festival, reorder by date) done in a small dialog. Festival not in a pool → tab shows an info card only, everything else in the app unchanged.
- **Coverage table** (only when a pool is active): rows = ingredients that appear in the pool's aggregate demand OR have deliveries; columns = every festival-day in tour date order.
  - `Opening packs` (from prior deliveries + prior remaining), then per-day `-consumed`, then `Remaining`.
  - Consumption per day = sum of that day's per-stall trolley packs for that ingredient in the festival owning that day.
  - Any day where `Remaining < 0` → row flagged red with `"short X packs by [festival name] · [day]"`.
- **Deliveries panel**: log per ingredient, filterable, with edit/delete.

## 3. Stock IN (three entry points)

1. **From a sent supplier order** — on the Orders tab, when `grocery_order_status.status = 'sent'` and festival is in a pool, add a **"Receive into stock"** button. Converts every ingredient line (pack qty) from that order into `grocery_stock_delivery` rows with `source_order_supplier_id` + `source_order_festival_id` + `delivery_date = today`. Idempotent: warns if that supplier order was already received.
2. **Manual entry** — a form on the Stock tab: ingredient + packs + date + note.
3. **CSV import** — small drop-zone accepting `ingredient_name,packs,delivery_date,note`. Match by exact ingredient name (case-insensitive). Rows that don't match are reported back and skipped.

## 4. Stock OUT — consumption from Trolleys

Per festival, per day, per ingredient consumption = `Σ per-stall packs from the largest-remainder distribution` (the same output as the Trolleys tab, but grouped by day).

The Trolleys builder currently computes over the whole festival. Extended in `groceriesCalc.ts` to also expose **per-day totals** by running the demand math on a per-day slice of stall estimates; then rounding via largest-remainder against the festival's ordered packs *proportionally per day*. Days sum equals festival ordered packs exactly (invariant preserved).

Implementation: reuse `computeDemand` per (stall, day) and apply the largest-remainder allocator across days on the festival's `orderedPacks` per ingredient. This gives `dailyPacks[festival_id][day][ingredient_id]`.

## 5. Top-up order

Button **"Generate top-up order"** on the Stock tab. For any ingredient with a negative remaining balance on any day, computes the max shortfall `S = -min(remaining_day)` over the tour. Draft order draft rows are created grouped by supplier, dated the day before the earliest short day (`shortDay - 1`).

Draft top-ups appear as a new panel `Top-up orders` inside the Stock tab (each row = supplier, ingredient, packs needed, dated). "Mark sent" flips the row status; when marked sent, that supplier's lines become a delivery on the specified date (via the existing "Receive into stock" flow so numbers stay consistent).

Data lives in a new table `grocery_stock_topup` (pool_id, supplier_id, delivery_date, status, created_at, updated_at) with a child `grocery_stock_topup_item (topup_id, ingredient_id, packs)`.

## 6. Orders reconciliation

When the festival is inside a pool AND opening stock already covers some or all of an ingredient's need for that festival, the **Orders tab** subtracts the covered amount so the daily order is only for the uncovered gap.

- New `orderedPacks(festival) = max(0, festivalReq - openingStock(festival))` where opening stock = the pool's balance for that ingredient at the moment the festival begins.
- Small pill on the affected row: `"Covered by stock: N packs"`.
- The **Trolleys** distribution stays the same total (festivalReq packs). What changes is only the label per pack: covered packs are marked **FROM STOCK**, uncovered packs marked **FROM DAILY ORDER**.

## 7. Trolley "FROM STOCK / FROM DAILY ORDER" label

Each per-stall packing list row gets a source badge. Rule per ingredient per festival:

- `openingStock = balance at festival start for that ingredient`.
- Packs are consumed in stall order (by `sort_order`, then name). First `openingStock` packs across the festival are labelled **FROM STOCK**, the rest **FROM DAILY ORDER**. Days ordered chronologically inside each stall.
- Reserve badge remains independent.
- Applied in the Trolleys tab AND the PDF exports. NULL packs guarded as 0.
- No pool → all packs are **FROM DAILY ORDER** (no label shown, current behavior).

Spelling in PDFs already handled by `normalizeForPdf` (Danish preserved, "Soborg" / "facade" style).

---

## Files touched

- **Migration**: 4 new tables + RLS + GRANTs + updated_at triggers.
- `src/lib/groceriesCalc.ts` — per-day trolley allocation helper, stock balance projector, source-labeler.
- `src/pages/festival/FestivalGroceries.tsx` — new **Stock** tab wiring; new pill in Orders showing stock coverage; NO change to Orders math beyond `festivalReq - openingStock`.
- `src/pages/festival/FestivalGroceriesTrolleys.tsx` — add source label per row (badge in UI).
- `src/pages/festival/FestivalGroceriesTrolleyExport.tsx` — same label in PDFs.
- `src/components/festival/GroceryStockTab.tsx` — new component with pool manager, deliveries log, coverage table, top-ups, CSV import.
- `src/App.tsx` — no new routes needed unless we add a stock PDF export (skipped for now).

## Out of scope

- Cross-pool transfers, spoilage tracking, cold-chain notes, per-unit price rollups — flag as future work if requested.
- No change to Estimates, Calculation, per-stall matrix, or existing exports.

Approve to build.