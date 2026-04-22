CREATE TABLE public.festival_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL,
  name text NOT NULL,
  role text,
  phone text,
  email text,
  notes text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.festival_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "festival_contacts viewable" ON public.festival_contacts FOR SELECT USING (true);
CREATE POLICY "festival_contacts insertable" ON public.festival_contacts FOR INSERT WITH CHECK (true);
CREATE POLICY "festival_contacts updatable" ON public.festival_contacts FOR UPDATE USING (true);
CREATE POLICY "festival_contacts deletable" ON public.festival_contacts FOR DELETE USING (true);

CREATE TRIGGER update_festival_contacts_updated_at
BEFORE UPDATE ON public.festival_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_festival_contacts_festival ON public.festival_contacts(festival_id, order_index);