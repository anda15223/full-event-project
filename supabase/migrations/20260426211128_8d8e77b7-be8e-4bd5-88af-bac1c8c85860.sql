ALTER TABLE public.festival_bc_trolley_items
  ADD COLUMN IF NOT EXISTS needed_quantity numeric,
  ADD COLUMN IF NOT EXISTS counted_quantity numeric;