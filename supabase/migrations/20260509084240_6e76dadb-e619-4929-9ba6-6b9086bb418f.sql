-- Extend festival_open_questions table
ALTER TABLE public.festival_open_questions DROP CONSTRAINT IF EXISTS festival_open_questions_status_check;

-- Migrate legacy values
UPDATE public.festival_open_questions SET status = 'open' WHERE status = 'in_progress';
UPDATE public.festival_open_questions SET status = 'resolved' WHERE status = 'answered';
UPDATE public.festival_open_questions SET status = 'deferred' WHERE status = 'abandoned';
UPDATE public.festival_open_questions SET priority = 'medium' WHERE priority = 'normal' OR priority IS NULL;

-- Add new columns
ALTER TABLE public.festival_open_questions
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.festival_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocking_what text,
  ADD COLUMN IF NOT EXISTS decision_owner text,
  ADD COLUMN IF NOT EXISTS deadline date,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS show_on_overview boolean NOT NULL DEFAULT true;

-- Default priority going forward
ALTER TABLE public.festival_open_questions ALTER COLUMN priority SET DEFAULT 'medium';

-- New constraints
ALTER TABLE public.festival_open_questions
  ADD CONSTRAINT festival_open_questions_status_check
  CHECK (status IN ('open', 'resolved', 'deferred'));

ALTER TABLE public.festival_open_questions
  ADD CONSTRAINT festival_open_questions_priority_check
  CHECK (priority IN ('critical', 'high', 'medium', 'low'));

-- Backfill resolved_at for existing resolved rows from resolved_date
UPDATE public.festival_open_questions
  SET resolved_at = (resolved_date::timestamptz)
  WHERE status = 'resolved' AND resolved_at IS NULL AND resolved_date IS NOT NULL;

-- Default show_on_overview to false for low/medium priority
UPDATE public.festival_open_questions SET show_on_overview = false WHERE priority IN ('low', 'medium');

CREATE INDEX IF NOT EXISTS idx_foq_festival_status ON public.festival_open_questions(festival_id, status);
CREATE INDEX IF NOT EXISTS idx_foq_deadline ON public.festival_open_questions(deadline) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_foq_priority ON public.festival_open_questions(priority) WHERE status = 'open';