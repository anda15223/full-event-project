ALTER TABLE public.festival_concepts
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE public.festival_extra_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL,
  label text NOT NULL DEFAULT '',
  value text,
  notes text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.festival_extra_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "festival_extra_details viewable" ON public.festival_extra_details FOR SELECT USING (true);
CREATE POLICY "festival_extra_details insertable" ON public.festival_extra_details FOR INSERT WITH CHECK (true);
CREATE POLICY "festival_extra_details updatable" ON public.festival_extra_details FOR UPDATE USING (true);
CREATE POLICY "festival_extra_details deletable" ON public.festival_extra_details FOR DELETE USING (true);

CREATE TRIGGER update_festival_extra_details_updated_at
BEFORE UPDATE ON public.festival_extra_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_festival_extra_details_festival ON public.festival_extra_details(festival_id, order_index);