-- =====================================================
-- PART A: Visibility flag on questions + rules
-- =====================================================
ALTER TABLE public.festival_open_questions
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','finance_only'));

ALTER TABLE public.cross_festival_rules
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','finance_only'));

UPDATE public.festival_open_questions
SET visibility = 'finance_only'
WHERE question ILIKE '%jonas kring%commission%'
   OR question ILIKE '%percentage commission%';

UPDATE public.cross_festival_rules
SET visibility = 'finance_only'
WHERE rule_name ILIKE '%jonas kring%commission%'
   OR rule_name ILIKE '%percentage commission%';

-- =====================================================
-- PART B: Finance access flag + scaffolding
-- =====================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_access_finance boolean NOT NULL DEFAULT false;

UPDATE public.profiles
SET can_access_finance = true
WHERE lower(email) = 'aa@thefishproject.dk';

-- Security definer function — avoids RLS recursion on profiles
CREATE OR REPLACE FUNCTION public.has_finance_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND can_access_finance = true
  )
$$;

-- Finance costs
CREATE TABLE IF NOT EXISTS public.festival_finance_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL,
  concept_id uuid,
  contract_id uuid,
  cost_category text NOT NULL CHECK (cost_category IN (
    'commission','cooling','power','transport','accommodation',
    'fuel','food_supplier','beverage_supplier','staff_wages',
    'staff_benefits','consumables','packaging','cleaning',
    'gas','safety_equipment','rentals','fees','other'
  )),
  subcategory text,
  description text,
  amount_dkk numeric(12,2) NOT NULL,
  amount_currency text DEFAULT 'DKK',
  amount_original numeric(12,2),
  vat_dkk numeric(12,2),
  vat_rate numeric(5,2),
  supplier_name text,
  invoice_number text,
  invoice_date date,
  payment_date date,
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid','disputed')),
  payment_method text,
  paid_by_entity text,
  attached_invoice_path text,
  notes text,
  is_jonas_commission boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Finance revenue
CREATE TABLE IF NOT EXISTS public.festival_finance_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL,
  concept_id uuid,
  contract_id uuid,
  revenue_source text CHECK (revenue_source IN ('pos_sales','event_pos','manual_cash','wolt','other')),
  revenue_date date,
  amount_dkk numeric(12,2) NOT NULL,
  vat_dkk numeric(12,2),
  transaction_count int,
  received_into_entity text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger for costs
DROP TRIGGER IF EXISTS trg_festival_finance_costs_updated_at ON public.festival_finance_costs;
CREATE TRIGGER trg_festival_finance_costs_updated_at
  BEFORE UPDATE ON public.festival_finance_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.festival_finance_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_finance_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_costs_select   ON public.festival_finance_costs FOR SELECT TO authenticated USING (public.has_finance_access(auth.uid()));
CREATE POLICY finance_costs_insert   ON public.festival_finance_costs FOR INSERT TO authenticated WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY finance_costs_update   ON public.festival_finance_costs FOR UPDATE TO authenticated USING (public.has_finance_access(auth.uid())) WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY finance_costs_delete   ON public.festival_finance_costs FOR DELETE TO authenticated USING (public.has_finance_access(auth.uid()));

CREATE POLICY finance_revenue_select ON public.festival_finance_revenue FOR SELECT TO authenticated USING (public.has_finance_access(auth.uid()));
CREATE POLICY finance_revenue_insert ON public.festival_finance_revenue FOR INSERT TO authenticated WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY finance_revenue_update ON public.festival_finance_revenue FOR UPDATE TO authenticated USING (public.has_finance_access(auth.uid())) WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY finance_revenue_delete ON public.festival_finance_revenue FOR DELETE TO authenticated USING (public.has_finance_access(auth.uid()));