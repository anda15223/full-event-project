BEGIN;

CREATE TABLE public.finance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  rule_description text NOT NULL,
  priority text NOT NULL,
  category text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  source_rule_id uuid
);
CREATE INDEX idx_finance_rules_active ON public.finance_rules(is_active);
CREATE INDEX idx_finance_rules_priority ON public.finance_rules(priority);
ALTER TABLE public.finance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY fr_select ON public.finance_rules
  FOR SELECT TO authenticated USING (public.has_finance_access(auth.uid()));
CREATE POLICY fr_insert ON public.finance_rules
  FOR INSERT TO authenticated WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY fr_update ON public.finance_rules
  FOR UPDATE TO authenticated USING (public.has_finance_access(auth.uid())) WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY fr_delete ON public.finance_rules
  FOR DELETE TO authenticated USING (public.has_finance_access(auth.uid()));

CREATE TRIGGER trg_finance_rules_updated_at
  BEFORE UPDATE ON public.finance_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.finance_rules (rule_name, rule_description, priority, category, is_active, source_rule_id)
SELECT rule_name, rule_description, severity, category, active, id
FROM public.cross_festival_rules
WHERE rule_name ILIKE '%operating entity%per-concept%'
   OR rule_name ILIKE '%marius%administrator%'
   OR rule_name ILIKE '%fif%owner%'
   OR rule_name ILIKE '%never invert%'
   OR rule_name ILIKE '%mca holding%'
   OR rule_name ILIKE '%mca trading%'
   OR rule_name ILIKE '%never confuse%'
   OR rule_name ILIKE '%markedshallen%';

DELETE FROM public.cross_festival_rules
WHERE id IN (SELECT source_rule_id FROM public.finance_rules WHERE source_rule_id IS NOT NULL);

COMMIT;