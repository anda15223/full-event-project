ALTER TABLE public.festival_concepts
  ADD COLUMN IF NOT EXISTS subsections jsonb NOT NULL DEFAULT '[]'::jsonb;