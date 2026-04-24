-- Add order_index to personal_festival_db for manual ordering of crew/contacts.
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.idx_personal_festival_db_order;
--   ALTER TABLE public.personal_festival_db DROP COLUMN IF EXISTS order_index;

ALTER TABLE public.personal_festival_db
  ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_personal_festival_db_order
  ON public.personal_festival_db(festival_id, is_crew, order_index);