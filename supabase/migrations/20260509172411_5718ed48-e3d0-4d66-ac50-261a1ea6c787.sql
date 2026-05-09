
ALTER TABLE festival_power_equipment ALTER COLUMN power_type DROP NOT NULL;
ALTER TABLE festival_power_equipment DROP CONSTRAINT IF EXISTS festival_power_equipment_power_type_check;
ALTER TABLE festival_power_equipment ADD CONSTRAINT festival_power_equipment_power_type_check
  CHECK (power_type IS NULL OR power_type = ANY (ARRAY['16A_240V','16A_400V','32A','63A','125A','230V_socket']));
