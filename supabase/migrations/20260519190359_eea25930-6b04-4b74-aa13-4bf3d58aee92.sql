
ALTER TABLE public.festival_staff_assignment
  ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES public.station(id);

CREATE INDEX IF NOT EXISTS idx_fsa_station ON public.festival_staff_assignment(station_id);
