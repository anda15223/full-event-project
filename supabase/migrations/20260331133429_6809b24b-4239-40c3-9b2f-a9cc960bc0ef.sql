-- Drop existing restrictive policies and replace with public access
-- Companies
DROP POLICY IF EXISTS "Companies are viewable by authenticated users" ON public.companies;
CREATE POLICY "Companies are viewable by everyone" ON public.companies FOR SELECT USING (true);

-- Emails
DROP POLICY IF EXISTS "Emails are viewable by authenticated users" ON public.emails;
DROP POLICY IF EXISTS "Emails can be inserted by authenticated users" ON public.emails;
DROP POLICY IF EXISTS "Emails can be updated by authenticated users" ON public.emails;
CREATE POLICY "Emails are viewable by everyone" ON public.emails FOR SELECT USING (true);
CREATE POLICY "Emails can be inserted by anyone" ON public.emails FOR INSERT WITH CHECK (true);
CREATE POLICY "Emails can be updated by anyone" ON public.emails FOR UPDATE USING (true);

-- Email Tasks
DROP POLICY IF EXISTS "Tasks viewable by authenticated users" ON public.email_tasks;
DROP POLICY IF EXISTS "Tasks insertable by authenticated users" ON public.email_tasks;
DROP POLICY IF EXISTS "Tasks updatable by authenticated users" ON public.email_tasks;
CREATE POLICY "Tasks viewable by everyone" ON public.email_tasks FOR SELECT USING (true);
CREATE POLICY "Tasks insertable by anyone" ON public.email_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Tasks updatable by anyone" ON public.email_tasks FOR UPDATE USING (true);

-- Email Invoices
DROP POLICY IF EXISTS "Invoices viewable by authenticated users" ON public.email_invoices;
DROP POLICY IF EXISTS "Invoices insertable by authenticated users" ON public.email_invoices;
DROP POLICY IF EXISTS "Invoices updatable by authenticated users" ON public.email_invoices;
CREATE POLICY "Invoices viewable by everyone" ON public.email_invoices FOR SELECT USING (true);
CREATE POLICY "Invoices insertable by anyone" ON public.email_invoices FOR INSERT WITH CHECK (true);
CREATE POLICY "Invoices updatable by anyone" ON public.email_invoices FOR UPDATE USING (true);