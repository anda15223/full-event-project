ALTER TABLE public.festival_transport
  ADD COLUMN IF NOT EXISTS loading_date date;

COMMENT ON COLUMN public.festival_transport.loading_date IS
  'Date the vehicle is loaded at Søborg HQ for transport to the festival site. Shown and edited on the Søborg Loading page.';