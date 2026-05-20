-- Drop existing table (only test data)
DROP TABLE IF EXISTS public.festival_concept_hours CASCADE;

-- Recreate with per-day shape
CREATE TABLE public.festival_concept_hours (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id      uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  concept_id       uuid NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  operating_date   date NOT NULL,
  open_time        time NOT NULL,
  close_time       time NOT NULL,
  crosses_midnight bool NOT NULL DEFAULT false,
  computed_hours   numeric(5,2),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, concept_id, operating_date)
);

CREATE INDEX idx_fch_festival ON public.festival_concept_hours(festival_id);
CREATE INDEX idx_fch_festival_concept ON public.festival_concept_hours(festival_id, concept_id);

-- Reuse existing compute_hours_metrics() function
CREATE TRIGGER trg_compute_hours_metrics
  BEFORE INSERT OR UPDATE OF open_time, close_time
  ON public.festival_concept_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_hours_metrics();

ALTER TABLE public.festival_concept_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY hours_auth_all
  ON public.festival_concept_hours
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);