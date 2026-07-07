ALTER TABLE public.grocery_settings DROP COLUMN IF EXISTS oil_refill_reserve_l;
ALTER TABLE public.grocery_settings ADD COLUMN IF NOT EXISTS oil_backup_factor numeric NOT NULL DEFAULT 2.0;