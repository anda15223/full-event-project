## Goal

Turn the current single **Grøn Koncert uge 1 2026** festival into **8 separate one-day festivals**, one per Grøn stop, each with its own staff / concepts / schedule.

## The 8 festivals

| Slug | Name | Date | City |
|---|---|---|---|
| `gron-tarnby-2026` | Grøn Tårnby 2026 | Jul 16, 2026 | Tårnby |
| `gron-kolding-2026` | Grøn Kolding 2026 | Jul 17, 2026 | Kolding |
| `gron-aarhus-2026` | Grøn Aarhus 2026 | Jul 18, 2026 | Aarhus |
| `gron-aalborg-2026` | Grøn Aalborg 2026 | Jul 19, 2026 | Aalborg |
| `gron-esbjerg-2026` | Grøn Esbjerg 2026 | Jul 23, 2026 | Esbjerg |
| `gron-odense-2026` | Grøn Odense 2026 | Jul 24, 2026 | Odense |
| `gron-naestved-2026` | Grøn Næstved 2026 | Jul 25, 2026 | Næstved |
| `gron-valby-2026` | Grøn Valby 2026 | Jul 26, 2026 | Valby |

Each is a single day: `start_date = end_date = <that Jul day>`, `year = 2026`.

## What gets copied into each of the 8

For every new festival, I clone the following rows from the current Grøn:

- **festivals** — one new row per city (all other columns copied: organiser, contacts, address defaults, notes, accreditation, crew register, etc.)
- **festival_contracts** — the 4 concept contracts (Fish 1, Fish 2, Gyros 1, Gyros 2)
- **festival_concepts** — 2 rows (Fish & Chips, Gyros)
- **festival_concept_assignments** — managers per concept
- **festival_staff** — full staff roster
- **festival_staff_vehicles** — vehicle assignments
- **festival_schedule_position** — station positions
- **festival_schedule_shift** — shifts, with `schedule_position_id` remapped to the new position rows
- **festival_shifts** — legacy shift groups
- **festival_concept_hours** — opening hours per concept
- **festival_hours** — service-day hours
- **festival_service_hours** — extra service hours
- **festival_contacts** — festival-side contacts

Dates on any date-bearing rows (e.g. `festival_schedule_shift.shift_date`, `festival_shifts.shift_date`, `festival_concept_hours.date`, etc.) are shifted so the row falls on the new festival's single day. If the original spans multiple days, only the last day's rows are kept for the new one-day festival.

**Not copied (kept simple):** accommodation, cooling units, power, safety, transport legs, timeline events, action items, open questions, finance rows, forecasts, docs. These are festival-specific and usually not identical between cities — you can add them per city.

## Then delete the original

After all 8 are created and verified, the current `gron-koncert-uge1-2026` festival and all its child rows are deleted (`ON DELETE CASCADE` where set; manual cleanup otherwise).

## How it runs

Everything happens in a single SQL migration inside one transaction, so either all 8 festivals appear cleanly or nothing changes. No code changes needed — the app already handles multiple festivals.

## Technical notes

- Uses `INSERT ... SELECT` per table with a generated `new_id = gen_random_uuid()` and a mapping CTE for FK remapping (positions → shifts).
- Slugs and names are hardcoded per the table above; everything else is copied verbatim from the source row.
- Date shift logic: for shift-bearing tables, `shift_date := <target festival day>` (single-day festival, so all shifts collapse onto that day).
- Original festival row is deleted last; child rows without cascade are deleted first.

Approve and I'll write and run the migration.
