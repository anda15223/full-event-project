-- Create cashflow_entries table for PBS direct debits and other cashflow tracking
CREATE TABLE public.cashflow_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  entry_date date,
  direction text NOT NULL DEFAULT 'out', -- 'in' or 'out'
  entry_type text NOT NULL DEFAULT 'pbs_debit', -- 'pbs_debit', 'bank_transfer', 'card', etc.
  amount numeric,
  currency text DEFAULT 'DKK',
  supplier_name text,
  company text,
  location text,
  description text,
  reference text,
  email_id uuid,
  relates_to_invoice_id uuid,
  source_email_sender text,
  bc_catering_branch text, -- 'roskilde' or 'skanderborg'
  status text DEFAULT 'recorded' -- 'recorded', 'matched', 'unmatched'
);

ALTER TABLE public.cashflow_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cashflow viewable by everyone" ON public.cashflow_entries FOR SELECT TO public USING (true);
CREATE POLICY "Cashflow insertable by anyone" ON public.cashflow_entries FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Cashflow updatable by anyone" ON public.cashflow_entries FOR UPDATE TO public USING (true);