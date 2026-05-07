
-- Schema extension for roster-level shift blocks
ALTER TABLE public.festival_shifts ALTER COLUMN staff_id DROP NOT NULL;
ALTER TABLE public.festival_shifts
  ADD COLUMN IF NOT EXISTS shift_name text,
  ADD COLUMN IF NOT EXISTS crosses_midnight boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS planned_crew_size integer,
  ADD COLUMN IF NOT EXISTS shift_type text;

BEGIN;

-- ============ PART 1: STAFF ROSTER ============

-- 1A. Setup crew (5)
INSERT INTO festival_staff (
    festival_id, concept_id, name, role, staff_source, wristband_type,
    works_thursday, works_friday, works_saturday, works_sunday,
    confirmed, notes
)
SELECT
    (SELECT id FROM festivals WHERE slug='jelling-2026'),
    NULL, x.name, x.role, 'soborg', 'sort-partout',
    true, true, true, true, true, x.notes
FROM (VALUES
    ('Alexandra Artimon (Fif)', 'Founder / operations lead — all concepts',
     'Setup crew. Drives BMW. Sort partout. May stay extra night 25 May.'),
    ('Marius Artimon',          'Setup + kitchen — all concepts',
     'Setup crew. Drives Europcar lift #1. Sort partout. Drives back separately 25 May.'),
    ('Costel',                  'Logistics + levnedsmiddel compliance + signs — all concepts',
     'Setup crew. Drives Europcar lift #2. Sort partout. Food authority lead.'),
    ('Marko',                   'Setup + kitchen — all concepts',
     'Setup crew. Drives Europcar lift #3. Sort partout.'),
    ('Anca',                    'Setup + kitchen — all concepts',
     'Setup crew. Drives Iveco. Sort partout.')
) AS x(name, role, notes);

-- 1B. Fish & Chips (8)
INSERT INTO festival_staff (festival_id, concept_id, name, role, staff_source, wristband_type,
    works_thursday, works_friday, works_saturday, works_sunday, total_hours_planned, confirmed, notes)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),
       (SELECT id FROM concepts WHERE slug='fish-and-chips'),
       NULL, x.role, x.source, x.wb, true, true, true, true, x.hours, false, x.notes
FROM (VALUES
    ('Fish cook',     'soborg', 'sort-partout',   51.5, 'Søborg crew. Beer-batter fish frying.'),
    ('Fries cook',    'soborg', 'normal-partout', 51.5, 'Søborg crew. Fries station.'),
    ('Burger',        'soborg', 'normal-partout', 51.5, 'Søborg crew. Fish burger station.'),
    ('Assembly lead', 'soborg', 'sort-partout',   51.5, 'Søborg crew. Assembly line lead.'),
    ('Assembly',      'local',  'normal-partout', 51.5, 'Local hire. Assembly support.'),
    ('Cashier #1',    'local',  'normal-partout', 51.5, 'Local hire. Cash register.'),
    ('Cashier #2',    'local',  'normal-partout', 51.5, 'Local hire. Cash register.'),
    ('Runner',        'local',  'normal-partout', 51.5, 'Local hire. Stock runner.')
) AS x(role, source, wb, hours, notes);

-- 1C. Gyros (9)
INSERT INTO festival_staff (festival_id, concept_id, name, role, staff_source, wristband_type,
    works_thursday, works_friday, works_saturday, works_sunday, total_hours_planned, confirmed, notes)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),
       (SELECT id FROM concepts WHERE slug='gyropolis-gyros'),
       NULL, x.role, x.source, x.wb, true, true, true, true, x.hours, false, x.notes
FROM (VALUES
    ('Pita',          'soborg', 'sort-partout',   52.6, 'Søborg crew. Pita preparation.'),
    ('Griddle',       'soborg', 'sort-partout',   52.6, 'Søborg crew. Chicken meat on griddle.'),
    ('Wrap',          'soborg', 'normal-partout', 52.6, 'Søborg crew. Gyros wrap assembly.'),
    ('Wrap assembly', 'soborg', 'normal-partout', 52.6, 'Søborg crew. Wrap assembly support.'),
    ('Assembly lead', 'soborg', 'sort-partout',   52.6, 'Søborg crew. Assembly line lead.'),
    ('Oven/runner',   'local',  'sort-partout',   52.6, 'Local hire. Oven + stock runner.'),
    ('Assembly',      'local',  'normal-partout', 52.6, 'Local hire. Assembly support.'),
    ('Cashier #1',    'local',  'sort-partout',   52.6, 'Local hire. Cash register.'),
    ('Cashier #2',    'local',  'normal-partout', 52.6, 'Local hire. Cash register.')
) AS x(role, source, wb, hours, notes);

-- 1D. La Creperie (10)
INSERT INTO festival_staff (festival_id, concept_id, name, role, staff_source, wristband_type,
    works_thursday, works_friday, works_saturday, works_sunday, total_hours_planned, confirmed, notes)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),
       (SELECT id FROM concepts WHERE slug='la-creperie'),
       NULL, x.role, x.source, x.wb, true, true, true, true, x.hours, false, x.notes
FROM (VALUES
    ('Pancake cook (Breakfast)', 'soborg', 'sort-partout',   37.6, 'Søborg crew. Breakfast shift cook.'),
    ('Pancake cook (Mid)',       'soborg', 'normal-partout', 37.6, 'Søborg crew. Mid shift cook.'),
    ('Pancake cook (Night)',     'soborg', 'normal-partout', 37.6, 'Søborg crew. Night shift cook.'),
    ('Assembly lead #1',         'soborg', 'sort-partout',   37.6, 'Søborg crew. Assembly lead.'),
    ('Assembly lead #2',         'soborg', 'normal-partout', 37.6, 'Søborg crew. Assembly lead.'),
    ('Cashier #1',               'local',  'sort-partout',   37.6, 'Local hire. Cash register.'),
    ('Cashier #2',               'local',  'normal-partout', 37.6, 'Local hire. Cash register.'),
    ('Assembly',                 'local',  'normal-partout', 37.6, 'Local hire. Assembly support.'),
    ('Runner/prep #1',           'local',  'normal-partout', 37.6, 'Local hire. Runner + prep.'),
    ('Runner/prep #2',           'local',  'normal-partout', 37.6, 'Local hire. Runner + prep.')
) AS x(role, source, wb, hours, notes);

-- 1E. Chicks 'n' Buns (12)
INSERT INTO festival_staff (festival_id, concept_id, name, role, staff_source, wristband_type,
    works_thursday, works_friday, works_saturday, works_sunday, total_hours_planned, confirmed, notes)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),
       (SELECT id FROM concepts WHERE slug='chicks-n-buns'),
       NULL, x.role, x.source, x.wb, true, true, true, true, x.hours, false, x.notes
FROM (VALUES
    ('Chicken cook (Breakfast)', 'soborg', 'sort-partout',   34.3, 'Søborg crew. Breakfast shift cook.'),
    ('Chicken cook (Mid)',       'soborg', 'normal-partout', 34.3, 'Søborg crew. Mid shift cook.'),
    ('Chicken cook (Night)',     'soborg', 'normal-partout', 34.3, 'Søborg crew. Night shift cook.'),
    ('Assembly lead #1',         'soborg', 'sort-partout',   34.3, 'Søborg crew. Assembly lead.'),
    ('Assembly lead #2',         'soborg', 'normal-partout', 34.3, 'Søborg crew. Assembly lead.'),
    ('Assembly',                 'local',  'normal-partout', 34.3, 'Local hire. Assembly support.'),
    ('Cashier #1',               'local',  'sort-partout',   34.3, 'Local hire. Cash register.'),
    ('Cashier #2',               'local',  'normal-partout', 34.3, 'Local hire. Cash register.'),
    ('Cashier #3',               'local',  'normal-partout', 34.3, 'Local hire. Cash register.'),
    ('Runner #1',                'local',  'normal-partout', 34.3, 'Local hire. Stock runner.'),
    ('Runner #2',                'local',  'normal-partout', 34.3, 'Local hire. Stock runner.'),
    ('Runner #3',                'local',  'normal-partout', 34.3, 'Local hire. Stock runner.')
) AS x(role, source, wb, hours, notes);

-- ============ PART 2: VAGTPLAN SHIFTS ============

-- 2A. Fish & Chips (8)
INSERT INTO festival_shifts (festival_id, concept_id, shift_name, shift_date, start_time, end_time, crosses_midnight, planned_crew_size, shift_type, notes) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='fish-and-chips'), 'Early Group Thursday', '2026-05-21', '10:00', '22:00', false, 4, 'full-crew', 'Setup + prep + service. 4×12h = 48h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='fish-and-chips'), 'Late Group Thursday', '2026-05-21', '10:00', '02:00', true, 4, 'full-crew', 'Setup + prep + full service + late close. 4×16h = 64h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='fish-and-chips'), 'Early Group Friday', '2026-05-22', '08:30', '22:00', false, 4, 'half-crew', 'Prep + half + peak. 4×13.5h = 54h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='fish-and-chips'), 'Late Group Friday', '2026-05-22', '14:30', '02:00', true, 4, 'peak', 'Peak + late close. 4×11.5h = 46h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='fish-and-chips'), 'Early Group Saturday', '2026-05-23', '08:30', '23:00', false, 4, 'half-crew', 'Sat peak extended +1h per 2025 data. 4×14.5h = 58h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='fish-and-chips'), 'Late Group Saturday', '2026-05-23', '14:30', '02:00', true, 4, 'peak', 'Peak + late close. 4×11.5h = 46h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='fish-and-chips'), 'Early Group Sunday', '2026-05-24', '08:30', '22:00', false, 4, 'half-crew', 'Last day. 4×13.5h = 54h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='fish-and-chips'), 'Late Group Sunday', '2026-05-24', '14:30', '01:00', true, 4, 'peak', 'Peak + earlier close. 4×10.5h = 42h.');

-- 2B. Gyros (8)
INSERT INTO festival_shifts (festival_id, concept_id, shift_name, shift_date, start_time, end_time, crosses_midnight, planned_crew_size, shift_type, notes) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='gyropolis-gyros'), 'Early Group Thursday', '2026-05-21', '09:00', '22:00', false, 4, 'full-crew', 'Gyros starts 09:00 (1h earlier). 4×13h = 52h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='gyropolis-gyros'), 'Late Group Thursday', '2026-05-21', '09:00', '02:00', true, 5, 'full-crew', 'Late group 5 ppl. 5×17h = 85h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='gyropolis-gyros'), 'Early Group Friday', '2026-05-22', '08:30', '22:00', false, 4, 'half-crew', 'Prep + half + peak. 4×13.5h = 54h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='gyropolis-gyros'), 'Late Group Friday', '2026-05-22', '14:30', '02:00', true, 5, 'peak', 'Peak + late close. 5×11.5h = 57.5h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='gyropolis-gyros'), 'Early Group Saturday', '2026-05-23', '08:30', '23:00', false, 5, 'half-crew', 'SWAP. 5×14.5h = 72.5h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='gyropolis-gyros'), 'Late Group Saturday', '2026-05-23', '14:30', '02:00', true, 4, 'peak', '4×11.5h = 46h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='gyropolis-gyros'), 'Early Group Sunday', '2026-05-24', '08:30', '22:00', false, 4, 'half-crew', 'SWAP BACK. 4×13.5h = 54h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='gyropolis-gyros'), 'Late Group Sunday', '2026-05-24', '14:30', '01:00', true, 5, 'peak', 'Peak + earlier close. 5×10.5h = 52.5h.');

-- 2C. La Creperie (11)
INSERT INTO festival_shifts (festival_id, concept_id, shift_name, shift_date, start_time, end_time, crosses_midnight, planned_crew_size, shift_type, notes) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Day Crew Thursday', '2026-05-21', '09:00', '22:00', false, 8, 'full-crew', 'Setup + service start. 8×13h = 104h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Night Shift Thursday', '2026-05-21', '22:00', '03:00', true, 4, 'service', 'Stay past 22:00. 4×5h = 20h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Breakfast Friday', '2026-05-22', '06:00', '14:00', false, 2, 'prep', '06:00 arrival. 2×8h = 16h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Mid Shift Friday', '2026-05-22', '12:00', '20:00', false, 4, 'service', 'Lunch + afternoon. 4×8h = 32h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Night Shift Friday', '2026-05-22', '18:00', '03:00', true, 4, 'peak', 'Evening peak + close. 4×9h = 36h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Breakfast Saturday', '2026-05-23', '06:00', '14:00', false, 2, 'prep', '2×8h = 16h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Mid Shift Saturday', '2026-05-23', '12:00', '20:00', false, 4, 'service', '4×8h = 32h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Night Shift Saturday', '2026-05-23', '18:00', '03:00', true, 4, 'peak', '4×9h = 36h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Breakfast Sunday', '2026-05-24', '06:00', '14:00', false, 2, 'prep', 'Final rotation. 2×8h = 16h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Mid Shift Sunday', '2026-05-24', '12:00', '20:00', false, 4, 'service', '4×8h = 32h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='la-creperie'), 'Night Shift Sunday', '2026-05-24', '18:00', '03:00', true, 4, 'peak', 'Last night. 4×9h = 36h.');

-- 2D. Chicks 'n' Buns (11)
INSERT INTO festival_shifts (festival_id, concept_id, shift_name, shift_date, start_time, end_time, crosses_midnight, planned_crew_size, shift_type, notes) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Day Crew Thursday', '2026-05-21', '09:00', '22:00', false, 8, 'full-crew', 'Setup + service. 8×13h = 104h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Night Shift Thursday', '2026-05-21', '22:00', '03:00', true, 4, 'service', '4×5h = 20h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Breakfast Friday', '2026-05-22', '06:00', '14:00', false, 3, 'prep', '3 ppl. 3×8h = 24h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Mid Shift Friday', '2026-05-22', '11:00', '20:00', false, 4, 'service', '4×9h = 36h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Night Shift Friday', '2026-05-22', '18:00', '03:00', true, 4, 'peak', '4×9h = 36h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Breakfast Saturday', '2026-05-23', '06:00', '14:00', false, 3, 'prep', '3×8h = 24h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Mid Shift Saturday', '2026-05-23', '11:00', '20:00', false, 4, 'service', '4×9h = 36h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Night Shift Saturday', '2026-05-23', '18:00', '03:00', true, 4, 'peak', '4×9h = 36h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Breakfast Sunday', '2026-05-24', '06:00', '14:00', false, 3, 'prep', '3×8h = 24h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Mid Shift Sunday', '2026-05-24', '11:00', '20:00', false, 4, 'service', '4×9h = 36h.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), (SELECT id FROM concepts WHERE slug='chicks-n-buns'), 'Night Shift Sunday', '2026-05-24', '18:00', '03:00', true, 4, 'peak', 'Last night. 4×9h = 36h.');

-- ============ PART 3: FINAL ACTION ITEMS (20) ============

INSERT INTO festival_action_items (festival_id, title, description, category, owner, due_date, status, priority) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Recruit 20 local staff in Jelling', 'Cashiers, runners, supporting assembly across 4 concepts: Fish 4 + Gyros 4 + Creperie 5 + Chicks 7 = 20 local hires.', 'hr', 'Alexandra', DATE '2026-05-12', 'open', 'critical'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Finalise 19 Søborg staff list and assignments', 'Fill in actual names against the 19 placeholder rows in festival_staff. Must align with vagtplan shifts.', 'hr', 'Alexandra', DATE '2026-05-11', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Request 39 wristbands from festival via portal', '20 sort partout + 24 normal partout = 44 max contracted. Currently using 39.', 'compliance', 'Alexandra', DATE '2026-05-15', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Publish vagtplaner to team and confirm availability', 'Share Thu/Fri/Sat/Sun shift grids per concept with all 39 staff.', 'hr', 'Alexandra', DATE '2026-05-11', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Make employment contracts + collect info for salary', 'Find employees, get info + contracts so they can get salary.', 'hr', 'Alexandra', DATE '2026-05-12', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Create volunteers + employees in Festival recruiting system', 'Festival may have a recruiting/scheduling portal.', 'compliance', 'Alexandra', DATE '2026-05-12', 'open', 'normal'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Pre-festival briefing to all 19 TFP staff', 'Vagtplan + discipline + safety briefing.', 'operations', 'Alexandra', DATE '2026-05-21', 'open', 'normal'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Confirm all suppliers aligned on 20 May before-10:00 delivery window', 'BC Catering, JEKA/Fiskerikajen, Saaby, Arab Aarhus/Megahouse, Kavsman, Inco, Søborg/Kolkek.', 'logistics', 'Alexandra', DATE '2026-05-11', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Confirm Jelling-provided EventPos kasseterminal install time on 19 May', 'Jelling staff installs POS terminals. Need install time confirmed before 12 May.', 'pos', 'Alexandra', DATE '2026-05-12', 'open', 'normal'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Confirm with Costel: hygiejnekursus + allergy signs + E-smiley printing', 'Each concept needs food handler certificates, allergy signs visible, E-smiley display.', 'compliance', 'Costel', DATE '2026-05-11', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Inventory F-mark extinguishers + fire blankets (need 4+4)', 'Need 4 F-class extinguishers + 4 fire blankets, all valid service date.', 'safety', 'Costel', DATE '2026-05-11', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Inventory first aid kits (need 4 with burn gel)', 'Each concept needs first aid kit on site.', 'safety', 'Costel', DATE '2026-05-11', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Confirm Fidibus + Jonas BR18 façade compliance is on track', 'BR18-lovgivning 2026 new requirement. Fidibus handling directly with Jonas Kring.', 'compliance', 'Alexandra', DATE '2026-05-15', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Hot-oil operational briefing on 18 May for Fish/Gyros/Chicks fry staff', 'F-mark extinguisher locations, NEVER water on oil, oil temps, burn gel use.', 'safety', 'Costel', DATE '2026-05-18', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Finalize prices in EventPos (verify 15 April deadline)', 'Contract deadline 15 April for setting up sortiment + prices in POS.', 'pos', 'Alexandra', DATE '2026-05-09', 'open', 'critical'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Coordinate setup crew travel with Fidibus (3× lift convoy 18 May)', 'Confirm departure time, route, on-site coordination with Fidibus crew.', 'logistics', 'Marius', DATE '2026-05-15', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Make packing list (who packs what onto which lift vehicle)', 'Final packing list before 18 May load.', 'logistics', 'Costel', DATE '2026-05-17', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Make setup list (who does what on 18 May)', 'Assign setup tasks to each of 5 setup crew members.', 'operations', 'Alexandra', DATE '2026-05-15', 'open', 'normal'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Make salary payments for all 39 staff after festival', 'Calculate hours and pay all staff. 1,673.5 total person-hours.', 'finance', 'Alexandra', DATE '2026-06-08', 'open', 'normal'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'BC Catering trolley/shelves/box pickup arrangement', 'Confirm pickup arrangement for leftover BC Catering grocery items.', 'logistics', 'Costel', DATE '2026-05-15', 'open', 'normal');

COMMIT;
