
ALTER TABLE public.festival_transport
  ADD COLUMN IF NOT EXISTS accreditation_pdf_path text,
  ADD COLUMN IF NOT EXISTS accreditation_uploaded_at timestamptz;

INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-permits', 'vehicle-permits', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "vehicle-permits authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "vehicle-permits authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "vehicle-permits authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "vehicle-permits authenticated delete" ON storage.objects;

CREATE POLICY "vehicle-permits authenticated read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vehicle-permits');

CREATE POLICY "vehicle-permits authenticated insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vehicle-permits');

CREATE POLICY "vehicle-permits authenticated update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'vehicle-permits')
WITH CHECK (bucket_id = 'vehicle-permits');

CREATE POLICY "vehicle-permits authenticated delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'vehicle-permits');
