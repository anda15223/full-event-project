INSERT INTO storage.buckets (id, name, public)
VALUES ('parse-test-uploads', 'parse-test-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "parse_test_uploads_auth_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'parse-test-uploads');

CREATE POLICY "parse_test_uploads_auth_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'parse-test-uploads');

CREATE POLICY "parse_test_uploads_auth_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'parse-test-uploads');