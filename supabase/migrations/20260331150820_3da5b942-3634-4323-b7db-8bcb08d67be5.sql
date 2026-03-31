-- Add new columns to emails table
ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS body_clean_text text,
  ADD COLUMN IF NOT EXISTS charset text DEFAULT 'utf-8',
  ADD COLUMN IF NOT EXISTS parse_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS parse_error text,
  ADD COLUMN IF NOT EXISTS has_attachments boolean DEFAULT false;

-- Create email_attachments table
CREATE TABLE IF NOT EXISTS public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid REFERENCES public.emails(id) ON DELETE CASCADE NOT NULL,
  filename text,
  mime_type text,
  size integer DEFAULT 0,
  content_disposition text,
  is_inline boolean DEFAULT false,
  cid text,
  storage_path text,
  extracted_text text,
  extracted_summary text,
  document_type text,
  parse_status text DEFAULT 'pending',
  parse_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies for attachments
CREATE POLICY "Attachments viewable by everyone" ON public.email_attachments FOR SELECT TO public USING (true);
CREATE POLICY "Attachments insertable by anyone" ON public.email_attachments FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Attachments updatable by anyone" ON public.email_attachments FOR UPDATE TO public USING (true);

-- Create storage bucket for email attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('email-attachments', 'email-attachments', true) ON CONFLICT DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Email attachments are publicly readable" ON storage.objects FOR SELECT TO public USING (bucket_id = 'email-attachments');
CREATE POLICY "Email attachments can be uploaded" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'email-attachments');
CREATE POLICY "Email attachments can be updated" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'email-attachments');