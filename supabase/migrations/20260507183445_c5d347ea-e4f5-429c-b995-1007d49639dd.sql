BEGIN;

ALTER TABLE festival_equipment ALTER COLUMN equipment_id DROP NOT NULL;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 1;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS power_unit TEXT;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS estimated_kw NUMERIC;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS fuel_type TEXT DEFAULT 'electric';
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS ownership TEXT DEFAULT 'owned';
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS is_shared_between_concepts BOOLEAN DEFAULT false;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS shared_concept_ids UUID[];
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS position_zone TEXT;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS position_notes TEXT;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS requires_inspection BOOLEAN DEFAULT false;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS is_spare BOOLEAN DEFAULT false;
ALTER TABLE festival_equipment ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS festival_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id UUID REFERENCES concepts(id),
    name TEXT, role TEXT NOT NULL,
    staff_source TEXT NOT NULL CHECK (staff_source IN ('soborg','local','fidibus','unknown')),
    wristband_type TEXT CHECK (wristband_type IN ('sort-partout','normal-partout','day-band','pending')),
    works_thursday BOOLEAN DEFAULT false, works_friday BOOLEAN DEFAULT false,
    works_saturday BOOLEAN DEFAULT false, works_sunday BOOLEAN DEFAULT false,
    total_hours_planned NUMERIC, confirmed BOOLEAN DEFAULT false,
    notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE festival_staff ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS festival_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id UUID NOT NULL REFERENCES concepts(id),
    shift_name TEXT NOT NULL, shift_date DATE NOT NULL,
    start_time TIME NOT NULL, end_time TIME NOT NULL,
    crosses_midnight BOOLEAN DEFAULT false, planned_crew_size INT NOT NULL,
    shift_type TEXT CHECK (shift_type IN ('prep','service','peak','half-crew','full-crew','setup','breakdown')),
    notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE festival_shifts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS dish_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    dish_id UUID NOT NULL REFERENCES dishes(id),
    price_dkk NUMERIC NOT NULL, price_includes_vat BOOLEAN DEFAULT true,
    notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(festival_id, dish_id)
);
ALTER TABLE dish_prices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='festival_staff' AND policyname='auth_users_all_access') THEN
    EXECUTE 'CREATE POLICY "auth_users_all_access" ON festival_staff FOR ALL TO authenticated USING (true) WITH CHECK (true)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='festival_shifts' AND policyname='auth_users_all_access') THEN
    EXECUTE 'CREATE POLICY "auth_users_all_access" ON festival_shifts FOR ALL TO authenticated USING (true) WITH CHECK (true)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dish_prices' AND policyname='auth_users_all_access') THEN
    EXECUTE 'CREATE POLICY "auth_users_all_access" ON dish_prices FOR ALL TO authenticated USING (true) WITH CHECK (true)'; END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_festival_staff_festival ON festival_staff(festival_id);
CREATE INDEX IF NOT EXISTS idx_festival_staff_concept ON festival_staff(concept_id);
CREATE INDEX IF NOT EXISTS idx_festival_shifts_festival2 ON festival_shifts(festival_id);
CREATE INDEX IF NOT EXISTS idx_festival_shifts_concept2 ON festival_shifts(concept_id);
CREATE INDEX IF NOT EXISTS idx_festival_shifts_date2 ON festival_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_dish_prices_festival ON dish_prices(festival_id);

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '16A', 1, 'baseline (included in fixed fee)', 'contract', '2026-01-01',
       'Festival contract — 1× 16A bundled with 3,000 DKK fixed fee', true,
       'BASELINE: Each contract includes 1× 16A free as part of the 3,000 DKK fixed fee.'
FROM festivals f, concepts c
WHERE f.slug = 'jelling-2026' AND c.slug IN ('fish-and-chips','gyropolis-gyros','la-creperie','chicks-n-buns');

UPDATE festival_power
SET is_current = false,
    notes = COALESCE(notes,'') || ' || SUPERSEDED 7 May 2026: Gas Fagor cancelled — replaced with 7× 16A electric.'
WHERE festival_id=(SELECT id FROM festivals WHERE slug='jelling-2026')
  AND concept_id=(SELECT id FROM concepts WHERE slug='gyropolis-gyros')
  AND source='email-update' AND power_unit='16A/3-phase' AND quantity=4;

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, source, source_date, source_reference, is_current, notes)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),
       (SELECT id FROM concepts WHERE slug='gyropolis-gyros'),
       '16A/3-phase', 7, 'main equipment (replacing cancelled gas Fagor)',
       'verbal','2026-05-07','Conversation 7 May 2026 — gas cancelled, all-electric',
       true,'Gyros went all-electric. Replaces previous 4×16A+gas allocation. Jonas Kring confirmed informed.';

UPDATE festival_contracts
SET tent_size='2× 6×9m tents joined operationally as 12×9m (gutter between)',
    notes = COALESCE(notes,'') || ' || REALITY 7 May 2026: 2× 6×9m joined as 12×9m.'
WHERE festival_id=(SELECT id FROM festivals WHERE slug='jelling-2026')
  AND concept_id IN ((SELECT id FROM concepts WHERE slug='fish-and-chips'),(SELECT id FROM concepts WHERE slug='gyropolis-gyros'));

UPDATE festival_contracts
SET tent_size='2× 6×6m tents joined operationally as 12×6m (gutter between)',
    notes = COALESCE(notes,'') || ' || REALITY 7 May 2026: 2× 6×6m joined as 12×6m.'
WHERE festival_id=(SELECT id FROM festivals WHERE slug='jelling-2026')
  AND concept_id IN ((SELECT id FROM concepts WHERE slug='la-creperie'),(SELECT id FROM concepts WHERE slug='chicks-n-buns'));

INSERT INTO festival_equipment (festival_id, concept_id, name, category, brand, quantity, power_unit, estimated_kw, fuel_type, ownership, position_zone, position_notes, requires_inspection, notes, qty)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),
       (SELECT id FROM concepts WHERE slug='fish-and-chips'),
       x.name, x.category, x.brand, x.qty, x.power, x.kw, 'electric','owned','INSIDE',x.pos,true,x.notes,x.qty
FROM (VALUES
  ('Big fryer Red Fox','fryer','Red Fox',1,'32A',7.4,'Center-left','Dedicated 32A fryer for fresh fish.'),
  ('Small fryer Amitek #1','fryer','Amitek',1,'16A',3.7,'Center-left front line','Dedicated 16A small fryer.'),
  ('Small fryer Amitek #2','fryer','Amitek',1,'16A',3.7,'Center-left front line','Dedicated 16A small fryer.'),
  ('Burger toaster','toaster',NULL,1,'230V',1.5,'Far-left wall, FP side','230V wall socket. Bun toasting.')
) AS x(name,category,brand,qty,power,kw,pos,notes);

INSERT INTO festival_equipment (festival_id, concept_id, name, category, brand, quantity, power_unit, estimated_kw, fuel_type, ownership, position_zone, position_notes, requires_inspection, notes, qty)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),
       (SELECT id FROM concepts WHERE slug='gyropolis-gyros'),
       x.name,x.category,x.brand,x.qty,x.power,x.kw,'electric','owned','INSIDE',x.pos,x.req,x.notes,x.qty
FROM (VALUES
  ('Griddle','griddle',NULL,1,'32A',7.4,true,'Center-right','Primary cook surface for chicken meat.'),
  ('Oven','oven',NULL,1,'16A',3.7,true,'Far-right wall','Warming/holding oven.'),
  ('Grill','grill',NULL,1,'16A',3.7,true,'Center-right','Vertical broiler/grill.'),
  ('Bain Marie','bain-marie',NULL,1,'230V',2.0,false,'Center-right','230V wall socket. Confirmed 230V (NOT 16A).'),
  ('Amitek fryer #1','fryer','Amitek',1,'16A',3.7,true,'Right-side fryer line','All-electric setup.'),
  ('Amitek fryer #2','fryer','Amitek',1,'16A',3.7,true,'Right-side fryer line','Dedicated 16A fryer.'),
  ('Amitek fryer #3','fryer','Amitek',1,'16A',3.7,true,'Right-side fryer line','Dedicated 16A fryer.')
) AS x(name,category,brand,qty,power,kw,req,pos,notes);

INSERT INTO festival_equipment (festival_id, concept_id, name, category, brand, quantity, power_unit, estimated_kw, fuel_type, ownership, is_shared_between_concepts, shared_concept_ids, position_zone, position_notes, requires_inspection, notes, qty)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, x.name, 'fryer', NULL, 1, '16A', 3.7, 'electric','owned',true,
  ARRAY[(SELECT id FROM concepts WHERE slug='fish-and-chips'),(SELECT id FROM concepts WHERE slug='gyropolis-gyros')],
  'INSIDE','Center middle row — FRIES station (shared)',true,'Shared fryer for fries — used by both Fish and Gyros.',1
FROM (VALUES ('Shared fryer #1 (FRIES)'),('Shared fryer #2 (FRIES)'),('Shared fryer #3 (FRIES)'),('Shared fryer #4 (FRIES)'),('Shared fryer #5 (FRIES)'),('Shared fryer #6 (FRIES)')) AS x(name);

INSERT INTO festival_equipment (festival_id, concept_id, name, category, brand, quantity, power_unit, estimated_kw, fuel_type, ownership, is_shared_between_concepts, shared_concept_ids, position_zone, position_notes, requires_inspection, notes, qty)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),NULL,'Godik fridge container (INSIDE)','fridge','Godik',1,'32A',10.25,'electric','rented',true,
  ARRAY[(SELECT id FROM concepts WHERE slug='fish-and-chips'),(SELECT id FROM concepts WHERE slug='gyropolis-gyros')],
  'INSIDE','Outside main tent, behind 3×3m pop-up area',true,'Godik 20ft container, booking 247741. 400V/32A CEE plug, 10,250W max.',1;

INSERT INTO festival_equipment (festival_id, concept_id, name, category, brand, quantity, power_unit, estimated_kw, fuel_type, ownership, position_zone, position_notes, requires_inspection, is_spare, notes, qty)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),(SELECT id FROM concepts WHERE slug='la-creperie'),
  x.name,'plate',NULL,1,'230V/2kW',2.0,'electric','owned','CAMPING',x.pos,false,x.is_spare,x.notes,1
FROM (VALUES
  ('Pancake plate #1 (prep)','Prep line',false,'Prep plate'),
  ('Pancake plate #2 (prep)','Prep line',false,'Prep plate'),
  ('Pancake plate #3 (prep)','Prep line',false,'Prep plate'),
  ('Pancake plate #4 (prep)','Prep line',false,'Prep plate'),
  ('Pancake plate #5 (prep)','Prep line',false,'Prep plate'),
  ('Pancake plate #6 (prep)','Prep line',false,'Prep plate'),
  ('Pancake plate #7 (service)','Service line',false,'Service plate'),
  ('Pancake plate #8 (service)','Service line',false,'Service plate'),
  ('Pancake plate #9 (service)','Service line',false,'Service plate'),
  ('Pancake plate #10 (peak)','Peak capacity',true,'Extra capacity for peak'),
  ('Pancake plate #11 (peak)','Peak capacity',true,'Extra capacity for peak'),
  ('Pancake plate #12 (peak)','Peak capacity',true,'Extra capacity for peak')
) AS x(name,pos,is_spare,notes);

INSERT INTO festival_equipment (festival_id, concept_id, name, category, brand, quantity, power_unit, estimated_kw, fuel_type, ownership, position_zone, position_notes, requires_inspection, notes, qty)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),(SELECT id FROM concepts WHERE slug='chicks-n-buns'),
  x.name,x.category,x.brand,1,x.power,x.kw,'electric','owned','CAMPING',x.pos,true,x.notes,1
FROM (VALUES
  ('Amitek fryer #1 (chicken)','fryer','Amitek','16A/3-phase',3.7,'Chicken fryer line','Chicken frying'),
  ('Amitek fryer #2 (chicken)','fryer','Amitek','16A/3-phase',3.7,'Chicken fryer line','Chicken frying'),
  ('Amitek fryer #3 (chicken)','fryer','Amitek','16A/3-phase',3.7,'Chicken fryer line','Chicken frying'),
  ('Amitek fryer #4 (fries)','fryer','Amitek','16A/3-phase',3.7,'Fries fryer','Fries'),
  ('Toaster','toaster',NULL,'16A',3.7,'Bun toasting line','Bun toasting'),
  ('Griddle','griddle',NULL,'16A',3.7,'Burger station','Burger patties')
) AS x(name,category,brand,power,kw,pos,notes);

INSERT INTO festival_equipment (festival_id, concept_id, name, category, brand, quantity, power_unit, estimated_kw, fuel_type, ownership, is_shared_between_concepts, shared_concept_ids, position_zone, position_notes, requires_inspection, notes, qty)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'),NULL,'Godik fridge container (CAMPING)','fridge','Godik',1,'32A',10.25,'electric','rented',true,
  ARRAY[(SELECT id FROM concepts WHERE slug='la-creperie'),(SELECT id FROM concepts WHERE slug='chicks-n-buns')],
  'CAMPING','Outside main tent, behind 3×3m pop-up area',true,'Godik 20ft container, booking 247741. Mode TBD.',1;

INSERT INTO dish_prices (festival_id, dish_id, price_dkk, price_includes_vat, notes)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'), d.id, x.price, true, x.notes
FROM dishes d
JOIN (VALUES
  ('classic-fish-and-chips',125.0,'Source: MENU + PRICES'),
  ('fish-burger',119.0,'Source: MENU + PRICES'),
  ('fries-only-fish',50.0,'Source: MENU + PRICES'),
  ('pita-chicken-gyros',109.0,'Source: MENU + PRICES'),
  ('fries-only-gyros',50.0,'Source: MENU + PRICES'),
  ('savory-pancake-ham-cheese',95.0,'Salty crepe'),
  ('savory-pancake-mushroom-cheese',95.0,'Salty crepe'),
  ('sweet-pancake-nutella',55.0,'Sweet crepe'),
  ('sweet-pancake-strawberry-sugar',55.0,'Sweet crepe'),
  ('sweet-pancake-sugar-lemon',50.0,'Sweet crepe')
) AS x(dish_slug,price,notes) ON d.slug=x.dish_slug
ON CONFLICT (festival_id, dish_id) DO UPDATE SET price_dkk=EXCLUDED.price_dkk, notes=EXCLUDED.notes, updated_at=NOW();

INSERT INTO festival_action_items (festival_id, title, description, category, owner, due_date, status, priority) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'),'Pack CEE 32A → 16A adapter cable for INSIDE tent','INSIDE tent has 1× spare 32A but short 1× 16A. Pack adapter cable.','logistics','Marius',DATE '2026-05-17','open','high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'),'Decide whether to release 2× 16A from Chicks order','Chicks ordered 8× 16A but only uses 6. 2,000 DKK potential refund.','finance','Alexandra',DATE '2026-05-12','open','normal'),
((SELECT id FROM festivals WHERE slug='jelling-2026'),'Verify with FF that Gyros all-electric power update is registered','New allocation 1× 32A + 7× 16A. Verify before 18 May setup.','compliance','Alexandra',DATE '2026-05-15','open','high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'),'Inventory all owned equipment before 17 May load day','Verify all 30 pieces in festival_equipment are operational.','operations','Costel',DATE '2026-05-17','open','high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'),'Pack 30m+ kabeltromler + CEE→LK overgang for all 4 concepts','Per all 4 contracts, TFP brings min 30m cables + adapters.','logistics','Marius',DATE '2026-05-17','open','high');

COMMIT;