# Shared Components & Schema Reference

Authoritative reference for the festival-cards shared components and the real
database tables they read/write. Use this before adding any new card.

> **Schema reality check (April 2026):** there is no `plan_*` schema in this
> project. All festival-related tables use the `festival_*` prefix or the
> domain-specific names below. Do not create parallel tables.

---

## 1. Real table names (and the names people sometimes confuse them with)

| Real table | Sometimes called | Purpose |
|---|---|---|
| `festivals` | "plan_festivals" | Top-level festival record (name, slug, dates, location, organiser). |
| `festival_concepts` | "plan_concepts" | Per-festival sales concept / stall / zone (e.g. *Pølsevogn*, *Coffee bar*). Holds wristbands, sales hours, gas, power baseline. |
| `festival_staff` | "plan_staff" (join table) | Lightweight per-concept staffing slots (shift-level). One row per assignment, FK → `festival_concepts`. |
| `personal_festival_db` | "plan_staff" (people DB) | Master people list per festival: name, role, phone, email, `is_driver`, `is_crew`, `needs_accommodation`, notes. |
| `festival_action_items` | "plan_action_items" / "tasks_deadlines" | Task/deadline rows: `title`, `deadline`, `priority`, `status`, `owner`, `section_key`. |
| `equipment_db` | "plan_equipment" | Equipment inventory per festival, dedup'd by `(festival_id, item_name, card_origin)`. Tracks `source` (`by_us`/`by_festival`) and `status`. |
| `cost_table` | "plan_costs" | Cost line items per festival with `amount`, `currency`, `card_origin`, `description`, optional `invoice_url`. |
| `invoices` | "invoice_details" | Master invoice table (uuid PK). Used for cross-references from `cost_table.invoice_url` and `ledger.invoice_id`. |
| `festival_cars` | — | Per-festival vehicles (driver, plates, rental cost, concept link). Admin RLS. |
| `festival_hotels` | — | Per-festival lodging (rooms, nights, cost). Admin RLS. |
| `festival_recipes` | — | Per-concept recipes (ingredients JSON, allergens, gramaj). Admin RLS. |
| `brain_entries` | — | Knowledge hub. Uploads, manual saves, and email captures all land here with `source` + `category` + optional `festival_id`. |
| `smart_cards` / `smart_files` / `smart_sections` / `smart_lines` / `smart_todos` / `smart_chat_messages` | — | Backing tables for the `SmartCard` upload + AI-extraction pipeline. |

---

## 2. Project conventions

- **Primary keys:** `uuid` with `DEFAULT gen_random_uuid()` on every table.
- **Column naming:** `snake_case` everywhere — `festival_id`, `item_name`,
  `card_origin`, `section_key`, `is_driver`, etc. No quoted camelCase.
- **Foreign keys:** `*_id uuid REFERENCES <table>(id)`. Most cascade on delete.
- **RLS:** enabled on every table.
  - **Admin-scoped tables** (`equipment_db`, `cost_table`,
    `personal_festival_db`, `festival_cars`, `festival_hotels`,
    `festival_recipes`) use a single `ALL` policy:
    `has_role(auth.uid(), 'admin')` for both `USING` and `WITH CHECK`.
  - **Public-festival tables** (`festivals`, `festival_concepts`,
    `festival_action_items`, `festival_contacts`, `festival_extra_details`,
    `festival_staff`, `festival_accommodation`, `festival_*_shifts`,
    `festival_bc_trolleys*`, `festival_questions`, `festival_answers`,
    `festival_reports`, `festival_vehicles`) currently expose permissive
    `true` policies for SELECT/INSERT/UPDATE/DELETE.
  - **Brain / smart_* tables**: permissive `true` policies.
- **Auth helper:** `public.has_role(_user_id uuid, _role app_role)` is a
  `SECURITY DEFINER` `STABLE` SQL function. Always wrap as
  `has_role(auth.uid(), 'admin'::app_role)`.
- **Timestamps:** `created_at` / `updated_at` default `now()`.
- **Storage buckets:** `festival-photos` (public), `email-attachments` (public),
  `invoice-pdfs` (public), `documents` (private).

---

## 3. Shared components → tables

All five components live in `src/components/festival-cards/shared/`.

| Component | File | Wraps | Writes to | Notes |
|---|---|---|---|---|
| `<CardUploadZone />` | `CardUploadZone.tsx` | `SmartCard` + brain-save logic | `brain_entries` (`source='upload'`, `category=cardName`, `scope='festival'`, `festival_id`) | Upload pipeline runs through `SmartCard` (which writes to `smart_*` tables and Storage). The brain save is a separate persistence step into `brain_entries` so the document is searchable by AI. |
| `<EditableField />` | `EditableField.tsx` | None — pure UI | nothing | Inline text/number/date editor. Parent owns `onChange` and persistence. |
| `<BySourceDropdown />` | `BySourceDropdown.tsx` | None | `equipment_db` | Selects existing row by `(festival_id, item_name, card_origin)`; UPDATE if found, INSERT otherwise. Switching to `by_festival` updates the source — never deletes. |
| `<MissingFlag />` | `MissingFlag.tsx` | None | `festival_action_items` | Creates a task with `priority='high'`, `status='open'` (see status mapping below), `section_key=cardOrigin`, `title=label`, optional `deadline`. |
| `<DocumentList />` (shared) | `shared/DocumentList.tsx` | Generic `DocumentList` viewer | reads `smart_files` joined to `smart_cards` | DB-indexed (filters by `card_key=cardName` + `festival_id`). Faster and supports delete vs. listing Storage paths directly. |

### `SmartCard` props (unchanged — do not modify)

```ts
{ cardKey: string; festivalId: string; conceptId?: string; title?: string; subtitle?: string }
```

No new props are required for any of the five wrappers.

---

## 4. Status mapping conventions

The UI uses friendly labels; tables use the persisted strings below. When you
render or filter, translate at the boundary.

### Tasks / action items (`festival_action_items.status`)

| UI label | DB value |
|---|---|
| Pending / Open | `open` |
| In progress | `in_progress` |
| Done | `closed` |

`festival_action_items.priority` accepts free text in practice; the project
uses `urgent` / `high` / `normal` / `low`. `MissingFlag` defaults to `high`.

### Equipment (`equipment_db.status`, enum `equipment_status`)

`pending` · `confirmed` · `delivered` · `returned`. UI typically shows
"Pending → Confirmed → Delivered → Returned".

### Equipment source (`equipment_db.source`, enum `equipment_source`)

`by_us` · `by_festival`.

### Brain entries (`brain_entries.source`)

`user_correction` (default), `upload`, `email`, plus any custom value the
component sets. `scope` is `global` or `festival`.

---

## 5. Component health check (April 2026)

| Component | File exists? | Writes to expected table? | Known issues |
|---|---|---|---|
| `<CardUploadZone />` | ✅ | ✅ `brain_entries` | None. `onSaveToBrain` is currently a `boolean` toggle (shows the "Save to Brain" button). If we ever want a callback, add a sibling prop — don't repurpose this one. |
| `<EditableField />` | ✅ | n/a (pure UI) | None. |
| `<BySourceDropdown />` | ✅ | ✅ `equipment_db` | None. Dedup logic uses an explicit `select … maybeSingle()` then UPDATE/INSERT — works because of the unique index on `(festival_id, item_name, card_origin)`. |
| `<MissingFlag />` | ✅ | ✅ `festival_action_items` | Spec sometimes calls this table `tasks_deadlines` — that table does not exist. Stay with `festival_action_items`. |
| `<DocumentList />` (shared) | ✅ | reads `smart_files` ⨝ `smart_cards` | Spec sometimes says "filter by Storage path under `festival-photos/brain/{festivalId}/{cardName}/`". We deliberately use the DB join instead — faster, indexed, supports row-level delete. |

---

## 6. Sprint 3 prerequisite — Power Requirements card

The Power Requirements card needs to read each piece of equipment's wattage
draw to roll up totals per concept and per festival.

- **Today:** `equipment_db` does **not** have a `consumption_watts` column.
- **Action before Sprint 3:** add a single nullable column. Migration body:

  ```sql
  ALTER TABLE equipment_db
    ADD COLUMN IF NOT EXISTS consumption_watts integer;
  ```

  No data migration, no RLS change, no new index needed yet. Existing rows
  stay `NULL` and the UI treats `NULL` as "unknown".

This is the only schema change planned for Sprint 3 prep. Everything else the
five shared components need is already in place.
