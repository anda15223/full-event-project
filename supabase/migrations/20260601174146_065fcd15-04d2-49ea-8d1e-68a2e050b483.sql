ALTER TABLE public.festivals
  ADD COLUMN IF NOT EXISTS crew_register_url text,
  ADD COLUMN IF NOT EXISTS crew_register_username text,
  ADD COLUMN IF NOT EXISTS crew_register_password text;