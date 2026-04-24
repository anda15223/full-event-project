-- 1. Extend personal_festival_db
ALTER TABLE public.personal_festival_db
  ADD COLUMN IF NOT EXISTS is_driver boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_accommodation boolean NOT NULL DEFAULT false;

-- 2. festival_cars
CREATE TABLE IF NOT EXISTS public.festival_cars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES public.festival_concepts(id) ON DELETE SET NULL,
  label text,
  make_model text,
  license_plate text,
  driver_id uuid REFERENCES public.personal_festival_db(id) ON DELETE SET NULL,
  is_rental boolean NOT NULL DEFAULT false,
  rental_cost numeric,
  currency text NOT NULL DEFAULT 'DKK',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_festival_cars_festival_id ON public.festival_cars(festival_id);

ALTER TABLE public.festival_cars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON public.festival_cars
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_festival_cars_updated
  BEFORE UPDATE ON public.festival_cars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. festival_hotels
CREATE TABLE IF NOT EXISTS public.festival_hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  name text,
  address text,
  contact text,
  rooms_count integer,
  cost_per_night numeric,
  total_nights integer,
  total_cost numeric,
  currency text NOT NULL DEFAULT 'DKK',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_festival_hotels_festival_id ON public.festival_hotels(festival_id);

ALTER TABLE public.festival_hotels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON public.festival_hotels
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_festival_hotels_updated
  BEFORE UPDATE ON public.festival_hotels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();