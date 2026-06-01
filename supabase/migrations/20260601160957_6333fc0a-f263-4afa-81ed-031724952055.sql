
CREATE TABLE public.festival_power_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_power_id uuid NOT NULL REFERENCES public.festival_power(id) ON DELETE CASCADE,
  category text,
  item_name text NOT NULL DEFAULT '',
  quantity numeric,
  unit text,
  unit_price numeric,
  total_price numeric,
  currency text,
  notes text,
  source_file_path text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fpoi_power ON public.festival_power_order_items(festival_power_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.festival_power_order_items TO authenticated;
GRANT ALL ON public.festival_power_order_items TO service_role;

ALTER TABLE public.festival_power_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read order items"
  ON public.festival_power_order_items FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth insert order items"
  ON public.festival_power_order_items FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "auth update order items"
  ON public.festival_power_order_items FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth delete order items"
  ON public.festival_power_order_items FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER trg_fpoi_updated
  BEFORE UPDATE ON public.festival_power_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.festival_power
  ADD COLUMN IF NOT EXISTS order_list_file_path text,
  ADD COLUMN IF NOT EXISTS order_list_parsed_at timestamptz;
