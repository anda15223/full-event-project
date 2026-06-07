
CREATE TABLE public.festival_info_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL UNIQUE REFERENCES public.festivals(id) ON DELETE CASCADE,
  raw_text text NOT NULL,
  summary jsonb NOT NULL,
  parsed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.festival_info_summaries TO authenticated;
GRANT ALL ON public.festival_info_summaries TO service_role;

ALTER TABLE public.festival_info_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read festival info summaries"
  ON public.festival_info_summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert festival info summaries"
  ON public.festival_info_summaries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update festival info summaries"
  ON public.festival_info_summaries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated can delete festival info summaries"
  ON public.festival_info_summaries FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_festival_info_summaries_updated_at
  BEFORE UPDATE ON public.festival_info_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
