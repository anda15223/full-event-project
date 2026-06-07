
-- 1) Per-concept trolley definitions (reused across festivals)
CREATE TABLE public.concept_trolleys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_id UUID NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concept_trolleys TO authenticated;
GRANT ALL ON public.concept_trolleys TO service_role;
ALTER TABLE public.concept_trolleys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read concept_trolleys" ON public.concept_trolleys FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write concept_trolleys" ON public.concept_trolleys FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_concept_trolleys_touch BEFORE UPDATE ON public.concept_trolleys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_concept_trolleys_concept ON public.concept_trolleys(concept_id, sort_order);

-- 2) Add trolley_id to existing concept_trolley_items (nullable for back-compat)
ALTER TABLE public.concept_trolley_items
  ADD COLUMN IF NOT EXISTS trolley_id UUID REFERENCES public.concept_trolleys(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_concept_trolley_items_trolley ON public.concept_trolley_items(trolley_id);

-- 3) Per-festival vehicle assignment for each trolley
CREATE TABLE public.festival_trolley_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  festival_id UUID NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  trolley_id UUID NOT NULL REFERENCES public.concept_trolleys(id) ON DELETE CASCADE,
  transport_id UUID REFERENCES public.festival_transport(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (festival_id, trolley_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.festival_trolley_assignments TO authenticated;
GRANT ALL ON public.festival_trolley_assignments TO service_role;
ALTER TABLE public.festival_trolley_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read festival_trolley_assignments" ON public.festival_trolley_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write festival_trolley_assignments" ON public.festival_trolley_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_festival_trolley_assignments_touch BEFORE UPDATE ON public.festival_trolley_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_fta_festival ON public.festival_trolley_assignments(festival_id);
CREATE INDEX idx_fta_transport ON public.festival_trolley_assignments(transport_id);
