
ALTER TABLE public.festival_power RENAME TO festival_power_legacy;

CREATE TABLE public.festival_power (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_contract_id uuid NOT NULL UNIQUE REFERENCES public.festival_contracts(id) ON DELETE CASCADE,
  connections_16a_240v smallint DEFAULT 0,
  connections_16a_400v smallint DEFAULT 0,
  connections_32a smallint DEFAULT 0,
  connections_63a smallint DEFAULT 0,
  connections_125a smallint DEFAULT 0,
  tableau_required boolean DEFAULT false,
  tableau_count smallint DEFAULT 0,
  total_kw_estimate numeric(6,2),
  total_amp_estimate smallint,
  equipment_breakdown text,
  status text NOT NULL DEFAULT 'drawing'
    CHECK (status IN ('drawing','submitted','ordered','confirmed','installed','tested')),
  power_drawing_file_path text,
  power_drawing_uploaded_at timestamptz,
  submission_deadline date,
  ordered_date date,
  cost_dkk numeric(10,2),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.festival_power ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_users_all_access ON public.festival_power
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('power-drawings', 'power-drawings', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read power-drawings" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'power-drawings');
CREATE POLICY "auth insert power-drawings" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'power-drawings');
CREATE POLICY "auth update power-drawings" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'power-drawings');
CREATE POLICY "auth delete power-drawings" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'power-drawings');
