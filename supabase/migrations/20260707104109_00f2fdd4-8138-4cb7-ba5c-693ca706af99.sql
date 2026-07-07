
CREATE TABLE public.grocery_recipe_packaging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.grocery_recipes(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.grocery_ingredients(id) ON DELETE CASCADE,
  qty_per_unit numeric NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_grocery_recipe_packaging_recipe ON public.grocery_recipe_packaging(recipe_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_recipe_packaging TO authenticated;
GRANT ALL ON public.grocery_recipe_packaging TO service_role;
ALTER TABLE public.grocery_recipe_packaging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_recipe_packaging all authenticated" ON public.grocery_recipe_packaging FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.grocery_festival_consumables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.grocery_ingredients(id) ON DELETE CASCADE,
  qty numeric NOT NULL DEFAULT 0,
  unit_mode text NOT NULL DEFAULT 'packs' CHECK (unit_mode IN ('packs','units')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_grocery_festival_consumables_fest ON public.grocery_festival_consumables(festival_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_festival_consumables TO authenticated;
GRANT ALL ON public.grocery_festival_consumables TO service_role;
ALTER TABLE public.grocery_festival_consumables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_festival_consumables all authenticated" ON public.grocery_festival_consumables FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_grocery_festival_consumables_updated BEFORE UPDATE ON public.grocery_festival_consumables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
