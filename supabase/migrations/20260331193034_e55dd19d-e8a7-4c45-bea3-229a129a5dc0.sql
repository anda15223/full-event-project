ALTER TABLE public.emails 
ADD COLUMN IF NOT EXISTS assigned_agent text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS reader_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS router_status text DEFAULT 'pending';