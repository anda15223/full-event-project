
BEGIN;

-- Step 1: Add column to festival_contracts
ALTER TABLE festival_contracts
  ADD COLUMN IF NOT EXISTS assigned_vehicle_id uuid;

ALTER TABLE festival_contracts
  ADD CONSTRAINT fk_fc_vehicle
  FOREIGN KEY (assigned_vehicle_id)
  REFERENCES festival_transport(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fc_assigned_vehicle
  ON festival_contracts(assigned_vehicle_id);

-- Step 2: Seed Jelling 2026 only
UPDATE festival_contracts fc
SET assigned_vehicle_id = (
  CASE c.slug
    WHEN 'gyros' THEN
      (SELECT id FROM festival_transport WHERE festival_id = fc.festival_id AND vehicle_type ILIKE '%lift vehicle #1%' LIMIT 1)
    WHEN 'fish-chips' THEN
      (SELECT id FROM festival_transport WHERE festival_id = fc.festival_id AND vehicle_type ILIKE '%lift vehicle #2%' LIMIT 1)
    WHEN 'chicks' THEN
      (SELECT id FROM festival_transport WHERE festival_id = fc.festival_id AND vehicle_type ILIKE '%lift vehicle #3%' LIMIT 1)
    WHEN 'creperie' THEN
      (SELECT id FROM festival_transport WHERE festival_id = fc.festival_id AND vehicle_type ILIKE '%lift vehicle #3%' LIMIT 1)
  END
)
FROM concepts c
WHERE fc.concept_id = c.id
  AND fc.festival_id = (SELECT id FROM festivals WHERE slug='jelling-2026');

-- Step 3: Drop column from festival_power_equipment
ALTER TABLE festival_power_equipment
  DROP CONSTRAINT IF EXISTS festival_power_equipment_assigned_vehicle_id_fkey;
ALTER TABLE festival_power_equipment
  DROP COLUMN IF EXISTS assigned_vehicle_id;

COMMIT;
