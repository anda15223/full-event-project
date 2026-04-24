ALTER TABLE public.festival_bc_trolleys
  ADD COLUMN IF NOT EXISTS cost numeric,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'DKK';

ALTER TABLE public.festival_bc_trolley_items
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';