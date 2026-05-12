
ALTER TABLE public.festival_setup
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS crew_assigned text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vehicles_assigned uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tasks text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.festivals
  ADD COLUMN IF NOT EXISTS setup_plan_pdf_path text,
  ADD COLUMN IF NOT EXISTS setup_plan_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_last_parsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_parse_summary text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('festival-setup-docs', 'festival-setup-docs', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "festival-setup-docs auth select" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'festival-setup-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "festival-setup-docs auth insert" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'festival-setup-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "festival-setup-docs auth update" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'festival-setup-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "festival-setup-docs auth delete" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'festival-setup-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
