
-- Suppliers (grocery module)
CREATE TABLE public.grocery_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  contact_email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_suppliers TO authenticated;
GRANT ALL ON public.grocery_suppliers TO service_role;
ALTER TABLE public.grocery_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_suppliers all authenticated" ON public.grocery_suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_grocery_suppliers_updated BEFORE UPDATE ON public.grocery_suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ingredients
CREATE TABLE public.grocery_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.grocery_suppliers(id) ON DELETE SET NULL,
  sku text,
  unit text NOT NULL CHECK (unit IN ('g','stk')),
  pack_size numeric,
  pack_label text,
  price_per_pack numeric,
  eco boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_ingredients TO authenticated;
GRANT ALL ON public.grocery_ingredients TO service_role;
ALTER TABLE public.grocery_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_ingredients all authenticated" ON public.grocery_ingredients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_grocery_ingredients_updated BEFORE UPDATE ON public.grocery_ingredients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Recipes
CREATE TABLE public.grocery_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('product','subrecipe')),
  concept text NOT NULL CHECK (concept IN ('fish','gyros','creperie','chicksbuns','other')),
  batch_g numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_recipes TO authenticated;
GRANT ALL ON public.grocery_recipes TO service_role;
ALTER TABLE public.grocery_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_recipes all authenticated" ON public.grocery_recipes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_grocery_recipes_updated BEFORE UPDATE ON public.grocery_recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Recipe items (one of ingredient_id or subrecipe_id)
CREATE TABLE public.grocery_recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.grocery_recipes(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES public.grocery_ingredients(id) ON DELETE CASCADE,
  subrecipe_id uuid REFERENCES public.grocery_recipes(id) ON DELETE CASCADE,
  qty_g numeric,
  qty_stk numeric,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((ingredient_id IS NOT NULL)::int + (subrecipe_id IS NOT NULL)::int = 1)
);
CREATE INDEX ix_grocery_recipe_items_recipe ON public.grocery_recipe_items(recipe_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_recipe_items TO authenticated;
GRANT ALL ON public.grocery_recipe_items TO service_role;
ALTER TABLE public.grocery_recipe_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_recipe_items all authenticated" ON public.grocery_recipe_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Estimates
CREATE TABLE public.grocery_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.grocery_recipes(id) ON DELETE CASCADE,
  day date,
  units int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_grocery_estimates_uniq ON public.grocery_estimates(festival_id, recipe_id, COALESCE(day, '1900-01-01'::date));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_estimates TO authenticated;
GRANT ALL ON public.grocery_estimates TO service_role;
ALTER TABLE public.grocery_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_estimates all authenticated" ON public.grocery_estimates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_grocery_estimates_updated BEFORE UPDATE ON public.grocery_estimates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Settings per festival
CREATE TABLE public.grocery_settings (
  festival_id uuid PRIMARY KEY REFERENCES public.festivals(id) ON DELETE CASCADE,
  safety_margin_pct numeric NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_settings TO authenticated;
GRANT ALL ON public.grocery_settings TO service_role;
ALTER TABLE public.grocery_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_settings all authenticated" ON public.grocery_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_grocery_settings_updated BEFORE UPDATE ON public.grocery_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Order status per festival/supplier
CREATE TABLE public.grocery_order_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.grocery_suppliers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(festival_id, supplier_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_order_status TO authenticated;
GRANT ALL ON public.grocery_order_status TO service_role;
ALTER TABLE public.grocery_order_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_order_status all authenticated" ON public.grocery_order_status FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_grocery_order_status_updated BEFORE UPDATE ON public.grocery_order_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
