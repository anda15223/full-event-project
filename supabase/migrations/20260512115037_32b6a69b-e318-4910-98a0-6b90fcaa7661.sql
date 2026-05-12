ALTER TABLE public.festival_contacts
ADD COLUMN IF NOT EXISTS role_category text
CHECK (role_category IN ('festival', 'setup', 'concept'));

CREATE INDEX IF NOT EXISTS idx_fcontacts_role
ON public.festival_contacts(festival_id, role_category);