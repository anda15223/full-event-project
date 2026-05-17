ALTER TABLE public.setup_phases
  ADD COLUMN IF NOT EXISTS from_location text,
  ADD COLUMN IF NOT EXISTS to_location text;