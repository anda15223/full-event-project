
ALTER TABLE public.festival_action_items
  ADD COLUMN IF NOT EXISTS concept_id uuid REFERENCES public.concepts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.festival_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS snoozed_until date;

-- Normalize legacy values
UPDATE public.festival_action_items SET priority = 'medium' WHERE priority = 'normal';
UPDATE public.festival_action_items SET status = 'done' WHERE status = 'closed';
UPDATE public.festival_action_items SET priority = COALESCE(priority, 'medium');
UPDATE public.festival_action_items SET status = COALESCE(status, 'open');
UPDATE public.festival_action_items SET source = COALESCE(source, 'manual');

ALTER TABLE public.festival_action_items
  ALTER COLUMN priority SET DEFAULT 'medium',
  ALTER COLUMN status SET DEFAULT 'open',
  ALTER COLUMN source SET DEFAULT 'manual';

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_festival_action_items_updated_at ON public.festival_action_items;
CREATE TRIGGER trg_festival_action_items_updated_at
  BEFORE UPDATE ON public.festival_action_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_festival_action_items_concept ON public.festival_action_items(concept_id);
CREATE INDEX IF NOT EXISTS idx_festival_action_items_contract ON public.festival_action_items(contract_id);
CREATE INDEX IF NOT EXISTS idx_festival_action_items_due ON public.festival_action_items(festival_id, due_date);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.festival_action_items;
ALTER TABLE public.festival_action_items REPLICA IDENTITY FULL;
