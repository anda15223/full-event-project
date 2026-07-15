
CREATE TABLE public.festival_trolley_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.festival_trolley_group TO authenticated;
GRANT ALL ON public.festival_trolley_group TO service_role;
ALTER TABLE public.festival_trolley_group ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage festival_trolley_group" ON public.festival_trolley_group FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_festival_trolley_group_updated_at BEFORE UPDATE ON public.festival_trolley_group FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.festival_trolley_group_stall (
  group_id uuid NOT NULL REFERENCES public.festival_trolley_group(id) ON DELETE CASCADE,
  stall_id uuid NOT NULL REFERENCES public.festival_grocery_stall(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, stall_id),
  UNIQUE (stall_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.festival_trolley_group_stall TO authenticated;
GRANT ALL ON public.festival_trolley_group_stall TO service_role;
ALTER TABLE public.festival_trolley_group_stall ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage festival_trolley_group_stall" ON public.festival_trolley_group_stall FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed Gron Tarnby 2026 trolley groups
DO $$
DECLARE
  fid uuid;
  g1 uuid;
  g2 uuid;
  fish1 uuid;
  fish2 uuid;
  gyros1 uuid;
  gyros2 uuid;
BEGIN
  SELECT id INTO fid FROM public.festivals WHERE slug = 'gron-tarnby-2026';
  IF fid IS NULL THEN RETURN; END IF;

  SELECT id INTO fish1 FROM public.festival_grocery_stall WHERE festival_id = fid AND name = 'Fish 1';
  SELECT id INTO fish2 FROM public.festival_grocery_stall WHERE festival_id = fid AND name = 'Fish 2';
  SELECT id INTO gyros1 FROM public.festival_grocery_stall WHERE festival_id = fid AND name = 'Gyros 1';
  SELECT id INTO gyros2 FROM public.festival_grocery_stall WHERE festival_id = fid AND name = 'Gyros 2';

  INSERT INTO public.festival_trolley_group (festival_id, name, sort_order)
    VALUES (fid, 'Trolley 1 - Fish 1 + Gyros 1', 0) RETURNING id INTO g1;
  INSERT INTO public.festival_trolley_group (festival_id, name, sort_order)
    VALUES (fid, 'Trolley 2 - Fish 2 + Gyros 2', 1) RETURNING id INTO g2;

  IF fish1 IS NOT NULL THEN INSERT INTO public.festival_trolley_group_stall (group_id, stall_id) VALUES (g1, fish1); END IF;
  IF gyros1 IS NOT NULL THEN INSERT INTO public.festival_trolley_group_stall (group_id, stall_id) VALUES (g1, gyros1); END IF;
  IF fish2 IS NOT NULL THEN INSERT INTO public.festival_trolley_group_stall (group_id, stall_id) VALUES (g2, fish2); END IF;
  IF gyros2 IS NOT NULL THEN INSERT INTO public.festival_trolley_group_stall (group_id, stall_id) VALUES (g2, gyros2); END IF;
END $$;
