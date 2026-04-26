ALTER TABLE public.festival_action_items
  ADD COLUMN IF NOT EXISTS card_origin TEXT;

CREATE INDEX IF NOT EXISTS idx_action_items_card_origin
  ON public.festival_action_items(card_origin);