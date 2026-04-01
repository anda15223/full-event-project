CREATE TABLE public.kpi_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  email_id uuid,
  platform text NOT NULL,
  date date,
  total_amount numeric,
  currency text DEFAULT 'DKK',
  location text,
  company text,
  invoice_number text,
  invoice_date date,
  period_from date,
  period_to date,
  source_type text DEFAULT 'platform_invoice',
  notes text,
  confidence numeric,
  verified boolean DEFAULT false
);

ALTER TABLE public.kpi_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "KPI ledger viewable by everyone" ON public.kpi_ledger FOR SELECT TO public USING (true);
CREATE POLICY "KPI ledger insertable by anyone" ON public.kpi_ledger FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "KPI ledger updatable by anyone" ON public.kpi_ledger FOR UPDATE TO public USING (true);