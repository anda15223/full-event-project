BEGIN;

DROP VIEW IF EXISTS public.v_attention_summary;
DROP VIEW IF EXISTS public.v_attention_items;

CREATE TABLE public.festival_contracts_finance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.festival_contracts(id) ON DELETE CASCADE,
  operating_entity text,
  counterparty text,
  cvr text,
  payment_terms text,
  payment_status text,
  payment_due_at date,
  payment_amount numeric(12,2),
  payment_currency text DEFAULT 'DKK',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(contract_id)
);
CREATE INDEX idx_fcf_contract_id ON public.festival_contracts_finance(contract_id);
ALTER TABLE public.festival_contracts_finance ENABLE ROW LEVEL SECURITY;
CREATE POLICY fcf_select ON public.festival_contracts_finance
  FOR SELECT TO authenticated USING (public.has_finance_access(auth.uid()));
CREATE POLICY fcf_insert ON public.festival_contracts_finance
  FOR INSERT TO authenticated WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY fcf_update ON public.festival_contracts_finance
  FOR UPDATE TO authenticated USING (public.has_finance_access(auth.uid())) WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY fcf_delete ON public.festival_contracts_finance
  FOR DELETE TO authenticated USING (public.has_finance_access(auth.uid()));
CREATE TRIGGER trg_fcf_updated_at
  BEFORE UPDATE ON public.festival_contracts_finance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.festival_contracts_finance (
  contract_id, operating_entity, counterparty, payment_terms, payment_status
)
SELECT id, operating_entity, counterparty, payment_terms, payment_status
FROM public.festival_contracts;

ALTER TABLE public.festival_contracts DROP COLUMN IF EXISTS operating_entity;
ALTER TABLE public.festival_contracts DROP COLUMN IF EXISTS counterparty;
ALTER TABLE public.festival_contracts DROP COLUMN IF EXISTS payment_terms;
ALTER TABLE public.festival_contracts DROP COLUMN IF EXISTS payment_status;
ALTER TABLE public.festival_contracts DROP COLUMN IF EXISTS payment_due_at;
ALTER TABLE public.festival_contracts DROP COLUMN IF EXISTS payment_amount;
ALTER TABLE public.festival_contracts DROP COLUMN IF EXISTS payment_currency;

-- Recreate views without counterparty (use concept name instead)
CREATE VIEW public.v_attention_items AS
 SELECT fai.festival_id, f.name AS festival_name, f.slug AS festival_slug, f.start_date AS festival_start_date,
    'festival_action_items'::text AS source_table, fai.id AS source_id, 'Action item'::text AS source_card_label,
    fai.title, fai.description, fai.due_date, NULL::time AS due_time,
    (fai.due_date)::timestamptz AS due_at, fai.status, fai.priority, fai.owner AS owner_name,
    NULL::uuid AS concept_id, NULL::text AS concept_name,
    CASE WHEN fai.due_date < CURRENT_DATE THEN 'overdue' WHEN fai.due_date = CURRENT_DATE THEN 'today'
         WHEN fai.due_date <= CURRENT_DATE + interval '7 days' THEN 'this-week' ELSE 'later' END AS urgency_bucket
   FROM festival_action_items fai JOIN festivals f ON f.id = fai.festival_id
  WHERE fai.status = ANY (ARRAY['open','in-progress'])
 UNION ALL
 SELECT fc.festival_id, f.name, f.slug, f.start_date,
    'festival_contracts', fc.id, 'Contract',
    ('Inspection: ' || COALESCE(c.name, '(unnamed contract)')) AS title,
    fc.notes, fc.inspection_date, NULL::time, (fc.inspection_date)::timestamptz,
    'planned', 'high', NULL::text, fc.concept_id, c.name,
    CASE WHEN fc.inspection_date < CURRENT_DATE THEN 'overdue' WHEN fc.inspection_date = CURRENT_DATE THEN 'today'
         WHEN fc.inspection_date <= CURRENT_DATE + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM festival_contracts fc JOIN festivals f ON f.id = fc.festival_id LEFT JOIN concepts c ON c.id = fc.concept_id
  WHERE fc.inspection_date IS NOT NULL
 UNION ALL
 SELECT fc.festival_id, f.name, f.slug, f.start_date,
    'festival_contracts', fc.id, 'Contract',
    ('Site clearance: ' || COALESCE(c.name, '(unnamed)')),
    fc.notes, (fc.site_clearance_deadline)::date, NULL::time, fc.site_clearance_deadline,
    'planned', 'high', NULL::text, fc.concept_id, c.name,
    CASE WHEN fc.site_clearance_deadline < now() THEN 'overdue' WHEN (fc.site_clearance_deadline)::date = CURRENT_DATE THEN 'today'
         WHEN fc.site_clearance_deadline <= now() + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM festival_contracts fc JOIN festivals f ON f.id = fc.festival_id LEFT JOIN concepts c ON c.id = fc.concept_id
  WHERE fc.site_clearance_deadline IS NOT NULL
 UNION ALL
 SELECT fc.festival_id, f.name, f.slug, f.start_date,
    'festival_cooling', fc.id, 'Cooling',
    ('Cooling delivery: ' || COALESCE(fc.unit_type, 'container')),
    fc.notes, fc.delivery_date, NULL::time, (fc.delivery_date)::timestamptz,
    COALESCE(fc.payment_status, 'planned'), 'normal', NULL::text, NULL::uuid, NULL::text,
    CASE WHEN fc.delivery_date < CURRENT_DATE THEN 'overdue' WHEN fc.delivery_date = CURRENT_DATE THEN 'today'
         WHEN fc.delivery_date <= CURRENT_DATE + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM festival_cooling fc JOIN festivals f ON f.id = fc.festival_id
  WHERE fc.delivery_date IS NOT NULL
 UNION ALL
 SELECT fc.festival_id, f.name, f.slug, f.start_date,
    'festival_cooling', fc.id, 'Cooling',
    ('Cooling pickup: ' || COALESCE(fc.unit_type, 'container')),
    fc.notes, fc.pickup_date, NULL::time, (fc.pickup_date)::timestamptz,
    COALESCE(fc.payment_status, 'planned'), 'normal', NULL::text, NULL::uuid, NULL::text,
    CASE WHEN fc.pickup_date < CURRENT_DATE THEN 'overdue' WHEN fc.pickup_date = CURRENT_DATE THEN 'today'
         WHEN fc.pickup_date <= CURRENT_DATE + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM festival_cooling fc JOIN festivals f ON f.id = fc.festival_id
  WHERE fc.pickup_date IS NOT NULL
 UNION ALL
 SELECT fa.festival_id, f.name, f.slug, f.start_date,
    'festival_accommodation', fa.id, 'Accommodation',
    (COALESCE(fa.venue_name, 'Accommodation') || CASE WHEN fa.status = 'gap' THEN ' (GAP — find rooms)' ELSE '' END),
    fa.notes, fa.check_in_date, NULL::time, (fa.check_in_date)::timestamptz,
    fa.status, CASE WHEN fa.status = 'gap' THEN 'high' ELSE 'normal' END, NULL::text, NULL::uuid, NULL::text,
    CASE WHEN fa.check_in_date < CURRENT_DATE THEN 'overdue' WHEN fa.check_in_date = CURRENT_DATE THEN 'today'
         WHEN fa.check_in_date <= CURRENT_DATE + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM festival_accommodation_legacy fa JOIN festivals f ON f.id = fa.festival_id
  WHERE fa.status = ANY (ARRAY['planned','gap'])
 UNION ALL
 SELECT fs.festival_id, f.name, f.slug, f.start_date,
    'festival_setup', fs.id, 'Setup',
    COALESCE(fs.description, 'Setup phase'), fs.notes,
    (fs.scheduled_start_at)::date, (fs.scheduled_start_at)::time, fs.scheduled_start_at,
    fs.status, 'normal', NULL::text, fs.concept_id, NULL::text,
    CASE WHEN fs.scheduled_start_at < now() THEN 'overdue' WHEN (fs.scheduled_start_at)::date = CURRENT_DATE THEN 'today'
         WHEN fs.scheduled_start_at <= now() + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM festival_setup fs JOIN festivals f ON f.id = fs.festival_id
  WHERE fs.status = ANY (ARRAY['planned','confirmed','in-progress']) AND fs.scheduled_start_at IS NOT NULL
 UNION ALL
 SELECT ft.festival_id, f.name, f.slug, f.start_date,
    'festival_transport', ft.id, 'Transport',
    (COALESCE(ft.vehicle_type, 'Vehicle') || ' pickup'), ft.notes,
    ft.pickup_date, NULL::time, (ft.pickup_date)::timestamptz,
    COALESCE(ft.status, 'planned'), 'normal', NULL::text, NULL::uuid, NULL::text,
    CASE WHEN ft.pickup_date < CURRENT_DATE THEN 'overdue' WHEN ft.pickup_date = CURRENT_DATE THEN 'today'
         WHEN ft.pickup_date <= CURRENT_DATE + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM festival_transport ft JOIN festivals f ON f.id = ft.festival_id
  WHERE ft.pickup_date IS NOT NULL AND COALESCE(ft.status, 'planned') = ANY (ARRAY['planned','booked'])
 UNION ALL
 SELECT ffs.festival_id, f.name, f.slug, f.start_date,
    'festival_facade_status', ffs.id, 'Façade',
    ('Façade print deadline: ' || COALESCE(c.name, '(concept)')),
    ffs.notes, ffs.print_deadline, NULL::time, (ffs.print_deadline)::timestamptz,
    COALESCE(ffs.design_status, 'planned'), 'normal', NULL::text, ffs.concept_id, c.name,
    CASE WHEN ffs.print_deadline < CURRENT_DATE THEN 'overdue' WHEN ffs.print_deadline = CURRENT_DATE THEN 'today'
         WHEN ffs.print_deadline <= CURRENT_DATE + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM festival_facade_status ffs JOIN festivals f ON f.id = ffs.festival_id LEFT JOIN concepts c ON c.id = ffs.concept_id
  WHERE ffs.print_deadline IS NOT NULL AND COALESCE(ffs.design_status,'') <> ALL (ARRAY['ready','installed'])
 UNION ALL
 SELECT fd.festival_id, f.name, f.slug, f.start_date,
    'festival_daka', fd.id, 'DAKA', 'DAKA pickup', fd.notes,
    fd.pickup_date, NULL::time, (fd.pickup_date)::timestamptz,
    'planned', 'normal', NULL::text, fd.concept_id, NULL::text,
    CASE WHEN fd.pickup_date < CURRENT_DATE THEN 'overdue' WHEN fd.pickup_date = CURRENT_DATE THEN 'today'
         WHEN fd.pickup_date <= CURRENT_DATE + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM festival_daka fd JOIN festivals f ON f.id = fd.festival_id
  WHERE fd.pickup_date IS NOT NULL
 UNION ALL
 SELECT ft.festival_id, f.name, f.slug, f.start_date,
    'transport_legs', tl.id, 'Transport — driver TBD',
    ('🚐 Driver unassigned: ' || COALESCE(ft.vehicle_type, 'vehicle')),
    (COALESCE(tl.leg_label, 'leg') || ' on ' || tl.leg_date::text || ' (' || COALESCE(tl.origin,'?') || ' → ' || COALESCE(tl.destination,'?') || ')'),
    tl.leg_date, tl.leg_start_time, ((tl.leg_date + COALESCE(tl.leg_start_time,'00:00:00'::time)))::timestamptz,
    tl.status, 'high', NULL::text, NULL::uuid, NULL::text,
    CASE WHEN tl.leg_date < CURRENT_DATE THEN 'overdue' WHEN tl.leg_date = CURRENT_DATE THEN 'today'
         WHEN tl.leg_date <= CURRENT_DATE + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM transport_legs tl JOIN festival_transport ft ON ft.id = tl.transport_id JOIN festivals f ON f.id = ft.festival_id
   LEFT JOIN transport_leg_assignments a ON a.leg_id = tl.id AND a.role = 'driver'
  WHERE tl.status = ANY (ARRAY['planned','confirmed']) AND tl.leg_phase = ANY (ARRAY['setup_outbound','crew_outbound']) AND (a.id IS NULL OR a.staff_id IS NULL)
 UNION ALL
 SELECT fs.festival_id, f.name, f.slug, f.start_date,
    'festival_staff', fs.id, 'Transport — passenger seat missing',
    ('🪑 Needs ride: ' || COALESCE(fs.name, '(staff name TBD)')),
    ('This person has a vagt assigned but no transport seat to ' || f.name ||
       CASE WHEN fs.home_location IS NOT NULL THEN ' (home: ' || fs.home_location || ')' ELSE '' END),
    f.start_date, NULL::time, (f.start_date)::timestamptz,
    'open', 'high', fs.name, NULL::uuid, NULL::text,
    CASE WHEN f.start_date < CURRENT_DATE THEN 'overdue' WHEN f.start_date = CURRENT_DATE THEN 'today'
         WHEN f.start_date <= CURRENT_DATE + interval '7 days' THEN 'this-week' ELSE 'later' END
   FROM festival_staff fs JOIN festivals f ON f.id = fs.festival_id
  WHERE fs.requires_transport = true
    AND EXISTS (SELECT 1 FROM festival_shifts sh WHERE sh.staff_id = fs.id)
    AND NOT EXISTS (SELECT 1 FROM transport_leg_assignments a JOIN transport_legs tl ON tl.id = a.leg_id JOIN festival_transport ft ON ft.id = tl.transport_id
                    WHERE a.staff_id = fs.id AND ft.festival_id = fs.festival_id AND tl.leg_phase = ANY (ARRAY['setup_outbound','crew_outbound']));

CREATE VIEW public.v_attention_summary AS
 SELECT festival_id, festival_name, festival_slug, festival_start_date,
    count(*) FILTER (WHERE urgency_bucket = 'overdue') AS overdue_count,
    count(*) FILTER (WHERE urgency_bucket = 'today') AS today_count,
    count(*) FILTER (WHERE urgency_bucket = 'this-week') AS this_week_count,
    count(*) FILTER (WHERE urgency_bucket = 'later') AS later_count,
    count(*) AS total_count,
    CASE WHEN count(*) FILTER (WHERE urgency_bucket = 'overdue') > 0 THEN 'overdue'
         WHEN count(*) FILTER (WHERE urgency_bucket = 'today') > 0 THEN 'today'
         WHEN count(*) FILTER (WHERE urgency_bucket = 'this-week') > 0 THEN 'this-week'
         WHEN count(*) FILTER (WHERE urgency_bucket = 'later') > 0 THEN 'later' END AS worst_bucket
   FROM v_attention_items
  GROUP BY festival_id, festival_name, festival_slug, festival_start_date;

COMMIT;