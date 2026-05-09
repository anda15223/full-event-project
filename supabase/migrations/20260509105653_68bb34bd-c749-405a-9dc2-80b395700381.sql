
DROP FUNCTION IF EXISTS public.apply_ingestion(uuid, jsonb);

ALTER TABLE public.intelligence_ingestion DROP CONSTRAINT IF EXISTS intelligence_ingestion_status_check;
ALTER TABLE public.intelligence_ingestion
  ADD CONSTRAINT intelligence_ingestion_status_check
  CHECK (status IN ('uploaded','parsing','parsed','applying','applied','rejected','failed','archived'));

UPDATE public.intelligence_ingestion SET status = 'archived' WHERE status IS DISTINCT FROM 'archived';

COMMENT ON TABLE public.intelligence_ingestion IS 'Archived 2026-05-09 — ingestion pipeline removed pending redesign. Manual Claude-skill workflow used instead this season.';

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual LIKE '%intelligence-uploads%' OR with_check LIKE '%intelligence-uploads%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "intelligence_uploads_read_only"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'intelligence-uploads');
