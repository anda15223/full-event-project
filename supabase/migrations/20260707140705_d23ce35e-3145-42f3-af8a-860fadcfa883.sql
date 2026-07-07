ALTER TABLE public.grocery_settings RENAME COLUMN oil_refill_per_fryer_l TO oil_refill_reserve_l;
ALTER TABLE public.grocery_settings ALTER COLUMN oil_refill_reserve_l SET DEFAULT 2.5;