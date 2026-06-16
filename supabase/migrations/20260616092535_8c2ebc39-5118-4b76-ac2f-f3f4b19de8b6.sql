ALTER TABLE public.festivals
  ADD COLUMN IF NOT EXISTS crew_register_url_2 text,
  ADD COLUMN IF NOT EXISTS crew_register_username_2 text,
  ADD COLUMN IF NOT EXISTS crew_register_password_2 text;