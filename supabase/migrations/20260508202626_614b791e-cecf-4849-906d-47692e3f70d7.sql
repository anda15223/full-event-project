CREATE TABLE public.festival_cooling_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  unit_label text NOT NULL,
  cooling_model text NOT NULL DEFAULT 'container'
    CHECK (cooling_model IN ('container','pallet_rental','festival_provided')),
  container_type text,
  container_count smallint,
  pallet_count_kol smallint,
  pallet_count_frys smallint,
  supplier text,
  delivery_date date,
  pickup_date date,
  cost_dkk numeric(10,2),
  status text NOT NULL DEFAULT 'not_ordered'
    CHECK (status IN ('not_ordered','ordered','confirmed','delivered','returned')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.festival_cooling_unit ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_users_all_access ON public.festival_cooling_unit
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_cooling_unit_festival ON public.festival_cooling_unit(festival_id);

CREATE TABLE public.festival_cooling_unit_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooling_unit_id uuid NOT NULL REFERENCES public.festival_cooling_unit(id) ON DELETE CASCADE,
  festival_contract_id uuid NOT NULL REFERENCES public.festival_contracts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(cooling_unit_id, festival_contract_id)
);

ALTER TABLE public.festival_cooling_unit_concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_users_all_access ON public.festival_cooling_unit_concepts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_cooling_concepts_unit ON public.festival_cooling_unit_concepts(cooling_unit_id);
CREATE INDEX idx_cooling_concepts_contract ON public.festival_cooling_unit_concepts(festival_contract_id);

CREATE TRIGGER trg_festival_cooling_unit_updated
  BEFORE UPDATE ON public.festival_cooling_unit
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();