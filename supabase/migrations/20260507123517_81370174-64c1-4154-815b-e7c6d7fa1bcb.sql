BEGIN;

-- PART 1 — SCHEMA PATCH v1.3
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS operational_name TEXT;
UPDATE concepts SET operational_name = 'Fish & Chips'   WHERE slug = 'fish-and-chips';
UPDATE concepts SET operational_name = 'Gyros'          WHERE slug = 'gyropolis-gyros';
UPDATE concepts SET operational_name = 'Pancake'        WHERE slug = 'la-creperie';
UPDATE concepts SET operational_name = 'Fried Chicken'  WHERE slug = 'chicks-n-buns';

ALTER TABLE festival_concepts 
    ADD COLUMN IF NOT EXISTS tent_size TEXT,
    ADD COLUMN IF NOT EXISTS has_dish_area BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS dish_area_size TEXT,
    ADD COLUMN IF NOT EXISTS planned_headcount INT,
    ADD COLUMN IF NOT EXISTS roles_breakdown TEXT,
    ADD COLUMN IF NOT EXISTS power_kw NUMERIC,
    ADD COLUMN IF NOT EXISTS power_amps NUMERIC;

ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS delivers_to_festival BOOLEAN DEFAULT false;
UPDATE storage_locations SET delivers_to_festival = true,
    delivery_notes = 'Central storage AND delivery partner. Pre-bought goods stored here, then delivered directly to any festival site.'
    WHERE slug = 'saaby';
UPDATE storage_locations SET delivers_to_festival = false WHERE slug IN ('soborg', 'sydhavn');

-- PART 2 — INCO + Megahouse/Ryan Food (no country column on suppliers)
INSERT INTO suppliers (slug, name, category, invoiced_to, notes) VALUES
    ('inco', 'INCO', 'dry-goods', NULL,
     'Pancake mix specialist + Nutella + dry groceries. Delivered to Søborg ~1 week before festival. Country: DK.')
ON CONFLICT (slug) DO NOTHING;

UPDATE suppliers SET notes = 
    'Dry goods / produce. Owned by Arab House group (along with Ryan Food). Also referred to as "Arab Arhus" or "Arab House". Onions, tomatoes, greens, fries.'
    WHERE slug = 'megahouse';

UPDATE suppliers SET notes = 
    'Dry goods / produce. Owned by Arab House group (along with Megahouse).'
    WHERE slug = 'ryan-food';

-- PART 3 — JELLING 2026 FESTIVAL ROW
INSERT INTO festivals (
    slug, name, year, start_date, end_date, setup_date, breakdown_date,
    address, city, country, organiser_name, organiser_phone, organiser_email, notes, is_active
) VALUES (
    'jelling-2026', 'Jelling Musikfestival', 2026,
    '2026-05-21', '2026-05-24', '2026-05-18', '2026-05-25',
    'Mølvangvej 66B', 'Jelling', 'DK',
    'Jonas Kring', '+45 22 96 91 61', 'jonas@nicolinehus.dk',
    'Operations plan v4 baseline. Setup 18 May early morning. Breakdown 25 May morning. Hard deadline: stalls + el + gas connected by 20 May 09:00 (gas & brand inspection).',
    true
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
    setup_date = EXCLUDED.setup_date, breakdown_date = EXCLUDED.breakdown_date,
    address = EXCLUDED.address, city = EXCLUDED.city,
    organiser_name = EXCLUDED.organiser_name, organiser_phone = EXCLUDED.organiser_phone,
    organiser_email = EXCLUDED.organiser_email, notes = EXCLUDED.notes, updated_at = NOW();

-- PART 4 — FESTIVAL CONCEPTS
WITH f AS (SELECT id FROM festivals WHERE slug = 'jelling-2026')
INSERT INTO festival_concepts (
    festival_id, concept_id, zone, stall_name, tent_size, has_dish_area, dish_area_size,
    planned_headcount, roles_breakdown, power_kw, power_amps
)
SELECT f.id, c.id, z.zone, z.stall_name, z.tent_size, z.has_dish_area, z.dish_area_size,
       z.headcount, z.roles, z.kw, z.amps
FROM f CROSS JOIN (VALUES
    ('fish-and-chips',  'INSIDE',  'Fish & Chips Stage',   '6x9m', true,  '3x3m', 8, '2 cashier, 2 assembling, 1 fries cook, 1 fish cook, 1 burger, 1 runner', 80::numeric, 115.5::numeric),
    ('gyropolis-gyros', 'INSIDE',  'Gyros Stage',          '6x9m', false, NULL,   9, '2 cashier, 1 pita, 1 fries cook, 1 oven/runner, 1 wrap, 2 assembling, 1 assembling wrap', 73::numeric, 105.5::numeric),
    ('la-creperie',     'CAMPING', 'Pancake Camping',      '6x6m', true,  '3x3m', 4, '1 cashier, 2 assembling, 1 prep+runner', 30::numeric, 43::numeric),
    ('chicks-n-buns',   'CAMPING', 'Fried Chicken Camping','6x6m', false, NULL,   4, '1 cashier, 1 cook, 1 assembling, 1 runner', NULL::numeric, NULL::numeric)
) AS z(concept_slug, zone, stall_name, tent_size, has_dish_area, dish_area_size, headcount, roles, kw, amps)
JOIN concepts c ON c.slug = z.concept_slug
ON CONFLICT (festival_id, concept_id, zone) DO UPDATE SET
    stall_name = EXCLUDED.stall_name, tent_size = EXCLUDED.tent_size,
    has_dish_area = EXCLUDED.has_dish_area, dish_area_size = EXCLUDED.dish_area_size,
    planned_headcount = EXCLUDED.planned_headcount, roles_breakdown = EXCLUDED.roles_breakdown,
    power_kw = EXCLUDED.power_kw, power_amps = EXCLUDED.power_amps;

-- PART 5 — DEADLINES
WITH f AS (SELECT id FROM festivals WHERE slug = 'jelling-2026')
INSERT INTO festival_deadlines (festival_id, title, description, deadline_at, is_hard, consequence, status)
SELECT f.id, d.title, d.description, d.deadline_at, d.is_hard, d.consequence, 'pending'
FROM f CROSS JOIN (VALUES
    ('Gas + Brand Inspection', 'All stalls fully set up with electricity + gas connected. Mandatory inspection by festival authority.', TIMESTAMPTZ '2026-05-20 09:00:00+02', true, 'If not met, approval at The Fish Project''s own expense.'),
    ('Façade Print Deadline', 'All façade designs must be finalized and sent for print. Chicks ''n'' Buns chicken layout still missing as of plan v4.', TIMESTAMPTZ '2026-05-08 17:00:00+02', false, 'Late prints risk arrival delays.'),
    ('BC Catering Order Delivery', 'BC Catering groceries delivered to Jelling site.', TIMESTAMPTZ '2026-05-20 12:00:00+02', true, 'Order must be in place before this date for delivery on 20 May.'),
    ('JEKA / Fiskerikajen Order Delivery', 'Fresh fish delivered to Jelling site. Orders to be placed in advance.', TIMESTAMPTZ '2026-05-20 12:00:00+02', true, 'Fresh fish failure = no Fish & Chips operational.'),
    ('Saaby Delivery to Jelling', 'Pita, chicken meat for gyros, chicken nuggets — delivered from Saaby central storage to Jelling site.', TIMESTAMPTZ '2026-05-20 12:00:00+02', true, 'Saaby goods are pre-bought and stored. Delivery to site must be coordinated.'),
    ('Kavsmann Pickup (Copenhagen)', 'Dressings (tartar, chilli mayo) picked up from Kavsmann CPH, stored overnight in Søborg fridge car.', TIMESTAMPTZ '2026-05-19 17:00:00+02', false, 'Dressings must arrive in cold chain.'),
    ('INCO + Søborg + Kolkek Pre-Festival', 'Pancake powder mix, Nutella, dry groceries, packaging delivered to Søborg ~1 week before festival.', TIMESTAMPTZ '2026-05-14 17:00:00+02', false, 'Late dry-goods = setup delay.')
) AS d(title, description, deadline_at, is_hard, consequence)
ON CONFLICT DO NOTHING;

-- PART 6 — ACTION ITEMS
WITH f AS (SELECT id FROM festivals WHERE slug = 'jelling-2026')
INSERT INTO festival_action_items (festival_id, title, description, category, owner, due_date, status, priority)
SELECT f.id, a.title, a.description, a.category, a.owner, a.due_date, 'open', a.priority
FROM f CROSS JOIN (VALUES
    ('Confirm dishwasher sink — ours or theirs?', 'Plan v4 says: "DISWASHER SINK IS OUR OR THEM ?" Need to verify with festival before setup.', 'logistics', 'Alexandra', DATE '2026-05-15', 'high'),
    ('Send Chicks ''n'' Buns façade for print', 'Chicken layout missing from façade pack as of plan v4. Print deadline imminent.', 'logistics', 'Alexandra', DATE '2026-05-08', 'critical'),
    ('Confirm freezer for Chicks ''n'' Buns', 'Plan v4 says: "FREEZER Needed for crispy chicken concept - TO FIND OUT."', 'logistics', 'Costel', DATE '2026-05-15', 'high'),
    ('Confirm cooler trailer KW', 'Cooler trailer power consumption unknown — needed for total power calc.', 'logistics', 'Costel', DATE '2026-05-15', 'normal'),
    ('Confirm Pancake + Fried Chicken tent sizes', 'Plan v4 has 6x6m as default but flagged "SIZE OF TENT ?" for both camping concepts.', 'logistics', 'Alexandra', DATE '2026-05-12', 'normal'),
    ('Book accommodation', 'Plan v4 says "ACCOMODATION – TO FIND OUT". Need cabins/hotel for crew.', 'logistics', 'Alexandra', DATE '2026-05-12', 'high'),
    ('Confirm Fish service box vs Gyros combo box', 'Plan v4 asks: "Fish service boxes gyros combo same box?" — packaging consolidation question.', 'operations', 'Alexandra', DATE '2026-05-13', 'normal'),
    ('Finalize prices in POS', 'All concept prices must be finalized and approved in POS — Alexandra.', 'operations', 'Alexandra', DATE '2026-05-15', 'high'),
    ('Print allergy signs + E-smiley', 'Costel to print — needs to confirm which version is required.', 'safety', 'Costel', DATE '2026-05-17', 'normal'),
    ('Decide menu picture display', 'Plan v4 asks: "PICTURE OF MENU ?" — visual menu display TBD.', 'planning', 'Alexandra', DATE '2026-05-15', 'low'),
    ('Gas installation with Ronny VVS', 'Plan v4 notes: "GAS INSTALATION IN PROGRES- RONNY VVS – TO BE DISCUSSED". Need confirmation of installation slot before 20 May 09:00 inspection.', 'logistics', 'Marius', DATE '2026-05-15', 'critical'),
    ('Recruit staff (2 weeks before)', 'Plan v4 staffing rule: recruit 2 weeks before festival start. Target 25 stall staff + setup crew + managers.', 'operations', 'Alexandra', DATE '2026-05-07', 'high'),
    ('Confirm BC Trolley contents — Chicks ''n'' Buns', 'BC Trolley list for Fried Chicken concept is empty in plan v4. Needs to be filled per template.', 'operations', 'Costel', DATE '2026-05-13', 'high'),
    ('Order Europcar rentals (2 big cars with lift)', 'Plan v4: 2 rented Europcar big cars with lift for equipment transport. Plus IVECO with lift for goods. Plus Søborg-Jelling van 8+1.', 'logistics', 'Marius', DATE '2026-05-13', 'high'),
    ('DAKA used oil container delivery', 'DAKA must supply sealed containers for used oil disposal. Confirm delivery to Jelling site for collection.', 'safety', 'Costel', DATE '2026-05-18', 'normal')
) AS a(title, description, category, owner, due_date, priority)
ON CONFLICT DO NOTHING;

-- PART 7 — DISHES
WITH c AS (SELECT id, slug FROM concepts)
INSERT INTO dishes (concept_id, slug, name, sale_price_dkk, description, is_active)
SELECT c.id, d.slug, d.name, d.price, d.description, true
FROM c JOIN (VALUES
    ('fish-and-chips', 'classic-fish-and-chips', 'Classic Fish & Chips',  NULL::numeric, 'Beer-battered fresh fish with hand-cut fries'),
    ('fish-and-chips', 'fish-burger',            'Fish Burger',           NULL::numeric, 'Breaded fish patty in burger bun with coleslaw'),
    ('fish-and-chips', 'kids-fish-and-chips',    'Kids Fish & Chips',     NULL::numeric, 'Smaller portion'),
    ('gyropolis-gyros', 'pita-pork-gyros',   'Pita Pork Gyros',     NULL::numeric, 'Pork gyros in pita with veggies, tzatziki'),
    ('gyropolis-gyros', 'pita-chicken-gyros','Pita Chicken Gyros',  NULL::numeric, 'Chicken gyros in pita with veggies, tzatziki'),
    ('gyropolis-gyros', 'wrap-gyros',        'Wrap Gyros',          NULL::numeric, 'Gyros in wrap'),
    ('gyropolis-gyros', 'gyros-fries-box',   'Gyros + Fries Box',   NULL::numeric, 'Gyros meat over fries with sauce'),
    ('la-creperie', 'sweet-pancake-nutella',     'Nutella Pancake',          NULL::numeric, 'Sweet pancake with Nutella'),
    ('la-creperie', 'sweet-pancake-banana',      'Banana Nutella Pancake',   NULL::numeric, 'Sweet pancake with banana + Nutella'),
    ('la-creperie', 'sweet-pancake-strawberry',  'Strawberry Pancake',       NULL::numeric, 'Sweet pancake with strawberry marmalade'),
    ('la-creperie', 'savory-pancake-cheese',     'Savory Cheese Pancake',    NULL::numeric, 'Mozzarella + cheddar'),
    ('la-creperie', 'savory-pancake-serrano',    'Savory Serrano Pancake',   NULL::numeric, 'Serrano ham + cheese + spinach'),
    ('chicks-n-buns', 'fried-chicken-bun',  'Fried Chicken Bun',  NULL::numeric, 'Crispy fried chicken in bun'),
    ('chicks-n-buns', 'fried-chicken-fries','Fried Chicken + Fries', NULL::numeric, 'Crispy fried chicken with fries')
) AS d(concept_slug, slug, name, price, description) ON c.slug = d.concept_slug
ON CONFLICT (concept_id, slug) DO NOTHING;

-- PART 8 — RECIPE NOTES
UPDATE dishes SET description = description || E'\n\nFISH BATTER RECIPE (prep):\n- Flour 1 kg, Maizena 300g, Black pepper 25g, Sodium bicarbonate 5g, Salt 85g, Beer 4.5 cans, Sparkling water 0.5 bottle, Honey 0.5 spoon. Beer + water cold. Bowl + tools cold.'
WHERE slug = 'classic-fish-and-chips';

UPDATE dishes SET description = description || E'\n\nBURGER COLESLAW RECIPE (prep):\n- Mix salad (green cabbage, red cabbage, carrot) 500g, Tartar sauce 120-150g, Lemon 0.5 portion, Honey 1 tsp, Black pepper 2-3g, Salt 5g, Green apple 1 portion grated.'
WHERE slug = 'fish-burger';

UPDATE dishes SET description = description || E'\n\nBURGER MIXED FLOUR (breading prep):\n- Flour 1kg, Panko (qty TBD), Maizena 300g, Salt 80g, Garlic powder 10g, Black pepper 10g, Semola 660g, Paprika 10g, Cayenne 10g.'
WHERE slug = 'fish-burger';

UPDATE dishes SET description = description || E'\n\nPANCAKE DOUGH RECIPE (prep):\n- 1 box mixed flour dough (4 × 2.5 KG), Water 13.2 L, Sugar 500g, Vanilla 200g, Oil 50ml, Salt 5g.\n- Yields 20L dough ≈ 150 pancakes. Store in 10L containers in fridge.'
WHERE slug IN ('sweet-pancake-nutella', 'sweet-pancake-banana', 'sweet-pancake-strawberry');

COMMIT;