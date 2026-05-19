-- =====================================================
-- BLOCK S1 — STAFF MODULE SCHEMA FOUNDATION
-- Parallel build. Legacy festival_staff / festival_shifts UNTOUCHED.
-- =====================================================

-- ---------- Table 1: evolve existing empty staff table ----------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS display_name   text,
  ADD COLUMN IF NOT EXISTS home_location  text,
  ADD COLUMN IF NOT EXISTS source         text DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS languages      text[],
  ADD COLUMN IF NOT EXISTS dietary_notes  text,
  ADD COLUMN IF NOT EXISTS tshirt_size    text,
  ADD COLUMN IF NOT EXISTS general_notes  text;

CREATE INDEX IF NOT EXISTS idx_staff_name   ON public.staff(full_name);
CREATE INDEX IF NOT EXISTS idx_staff_active ON public.staff(is_active);

-- Ensure RLS + policies exist (idempotent)
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staff' AND policyname='staff_auth_all') THEN
    CREATE POLICY staff_auth_all ON public.staff FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS staff_set_updated_at ON public.staff;
CREATE TRIGGER staff_set_updated_at BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Table 2: station (lookup) ----------
CREATE TABLE public.station (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid REFERENCES public.concepts(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(concept_id, code)
);
CREATE INDEX idx_station_concept ON public.station(concept_id);
ALTER TABLE public.station ENABLE ROW LEVEL SECURITY;
CREATE POLICY station_auth_all ON public.station FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- Table 3: staff_station_skill ----------
CREATE TABLE public.staff_station_skill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.station(id) ON DELETE CASCADE,
  proficiency text DEFAULT 'trained',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, station_id)
);
CREATE INDEX idx_sss_staff   ON public.staff_station_skill(staff_id);
CREATE INDEX idx_sss_station ON public.staff_station_skill(station_id);
ALTER TABLE public.staff_station_skill ENABLE ROW LEVEL SECURITY;
CREATE POLICY sss_auth_all ON public.staff_station_skill FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- Table 4: festival_position ----------
CREATE TABLE public.festival_position (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES public.concepts(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.station(id),
  slots_needed integer DEFAULT 1,
  notes text,
  display_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(festival_id, concept_id, station_id)
);
CREATE INDEX idx_fp_festival ON public.festival_position(festival_id);
ALTER TABLE public.festival_position ENABLE ROW LEVEL SECURITY;
CREATE POLICY fp_auth_all ON public.festival_position FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER fp_set_updated_at BEFORE UPDATE ON public.festival_position
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Table 5: festival_staff_assignment (NO UNIQUE — multi-station allowed) ----------
CREATE TABLE public.festival_staff_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  primary_concept_id uuid REFERENCES public.concepts(id),
  source_override text,
  works_thu boolean DEFAULT false,
  works_fri boolean DEFAULT false,
  works_sat boolean DEFAULT false,
  works_sun boolean DEFAULT false,
  needs_accom_thu boolean DEFAULT false,
  needs_accom_fri boolean DEFAULT false,
  needs_accom_sat boolean DEFAULT false,
  needs_accom_sun boolean DEFAULT false,
  confirmed boolean DEFAULT false,
  accommodation_room_id uuid REFERENCES public.festival_accommodation_room(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fsa_festival ON public.festival_staff_assignment(festival_id);
CREATE INDEX idx_fsa_staff    ON public.festival_staff_assignment(staff_id);
CREATE INDEX idx_fsa_concept  ON public.festival_staff_assignment(primary_concept_id);
ALTER TABLE public.festival_staff_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY fsa_auth_all ON public.festival_staff_assignment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER fsa_set_updated_at BEFORE UPDATE ON public.festival_staff_assignment
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Table 6: festival_staff_shift (station per shift) ----------
CREATE TABLE public.festival_staff_shift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.festival_staff_assignment(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  station_id uuid REFERENCES public.station(id),
  start_time time,
  end_time time,
  crosses_midnight boolean DEFAULT false,
  computed_hours numeric,
  shift_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fss_assignment ON public.festival_staff_shift(assignment_id);
CREATE INDEX idx_fss_date       ON public.festival_staff_shift(shift_date);
ALTER TABLE public.festival_staff_shift ENABLE ROW LEVEL SECURITY;
CREATE POLICY fss_auth_all ON public.festival_staff_shift FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER fss_set_updated_at BEFORE UPDATE ON public.festival_staff_shift
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- SEED STATION LOOKUP (Section 3 of design doc)
-- =====================================================
DO $$
DECLARE
  c_mgmt uuid;
  c_fish uuid;
  c_crep uuid;
  c_gyro uuid;
  c_chick uuid;
BEGIN
  SELECT id INTO c_mgmt  FROM public.concepts WHERE lower(name) LIKE '%management%' LIMIT 1;
  SELECT id INTO c_fish  FROM public.concepts WHERE lower(name) LIKE '%fish%'       LIMIT 1;
  SELECT id INTO c_crep  FROM public.concepts WHERE lower(name) LIKE '%crep%'       LIMIT 1;
  SELECT id INTO c_gyro  FROM public.concepts WHERE lower(name) LIKE '%gyro%'       LIMIT 1;
  SELECT id INTO c_chick FROM public.concepts WHERE lower(name) LIKE '%chick%' OR lower(name) LIKE '%bun%' LIMIT 1;

  INSERT INTO public.station (concept_id, code, label, display_order) VALUES
    (c_mgmt,  'mgmt',         'Management',       0),
    (c_fish,  'cash',          'Cash register',    0),
    (c_fish,  'assembly',      'Assembly',         1),
    (c_fish,  'fryer',         'Fryer',            2),
    (c_crep,  'crepes',        'Crepes',           0),
    (c_gyro,  'pita_wrap',     'Pita wrapper',     0),
    (c_gyro,  'pita_griddle',  'Pita griddle',     1),
    (c_gyro,  'assembly',      'Assembly',         2),
    (c_gyro,  'fryer',         'Fryer',            3),
    (c_gyro,  'oven',          'Oven',             4),
    (c_gyro,  'cash',          'Cash register',    5),
    (c_chick, 'burger',        'Burger',           0),
    (c_chick, 'assembly',      'Assembly',         1),
    (c_chick, 'cash',          'Cash register',    2),
    (c_chick, 'bun_grill',     'Burger bun grill', 3),
    (c_chick, 'fryer',         'Fryer',            4)
  ON CONFLICT (concept_id, code) DO NOTHING;
END $$;