CREATE TABLE public.concept_trolley_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  quantity text NOT NULL,
  position int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_concept_trolley_items_concept ON public.concept_trolley_items(concept_id, position);

ALTER TABLE public.concept_trolley_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users_all_access" ON public.concept_trolley_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_concept_trolley_items_updated_at
  BEFORE UPDATE ON public.concept_trolley_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();