
CREATE TABLE public.grocery_stock_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_stock_pool TO authenticated;
GRANT ALL ON public.grocery_stock_pool TO service_role;
ALTER TABLE public.grocery_stock_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_stock_pool all authenticated" ON public.grocery_stock_pool FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gs_pool_upd BEFORE UPDATE ON public.grocery_stock_pool FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.grocery_stock_pool_festival (
  pool_id uuid NOT NULL REFERENCES public.grocery_stock_pool(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, festival_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_stock_pool_festival TO authenticated;
GRANT ALL ON public.grocery_stock_pool_festival TO service_role;
ALTER TABLE public.grocery_stock_pool_festival ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_stock_pool_festival all authenticated" ON public.grocery_stock_pool_festival FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX idx_gs_pool_festival_unique ON public.grocery_stock_pool_festival (festival_id);

CREATE TABLE public.grocery_stock_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.grocery_stock_pool(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.grocery_ingredients(id) ON DELETE CASCADE,
  packs numeric NOT NULL DEFAULT 0,
  delivery_date date,
  source_order_supplier_id uuid,
  source_order_festival_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_stock_delivery TO authenticated;
GRANT ALL ON public.grocery_stock_delivery TO service_role;
ALTER TABLE public.grocery_stock_delivery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_stock_delivery all authenticated" ON public.grocery_stock_delivery FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gs_delivery_upd BEFORE UPDATE ON public.grocery_stock_delivery FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_gs_delivery_pool ON public.grocery_stock_delivery (pool_id, ingredient_id, delivery_date);

CREATE TABLE public.grocery_stock_topup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.grocery_stock_pool(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.grocery_suppliers(id) ON DELETE CASCADE,
  delivery_date date,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_stock_topup TO authenticated;
GRANT ALL ON public.grocery_stock_topup TO service_role;
ALTER TABLE public.grocery_stock_topup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_stock_topup all authenticated" ON public.grocery_stock_topup FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gs_topup_upd BEFORE UPDATE ON public.grocery_stock_topup FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.grocery_stock_topup_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topup_id uuid NOT NULL REFERENCES public.grocery_stock_topup(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.grocery_ingredients(id) ON DELETE CASCADE,
  packs numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_stock_topup_item TO authenticated;
GRANT ALL ON public.grocery_stock_topup_item TO service_role;
ALTER TABLE public.grocery_stock_topup_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_stock_topup_item all authenticated" ON public.grocery_stock_topup_item FOR ALL TO authenticated USING (true) WITH CHECK (true);
