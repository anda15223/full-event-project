BEGIN;

-- Step 2: new columns
ALTER TABLE festival_power_equipment
  ADD COLUMN IF NOT EXISTS is_powered boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'cooking',
  ADD COLUMN IF NOT EXISTS loads_from_soborg boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS assigned_vehicle_id uuid,
  ADD COLUMN IF NOT EXISTS linked_facade_id uuid,
  ADD COLUMN IF NOT EXISTS linked_topskilt_id uuid;

ALTER TABLE festival_power_equipment
  DROP CONSTRAINT IF EXISTS chk_fpe_category;
ALTER TABLE festival_power_equipment
  ADD CONSTRAINT chk_fpe_category
  CHECK (category IN (
    'cooking','cooling','table','scaffold','trolley',
    'facade','topskilt','pos','sink','prep',
    'signage','popup_tent','cable','fire_safety',
    'first_aid','consumable_storage','other'
  ));

-- FKs (nullable)
ALTER TABLE festival_power_equipment
  DROP CONSTRAINT IF EXISTS fk_fpe_vehicle,
  DROP CONSTRAINT IF EXISTS fk_fpe_facade,
  DROP CONSTRAINT IF EXISTS fk_fpe_topskilt;

ALTER TABLE festival_power_equipment
  ADD CONSTRAINT fk_fpe_vehicle
  FOREIGN KEY (assigned_vehicle_id)
  REFERENCES festival_transport(id) ON DELETE SET NULL;

ALTER TABLE festival_power_equipment
  ADD CONSTRAINT fk_fpe_facade
  FOREIGN KEY (linked_facade_id)
  REFERENCES festival_facade(id) ON DELETE SET NULL;

ALTER TABLE festival_power_equipment
  ADD CONSTRAINT fk_fpe_topskilt
  FOREIGN KEY (linked_topskilt_id)
  REFERENCES festival_topskilt(id) ON DELETE SET NULL;

-- Step 3: indices
CREATE INDEX IF NOT EXISTS idx_fpe_loads_from_soborg
  ON festival_power_equipment(loads_from_soborg);
CREATE INDEX IF NOT EXISTS idx_fpe_assigned_vehicle
  ON festival_power_equipment(assigned_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fpe_category
  ON festival_power_equipment(category);

-- Step 4: backfill 16 existing Jelling rows
WITH jelling AS (SELECT id FROM festivals WHERE slug='jelling-2026'),
veh1 AS (SELECT id FROM festival_transport WHERE festival_id=(SELECT id FROM jelling) AND vehicle_type ILIKE '%lift vehicle #1%' LIMIT 1),
veh2 AS (SELECT id FROM festival_transport WHERE festival_id=(SELECT id FROM jelling) AND vehicle_type ILIKE '%lift vehicle #2%' LIMIT 1)
UPDATE festival_power_equipment fpe SET
  category = 'cooking',
  is_powered = true,
  loads_from_soborg = true,
  assigned_vehicle_id = CASE
    WHEN c.slug IN ('gyros','fish-chips') THEN (SELECT id FROM veh1)
    WHEN c.slug IN ('creperie','chicks')  THEN (SELECT id FROM veh2)
    ELSE NULL
  END
FROM festival_power fp, festival_contracts fc, concepts c
WHERE fp.id = fpe.festival_power_id
  AND fc.id = fp.festival_contract_id
  AND c.id  = fc.concept_id
  AND fc.festival_id = (SELECT id FROM jelling);

COMMIT;