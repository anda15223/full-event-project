# Import-from-previous-festival feature

Goal: on every festival card (Power, Equipment, Cooling, Facade, Accommodation, Safety, Prices, Contract, Setup, Contacts, Rules, Transport, Staff…) add a small internal sub-card that lets the user clone data from any past festival as a **draft**, review it, and then promote it to the live card with one click.

## UX per card

A new compact sub-card rendered above the main card body:

```text
┌──────────────────────────────────────────┐
│  ⬇ Import from previous festival         │
│  [Pick festival ▾]  [Import as draft]    │
│  ─────────────────────────────────────   │
│  Draft loaded from "Jelling 2026":       │
│  • 12 rows ready                         │
│  [Preview]  [Set up for this event]  [✕] │
└──────────────────────────────────────────┘
```

- **Pick festival**: dropdown of all festivals except current.
- **Import as draft**: copies rows from the source festival/card scope into the same table(s) with `is_draft = true` and `draft_source_festival_id` set. Main card queries ignore `is_draft = true`.
- **Preview**: expands a read-only mini-table of the draft rows.
- **Set up for this event**: flips `is_draft = false` (and unsets source) so rows appear in the main card. Existing live rows for that card are kept; draft rows are merged in.
- **✕**: discards all current draft rows for that card.

The widget hides itself once the card has any live rows, unless the user expands "Import more".

## Technical approach

### 1. Schema — single migration

Add two columns to every card-backed table:

- `is_draft boolean not null default false`
- `draft_source_festival_id uuid null references festivals(id)`

Tables in scope (from existing schema):
`festival_power`, `festival_equipment`, `festival_cooling`, `festival_facade_status`, `festival_accommodation`, `festival_safety_*`, `festival_prices_*`, `festival_contracts`, `festival_setup`, `festival_contacts`, `festival_transport`, `festival_staff`, `festival_action_items`, `festival_open_questions`, `festival_rules` (only ones that actually exist will be touched; I'll audit before writing the migration).

Plus a partial index per table: `where is_draft = true` for fast draft lookups.

Every existing main-card query gets `.eq('is_draft', false)` (or equivalent in the RPCs).

### 2. Shared widget

New component `src/components/festival/ImportFromPreviousCard.tsx`:

```ts
<ImportFromPreviousCard
  cardKey="power"                  // identifies which tables/columns to copy
  currentFestivalId={festival.id}
  onCommitted={() => refetch()}
/>
```

Internally:
- Fetches `festivals` list (excluding current).
- On **Import**: calls a single edge function `clone-card-data` with `{ cardKey, sourceFestivalId, targetFestivalId }`. The function knows, per `cardKey`, which tables/columns to copy, strips PKs + timestamps, rewrites `festival_id`, sets `is_draft = true, draft_source_festival_id = source`.
- On **Commit**: `update ... set is_draft = false, draft_source_festival_id = null where festival_id = target and is_draft = true and <card scope>`.
- On **Discard**: deletes the same set.

### 3. Edge function `clone-card-data`

One function, table map keyed by `cardKey`. Examples:

```ts
const CARD_MAP = {
  power:       { tables: ['festival_power'] },
  equipment:   { tables: ['festival_equipment'] },
  cooling:     { tables: ['festival_cooling'] },
  prices:      { tables: ['festival_prices', 'festival_prices_items'] },
  ...
}
```

For each table: `select * where festival_id = source`, strip `id/created_at/updated_at`, set `festival_id = target, is_draft = true, draft_source_festival_id = source`, bulk insert. Where a row points to a concept/position by id, remap via slug or name match within the target festival; if no match, leave null and surface a "needs attention" badge on the draft.

### 4. Wiring per card

For each existing card component (`PowerConceptCard`, `EquipmentConceptCard`, …) I'll:
1. Add `<ImportFromPreviousCard cardKey="..." .../>` at the top.
2. Add `.eq('is_draft', false)` to its data fetches.

No business logic changes inside the cards themselves.

## Rollout

1. Migration (adds `is_draft` + `draft_source_festival_id` to all card tables, partial indexes).
2. Edge function `clone-card-data` with the full table map.
3. `ImportFromPreviousCard` component.
4. Update every card component: import widget + `is_draft=false` filter.
5. Smoke test by cloning Jelling 2026 → Heartland 2026 on Power and Equipment first, then the rest.

## Out of scope (for this pass)

- Editing draft rows before commit (only preview + commit/discard).
- Cross-festival concept remap UI (auto by slug only, manual remap can come later).
- File-attachment cloning (PDFs in storage buckets) — initial version copies DB rows only and links to the original files; we can deep-copy files in a follow-up if needed.
