-- Rollback for crew onboarding foundation
DROP POLICY IF EXISTS crew_contracts_self_read ON storage.objects;
DROP POLICY IF EXISTS crew_docs_anon_token_rw ON storage.objects;
DROP POLICY IF EXISTS crew_docs_admin_all ON storage.objects;

DROP TABLE IF EXISTS public.fep_contract CASCADE;
DROP TABLE IF EXISTS public.fep_contract_template CASCADE;
DROP TABLE IF EXISTS public.fep_company_settings CASCADE;
DROP TABLE IF EXISTS public.fep_employee_profile CASCADE;
DROP TABLE IF EXISTS public.fep_user_roles CASCADE;

DROP FUNCTION IF EXISTS public.fep_is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.fep_has_role(uuid, fep_app_role) CASCADE;
DROP FUNCTION IF EXISTS public.fep_touch_updated_at() CASCADE;

DROP TYPE IF EXISTS fep_contract_status CASCADE;
DROP TYPE IF EXISTS fep_bank_type CASCADE;
DROP TYPE IF EXISTS fep_eu_status CASCADE;
DROP TYPE IF EXISTS fep_onboarding_status CASCADE;
DROP TYPE IF EXISTS fep_app_role CASCADE;

-- Storage buckets (optional)
-- DELETE FROM storage.buckets WHERE id IN ('crew-documents','crew-contracts');
