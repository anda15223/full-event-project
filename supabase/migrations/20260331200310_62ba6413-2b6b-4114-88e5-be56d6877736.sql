
-- Create invoices table (replaces email_invoices for new flow)
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  email_id UUID NULL,
  supplier_name TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  amount NUMERIC,
  currency TEXT DEFAULT 'DKK',
  vat_amount NUMERIC,
  total_with_vat NUMERIC,
  company TEXT,
  location TEXT,
  status TEXT DEFAULT 'pending',
  overdue_flag BOOLEAN DEFAULT false,
  pdf_url TEXT,
  payment_account TEXT,
  payment_reference TEXT,
  what_was_bought TEXT,
  confidence NUMERIC,
  source_type TEXT DEFAULT 'email',
  notes TEXT
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invoices viewable by everyone" ON public.invoices FOR SELECT USING (true);
CREATE POLICY "Invoices insertable by anyone" ON public.invoices FOR INSERT WITH CHECK (true);
CREATE POLICY "Invoices updatable by anyone" ON public.invoices FOR UPDATE USING (true);

-- Create suppliers table
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  email_domain TEXT,
  known_locations TEXT[] DEFAULT '{}',
  known_companies TEXT[] DEFAULT '{}',
  payment_account TEXT,
  payment_terms TEXT,
  vat_included BOOLEAN DEFAULT true,
  is_web_order_supplier BOOLEAN DEFAULT false,
  reconcile_with TEXT,
  notes TEXT,
  correction_count INTEGER DEFAULT 0
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Suppliers viewable by everyone" ON public.suppliers FOR SELECT USING (true);
CREATE POLICY "Suppliers insertable by anyone" ON public.suppliers FOR INSERT WITH CHECK (true);
CREATE POLICY "Suppliers updatable by anyone" ON public.suppliers FOR UPDATE USING (true);

-- Create ledger table
CREATE TABLE public.ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  invoice_id UUID REFERENCES public.invoices(id),
  supplier_name TEXT,
  amount NUMERIC,
  vat_amount NUMERIC,
  total_with_vat NUMERIC,
  company TEXT,
  location TEXT,
  what_was_bought TEXT,
  paid_date DATE,
  payment_reference TEXT,
  invoice_number TEXT
);

ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger viewable by everyone" ON public.ledger FOR SELECT USING (true);
CREATE POLICY "Ledger insertable by anyone" ON public.ledger FOR INSERT WITH CHECK (true);

-- Create supplier_corrections table
CREATE TABLE public.supplier_corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  supplier_name TEXT,
  field_corrected TEXT,
  old_value TEXT,
  new_value TEXT,
  invoice_id UUID REFERENCES public.invoices(id)
);

ALTER TABLE public.supplier_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Corrections viewable by everyone" ON public.supplier_corrections FOR SELECT USING (true);
CREATE POLICY "Corrections insertable by anyone" ON public.supplier_corrections FOR INSERT WITH CHECK (true);
