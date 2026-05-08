
-- 1.1 / 1.2 concepts: canonical slugs + display_order
UPDATE concepts SET slug = 'fish-chips' WHERE name ILIKE 'Fish%Chips%';
UPDATE concepts SET slug = 'gyros' WHERE name ILIKE '%Gyros%';
UPDATE concepts SET slug = 'creperie' WHERE name ILIKE '%Crêperie%' OR name ILIKE '%Creperie%';
UPDATE concepts SET slug = 'chicks' WHERE name ILIKE '%Chicks%';

ALTER TABLE concepts ADD CONSTRAINT concepts_slug_unique UNIQUE (slug);

ALTER TABLE concepts ADD COLUMN IF NOT EXISTS display_order smallint;
UPDATE concepts SET display_order = 1 WHERE slug = 'fish-chips';
UPDATE concepts SET display_order = 2 WHERE slug = 'gyros';
UPDATE concepts SET display_order = 3 WHERE slug = 'creperie';
UPDATE concepts SET display_order = 4 WHERE slug = 'chicks';

-- 1.3 festival_concept_assignments
CREATE TABLE public.festival_concept_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  manager_staff_id uuid REFERENCES festival_staff(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'manager'
    CHECK (role IN ('manager','sous_manager','foh_lead','kitchen_lead')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (festival_id, concept_id, role)
);
ALTER TABLE public.festival_concept_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_users_all_access ON public.festival_concept_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 1.4 festival_service_hours
CREATE TABLE public.festival_service_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES concepts(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  open_time time,
  close_time time,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX uq_hours_per_concept_per_day
  ON public.festival_service_hours
  (festival_id, COALESCE(concept_id, '00000000-0000-0000-0000-000000000000'::uuid), service_date);
ALTER TABLE public.festival_service_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_users_all_access ON public.festival_service_hours
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 1.5 festival_contacts
CREATE TABLE public.festival_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  role text NOT NULL,
  organization text,
  full_name text NOT NULL,
  email text,
  phone text,
  notes text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.festival_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_users_all_access ON public.festival_contacts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
