
CREATE TABLE public.trolley_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trolley_templates TO authenticated;
GRANT ALL ON public.trolley_templates TO service_role;
ALTER TABLE public.trolley_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage trolley templates"
  ON public.trolley_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_trolley_templates_updated_at
  BEFORE UPDATE ON public.trolley_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.trolley_template_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trolley_id UUID NOT NULL REFERENCES public.trolley_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trolley_template_items TO authenticated;
GRANT ALL ON public.trolley_template_items TO service_role;
ALTER TABLE public.trolley_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage trolley items"
  ON public.trolley_template_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE INDEX idx_trolley_items_trolley ON public.trolley_template_items(trolley_id);
CREATE TRIGGER trg_trolley_items_updated_at
  BEFORE UPDATE ON public.trolley_template_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
