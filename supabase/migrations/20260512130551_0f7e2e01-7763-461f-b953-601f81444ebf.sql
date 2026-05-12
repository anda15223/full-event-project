-- Add facade dimension + spec columns
ALTER TABLE public.festival_facade
  ADD COLUMN IF NOT EXISTS tent_width_m numeric,
  ADD COLUMN IF NOT EXISTS tent_depth_m numeric,
  ADD COLUMN IF NOT EXISTS tent_height_m numeric,
  ADD COLUMN IF NOT EXISTS facade_width_m numeric,
  ADD COLUMN IF NOT EXISTS facade_height_m numeric,
  ADD COLUMN IF NOT EXISTS setup_notes text,
  ADD COLUMN IF NOT EXISTS spec_pdf_path text,
  ADD COLUMN IF NOT EXISTS spec_pdf_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_parsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS parse_summary text;

-- Seed Jelling tent dimensions (12 x 6 x 3) where unset
UPDATE public.festival_facade ff
SET tent_width_m = COALESCE(ff.tent_width_m, 12),
    tent_depth_m = COALESCE(ff.tent_depth_m, 6),
    tent_height_m = COALESCE(ff.tent_height_m, 3)
FROM public.festival_contracts fc, public.festivals f
WHERE ff.festival_contract_id = fc.id
  AND fc.festival_id = f.id
  AND f.slug = 'jelling-2026';

-- Photos table
CREATE TABLE IF NOT EXISTS public.festival_facade_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_facade_id uuid NOT NULL REFERENCES public.festival_facade(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  caption text,
  display_order integer DEFAULT 0,
  uploaded_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ffphotos_facade ON public.festival_facade_photos(festival_facade_id);
ALTER TABLE public.festival_facade_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select" ON public.festival_facade_photos;
DROP POLICY IF EXISTS "auth_insert" ON public.festival_facade_photos;
DROP POLICY IF EXISTS "auth_update" ON public.festival_facade_photos;
DROP POLICY IF EXISTS "auth_delete" ON public.festival_facade_photos;
CREATE POLICY "auth_select" ON public.festival_facade_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.festival_facade_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON public.festival_facade_photos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON public.festival_facade_photos FOR DELETE TO authenticated USING (true);

-- Storage policies for facade-designs bucket (idempotent, authenticated full access)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='facade_designs_auth_all') THEN
    CREATE POLICY "facade_designs_auth_all" ON storage.objects FOR ALL TO authenticated
      USING (bucket_id='facade-designs') WITH CHECK (bucket_id='facade-designs');
  END IF;
END $$;