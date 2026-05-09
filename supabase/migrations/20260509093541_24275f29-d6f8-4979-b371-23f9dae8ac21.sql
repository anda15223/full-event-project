
-- Rename existing legacy tables
ALTER TABLE public.festival_safety RENAME TO festival_safety_legacy;
ALTER TABLE public.festival_accommodation RENAME TO festival_accommodation_legacy;

-- ============= SAFETY =============
CREATE TYPE public.safety_gas_status AS ENUM ('not_required','scheduled','passed','failed','pending_reschedule');
CREATE TYPE public.safety_food_status AS ENUM ('not_scheduled','scheduled','passed','passed_with_remarks','failed','not_required');
CREATE TYPE public.safety_electrical_status AS ENUM ('not_required','pending','certified','failed');

CREATE TABLE public.festival_safety (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL UNIQUE,
  gas_safety_required boolean NOT NULL DEFAULT true,
  gas_safety_status public.safety_gas_status NOT NULL DEFAULT 'scheduled',
  gas_safety_date date,
  gas_safety_time time,
  gas_safety_inspector text,
  gas_safety_certificate_path text,
  gas_safety_notes text,
  food_authority_lead text DEFAULT 'Costel',
  food_authority_inspection_date date,
  food_authority_status public.safety_food_status NOT NULL DEFAULT 'not_scheduled',
  food_authority_notes text,
  food_authority_certificate_path text,
  electrical_certification_status public.safety_electrical_status NOT NULL DEFAULT 'pending',
  electrical_certifier text,
  electrical_certification_path text,
  electrical_certification_date date,
  fire_safety_extinguishers_count integer,
  fire_safety_extinguishers_inspection_date date,
  fire_safety_blanket_count integer,
  fire_safety_evacuation_plan_path text,
  first_aid_kit_locations text,
  first_aid_kit_count integer,
  first_aid_certified_staff_count integer,
  first_aid_responsible text,
  emergency_contacts_text text,
  insurance_policy_number text,
  insurance_provider text,
  insurance_coverage_summary text,
  insurance_certificate_path text,
  safety_briefing_completed boolean NOT NULL DEFAULT false,
  safety_briefing_date date,
  safety_briefing_attendees text[],
  additional_notes text,
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.festival_safety ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all_access" ON public.festival_safety FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_festival_safety_updated BEFORE UPDATE ON public.festival_safety
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= ACCOMMODATION =============
CREATE TYPE public.accommodation_type AS ENUM ('festival_camping','festival_caravan','festival_provided_room','hotel','airbnb','private_house','company_van');
CREATE TYPE public.accommodation_payment_status AS ENUM ('not_paid','deposit_paid','paid_in_full','invoiced');

CREATE TABLE public.festival_accommodation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL,
  accommodation_type public.accommodation_type NOT NULL DEFAULT 'hotel',
  provider_name text,
  address text,
  check_in_date date,
  check_in_time time,
  check_out_date date,
  check_out_time time,
  capacity integer,
  assigned_staff text[],
  assigned_staff_count integer,
  cost_dkk numeric,
  payment_status public.accommodation_payment_status NOT NULL DEFAULT 'not_paid',
  confirmation_number text,
  contact_name text,
  contact_phone text,
  contact_email text,
  booking_file_path text,
  amenities text[],
  notes text,
  booking_made_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.festival_accommodation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all_access" ON public.festival_accommodation FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_festival_accommodation_updated BEFORE UPDATE ON public.festival_accommodation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_facc_festival ON public.festival_accommodation(festival_id);

-- ============= STORAGE BUCKETS =============
INSERT INTO storage.buckets (id, name, public) VALUES ('festival-safety-docs','festival-safety-docs',false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('festival-accommodation-docs','festival-accommodation-docs',false) ON CONFLICT DO NOTHING;

CREATE POLICY "safety_docs_auth_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='festival-safety-docs') WITH CHECK (bucket_id='festival-safety-docs');
CREATE POLICY "acc_docs_auth_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='festival-accommodation-docs') WITH CHECK (bucket_id='festival-accommodation-docs');

-- ============= REALTIME =============
ALTER PUBLICATION supabase_realtime ADD TABLE public.festival_safety;
ALTER PUBLICATION supabase_realtime ADD TABLE public.festival_accommodation;
