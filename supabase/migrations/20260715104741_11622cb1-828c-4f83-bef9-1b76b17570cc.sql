
CREATE TABLE public.festival_grocery_stall (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  concept text NOT NULL,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, concept, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.festival_grocery_stall TO authenticated;
GRANT ALL ON public.festival_grocery_stall TO service_role;
ALTER TABLE public.festival_grocery_stall ENABLE ROW LEVEL SECURITY;
CREATE POLICY "festival_grocery_stall all authenticated" ON public.festival_grocery_stall FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_festival_grocery_stall_updated BEFORE UPDATE ON public.festival_grocery_stall FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.festival_grocery_stall_estimate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  stall_id uuid NOT NULL REFERENCES public.festival_grocery_stall(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  day date NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stall_id, product_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.festival_grocery_stall_estimate TO authenticated;
GRANT ALL ON public.festival_grocery_stall_estimate TO service_role;
ALTER TABLE public.festival_grocery_stall_estimate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "festival_grocery_stall_estimate all authenticated" ON public.festival_grocery_stall_estimate FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_festival_grocery_stall_estimate_updated BEFORE UPDATE ON public.festival_grocery_stall_estimate FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_fgs_festival_concept ON public.festival_grocery_stall (festival_id, concept, sort_order);
CREATE INDEX idx_fgse_stall ON public.festival_grocery_stall_estimate (stall_id);
CREATE INDEX idx_fgse_festival ON public.festival_grocery_stall_estimate (festival_id);
