-- PART 1: festivals
ALTER TABLE festivals ADD COLUMN IF NOT EXISTS setup_responsibility text 
  CHECK (setup_responsibility IN ('fidibus_assisted', 'fidibus_solo', 'fish_project_solo'))
  DEFAULT 'fidibus_assisted';
COMMENT ON COLUMN festivals.setup_responsibility IS 'Setup model for 2026 — fidibus_assisted (Fidibus leads, Fish Project assists) or fidibus_solo (Fidibus alone, Fish Project arrives only for prep). Fish Project Søborg transport pipeline is constant regardless.';

ALTER TABLE festivals ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE festivals ADD COLUMN IF NOT EXISTS website_domain text;
ALTER TABLE festivals ADD COLUMN IF NOT EXISTS operator_org text;
ALTER TABLE festivals ADD COLUMN IF NOT EXISTS operator_cvr text;
ALTER TABLE festivals ADD COLUMN IF NOT EXISTS previous_contact_note text;
COMMENT ON COLUMN festivals.previous_contact_note IS 'Historical contact metadata — e.g., "Filip Færgeman handled all comms until 31 Mar 2026 departure". Useful for understanding why some threads went silent.';

ALTER TABLE festivals ADD COLUMN IF NOT EXISTS prep_status text 
  CHECK (prep_status IN ('not_started', 'early_stage', 'in_negotiation', 'contracts_signed', 
                          'in_execution', 'completed', 'at_risk', 'stalled'))
  DEFAULT 'early_stage';

ALTER TABLE festivals ADD COLUMN IF NOT EXISTS festival_duration_days smallint;

-- PART 2: festival_contracts
ALTER TABLE festival_contracts ADD COLUMN IF NOT EXISTS operating_entity text;
COMMENT ON COLUMN festival_contracts.operating_entity IS 'Which DK ApS entity holds this concept-festival contract. Examples: "The Fish Project ApS", "Aegean ApS", "Blue Fish ApS", "Athos ApS", "MCA Trading ApS". Per concept-per-festival because Tønder runs Fish under TFP and Gaia under Aegean.';

ALTER TABLE festival_contracts ADD COLUMN IF NOT EXISTS operating_entity_cvr text;
ALTER TABLE festival_contracts ADD COLUMN IF NOT EXISTS concept_alias text;
COMMENT ON COLUMN festival_contracts.concept_alias IS 'When a concept is branded differently at this festival. e.g., gyros concept at Tønder is settled under "Gaia" name from Aegean ApS. NULL means use canonical concept name.';

ALTER TABLE festival_contracts ADD COLUMN IF NOT EXISTS contract_signed_date date;

ALTER TABLE festival_contracts ADD COLUMN IF NOT EXISTS contract_status text 
  CHECK (contract_status IN ('not_started', 'in_negotiation', 'pending_signature', 
                              'signed', 'stalled', 'cancelled'))
  DEFAULT 'not_started';

ALTER TABLE festival_contracts ADD COLUMN IF NOT EXISTS stall_count smallint DEFAULT 1;
ALTER TABLE festival_contracts ADD COLUMN IF NOT EXISTS concept_variation_note text;

-- PART 3: festival_staff
ALTER TABLE festival_staff ADD COLUMN IF NOT EXISTS staff_type text 
  CHECK (staff_type IN ('fish_project', 'fidibus', 'local_hire', 'festival_volunteer'))
  DEFAULT 'fish_project';

-- PART 4: festival_concept_city_assignments
CREATE TABLE IF NOT EXISTS festival_concept_city_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_contract_id uuid NOT NULL REFERENCES festival_contracts(id) ON DELETE CASCADE,
  stall_label text NOT NULL,
  city text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_concept_city_contract ON festival_concept_city_assignments(festival_contract_id);
CREATE INDEX IF NOT EXISTS idx_concept_city_city ON festival_concept_city_assignments(city);
ALTER TABLE festival_concept_city_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_users_all_access ON festival_concept_city_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMENT ON TABLE festival_concept_city_assignments IS 
  'For multi-city festivals like GRØN where one stall (e.g. "Fish 1") serves some-but-not-all cities. Each row = one stall presence at one city.';

-- PART 5: cross_festival_rules
CREATE TABLE IF NOT EXISTS cross_festival_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  rule_description text NOT NULL,
  applies_to_festivals text[],
  applies_to_operators text[],
  source text,
  severity text CHECK (severity IN ('info', 'important', 'critical')) DEFAULT 'important',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE cross_festival_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_users_all_access ON cross_festival_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMENT ON TABLE cross_festival_rules IS
  'Operational rules that apply to multiple festivals. Lets the system surface "vegetarian-first menu rule" once and apply it across Tinderbox, GRØN, Cirkus, etc., instead of duplicating per festival.';

-- PART 6: festival_open_questions
CREATE TABLE IF NOT EXISTS festival_open_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES concepts(id) ON DELETE SET NULL,
  question text NOT NULL,
  context text,
  raised_date date,
  raised_by text,
  status text CHECK (status IN ('open', 'in_progress', 'answered', 'abandoned')) DEFAULT 'open',
  resolution text,
  resolved_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE festival_open_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_users_all_access ON festival_open_questions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PART 7: personnel_history
CREATE TABLE IF NOT EXISTS personnel_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  role text NOT NULL,
  email text,
  phone text,
  start_date date,
  end_date date,
  status text CHECK (status IN ('active', 'departed', 'on_leave')) DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE personnel_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_users_all_access ON personnel_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);