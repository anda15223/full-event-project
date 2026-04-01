
-- Brain entries table for persistent AI learning
CREATE TABLE public.brain_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  key_name text UNIQUE NOT NULL,
  display_name text,
  category text DEFAULT 'extraction_rule',
  content text NOT NULL,
  structured_data jsonb DEFAULT '{}'::jsonb,
  source text DEFAULT 'user_correction',
  is_active boolean DEFAULT true,
  tags text[] DEFAULT '{}'::text[]
);

ALTER TABLE public.brain_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brain entries viewable by everyone" ON public.brain_entries FOR SELECT TO public USING (true);
CREATE POLICY "Brain entries insertable by anyone" ON public.brain_entries FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Brain entries updatable by anyone" ON public.brain_entries FOR UPDATE TO public USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_brain_entries_updated_at
  BEFORE UPDATE ON public.brain_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Allow deleting invoices (for NOT_INVOICE cleanup)
CREATE POLICY "Invoices deletable by anyone" ON public.invoices FOR DELETE TO public USING (true);
