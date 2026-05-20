
-- ============== TYPES ==============
CREATE TYPE fep_app_role AS ENUM ('admin', 'staff');
CREATE TYPE fep_onboarding_status AS ENUM ('incomplete','completed','contract_sent','contract_signed');
CREATE TYPE fep_eu_status AS ENUM ('eu_eea','non_eu');
CREATE TYPE fep_bank_type AS ENUM ('dk','iban','nemkonto');
CREATE TYPE fep_contract_status AS ENUM ('draft','sent','signed','declined','expired');

-- ============== SHARED FUNCTIONS ==============
CREATE OR REPLACE FUNCTION public.fep_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

-- ============== TABLE 1: fep_user_roles ==============
CREATE TABLE public.fep_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role fep_app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX idx_fep_user_roles_user ON public.fep_user_roles(user_id);

CREATE OR REPLACE FUNCTION public.fep_has_role(_user_id uuid, _role fep_app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fep_user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.fep_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.fep_has_role(auth.uid(), 'admin'::fep_app_role)
$$;

-- ============== TABLE 2: fep_employee_profile ==============
CREATE TABLE public.fep_employee_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_staff_id uuid NOT NULL REFERENCES public.festival_staff(id) ON DELETE CASCADE,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  magic_token text UNIQUE,
  magic_token_expires_at timestamptz,
  full_legal_name text,
  date_of_birth date,
  nationality text,
  eu_status fep_eu_status,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text DEFAULT 'Denmark',
  cpr text,
  phone text,
  email text,
  bank_type fep_bank_type,
  reg_nr text,
  account_nr text,
  iban text,
  swift text,
  work_permit_file_path text,
  privacy_accepted_at timestamptz,
  terms_accepted_at timestamptz,
  onboarding_status fep_onboarding_status NOT NULL DEFAULT 'incomplete',
  profile_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_staff_id),
  UNIQUE (auth_user_id)
);
CREATE INDEX idx_fep_emp_token ON public.fep_employee_profile(magic_token);
CREATE INDEX idx_fep_emp_status ON public.fep_employee_profile(onboarding_status);
CREATE TRIGGER trg_fep_emp_updated_at BEFORE UPDATE ON public.fep_employee_profile
  FOR EACH ROW EXECUTE FUNCTION public.fep_touch_updated_at();

-- ============== TABLE 3: fep_company_settings ==============
CREATE TABLE public.fep_company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  company_name text NOT NULL,
  cvr text NOT NULL,
  address text NOT NULL,
  phone text,
  email text NOT NULL,
  insurance_company text,
  sick_contact_name text,
  sick_contact_phone text,
  default_hourly_rate numeric(10,2) NOT NULL DEFAULT 150.00,
  contract_cc_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton_only CHECK (singleton = true),
  UNIQUE (singleton)
);
CREATE TRIGGER trg_fep_company_settings_updated_at BEFORE UPDATE ON public.fep_company_settings
  FOR EACH ROW EXECUTE FUNCTION public.fep_touch_updated_at();

INSERT INTO public.fep_company_settings (
  company_name, cvr, address, phone, email,
  insurance_company, sick_contact_name, sick_contact_phone,
  default_hourly_rate, contract_cc_email
) VALUES (
  'MCA Trading ApS','39313707','Gentoftegade 110, kl., 2820 Gentofte','+45 42 78 77 38','aa@thefishproject.dk',
  'Tryg Forsikring','Ancuța Creanga','+45 21 57 11 32',150.00,'aa@thefishproject.dk'
);

-- ============== TABLE 4: fep_contract_template ==============
CREATE TABLE public.fep_contract_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  file_path text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  language text NOT NULL DEFAULT 'da',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_fep_contract_template_updated_at BEFORE UPDATE ON public.fep_contract_template
  FOR EACH ROW EXECUTE FUNCTION public.fep_touch_updated_at();

-- ============== TABLE 5: fep_contract ==============
CREATE TABLE public.fep_contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_staff_id uuid NOT NULL REFERENCES public.festival_staff(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  employee_profile_id uuid REFERENCES public.fep_employee_profile(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.fep_contract_template(id) ON DELETE SET NULL,
  hourly_rate numeric(10,2) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  work_location text,
  job_title text DEFAULT 'Festivalmedhjælper',
  work_hours_description text,
  company_snapshot jsonb,
  employee_snapshot jsonb,
  signed_pdf_path text,
  signed_name text,
  signed_at timestamptz,
  signed_ip text,
  emailed_to_hire_at timestamptz,
  emailed_to_admin_at timestamptz,
  status fep_contract_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_staff_id, festival_id)
);
CREATE INDEX idx_fep_contract_festival ON public.fep_contract(festival_id);
CREATE INDEX idx_fep_contract_staff ON public.fep_contract(festival_staff_id);
CREATE INDEX idx_fep_contract_status ON public.fep_contract(status);
CREATE TRIGGER trg_fep_contract_updated_at BEFORE UPDATE ON public.fep_contract
  FOR EACH ROW EXECUTE FUNCTION public.fep_touch_updated_at();

-- ============== RLS ==============
ALTER TABLE public.fep_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fep_employee_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fep_company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fep_contract_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fep_contract ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_roles_admin_all ON public.fep_user_roles
  FOR ALL TO authenticated USING (public.fep_is_admin()) WITH CHECK (public.fep_is_admin());

CREATE POLICY emp_profile_admin_all ON public.fep_employee_profile
  FOR ALL TO authenticated USING (public.fep_is_admin()) WITH CHECK (public.fep_is_admin());
CREATE POLICY emp_profile_self_read ON public.fep_employee_profile
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY emp_profile_self_update ON public.fep_employee_profile
  FOR UPDATE TO authenticated USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY emp_profile_token_read ON public.fep_employee_profile
  FOR SELECT TO anon USING (magic_token IS NOT NULL AND magic_token_expires_at > now());
CREATE POLICY emp_profile_token_update ON public.fep_employee_profile
  FOR UPDATE TO anon USING (magic_token IS NOT NULL AND magic_token_expires_at > now()) WITH CHECK (magic_token IS NOT NULL);

CREATE POLICY company_settings_admin_write ON public.fep_company_settings
  FOR ALL TO authenticated USING (public.fep_is_admin()) WITH CHECK (public.fep_is_admin());
CREATE POLICY company_settings_auth_read ON public.fep_company_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY company_settings_anon_read ON public.fep_company_settings
  FOR SELECT TO anon USING (true);

CREATE POLICY contract_template_admin ON public.fep_contract_template
  FOR ALL TO authenticated USING (public.fep_is_admin()) WITH CHECK (public.fep_is_admin());

CREATE POLICY contract_admin_all ON public.fep_contract
  FOR ALL TO authenticated USING (public.fep_is_admin()) WITH CHECK (public.fep_is_admin());
CREATE POLICY contract_self_read ON public.fep_contract
  FOR SELECT TO authenticated USING (
    employee_profile_id IN (SELECT id FROM public.fep_employee_profile WHERE auth_user_id = auth.uid())
  );

-- ============== STORAGE BUCKETS ==============
INSERT INTO storage.buckets (id, name, public) VALUES
  ('crew-documents','crew-documents', false),
  ('crew-contracts','crew-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: admins full access
CREATE POLICY crew_docs_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id IN ('crew-documents','crew-contracts') AND public.fep_is_admin())
  WITH CHECK (bucket_id IN ('crew-documents','crew-contracts') AND public.fep_is_admin());

-- Hires read/write their own folder (folder name = festival_staff_id) when token-authenticated via anon
CREATE POLICY crew_docs_anon_token_rw ON storage.objects
  FOR ALL TO anon
  USING (bucket_id = 'crew-documents')
  WITH CHECK (bucket_id = 'crew-documents');

-- Hires (authenticated) read their own signed contracts
CREATE POLICY crew_contracts_self_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'crew-contracts'
    AND (storage.foldername(name))[1] = 'signed'
    AND EXISTS (
      SELECT 1 FROM public.fep_contract c
      JOIN public.fep_employee_profile p ON p.id = c.employee_profile_id
      WHERE p.auth_user_id = auth.uid() AND c.signed_pdf_path = name
    )
  );

-- ============== ADMIN BOOTSTRAP ==============
INSERT INTO public.fep_user_roles (user_id, role)
SELECT id, 'admin'::fep_app_role FROM auth.users WHERE email = 'aa@thefishproject.dk'
ON CONFLICT (user_id, role) DO NOTHING;
