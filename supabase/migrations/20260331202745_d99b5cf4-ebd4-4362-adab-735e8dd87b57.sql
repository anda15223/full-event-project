CREATE TABLE public.email_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  sync_from date,
  sync_to date,
  total_emails_found integer DEFAULT 0,
  total_processed integer DEFAULT 0,
  total_invoices_extracted integer DEFAULT 0,
  total_skipped integer DEFAULT 0,
  current_batch integer DEFAULT 0,
  total_batches integer DEFAULT 0,
  last_uid_processed text,
  current_subject text,
  error_log jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE public.email_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sync jobs viewable by everyone" ON public.email_sync_jobs FOR SELECT TO public USING (true);
CREATE POLICY "Sync jobs insertable by anyone" ON public.email_sync_jobs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Sync jobs updatable by anyone" ON public.email_sync_jobs FOR UPDATE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.email_sync_jobs;