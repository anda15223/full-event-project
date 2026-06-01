ALTER TABLE public.festival_contracts
  ADD COLUMN IF NOT EXISTS summary jsonb,
  ADD COLUMN IF NOT EXISTS parsed_at timestamptz;