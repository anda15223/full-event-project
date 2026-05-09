ALTER TABLE public.festival_open_questions
  ADD COLUMN IF NOT EXISTS question_type text,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_foq_question_type ON public.festival_open_questions(question_type) WHERE status = 'open';