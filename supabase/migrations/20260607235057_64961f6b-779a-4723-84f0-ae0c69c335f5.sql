
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.fep_fidibus_buildout;
-- ALTER TABLE public.setup_runs
--   DROP COLUMN IF EXISTS scope_summary,
--   DROP COLUMN IF EXISTS access_address,
--   DROP COLUMN IF EXISTS access_gate,
--   DROP COLUMN IF EXISTS checkin_contact,
--   DROP COLUMN IF EXISTS checkin_phone,
--   DROP COLUMN IF EXISTS driving_windows,
--   DROP COLUMN IF EXISTS driving_rules,
--   DROP COLUMN IF EXISTS escort_required,
--   DROP COLUMN IF EXISTS gas_check_at,
--   DROP COLUMN IF EXISTS fire_inspection_at,
--   DROP COLUMN IF EXISTS teardown_start_at,
--   DROP COLUMN IF EXISTS teardown_window,
--   DROP COLUMN IF EXISTS fidibus_notes;

ALTER TABLE public.setup_runs
  ADD COLUMN IF NOT EXISTS scope_summary text,
  ADD COLUMN IF NOT EXISTS access_address text,
  ADD COLUMN IF NOT EXISTS access_gate text,
  ADD COLUMN IF NOT EXISTS checkin_contact text,
  ADD COLUMN IF NOT EXISTS checkin_phone text,
  ADD COLUMN IF NOT EXISTS driving_windows text,
  ADD COLUMN IF NOT EXISTS driving_rules text,
  ADD COLUMN IF NOT EXISTS escort_required boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS gas_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS fire_inspection_at timestamptz,
  ADD COLUMN IF NOT EXISTS teardown_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS teardown_window text,
  ADD COLUMN IF NOT EXISTS fidibus_notes text;

CREATE TABLE IF NOT EXISTS public.fep_fidibus_buildout (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('tent','power','water','gas','cooling','daka','tables','facade','other')),
  area text,
  concept_id uuid REFERENCES public.concepts(id) ON DELETE SET NULL,
  label text,
  spec text,
  qty integer,
  dimensions text,
  position_notes text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fep_fidibus_buildout_festival_idx ON public.fep_fidibus_buildout(festival_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fep_fidibus_buildout TO authenticated;
GRANT ALL ON public.fep_fidibus_buildout TO service_role;

ALTER TABLE public.fep_fidibus_buildout ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fep_fidibus_buildout' AND policyname='fep_fidibus_buildout_admin') THEN
    CREATE POLICY "fep_fidibus_buildout_admin" ON public.fep_fidibus_buildout
      FOR ALL
      USING (public.has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='fep_fidibus_buildout_touch_updated_at') THEN
    CREATE TRIGGER fep_fidibus_buildout_touch_updated_at
      BEFORE UPDATE ON public.fep_fidibus_buildout
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
