# Trolley Grouping Layer

Presentation/grouping layer on top of the existing per-stall allocation. Allocation math in `groceriesCalc.ts` and the largest-remainder distribution are unchanged — we only re-bucket the per-stall output into named physical trolleys.

---

## 1. Data model

New tables, scoped per festival:

```text
festival_trolley_group
  id, festival_id (FK, ON DELETE CASCADE),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at, updated_at

festival_trolley_group_stall
  group_id (FK ON DELETE CASCADE),
  stall_id (FK -> festival_grocery_stall ON DELETE CASCADE),
  PRIMARY KEY (group_id, stall_id),
  UNIQUE (stall_id)   -- a stall belongs to at most one group
```

RLS + GRANTs matching sibling `festival_grocery_*` tables. `updated_at` triggers.

**Default behavior** (no groups configured for a festival): each stall is treated as its own trolley named after the stall — same as today.

## 2. Config UI

Small **"Trolley groups"** panel at the top of the Trolleys tab:

- List of groups with inline rename, drag-to-reorder, delete.
- Each group card: multi-select checklist of unassigned + currently-assigned stalls.
- A stall can only be in one group; picking it in group B removes it from group A.
- "Unassigned stalls" section at the bottom (each renders as its own implicit trolley in the display).
- "Reset (one trolley per stall)" button = deletes all groups for this festival.

Seed for Gron Tarnby via migration insert:
- `Trolley 1 - Fish 1 + Gyros 1` (stalls: Fish 1, Gyros 1)
- `Trolley 2 - Fish 2 + Gyros 2` (stalls: Fish 2, Gyros 2)

## 3. Trolleys tab display

For each trolley group (in sort order), render one card:

- **Header**: trolley name + list of member stall names.
- **Combined packing list**: rows = ingredients used by any member stall, packs summed across the group's stalls (reuse the existing per-stall allocation, just sum by group membership).
- **Sub-grouping by concept**: rows grouped by `recipe.concept` (Fish & Chips, Gyros, Shared). Same section headers already in the tab.
- **Per-stall detail**: under each row, a small muted line `Fish 1: 8 · Gyros 1: 4` — zero-stall members hidden. Reserve badge preserved per stall.
- Source badge (FROM STOCK / FROM DAILY ORDER) rolls up: shown per pack on the detail line, aggregate on the summed row when uniform.

Unassigned stalls: rendered below groups, one card per stall (current single-stall layout, unchanged).

## 4. PDF exports

`FestivalGroceriesTrolleyExport.tsx`:

- **"Export all trolleys"** produces one PDF per trolley group (plus one per unassigned stall). Filename `Trolley - {group.name} - {festival}.pdf`.
- Each trolley PDF: combined totals table first (ingredient, packs, pack label, source), concept sub-headers, small per-stall breakdown column on the right.
- **Freezer pull sheet** (existing single-page export) reworked:
  - Section 1: per-trolley totals (one small table per trolley, ingredient + packs).
  - Section 2: per-stall detail (existing table, unchanged, for verification).

All Danish spelling handled via existing `normalizeForPdf`.

## 5. Files touched

- **Migration**: 2 new tables + RLS + GRANTs + `updated_at` triggers + seed rows for Gron Tarnby groups.
- `src/lib/groceriesCalc.ts` — add `groupPerStallByTrolley(perStall, groups)` helper. No math change.
- `src/pages/festival/FestivalGroceriesTrolleys.tsx` — trolley-group config panel, re-render list as grouped cards, per-stall detail line.
- `src/pages/festival/FestivalGroceriesTrolleyExport.tsx` — per-trolley PDFs, updated freezer pull sheet.
- `src/integrations/supabase/types.ts` — regenerated after migration.

## Out of scope

- Cross-festival trolley templates, trolley photos, trolley loading order — future work.
- No change to allocation math, stock layer, orders tab, estimates.

Approve to build.
