-- ============ FESTIVAL PLANNER MODULE ============

-- Core
CREATE TABLE public.festivals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  year integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  location text,
  organiser_name text,
  organiser_phone text,
  organiser_email text,
  status text NOT NULL DEFAULT 'planning',
  drive_folder_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.festival_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL,
  category text NOT NULL,
  sub_editor_route text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.festival_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.festival_sections(id) ON DELETE CASCADE,
  key text NOT NULL,
  prompt text NOT NULL,
  kind text NOT NULL,
  options jsonb,
  help_text text,
  required boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL,
  default_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, key)
);

CREATE TABLE public.festival_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.festival_questions(id) ON DELETE CASCADE,
  value jsonb NOT NULL,
  value_type text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, question_id)
);

-- Sub-tables
CREATE TABLE public.festival_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  name text NOT NULL,
  zone text NOT NULL,
  sales_hours_thu text,
  sales_hours_fri text,
  sales_hours_sat text,
  sales_hours_sun text,
  power_baseline text,
  power_extras jsonb DEFAULT '[]'::jsonb,
  gas_required boolean NOT NULL DEFAULT false,
  gas_supplier text,
  wristband_max integer,
  wristband_black_partout integer,
  wristband_normal_partout integer,
  tent_size text,
  products_sold text,
  order_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, name)
);

CREATE TABLE public.festival_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES public.festival_concepts(id) ON DELETE SET NULL,
  name text,
  source text NOT NULL,
  role text,
  is_manager boolean NOT NULL DEFAULT false,
  is_setup_crew boolean NOT NULL DEFAULT false,
  wristband_type text,
  external_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, external_key)
);

CREATE TABLE public.festival_vagtplan_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.festival_concepts(id) ON DELETE CASCADE,
  day date NOT NULL,
  shift_name text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  people_count integer NOT NULL,
  notes text,
  order_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, day, shift_name)
);

CREATE TABLE public.festival_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  section_key text,
  title text NOT NULL,
  deadline date,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  owner text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, title)
);

CREATE TABLE public.festival_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  label text NOT NULL,
  vehicle_type text NOT NULL,
  status text NOT NULL,
  driver text,
  purpose text,
  travel_date date,
  seats integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, label)
);

CREATE TABLE public.festival_accommodation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  label text NOT NULL,
  status text NOT NULL,
  check_in date,
  check_out date,
  people_count integer,
  room_config text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, label)
);

CREATE TABLE public.festival_bc_trolleys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.festival_concepts(id) ON DELETE CASCADE,
  trolley_number integer NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, trolley_number)
);

CREATE TABLE public.festival_bc_trolley_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trolley_id uuid NOT NULL REFERENCES public.festival_bc_trolleys(id) ON DELETE CASCADE,
  category text NOT NULL,
  item_name text NOT NULL,
  quantity text,
  order_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.festival_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  version integer NOT NULL,
  storage_key text,
  schema_snapshot jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, version)
);

-- Indexes
CREATE INDEX idx_festival_questions_section ON public.festival_questions(section_id, order_index);
CREATE INDEX idx_festival_answers_festival ON public.festival_answers(festival_id);
CREATE INDEX idx_festival_concepts_festival ON public.festival_concepts(festival_id, order_index);
CREATE INDEX idx_festival_staff_festival ON public.festival_staff(festival_id);
CREATE INDEX idx_festival_shifts_concept ON public.festival_vagtplan_shifts(concept_id, day, order_index);
CREATE INDEX idx_festival_action_items_festival ON public.festival_action_items(festival_id, deadline);
CREATE INDEX idx_festival_vehicles_festival ON public.festival_vehicles(festival_id);
CREATE INDEX idx_festival_accom_festival ON public.festival_accommodation(festival_id);
CREATE INDEX idx_festival_trolley_items_trolley ON public.festival_bc_trolley_items(trolley_id, order_index);

-- Triggers for updated_at
CREATE TRIGGER trg_festivals_updated BEFORE UPDATE ON public.festivals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_festival_sections_updated BEFORE UPDATE ON public.festival_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_festival_questions_updated BEFORE UPDATE ON public.festival_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_festival_answers_updated BEFORE UPDATE ON public.festival_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_festival_concepts_updated BEFORE UPDATE ON public.festival_concepts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.festivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_vagtplan_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_accommodation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_bc_trolleys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_bc_trolley_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_reports ENABLE ROW LEVEL SECURITY;

-- Public RLS policies (matches existing project pattern: single-tenant Fif workspace)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'festivals','festival_sections','festival_questions','festival_answers',
    'festival_concepts','festival_staff','festival_vagtplan_shifts',
    'festival_action_items','festival_vehicles','festival_accommodation',
    'festival_bc_trolleys','festival_bc_trolley_items','festival_reports'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('CREATE POLICY "%1$s viewable" ON public.%1$I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "%1$s insertable" ON public.%1$I FOR INSERT WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "%1$s updatable" ON public.%1$I FOR UPDATE USING (true)', t);
    EXECUTE format('CREATE POLICY "%1$s deletable" ON public.%1$I FOR DELETE USING (true)', t);
  END LOOP;
END $$;

-- =================== SEED: SECTIONS ===================
INSERT INTO public.festival_sections (key, title, description, order_index, category, sub_editor_route) VALUES
  ('intro', 'Introduction', 'Festival basics and organiser contact', 1, 'planning', NULL),
  ('concepts', 'Concepts', 'Food concepts, zones, sales hours, power, wristbands', 2, 'planning', '/festivals/:slug/concepts'),
  ('equipment_list', 'Equipment List', 'Tables, countertops, DAKA containers', 3, 'logistics', NULL),
  ('facade', 'Façade', 'Artwork status and BR18 compliance', 4, 'logistics', NULL),
  ('cooling_storage', 'Cooling & Storage', 'Container booking, modes, delivery', 5, 'logistics', NULL),
  ('power', 'Power Requirements', 'Baseline, extras, gas', 6, 'logistics', NULL),
  ('staffing', 'Staffing & Vagtplaner', 'Staff, shifts, person-hours', 7, 'operations', '/festivals/:slug/staffing'),
  ('cooking_equipment', 'Cooking Equipment per Concept', 'Fryers, plates, gas, electric', 8, 'operations', NULL),
  ('safety_compliance', 'Safety & Compliance', 'Fire, first aid, hot oil, CVR, inspections', 9, 'safety', NULL),
  ('setup_timeline', 'Setup Timeline & Day Plan', 'Setup crew, goods, breakdown', 10, 'operations', '/festivals/:slug/timeline'),
  ('transportation', 'Transportation & Accommodation', 'Vehicles, beds', 11, 'logistics', '/festivals/:slug/transport'),
  ('bc_trolleys', 'BC Trolley Checklists', 'Per-concept trolley contents', 12, 'logistics', '/festivals/:slug/trolleys'),
  ('groceries', 'Groceries & Ordering', 'POS-driven grocery list (v2)', 13, 'operations', NULL),
  ('recipes', 'Recipes per Concept', 'Per-portion ingredients (v2)', 14, 'operations', NULL);

-- =================== SEED: QUESTIONS ===================
WITH s AS (SELECT key, id FROM public.festival_sections)
INSERT INTO public.festival_questions (section_id, key, prompt, kind, options, help_text, required, order_index, default_value) VALUES
  -- intro
  ((SELECT id FROM s WHERE key='intro'), 'festival_organiser_contact_name', 'Festival organiser contact name', 'text', NULL, NULL, true, 1, NULL),
  ((SELECT id FROM s WHERE key='intro'), 'festival_organiser_contact_phone', 'Organiser phone', 'text', NULL, NULL, false, 2, NULL),
  ((SELECT id FROM s WHERE key='intro'), 'festival_organiser_contact_email', 'Organiser email', 'text', NULL, NULL, false, 3, NULL),
  -- equipment_list
  ((SELECT id FROM s WHERE key='equipment_list'), 'stilladsbar_inside', 'Stilladsbar — INSIDE count', 'number', NULL, NULL, false, 1, NULL),
  ((SELECT id FROM s WHERE key='equipment_list'), 'stilladsbar_camping', 'Stilladsbar — CAMPING count', 'number', NULL, NULL, false, 2, NULL),
  ((SELECT id FROM s WHERE key='equipment_list'), 'folding_tables_inside', 'Folding tables — INSIDE count', 'number', NULL, NULL, false, 3, NULL),
  ((SELECT id FROM s WHERE key='equipment_list'), 'folding_tables_camping', 'Folding tables — CAMPING count', 'number', NULL, NULL, false, 4, NULL),
  ((SELECT id FROM s WHERE key='equipment_list'), 'countertops_per_concept', 'Countertops per concept', 'number', NULL, NULL, false, 5, '2'::jsonb),
  ((SELECT id FROM s WHERE key='equipment_list'), 'daka_containers_per_concept', 'DAKA containers per concept', 'number', NULL, NULL, false, 6, '2'::jsonb),
  -- facade
  ((SELECT id FROM s WHERE key='facade'), 'facade_designer', 'Façade designer', 'text', NULL, NULL, false, 1, '"Fidibus"'::jsonb),
  ((SELECT id FROM s WHERE key='facade'), 'facade_status_fish', 'Fish & Chips façade status', 'single_select', '[{"label":"Print ready","value":"print_ready"},{"label":"In progress","value":"in_progress"},{"label":"Not started","value":"not_started"}]'::jsonb, NULL, false, 2, NULL),
  ((SELECT id FROM s WHERE key='facade'), 'facade_status_gyros', 'Gyros façade status', 'single_select', '[{"label":"Print ready","value":"print_ready"},{"label":"In progress","value":"in_progress"},{"label":"Not started","value":"not_started"}]'::jsonb, NULL, false, 3, NULL),
  ((SELECT id FROM s WHERE key='facade'), 'facade_status_creperie', 'Creperie façade status', 'single_select', '[{"label":"Print ready","value":"print_ready"},{"label":"In progress","value":"in_progress"},{"label":"Not started","value":"not_started"}]'::jsonb, NULL, false, 4, NULL),
  ((SELECT id FROM s WHERE key='facade'), 'facade_status_chicks', 'Chicks ''n'' Buns façade status', 'single_select', '[{"label":"Print ready","value":"print_ready"},{"label":"In progress","value":"in_progress"},{"label":"Not started","value":"not_started"}]'::jsonb, NULL, false, 5, NULL),
  ((SELECT id FROM s WHERE key='facade'), 'facade_print_deadline', 'Façade print deadline', 'date', NULL, NULL, false, 6, NULL),
  ((SELECT id FROM s WHERE key='facade'), 'br18_2026_compliance', 'BR18 2026 compliance', 'single_select', '[{"label":"Fidibus handling","value":"fidibus_handling"},{"label":"TFP handling","value":"tfp_handling"},{"label":"Not yet","value":"not_yet"}]'::jsonb, NULL, false, 7, NULL),
  -- cooling_storage
  ((SELECT id FROM s WHERE key='cooling_storage'), 'container_supplier', 'Container supplier', 'single_select', '[{"label":"Godik","value":"godik"},{"label":"Other","value":"other"}]'::jsonb, NULL, false, 1, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'container_booking_number', 'Booking number', 'text', NULL, NULL, false, 2, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'container_count', 'Container count', 'number', NULL, NULL, false, 3, '2'::jsonb),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'container_size', 'Container size', 'single_select', '[{"label":"20ft","value":"20ft"},{"label":"10ft","value":"10ft"},{"label":"Custom","value":"custom"}]'::jsonb, NULL, false, 4, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'container_item_code', 'Container item code', 'text', NULL, NULL, false, 5, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'container_modes', 'Container modes', 'multi_select', '[{"label":"INSIDE = fridge only","value":"inside_fridge"},{"label":"INSIDE = freezer","value":"inside_freezer"},{"label":"CAMPING = fridge","value":"camping_fridge"},{"label":"CAMPING = freezer","value":"camping_freezer"},{"label":"CAMPING = TBD","value":"camping_tbd"}]'::jsonb, NULL, false, 6, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'delivery_date', 'Delivery date', 'date', NULL, NULL, false, 7, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'pickup_date', 'Pickup date', 'date', NULL, NULL, false, 8, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'payment_due', 'Payment due', 'date', NULL, NULL, false, 9, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'total_cost_incl_vat_dkk', 'Total cost incl. VAT (DKK)', 'number', NULL, NULL, false, 10, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'godik_contact_name', 'Supplier contact name', 'text', NULL, NULL, false, 11, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'godik_contact_phone', 'Supplier contact phone', 'text', NULL, NULL, false, 12, NULL),
  ((SELECT id FROM s WHERE key='cooling_storage'), 'godik_24h_service', '24h service number', 'text', NULL, NULL, false, 13, NULL),
  -- power
  ((SELECT id FROM s WHERE key='power'), 'baseline_amp_per_concept', 'Baseline amp per concept', 'text', NULL, NULL, false, 1, '"1×16A"'::jsonb),
  ((SELECT id FROM s WHERE key='power'), 'contracted_baseline_total', 'Contracted baseline total', 'text', NULL, NULL, false, 2, NULL),
  ((SELECT id FROM s WHERE key='power'), 'gas_needed', 'Gas needed', 'single_select', '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb, NULL, false, 3, NULL),
  ((SELECT id FROM s WHERE key='power'), 'gas_supplier', 'Gas supplier', 'text', NULL, NULL, false, 4, NULL),
  -- staffing
  ((SELECT id FROM s WHERE key='staffing'), 'total_headcount', 'Total headcount', 'number', NULL, 'Auto-computed', false, 1, NULL),
  ((SELECT id FROM s WHERE key='staffing'), 'soborg_count', 'Søborg headcount', 'number', NULL, NULL, false, 2, NULL),
  ((SELECT id FROM s WHERE key='staffing'), 'local_count', 'Local headcount', 'number', NULL, NULL, false, 3, NULL),
  ((SELECT id FROM s WHERE key='staffing'), 'manager_count', 'Managers', 'number', NULL, NULL, false, 4, NULL),
  ((SELECT id FROM s WHERE key='staffing'), 'setup_crew_count', 'Setup crew', 'number', NULL, NULL, false, 5, NULL),
  ((SELECT id FROM s WHERE key='staffing'), 'saturday_peak_extension', 'Saturday peak extension', 'single_select', '[{"label":"Extend to 23:00","value":"yes_extend_to_23"},{"label":"Same as Fri/Sun","value":"no_same_as_fri_sun"}]'::jsonb, NULL, false, 6, NULL),
  ((SELECT id FROM s WHERE key='staffing'), 'camping_arrival_time', 'Camping arrival time', 'single_select', '[{"label":"06:00","value":"06:00"},{"label":"06:30","value":"06:30"},{"label":"07:00 on open","value":"07:00_on_open"}]'::jsonb, NULL, false, 7, NULL),
  ((SELECT id FROM s WHERE key='staffing'), 'thursday_arrival_time_inside_fish', 'Thu arrival — Fish', 'single_select', '[{"label":"09:00","value":"09:00"},{"label":"10:00","value":"10:00"},{"label":"Later","value":"later"}]'::jsonb, NULL, false, 8, NULL),
  ((SELECT id FROM s WHERE key='staffing'), 'thursday_arrival_time_inside_gyros', 'Thu arrival — Gyros', 'single_select', '[{"label":"09:00","value":"09:00"},{"label":"10:00","value":"10:00"},{"label":"Later","value":"later"}]'::jsonb, NULL, false, 9, NULL),
  ((SELECT id FROM s WHERE key='staffing'), 'total_wristbands_requested', 'Wristbands requested', 'number', NULL, NULL, false, 10, NULL),
  ((SELECT id FROM s WHERE key='staffing'), 'total_person_hours', 'Total person-hours', 'number', NULL, 'Sum of vagtplan shifts', false, 11, NULL),
  -- cooking_equipment
  ((SELECT id FROM s WHERE key='cooking_equipment'), 'fish_fryer_strategy', 'Fish fryer strategy', 'single_select', '[{"label":"All electric (2×32A + 5×16A Amitek)","value":"all_electric_2x32a_5x16a_amitek"},{"label":"Hybrid","value":"hybrid"},{"label":"All gas","value":"all_gas"},{"label":"Pending","value":"pending"}]'::jsonb, NULL, false, 1, NULL),
  ((SELECT id FROM s WHERE key='cooking_equipment'), 'gyros_gas', 'Gyros gas (Ronny VVS Fagor)', 'single_select', '[{"label":"Yes","value":"yes_ronny_vvs_fagor"},{"label":"No","value":"no"}]'::jsonb, NULL, false, 2, NULL),
  ((SELECT id FROM s WHERE key='cooking_equipment'), 'pancake_plate_count', 'Pancake plate count', 'number', NULL, NULL, false, 3, NULL),
  ((SELECT id FROM s WHERE key='cooking_equipment'), 'chicks_equipment', 'Chicks equipment', 'multi_select', '[{"label":"4 Amitek fryers 16/3A","value":"4 Amitek fryers 16/3A"},{"label":"1 toaster 16A","value":"1 toaster 16A"},{"label":"1 griddle 16A","value":"1 griddle 16A"}]'::jsonb, NULL, false, 4, NULL),
  ((SELECT id FROM s WHERE key='cooking_equipment'), 'chicks_spare_16_3a_circuits', 'Chicks spare 16/3A circuits', 'number', NULL, NULL, false, 5, NULL),
  ((SELECT id FROM s WHERE key='cooking_equipment'), 'chicks_release_spare_candidate', 'Chicks release spare candidate', 'text', NULL, NULL, false, 6, NULL),
  -- safety_compliance
  ((SELECT id FROM s WHERE key='safety_compliance'), 'fire_extinguishers_count', 'Fire extinguishers', 'number', NULL, NULL, false, 1, '4'::jsonb),
  ((SELECT id FROM s WHERE key='safety_compliance'), 'fire_extinguisher_type', 'Extinguisher type', 'single_select', '[{"label":"F-class / F-mark","value":"F-class / F-mark"},{"label":"AB","value":"AB"},{"label":"ABC","value":"ABC"}]'::jsonb, NULL, false, 2, NULL),
  ((SELECT id FROM s WHERE key='safety_compliance'), 'fire_blankets_count', 'Fire blankets', 'number', NULL, NULL, false, 3, '4'::jsonb),
  ((SELECT id FROM s WHERE key='safety_compliance'), 'first_aid_kits_count', 'First aid kits', 'number', NULL, NULL, false, 4, '4'::jsonb),
  ((SELECT id FROM s WHERE key='safety_compliance'), 'hot_oil_protocol', 'Hot oil protocol', 'single_select', '[{"label":"Briefing on setup day","value":"briefing_on_setup_day"},{"label":"Documented SOP","value":"documented_sop"},{"label":"To be written","value":"to_be_written"}]'::jsonb, NULL, false, 5, NULL),
  ((SELECT id FROM s WHERE key='safety_compliance'), 'food_authority_owner', 'Food authority owner', 'text', NULL, NULL, false, 6, '"Costel"'::jsonb),
  ((SELECT id FROM s WHERE key='safety_compliance'), 'gas_brand_inspection_datetime', 'Gas & brand inspection', 'datetime', NULL, NULL, false, 7, NULL),
  ((SELECT id FROM s WHERE key='safety_compliance'), 'cvr_primary', 'CVR primary', 'text', NULL, NULL, false, 8, NULL),
  ((SELECT id FROM s WHERE key='safety_compliance'), 'cvr_secondary', 'CVR secondary', 'text', NULL, NULL, false, 9, NULL),
  -- setup_timeline
  ((SELECT id FROM s WHERE key='setup_timeline'), 'setup_crew_arrival_date', 'Setup crew arrival', 'date', NULL, NULL, false, 1, NULL),
  ((SELECT id FROM s WHERE key='setup_timeline'), 'goods_delivery_date', 'Goods delivery', 'date', NULL, NULL, false, 2, NULL),
  ((SELECT id FROM s WHERE key='setup_timeline'), 'main_crew_arrival_date', 'Main crew arrival', 'date', NULL, NULL, false, 3, NULL),
  ((SELECT id FROM s WHERE key='setup_timeline'), 'breakdown_date', 'Breakdown', 'date', NULL, NULL, false, 4, NULL),
  ((SELECT id FROM s WHERE key='setup_timeline'), 'breakdown_handler', 'Breakdown handler', 'single_select', '[{"label":"Fidibus only","value":"fidibus_only"},{"label":"Fidibus + TFP","value":"fidibus_plus_tfp"},{"label":"TFP only","value":"tfp_only"}]'::jsonb, NULL, false, 5, NULL),
  ((SELECT id FROM s WHERE key='setup_timeline'), 'clear_area_deadline', 'Clear area deadline', 'datetime', NULL, NULL, false, 6, NULL),
  -- transportation
  ((SELECT id FROM s WHERE key='transportation'), 'total_vehicles', 'Total vehicles', 'number', NULL, 'Auto-computed', false, 1, NULL),
  ((SELECT id FROM s WHERE key='transportation'), 'total_bed_nights', 'Total bed-nights', 'number', NULL, 'Auto-computed', false, 2, NULL),
  ((SELECT id FROM s WHERE key='transportation'), 'vehicle_fleet_summary', 'Fleet summary', 'text', NULL, NULL, false, 3, NULL),
  ((SELECT id FROM s WHERE key='transportation'), 'cabin_vejle_booking_range', 'Main accommodation range', 'text', NULL, NULL, false, 4, NULL),
  -- bc_trolleys
  ((SELECT id FROM s WHERE key='bc_trolleys'), 'trolleys_per_concept', 'Trolleys per concept', 'number', NULL, NULL, false, 1, '2'::jsonb),
  ((SELECT id FROM s WHERE key='bc_trolleys'), 'total_trolleys', 'Total trolleys', 'number', NULL, 'Auto-computed', false, 2, NULL),
  ((SELECT id FROM s WHERE key='bc_trolleys'), 'content_list_uploaded', 'Content list uploaded', 'single_select', '[{"label":"Yes","value":"yes"},{"label":"No / TBD","value":"no_tbd"},{"label":"Partial","value":"partial"}]'::jsonb, NULL, false, 3, NULL),
  ((SELECT id FROM s WHERE key='bc_trolleys'), 'categories', 'Categories', 'multi_select', '[{"label":"Cooking/small gear","value":"Cooking/small gear"},{"label":"Serving/packaging","value":"Serving/packaging"},{"label":"Cleaning/chemicals","value":"Cleaning/chemicals"},{"label":"Stationery/signage","value":"Stationery/signage"}]'::jsonb, NULL, false, 4, NULL),
  -- groceries
  ((SELECT id FROM s WHERE key='groceries'), 'portion_volume_method', 'Portion volume method', 'single_select', '[{"label":"POS prev year + 15%","value":"pos_sales_prev_year_plus_15pct"},{"label":"Manual estimate","value":"manual_estimate"},{"label":"Other","value":"other"}]'::jsonb, NULL, false, 1, NULL),
  ((SELECT id FROM s WHERE key='groceries'), 'supplier_list', 'Supplier list', 'text', NULL, NULL, false, 2, NULL),
  -- recipes
  ((SELECT id FROM s WHERE key='recipes'), 'recipe_source', 'Recipe source', 'single_select', '[{"label":"Uploaded Excel","value":"uploaded_excel"},{"label":"Freeform list","value":"freeform_list"},{"label":"Not yet","value":"not_yet"}]'::jsonb, NULL, false, 1, NULL);