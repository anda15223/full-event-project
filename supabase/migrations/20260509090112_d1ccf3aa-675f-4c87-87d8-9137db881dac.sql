
CREATE TABLE IF NOT EXISTS public.festival_timeline_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'load_soborg','drive_to_festival','arrival_on_site','supplier_delivery',
    'setup_start','setup_complete','festival_open','festival_close',
    'wrap_start','wrap_complete','drive_return','pickup','inspection','handover','other'
  )),
  event_date date NOT NULL,
  event_time time,
  end_date date,
  end_time time,
  location text,
  responsible_party text NOT NULL DEFAULT 'fish_project' CHECK (responsible_party IN ('fish_project','fidibus','festival','supplier','mixed')),
  responsible_contact_id uuid,
  concepts_involved uuid[],
  contracts_involved uuid[],
  title text NOT NULL,
  notes text,
  linked_action_item_id uuid,
  linked_supplier_name text,
  supplier_contact_phone text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','confirmed','in_progress','done','delayed','cancelled')),
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fte_festival_date ON public.festival_timeline_event(festival_id, event_date);
CREATE INDEX IF NOT EXISTS idx_fte_status ON public.festival_timeline_event(status);

ALTER TABLE public.festival_timeline_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users_all_access" ON public.festival_timeline_event
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_fte_updated_at ON public.festival_timeline_event;
CREATE TRIGGER trg_fte_updated_at
  BEFORE UPDATE ON public.festival_timeline_event
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.festival_timeline_event;
ALTER TABLE public.festival_timeline_event REPLICA IDENTITY FULL;
