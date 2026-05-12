ALTER TABLE public.festival_contracts
  ADD COLUMN IF NOT EXISTS bracelet_count integer,
  ADD COLUMN IF NOT EXISTS contract_pdf_path text,
  ADD COLUMN IF NOT EXISTS contract_pdf_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_parsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS parse_summary text;