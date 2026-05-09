
-- Extend festival_contracts with new contract-management columns
ALTER TABLE public.festival_contracts
  ADD COLUMN IF NOT EXISTS signing_platform text,
  ADD COLUMN IF NOT EXISTS contract_file_path text,
  ADD COLUMN IF NOT EXISTS contract_value_dkk numeric,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'not_invoiced',
  ADD COLUMN IF NOT EXISTS counterparty_name text,
  ADD COLUMN IF NOT EXISTS contract_terms_summary text,
  ADD COLUMN IF NOT EXISTS key_obligations text,
  ADD COLUMN IF NOT EXISTS contract_signed_by text,
  ADD COLUMN IF NOT EXISTS contract_expires_at date,
  ADD COLUMN IF NOT EXISTS sent_to_counterparty_at date,
  ADD COLUMN IF NOT EXISTS expected_signing_by date,
  ADD COLUMN IF NOT EXISTS stalled_reason text,
  ADD COLUMN IF NOT EXISTS stalled_since date,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS status_history jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- Add check constraint for payment status
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'festival_contracts_payment_status_check') THEN
    ALTER TABLE public.festival_contracts
      ADD CONSTRAINT festival_contracts_payment_status_check
      CHECK (payment_status IS NULL OR payment_status IN ('not_invoiced','invoiced','partial','paid','disputed'));
  END IF;
END $$;

-- Backfill counterparty_name from existing counterparty
UPDATE public.festival_contracts
  SET counterparty_name = counterparty
  WHERE counterparty_name IS NULL AND counterparty IS NOT NULL;

-- Storage bucket for signed contracts
INSERT INTO storage.buckets (id, name, public)
VALUES ('festival-contracts', 'festival-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for the bucket — authenticated users only
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='festival_contracts_auth_select') THEN
    CREATE POLICY festival_contracts_auth_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'festival-contracts');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='festival_contracts_auth_insert') THEN
    CREATE POLICY festival_contracts_auth_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'festival-contracts');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='festival_contracts_auth_update') THEN
    CREATE POLICY festival_contracts_auth_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'festival-contracts');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='festival_contracts_auth_delete') THEN
    CREATE POLICY festival_contracts_auth_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'festival-contracts');
  END IF;
END $$;
