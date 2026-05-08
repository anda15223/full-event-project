
CREATE TABLE IF NOT EXISTS public.festival_power_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_power_id uuid NOT NULL REFERENCES public.festival_power(id) ON DELETE CASCADE,
  position smallint NOT NULL DEFAULT 0,
  equipment_name text NOT NULL,
  quantity smallint NOT NULL DEFAULT 1,
  power_type text NOT NULL CHECK (power_type IN ('16A_240V','16A_400V','32A','63A','125A','230V_socket')),
  power_kw numeric(5,2),
  is_shared boolean DEFAULT false,
  shared_with_concepts uuid[],
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_power_equipment_power ON public.festival_power_equipment(festival_power_id);

ALTER TABLE public.festival_power_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_users_all_access ON public.festival_power_equipment
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.festival_power ADD COLUMN IF NOT EXISTS tent_location text;
ALTER TABLE public.festival_power ADD COLUMN IF NOT EXISTS shared_tent_with_contracts uuid[];

COMMENT ON COLUMN public.festival_power.tent_location IS 'For festivals with multiple shared tents (Jelling INSIDE+CAMPING). Used for tent-level gap analysis where shared equipment is summed across all stalls in same tent.';
