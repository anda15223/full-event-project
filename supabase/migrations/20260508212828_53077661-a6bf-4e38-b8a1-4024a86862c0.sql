CREATE TABLE public.concept_equipment_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  variant text NOT NULL DEFAULT 'standalone'
    CHECK (variant IN ('standalone', 'inside_tent_shared')),
  position smallint NOT NULL DEFAULT 0,
  equipment_name text NOT NULL,
  quantity smallint NOT NULL DEFAULT 1,
  power_type text NOT NULL
    CHECK (power_type IN ('16A_240V','16A_400V','32A','63A','125A','230V_socket')),
  power_kw numeric(5,2),
  is_shared_with_other_concept boolean DEFAULT false,
  shared_with_concept_slug text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_template_unique
  ON public.concept_equipment_template(concept_id, variant, position);

ALTER TABLE public.concept_equipment_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_users_all_access ON public.concept_equipment_template
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_concept_equipment_template_updated_at
  BEFORE UPDATE ON public.concept_equipment_template
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();