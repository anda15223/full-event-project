ALTER TABLE public.festivals
  ADD COLUMN IF NOT EXISTS accreditation_url text,
  ADD COLUMN IF NOT EXISTS accreditation_username text,
  ADD COLUMN IF NOT EXISTS accreditation_password text,
  ADD COLUMN IF NOT EXISTS accreditation_notes text;