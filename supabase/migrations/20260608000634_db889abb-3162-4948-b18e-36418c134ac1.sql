-- Add source_festival_id tag to fep_fidibus_buildout so imported rows can be badged/filtered.
ALTER TABLE public.fep_fidibus_buildout
  ADD COLUMN IF NOT EXISTS source_festival_id uuid NULL REFERENCES public.festivals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fep_fidibus_buildout_source_festival_idx
  ON public.fep_fidibus_buildout(source_festival_id);

-- ROLLBACK
-- DROP INDEX IF EXISTS public.fep_fidibus_buildout_source_festival_idx;
-- ALTER TABLE public.fep_fidibus_buildout DROP COLUMN IF EXISTS source_festival_id;
