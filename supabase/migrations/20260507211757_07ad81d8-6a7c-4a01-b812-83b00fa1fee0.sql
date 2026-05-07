BEGIN;

DROP VIEW IF EXISTS v_attention_summary CASCADE;
DROP VIEW IF EXISTS v_attention_items   CASCADE;

CREATE OR REPLACE VIEW v_attention_items AS
SELECT
  fai.festival_id,
  f.name                AS festival_name,
  f.slug                AS festival_slug,
  f.start_date          AS festival_start_date,
  'festival_action_items'::text AS source_table,
  fai.id                AS source_id,
  'Action item'::text   AS source_card_label,
  fai.title             AS title,
  fai.description       AS description,
  fai.due_date          AS due_date,
  NULL::time            AS due_time,
  fai.due_date::timestamptz AS due_at,
  fai.status            AS status,
  fai.priority          AS priority,
  fai.owner             AS owner_name,
  NULL::uuid            AS concept_id,
  NULL::text            AS concept_name,
  CASE
    WHEN fai.due_date < current_date THEN 'overdue'
    WHEN fai.due_date = current_date THEN 'today'
    WHEN fai.due_date <= current_date + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END AS urgency_bucket
FROM festival_action_items fai
JOIN festivals f ON f.id = fai.festival_id
WHERE fai.status IN ('open','in-progress')

UNION ALL

SELECT
  fc.festival_id, f.name, f.slug, f.start_date,
  'festival_contracts', fc.id, 'Contract',
  'Inspection: ' || COALESCE(fc.counterparty,'(unnamed contract)'),
  fc.notes,
  fc.inspection_date, NULL::time, fc.inspection_date::timestamptz,
  'planned', 'high', NULL,
  fc.concept_id, c.name,
  CASE
    WHEN fc.inspection_date < current_date THEN 'overdue'
    WHEN fc.inspection_date = current_date THEN 'today'
    WHEN fc.inspection_date <= current_date + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM festival_contracts fc
JOIN festivals f ON f.id = fc.festival_id
LEFT JOIN concepts c ON c.id = fc.concept_id
WHERE fc.inspection_date IS NOT NULL

UNION ALL

SELECT
  fc.festival_id, f.name, f.slug, f.start_date,
  'festival_contracts', fc.id, 'Contract',
  'Site clearance: ' || COALESCE(fc.counterparty,'(unnamed)'),
  fc.notes,
  fc.site_clearance_deadline::date, NULL::time, fc.site_clearance_deadline,
  'planned', 'high', NULL,
  fc.concept_id, c.name,
  CASE
    WHEN fc.site_clearance_deadline < now() THEN 'overdue'
    WHEN fc.site_clearance_deadline::date = current_date THEN 'today'
    WHEN fc.site_clearance_deadline <= now() + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM festival_contracts fc
JOIN festivals f ON f.id = fc.festival_id
LEFT JOIN concepts c ON c.id = fc.concept_id
WHERE fc.site_clearance_deadline IS NOT NULL

UNION ALL

SELECT
  fc.festival_id, f.name, f.slug, f.start_date,
  'festival_cooling', fc.id, 'Cooling',
  'Cooling delivery: ' || COALESCE(fc.unit_type,'container'),
  fc.notes,
  fc.delivery_date, NULL::time, fc.delivery_date::timestamptz,
  COALESCE(fc.payment_status,'planned'), 'normal', NULL, NULL, NULL,
  CASE
    WHEN fc.delivery_date < current_date THEN 'overdue'
    WHEN fc.delivery_date = current_date THEN 'today'
    WHEN fc.delivery_date <= current_date + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM festival_cooling fc
JOIN festivals f ON f.id = fc.festival_id
WHERE fc.delivery_date IS NOT NULL

UNION ALL

SELECT
  fc.festival_id, f.name, f.slug, f.start_date,
  'festival_cooling', fc.id, 'Cooling',
  'Cooling pickup: ' || COALESCE(fc.unit_type,'container'),
  fc.notes,
  fc.pickup_date, NULL::time, fc.pickup_date::timestamptz,
  COALESCE(fc.payment_status,'planned'), 'normal', NULL, NULL, NULL,
  CASE
    WHEN fc.pickup_date < current_date THEN 'overdue'
    WHEN fc.pickup_date = current_date THEN 'today'
    WHEN fc.pickup_date <= current_date + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM festival_cooling fc
JOIN festivals f ON f.id = fc.festival_id
WHERE fc.pickup_date IS NOT NULL

UNION ALL

SELECT
  fa.festival_id, f.name, f.slug, f.start_date,
  'festival_accommodation', fa.id, 'Accommodation',
  COALESCE(fa.venue_name,'Accommodation') ||
    CASE WHEN fa.status = 'gap' THEN ' (GAP — find rooms)' ELSE '' END,
  fa.notes,
  fa.check_in_date, NULL::time, fa.check_in_date::timestamptz,
  fa.status,
  CASE WHEN fa.status = 'gap' THEN 'high' ELSE 'normal' END,
  NULL, NULL, NULL,
  CASE
    WHEN fa.check_in_date < current_date THEN 'overdue'
    WHEN fa.check_in_date = current_date THEN 'today'
    WHEN fa.check_in_date <= current_date + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM festival_accommodation fa
JOIN festivals f ON f.id = fa.festival_id
WHERE fa.status IN ('planned','gap')

UNION ALL

SELECT
  fs.festival_id, f.name, f.slug, f.start_date,
  'festival_setup', fs.id, 'Setup',
  COALESCE(fs.description,'Setup phase'),
  fs.notes,
  fs.scheduled_start_at::date, fs.scheduled_start_at::time, fs.scheduled_start_at,
  fs.status, 'normal', NULL, fs.concept_id, NULL,
  CASE
    WHEN fs.scheduled_start_at < now() THEN 'overdue'
    WHEN fs.scheduled_start_at::date = current_date THEN 'today'
    WHEN fs.scheduled_start_at <= now() + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM festival_setup fs
JOIN festivals f ON f.id = fs.festival_id
WHERE fs.status IN ('planned','confirmed','in-progress')
  AND fs.scheduled_start_at IS NOT NULL

UNION ALL

SELECT
  ft.festival_id, f.name, f.slug, f.start_date,
  'festival_transport', ft.id, 'Transport',
  COALESCE(ft.vehicle_type,'Vehicle') || ' pickup',
  ft.notes,
  ft.pickup_date, NULL::time, ft.pickup_date::timestamptz,
  COALESCE(ft.status,'planned'), 'normal', NULL, NULL, NULL,
  CASE
    WHEN ft.pickup_date < current_date THEN 'overdue'
    WHEN ft.pickup_date = current_date THEN 'today'
    WHEN ft.pickup_date <= current_date + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM festival_transport ft
JOIN festivals f ON f.id = ft.festival_id
WHERE ft.pickup_date IS NOT NULL
  AND COALESCE(ft.status,'planned') IN ('planned','booked')

UNION ALL

SELECT
  ffs.festival_id, f.name, f.slug, f.start_date,
  'festival_facade_status', ffs.id, 'Façade',
  'Façade print deadline: ' || COALESCE(c.name,'(concept)'),
  ffs.notes,
  ffs.print_deadline, NULL::time, ffs.print_deadline::timestamptz,
  COALESCE(ffs.design_status,'planned'), 'normal', NULL, ffs.concept_id, c.name,
  CASE
    WHEN ffs.print_deadline < current_date THEN 'overdue'
    WHEN ffs.print_deadline = current_date THEN 'today'
    WHEN ffs.print_deadline <= current_date + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM festival_facade_status ffs
JOIN festivals f ON f.id = ffs.festival_id
LEFT JOIN concepts c ON c.id = ffs.concept_id
WHERE ffs.print_deadline IS NOT NULL
  AND COALESCE(ffs.design_status,'') NOT IN ('ready','installed')

UNION ALL

SELECT
  fd.festival_id, f.name, f.slug, f.start_date,
  'festival_daka', fd.id, 'DAKA',
  'DAKA pickup',
  fd.notes,
  fd.pickup_date, NULL::time, fd.pickup_date::timestamptz,
  'planned', 'normal', NULL, fd.concept_id, NULL,
  CASE
    WHEN fd.pickup_date < current_date THEN 'overdue'
    WHEN fd.pickup_date = current_date THEN 'today'
    WHEN fd.pickup_date <= current_date + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM festival_daka fd
JOIN festivals f ON f.id = fd.festival_id
WHERE fd.pickup_date IS NOT NULL

UNION ALL

-- Source 9: Driver unassigned
SELECT
  ft.festival_id, f.name, f.slug, f.start_date,
  'transport_legs'::text, tl.id,
  'Transport — driver TBD'::text,
  '🚐 Driver unassigned: ' || COALESCE(ft.vehicle_type,'vehicle'),
  COALESCE(tl.leg_label,'leg') || ' on ' || tl.leg_date::text ||
    ' (' || COALESCE(tl.origin,'?') || ' → ' || COALESCE(tl.destination,'?') || ')',
  tl.leg_date, tl.leg_start_time,
  (tl.leg_date + COALESCE(tl.leg_start_time, '00:00'::time))::timestamptz,
  tl.status,
  CASE WHEN tl.leg_phase IN ('setup_outbound','crew_outbound') THEN 'high' ELSE 'normal' END,
  NULL::text, NULL::uuid, NULL::text,
  CASE
    WHEN tl.leg_date < current_date THEN 'overdue'
    WHEN tl.leg_date = current_date THEN 'today'
    WHEN tl.leg_date <= current_date + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM transport_legs tl
JOIN festival_transport ft ON ft.id = tl.transport_id
JOIN festivals f ON f.id = ft.festival_id
LEFT JOIN transport_leg_assignments a
  ON a.leg_id = tl.id AND a.role = 'driver'
WHERE tl.status IN ('planned','confirmed')
  AND (a.id IS NULL OR a.staff_id IS NULL)

UNION ALL

-- Source 10: Staff without transport
SELECT
  fs.festival_id, f.name, f.slug, f.start_date,
  'festival_staff'::text, fs.id,
  'Transport — passenger seat missing'::text,
  '🪑 Needs ride: ' || COALESCE(fs.name,'(staff name TBD)'),
  'This person has a vagt assigned but no transport seat to ' || f.name ||
    CASE WHEN fs.home_location IS NOT NULL THEN ' (home: ' || fs.home_location || ')' ELSE '' END,
  f.start_date, NULL::time, f.start_date::timestamptz,
  'open'::text, 'high'::text, fs.name,
  NULL::uuid, NULL::text,
  CASE
    WHEN f.start_date < current_date THEN 'overdue'
    WHEN f.start_date = current_date THEN 'today'
    WHEN f.start_date <= current_date + interval '7 days' THEN 'this-week'
    ELSE 'later'
  END
FROM festival_staff fs
JOIN festivals f ON f.id = fs.festival_id
WHERE fs.requires_transport = true
  AND EXISTS (SELECT 1 FROM festival_shifts sh WHERE sh.staff_id = fs.id)
  AND NOT EXISTS (
    SELECT 1
    FROM transport_leg_assignments a
    JOIN transport_legs tl     ON tl.id = a.leg_id
    JOIN festival_transport ft ON ft.id = tl.transport_id
    WHERE a.staff_id = fs.id
      AND ft.festival_id = fs.festival_id
      AND tl.leg_phase IN ('setup_outbound','crew_outbound')
  );

CREATE OR REPLACE VIEW v_attention_summary AS
SELECT
  festival_id, festival_name, festival_slug, festival_start_date,
  count(*) FILTER (WHERE urgency_bucket = 'overdue')   AS overdue_count,
  count(*) FILTER (WHERE urgency_bucket = 'today')     AS today_count,
  count(*) FILTER (WHERE urgency_bucket = 'this-week') AS this_week_count,
  count(*) FILTER (WHERE urgency_bucket = 'later')     AS later_count,
  count(*) AS total_count,
  CASE
    WHEN count(*) FILTER (WHERE urgency_bucket = 'overdue')   > 0 THEN 'overdue'
    WHEN count(*) FILTER (WHERE urgency_bucket = 'today')     > 0 THEN 'today'
    WHEN count(*) FILTER (WHERE urgency_bucket = 'this-week') > 0 THEN 'this-week'
    WHEN count(*) FILTER (WHERE urgency_bucket = 'later')     > 0 THEN 'later'
    ELSE NULL
  END AS worst_bucket
FROM v_attention_items
GROUP BY festival_id, festival_name, festival_slug, festival_start_date;

CREATE OR REPLACE FUNCTION public.mark_attention_done(p_source_table text, p_source_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result text;
BEGIN
  CASE p_source_table
    WHEN 'festival_action_items' THEN
      UPDATE festival_action_items SET status='closed', completed_at=now(), updated_at=now() WHERE id=p_source_id;
      v_result := 'Action item marked done';
    WHEN 'festival_contracts' THEN
      UPDATE festival_contracts SET notes = COALESCE(notes,'') || ' || INSPECTION COMPLETED ' || CURRENT_DATE, updated_at=now() WHERE id=p_source_id;
      v_result := 'Contract inspection marked done (note added)';
    WHEN 'festival_cooling' THEN
      UPDATE festival_cooling SET notes = COALESCE(notes,'') || ' || COMPLETED ' || CURRENT_DATE, updated_at=now() WHERE id=p_source_id;
      v_result := 'Cooling marked completed';
    WHEN 'festival_accommodation' THEN
      UPDATE festival_accommodation SET status='booked', updated_at=now() WHERE id=p_source_id;
      v_result := 'Accommodation marked booked';
    WHEN 'festival_setup' THEN
      UPDATE festival_setup SET status='completed', updated_at=now() WHERE id=p_source_id;
      v_result := 'Setup phase marked completed';
    WHEN 'festival_transport' THEN
      UPDATE festival_transport SET status='picked-up', updated_at=now() WHERE id=p_source_id;
      v_result := 'Transport marked picked-up';
    WHEN 'festival_facade_status' THEN
      UPDATE festival_facade_status SET design_status='ready', updated_at=now() WHERE id=p_source_id;
      v_result := 'Façade marked ready';
    WHEN 'festival_daka' THEN
      UPDATE festival_daka SET notes = COALESCE(notes,'') || ' || PICKED UP ' || CURRENT_DATE WHERE id=p_source_id;
      v_result := 'DAKA pickup marked done (note added)';
    WHEN 'transport_legs' THEN
      UPDATE transport_legs SET status='confirmed' WHERE id=p_source_id;
      v_result := 'Transport leg marked confirmed (assign driver via UI to clear alert)';
    WHEN 'festival_staff' THEN
      v_result := 'Assign passenger to a transport leg via UI to clear this alert';
    ELSE
      v_result := 'ERROR: unknown source_table: ' || p_source_table;
  END CASE;
  RETURN v_result;
END;
$$;

COMMIT;