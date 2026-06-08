## Goal

Allow each staff row to track work days and accommodation nights across an arbitrary set of dates (e.g. arriving Monday before a Thursday festival), instead of the current fixed Thu/Fri/Sat/Sun columns.

## Approach

Replace the 8 hardcoded boolean columns with 2 date-array columns and derive the on-screen day chips from the festival's date range (with a configurable buffer before/after).

### 1. Database migration
On `festival_staff`:
- Add `work_dates date[] NOT NULL DEFAULT '{}'`
- Add `accom_dates date[] NOT NULL DEFAULT '{}'`
- Backfill from existing booleans using the festival's start_date:
  - For each row, map `works_thursday/friday/saturday/sunday` → the actual calendar dates of that festival's Thu–Sun, push into `work_dates`. Same for `accom_*`.
- Keep the old boolean columns for now (don't drop) so the PDF export and any other readers keep working until they're migrated. Mark them deprecated in a comment.

### 2. Day range derivation (frontend)
- Read `festivals.start_date` and `end_date` for the current festival.
- Day window shown in the table = `start_date − 3 days` → `end_date + 1 day` (covers early arrivals and pack-down). The buffer is a constant for now, easy to tune later.
- Render one chip per date in that window, labeled with weekday short name + day number (e.g. `Mon 18`, `Tue 19`, … `Sun 24`).
- Highlight the actual festival days (start_date → end_date) with a stronger background so the buffer days read as "extra".

### 3. Staff table UI (`FestivalStaff.tsx`)
- Replace the two `(["works_thursday"…] as const).map(...)` blocks with a loop over the derived date list.
- Toggling a chip writes `array_append` / `array_remove` on `work_dates` / `accom_dates` via Supabase (using `.update` with the new array we compute client-side — simpler than RPC).
- "Add person" defaults: `work_dates = []`, `accom_dates = []` (or pre-fill with the festival's main days; will pick one in implementation).

### 4. PDF export (`FestivalStaffExport.tsx`)
- Query `work_dates` and `accom_dates` instead of the 8 booleans.
- Render the same dynamic day columns as the table.

### 5. Shift schedule card
- The `WORK_DAYS = ["2026-05-21", …]` constant becomes derived from the festival's date range too, same buffer logic. (Schedule rows live in `festival_schedule_shift` keyed by date, so no schema change needed there.)

### 6. Out of scope (this round)
- Source / Concept / City "add new option inline" — separate request, will tackle after this lands.
- Dropping the legacy boolean columns — defer until we're sure nothing external reads them.

## Open questions

1. **Buffer size** — I'm proposing 3 days before start, 1 day after end. OK, or do you want the full ISO week containing the festival (Mon–Sun)?
2. **Per-row override** — if someone needs a date *outside* even the buffered window (e.g. arrives a full week early), do you want a "+ add date" button on their row, or is the buffered window always enough?
