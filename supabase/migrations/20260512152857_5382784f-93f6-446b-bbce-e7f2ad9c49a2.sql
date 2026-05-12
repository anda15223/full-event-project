
CREATE TABLE public.festival_concept_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'DKK',
  source_pdf_path text,
  source_pdf_uploaded_at timestamptz,
  last_parsed_at timestamptz,
  parse_summary text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(festival_id, concept_id)
);
CREATE INDEX idx_fcp_festival ON public.festival_concept_prices(festival_id);
CREATE INDEX idx_fcp_concept ON public.festival_concept_prices(festival_id, concept_id);

CREATE TRIGGER festival_concept_prices_set_updated_at
BEFORE UPDATE ON public.festival_concept_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.festival_concept_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fcp_select" ON public.festival_concept_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "fcp_insert" ON public.festival_concept_prices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fcp_update" ON public.festival_concept_prices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "fcp_delete" ON public.festival_concept_prices FOR DELETE TO authenticated USING (true);

CREATE TABLE public.festival_concept_price_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_prices_id uuid NOT NULL REFERENCES public.festival_concept_prices(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  category text,
  is_vegetarian boolean NOT NULL DEFAULT false,
  is_vegan boolean NOT NULL DEFAULT false,
  is_gluten_free boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fcpi_prices ON public.festival_concept_price_item(concept_prices_id);

ALTER TABLE public.festival_concept_price_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fcpi_select" ON public.festival_concept_price_item FOR SELECT TO authenticated USING (true);
CREATE POLICY "fcpi_insert" ON public.festival_concept_price_item FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fcpi_update" ON public.festival_concept_price_item FOR UPDATE TO authenticated USING (true);
CREATE POLICY "fcpi_delete" ON public.festival_concept_price_item FOR DELETE TO authenticated USING (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('festival-prices-docs', 'festival-prices-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "prices_docs_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'festival-prices-docs');
CREATE POLICY "prices_docs_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'festival-prices-docs');
CREATE POLICY "prices_docs_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'festival-prices-docs');
CREATE POLICY "prices_docs_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'festival-prices-docs');
