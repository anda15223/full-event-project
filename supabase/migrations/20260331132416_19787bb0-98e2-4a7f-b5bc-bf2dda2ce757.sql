
-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  country_group TEXT NOT NULL DEFAULT 'denmark',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Companies are viewable by authenticated users" ON public.companies FOR SELECT TO authenticated USING (true);

-- Seed companies
INSERT INTO public.companies (name, country_group) VALUES
  ('M.C.A. Holding ApS', 'denmark'),
  ('MCA Trading ApS', 'denmark'),
  ('The Fish Project ApS', 'denmark'),
  ('Blue Fish ApS', 'denmark'),
  ('Aegean ApS', 'denmark'),
  ('Athos ApS', 'denmark'),
  ('Romania', 'romania');

-- Create emails table
CREATE TABLE public.emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT UNIQUE,
  subject TEXT,
  sender TEXT,
  body_text TEXT,
  received_at TIMESTAMP WITH TIME ZONE,
  classification TEXT CHECK (classification IN ('invoice', 'task', 'waiting', 'information', 'irrelevant')),
  company TEXT,
  summary TEXT,
  action_required BOOLEAN DEFAULT false,
  confidence NUMERIC(3,2),
  needs_review BOOLEAN DEFAULT false,
  review_reason TEXT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Emails are viewable by authenticated users" ON public.emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "Emails can be inserted by authenticated users" ON public.emails FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Emails can be updated by authenticated users" ON public.emails FOR UPDATE TO authenticated USING (true);

CREATE INDEX idx_emails_classification ON public.emails (classification);
CREATE INDEX idx_emails_company ON public.emails (company);
CREATE INDEX idx_emails_needs_review ON public.emails (needs_review);
CREATE INDEX idx_emails_received_at ON public.emails (received_at DESC);

-- Create email_tasks table
CREATE TABLE public.email_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID REFERENCES public.emails(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT,
  priority TEXT CHECK (priority IN ('urgent', 'high', 'normal', 'low')) DEFAULT 'normal',
  status TEXT CHECK (status IN ('urgent', 'to_do', 'waiting', 'done')) DEFAULT 'to_do',
  due_date DATE,
  owner TEXT DEFAULT 'Alexandra',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tasks viewable by authenticated users" ON public.email_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tasks insertable by authenticated users" ON public.email_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Tasks updatable by authenticated users" ON public.email_tasks FOR UPDATE TO authenticated USING (true);

CREATE INDEX idx_email_tasks_company ON public.email_tasks (company);
CREATE INDEX idx_email_tasks_priority ON public.email_tasks (priority);
CREATE INDEX idx_email_tasks_status ON public.email_tasks (status);

-- Create email_invoices table
CREATE TABLE public.email_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID REFERENCES public.emails(id) ON DELETE CASCADE,
  company TEXT,
  supplier_name TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'DKK',
  vat NUMERIC(12,2),
  attachment_present BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invoices viewable by authenticated users" ON public.email_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Invoices insertable by authenticated users" ON public.email_invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Invoices updatable by authenticated users" ON public.email_invoices FOR UPDATE TO authenticated USING (true);

CREATE INDEX idx_email_invoices_company ON public.email_invoices (company);
CREATE INDEX idx_email_invoices_supplier ON public.email_invoices (supplier_name);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_email_tasks_updated_at
  BEFORE UPDATE ON public.email_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
