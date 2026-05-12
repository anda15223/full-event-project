CREATE TABLE public.festival_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  festival_open time,
  festival_close time,
  prep_open time,
  prep_close time,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(festival_id, day_date)
);

CREATE INDEX idx_fhours_festival ON public.festival_hours(festival_id);
CREATE INDEX idx_fhours_date ON public.festival_hours(festival_id, day_date);

CREATE TRIGGER festival_hours_set_updated_at
BEFORE UPDATE ON public.festival_hours
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.festival_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select" ON public.festival_hours FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.festival_hours FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON public.festival_hours FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete" ON public.festival_hours FOR DELETE TO authenticated USING (true);