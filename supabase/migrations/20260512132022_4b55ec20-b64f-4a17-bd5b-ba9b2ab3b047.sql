
ALTER TABLE festival_cooling_unit
  ADD COLUMN IF NOT EXISTS unit_size text,
  ADD COLUMN IF NOT EXISTS power_required_kw numeric,
  ADD COLUMN IF NOT EXISTS order_pdf_path text,
  ADD COLUMN IF NOT EXISTS order_pdf_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_parsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS parse_summary text,
  ADD COLUMN IF NOT EXISTS order_reference text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('festival-cooling-docs', 'festival-cooling-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "cooling_docs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'festival-cooling-docs');
CREATE POLICY "cooling_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'festival-cooling-docs');
CREATE POLICY "cooling_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'festival-cooling-docs');
CREATE POLICY "cooling_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'festival-cooling-docs');
