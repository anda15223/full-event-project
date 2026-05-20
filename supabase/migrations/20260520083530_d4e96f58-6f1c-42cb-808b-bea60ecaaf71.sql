CREATE TABLE public.festival_concept_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  open_time time NOT NULL,
  close_time time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  computed_hours numeric(5,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, concept_id)
);

CREATE INDEX idx_fch_festival ON public.festival_concept_hours(festival_id);

CREATE OR REPLACE FUNCTION public.compute_hours_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  start_min int;
  end_min   int;
  diff_min  int;
BEGIN
  start_min := EXTRACT(HOUR FROM NEW.open_time)  * 60 + EXTRACT(MINUTE FROM NEW.open_time);
  end_min   := EXTRACT(HOUR FROM NEW.close_time) * 60 + EXTRACT(MINUTE FROM NEW.close_time);
  IF start_min = end_min THEN
    NEW.crosses_midnight := false;
    diff_min := 0;
  ELSIF end_min < start_min THEN
    NEW.crosses_midnight := true;
    diff_min := (1440 - start_min) + end_min;
  ELSE
    NEW.crosses_midnight := false;
    diff_min := end_min - start_min;
  END IF;
  NEW.computed_hours := ROUND(diff_min::numeric / 60, 2);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

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