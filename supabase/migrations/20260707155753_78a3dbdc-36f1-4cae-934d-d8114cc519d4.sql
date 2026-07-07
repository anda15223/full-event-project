ALTER TABLE public.grocery_recipes ADD COLUMN IF NOT EXISTS location_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.grocery_ingredients ADD COLUMN IF NOT EXISTS notes text;
-- notes column may already exist; IF NOT EXISTS guards it