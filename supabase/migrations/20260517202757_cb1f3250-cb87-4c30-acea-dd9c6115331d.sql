ALTER TABLE public.setup_attachments
ADD COLUMN IF NOT EXISTS setup_phase_id uuid REFERENCES public.setup_phases(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_setup_attachments_phase ON public.setup_attachments(setup_phase_id);