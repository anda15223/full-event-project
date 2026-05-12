CREATE TABLE IF NOT EXISTS public.festival_safety_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  zone_label text NOT NULL,
  zone_type text DEFAULT 'tent',
  responsible_person text,
  fire_extinguisher_count integer DEFAULT 0,
  fire_extinguisher_checked boolean DEFAULT false,
  fire_blanket_count integer DEFAULT 0,
  fire_blanket_checked boolean DEFAULT false,
  first_aid_kit boolean DEFAULT false,
  first_aid_checked boolean DEFAULT false,
  emergency_exits_count integer,
  permits_obtained boolean DEFAULT false,
  permits_notes text,
  briefing_done boolean DEFAULT false,
  briefing_date timestamptz,
  notes text,
  display_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fsz_festival ON public.festival_safety_zone(festival_id);

CREATE TRIGGER festival_safety_zone_set_updated_at
BEFORE UPDATE ON public.festival_safety_zone
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.festival_safety_zone ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select" ON public.festival_safety_zone FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.festival_safety_zone FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON public.festival_safety_zone FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON public.festival_safety_zone FOR DELETE TO authenticated USING (true);

INSERT INTO public.festival_safety_zone (festival_id, zone_label, zone_type, display_order)
SELECT id, 'INSIDE tent (Fish + Gyros)', 'tent', 1 FROM public.festivals WHERE slug='jelling-2026'
UNION ALL
SELECT id, 'CAMPING tent (Creperie + Chicks)', 'tent', 2 FROM public.festivals WHERE slug='jelling-2026';