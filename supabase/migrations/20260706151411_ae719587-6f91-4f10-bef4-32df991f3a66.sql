
CREATE TABLE public.festival_equipment_trolley_split (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.festival_power_equipment(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  trolley_number int NOT NULL CHECK (trolley_number > 0),
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipment_id, trolley_number)
);

CREATE INDEX idx_fets_festival ON public.festival_equipment_trolley_split(festival_id, trolley_number);
CREATE INDEX idx_fets_equipment ON public.festival_equipment_trolley_split(equipment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.festival_equipment_trolley_split TO authenticated;
GRANT ALL ON public.festival_equipment_trolley_split TO service_role;

ALTER TABLE public.festival_equipment_trolley_split ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read equipment trolley splits"
  ON public.festival_equipment_trolley_split FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can manage equipment trolley splits"
  ON public.festival_equipment_trolley_split FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_fets_updated_at
  BEFORE UPDATE ON public.festival_equipment_trolley_split
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
