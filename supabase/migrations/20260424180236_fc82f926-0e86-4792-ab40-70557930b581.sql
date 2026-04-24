CREATE TABLE IF NOT EXISTS public.festival_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL,
  concept_id uuid,
  concept_name text NOT NULL,
  product_name text NOT NULL,
  recipe_text text,
  gramaj numeric,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  allergens text[] NOT NULL DEFAULT '{}',
  allergen_notes text,
  source_file_path text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.festival_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access"
ON public.festival_recipes
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_festival_recipes_festival ON public.festival_recipes(festival_id);
CREATE INDEX IF NOT EXISTS idx_festival_recipes_concept ON public.festival_recipes(concept_id);

CREATE TRIGGER update_festival_recipes_updated_at
BEFORE UPDATE ON public.festival_recipes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();