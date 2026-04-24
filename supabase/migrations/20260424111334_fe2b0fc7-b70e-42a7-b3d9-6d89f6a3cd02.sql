-- 1. Add folder column to emails
ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'inbox';

CREATE INDEX IF NOT EXISTS idx_emails_folder ON public.emails(folder);

-- 2. Document category enum
CREATE TYPE public.document_category AS ENUM (
  'invoice', 'festival', 'contract', 'hr', 'supplier', 'authority', 'other'
);

-- 3. Extracted documents table
CREATE TABLE public.extracted_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES public.emails(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT,
  folder TEXT NOT NULL DEFAULT 'inbox',
  received_at TIMESTAMPTZ,
  sender TEXT,
  subject TEXT,
  category document_category NOT NULL DEFAULT 'other',
  festival_slug TEXT,
  subcategory TEXT,
  extracted_text TEXT,
  ai_summary TEXT,
  amount NUMERIC,
  currency TEXT,
  processed_at TIMESTAMPTZ,
  manual_override BOOLEAN NOT NULL DEFAULT false,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_extracted_documents_category ON public.extracted_documents(category);
CREATE INDEX idx_extracted_documents_festival_slug ON public.extracted_documents(festival_slug);
CREATE INDEX idx_extracted_documents_folder ON public.extracted_documents(folder);
CREATE INDEX idx_extracted_documents_received_at ON public.extracted_documents(received_at DESC);
CREATE INDEX idx_extracted_documents_email_id ON public.extracted_documents(email_id);

ALTER TABLE public.extracted_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view documents"
  ON public.extracted_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert documents"
  ON public.extracted_documents FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update documents"
  ON public.extracted_documents FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete documents"
  ON public.extracted_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_extracted_documents_updated_at
  BEFORE UPDATE ON public.extracted_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Private documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read documents bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "Authenticated users can upload to documents bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Authenticated users can update documents bucket"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "Admins can delete from documents bucket"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'));