-- Add parsed_data JSONB column to festival_accommodation to store full AI extraction results including evidence
ALTER TABLE public.festival_accommodation ADD COLUMN IF NOT EXISTS parsed_data JSONB;