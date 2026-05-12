-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('festival-location-docs', 'festival-location-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "floc_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "floc_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "floc_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "floc_storage_update" ON storage.objects;

CREATE POLICY "floc_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'festival-location-docs');

CREATE POLICY "floc_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'festival-location-docs');

CREATE POLICY "floc_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'festival-location-docs');

CREATE POLICY "floc_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'festival-location-docs');

-- Table
CREATE TABLE IF NOT EXISTS public.festival_location_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  file_size_bytes integer,
  description text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_floc_festival ON public.festival_location_documents(festival_id);

ALTER TABLE public.festival_location_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select" ON public.festival_location_documents;
DROP POLICY IF EXISTS "auth_insert" ON public.festival_location_documents;
DROP POLICY IF EXISTS "auth_update" ON public.festival_location_documents;
DROP POLICY IF EXISTS "auth_delete" ON public.festival_location_documents;

CREATE POLICY "auth_select" ON public.festival_location_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.festival_location_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON public.festival_location_documents FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON public.festival_location_documents FOR DELETE TO authenticated USING (true);