-- Drop old empty festival_facade and recreate with rich schema
DROP TABLE IF EXISTS public.festival_facade CASCADE;

CREATE TABLE public.festival_facade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_contract_id uuid NOT NULL UNIQUE REFERENCES public.festival_contracts(id) ON DELETE CASCADE,
  design_status text NOT NULL DEFAULT 'not_started'
    CHECK (design_status IN ('not_started','in_design','in_review','festival_approved','reused_from_2025','printed','installed','damaged_replace_needed')),
  design_concept_note text,
  design_file_path text,
  design_preview_path text,
  material_type text CHECK (material_type IN ('fabric','forex','dibond','vinyl_wrap','banner_mesh','other') OR material_type IS NULL),
  material_orders_status text CHECK (material_orders_status IN ('not_ordered','ordered','in_production','delivered','installed') OR material_orders_status IS NULL),
  material_supplier text,
  material_deadline date,
  print_deadline date,
  dimensions_text text,
  dimensions_w_cm integer,
  dimensions_h_cm integer,
  panel_count integer NOT NULL DEFAULT 1,
  cost_dkk numeric,
  festival_approval_required boolean NOT NULL DEFAULT true,
  festival_approval_received_at timestamptz,
  festival_approval_contact_id uuid REFERENCES public.festival_contacts(id) ON DELETE SET NULL,
  reused_from text,
  reuse_modifications text,
  installation_notes text,
  notes text,
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_festival_facade_contract ON public.festival_facade(festival_contract_id);
CREATE INDEX idx_festival_facade_status ON public.festival_facade(design_status);
CREATE INDEX idx_festival_facade_print_deadline ON public.festival_facade(print_deadline);

ALTER TABLE public.festival_facade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all_access" ON public.festival_facade
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_festival_facade_updated
  BEFORE UPDATE ON public.festival_facade
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.festival_facade;

-- Storage bucket for design files & previews
INSERT INTO storage.buckets (id, name, public)
VALUES ('facade-designs', 'facade-designs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "facade_designs_auth_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'facade-designs');
CREATE POLICY "facade_designs_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'facade-designs');
CREATE POLICY "facade_designs_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'facade-designs');
CREATE POLICY "facade_designs_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'facade-designs');