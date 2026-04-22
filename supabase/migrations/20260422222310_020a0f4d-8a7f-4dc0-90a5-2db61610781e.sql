INSERT INTO storage.buckets (id, name, public)
VALUES ('festival-photos', 'festival-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "festival-photos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'festival-photos');

CREATE POLICY "festival-photos public insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'festival-photos');

CREATE POLICY "festival-photos public update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'festival-photos');

CREATE POLICY "festival-photos public delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'festival-photos');

ALTER TABLE public.festival_concepts
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;