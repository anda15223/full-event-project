INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-pdfs', 'invoice-pdfs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload invoice PDFs"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'invoice-pdfs');

CREATE POLICY "Anyone can read invoice PDFs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'invoice-pdfs');

CREATE POLICY "Anyone can update invoice PDFs"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'invoice-pdfs');