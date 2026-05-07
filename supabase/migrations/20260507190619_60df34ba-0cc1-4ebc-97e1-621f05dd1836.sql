
BEGIN;

DROP VIEW IF EXISTS v_attention_summary CASCADE;
DROP VIEW IF EXISTS v_attention_items CASCADE;

CREATE VIEW v_attention_items AS
-- 1. Action items
SELECT
    f.id AS festival_id, f.name AS festival_name, f.slug AS festival_slug, f.start_date AS festival_start_date,
    'festival_action_items'::text AS source_table, fai.id AS source_id, 'Action Items'::text AS source_card_label,
    fai.title, fai.description,
    fai.due_date, NULL::time AS due_time, fai.due_date::timestamptz AS due_at,
    fai.status, fai.priority, fai.owner AS owner_name,
    NULL::uuid AS concept_id, NULL::text AS concept_name,
    CASE WHEN fai.due_date < CURRENT_DATE THEN 'overdue'
         WHEN fai.due_date = CURRENT_DATE THEN 'today'
         WHEN fai.due_date <= CURRENT_DATE + 7 THEN 'this-week'
         ELSE 'later' END AS urgency_bucket
FROM festival_action_items fai
JOIN festivals f ON f.id = fai.festival_id
WHERE fai.status IN ('open','in_progress','in-progress') AND fai.due_date IS NOT NULL

UNION ALL
-- 2a. Contract inspection
SELECT f.id, f.name, f.slug, f.start_date,
    'festival_contracts', fc.id, 'Card #1 Introduction',
    'Brand inspection — ' || c.name,
    'Authorities gas+brand inspection 1 day before festival opens. All bods must be set up & powered.'::text,
    fc.inspection_date, fc.inspection_time,
    (fc.inspection_date::text || ' ' || COALESCE(fc.inspection_time::text,'09:00:00'))::timestamptz,
    'pending'::text, 'critical'::text, 'Alexandra'::text,
    c.id, c.name,
    CASE WHEN fc.inspection_date < CURRENT_DATE THEN 'overdue'
         WHEN fc.inspection_date = CURRENT_DATE THEN 'today'
         WHEN fc.inspection_date <= CURRENT_DATE + 7 THEN 'this-week'
         ELSE 'later' END
FROM festival_contracts fc
JOIN festivals f ON f.id = fc.festival_id
JOIN concepts c ON c.id = fc.concept_id
WHERE fc.inspection_date IS NOT NULL AND fc.inspection_date >= CURRENT_DATE - 1

UNION ALL
-- 2b. Site clearance
SELECT f.id, f.name, f.slug, f.start_date,
    'festival_contracts', fc.id, 'Card #1 Introduction',
    'Site clearance deadline — ' || c.name,
    'Per contract: leave area fully clean by deadline.'::text,
    fc.site_clearance_deadline::date, fc.site_clearance_deadline::time, fc.site_clearance_deadline,
    'pending'::text, 'high'::text, 'Alexandra'::text,
    c.id, c.name,
    CASE WHEN fc.site_clearance_deadline::date < CURRENT_DATE THEN 'overdue'
         WHEN fc.site_clearance_deadline::date = CURRENT_DATE THEN 'today'
         WHEN fc.site_clearance_deadline::date <= CURRENT_DATE + 7 THEN 'this-week'
         ELSE 'later' END
FROM festival_contracts fc
JOIN festivals f ON f.id = fc.festival_id
JOIN concepts c ON c.id = fc.concept_id
WHERE fc.site_clearance_deadline IS NOT NULL AND fc.site_clearance_deadline >= CURRENT_DATE - INTERVAL '1 day'

UNION ALL
-- 3a. Cooling delivery
SELECT f.id, f.name, f.slug, f.start_date,
    'festival_cooling', fcl.id, 'Card #4 Cooling',
    'Cooling delivery — ' || COALESCE((SELECT name FROM suppliers s WHERE s.id = fcl.supplier_id),'Godik'),
    COALESCE(fcl.notes,'') || ' Delivery scheduled.',
    fcl.delivery_date, fcl.delivery_time_earliest, fcl.delivery_date::timestamptz,
    COALESCE(fcl.payment_status,'pending')::text, 'high'::text, 'Marius'::text,
    NULL::uuid, NULL::text,
    CASE WHEN fcl.delivery_date < CURRENT_DATE THEN 'overdue'
         WHEN fcl.delivery_date = CURRENT_DATE THEN 'today'
         WHEN fcl.delivery_date <= CURRENT_DATE + 7 THEN 'this-week'
         ELSE 'later' END
FROM festival_cooling fcl
JOIN festivals f ON f.id = fcl.festival_id
WHERE fcl.delivery_date IS NOT NULL AND fcl.delivery_date >= CURRENT_DATE - 1

UNION ALL
-- 3b. Cooling pickup
SELECT f.id, f.name, f.slug, f.start_date,
    'festival_cooling', fcl.id, 'Card #4 Cooling',
    'Cooling pickup — ' || COALESCE((SELECT name FROM suppliers s WHERE s.id = fcl.supplier_id),'Godik'),
    COALESCE(fcl.notes,'') || ' Pickup scheduled.',
    fcl.pickup_date, fcl.pickup_time_earliest, fcl.pickup_date::timestamptz,
    COALESCE(fcl.payment_status,'pending')::text, 'normal'::text, 'Marius'::text,
    NULL::uuid, NULL::text,
    CASE WHEN fcl.pickup_date < CURRENT_DATE THEN 'overdue'
         WHEN fcl.pickup_date = CURRENT_DATE THEN 'today'
         WHEN fcl.pickup_date <= CURRENT_DATE + 7 THEN 'this-week'
         ELSE 'later' END
FROM festival_cooling fcl
JOIN festivals f ON f.id = fcl.festival_id
WHERE fcl.pickup_date IS NOT NULL AND fcl.pickup_date >= CURRENT_DATE - 1

UNION ALL
-- 4. Accommodation
SELECT f.id, f.name, f.slug, f.start_date,
    'festival_accommodation', fa.id, 'Card #7 Staff Transport & Accommodation',
    CASE WHEN fa.status = 'gap' THEN 'BOOK accommodation — ' || COALESCE(fa.group_label, fa.venue_name)
         ELSE 'Check-in: ' || COALESCE(fa.venue_name,'TBD') || ' — ' || COALESCE(fa.group_label,'') END,
    COALESCE(fa.notes,'') || CASE WHEN fa.status = 'gap' THEN ' [GAP — needs booking]' ELSE '' END,
    fa.check_in_date, NULL::time, fa.check_in_date::timestamptz,
    fa.status,
    CASE WHEN fa.status = 'gap' THEN 'critical'
         WHEN fa.check_in_date <= CURRENT_DATE + 7 THEN 'high' ELSE 'normal' END,
    'Alexandra'::text,
    NULL::uuid, NULL::text,
    CASE WHEN fa.check_in_date < CURRENT_DATE THEN 'overdue'
         WHEN fa.check_in_date = CURRENT_DATE THEN 'today'
         WHEN fa.check_in_date <= CURRENT_DATE + 7 THEN 'this-week'
         ELSE 'later' END
FROM festival_accommodation fa
JOIN festivals f ON f.id = fa.festival_id
WHERE fa.check_in_date IS NOT NULL AND fa.check_in_date >= CURRENT_DATE - 1
  AND fa.status IN ('planned','gap')

UNION ALL
-- 5. Setup
SELECT f.id, f.name, f.slug, f.start_date,
    'festival_setup', fs.id, 'Card #12 Setup Timeline',
    LEFT(fs.description,80) || CASE WHEN length(fs.description) > 80 THEN '…' ELSE '' END,
    fs.description,
    fs.scheduled_start_at::date, fs.scheduled_start_at::time, fs.scheduled_start_at,
    fs.status,
    CASE WHEN fs.work_type = 'setup' AND fs.scheduled_start_at::date <= CURRENT_DATE + 3 THEN 'high' ELSE 'normal' END,
    fs.crew_lead,
    NULL::uuid, NULL::text,
    CASE WHEN fs.scheduled_start_at::date < CURRENT_DATE THEN 'overdue'
         WHEN fs.scheduled_start_at::date = CURRENT_DATE THEN 'today'
         WHEN fs.scheduled_start_at::date <= CURRENT_DATE + 7 THEN 'this-week'
         ELSE 'later' END
FROM festival_setup fs
JOIN festivals f ON f.id = fs.festival_id
WHERE fs.scheduled_start_at IS NOT NULL AND fs.scheduled_start_at::date >= CURRENT_DATE - 1
  AND fs.status IN ('planned','confirmed','in-progress','in_progress')

UNION ALL
-- 6. Transport
SELECT f.id, f.name, f.slug, f.start_date,
    'festival_transport', ft.id, 'Card #7 Staff Transport & Accommodation',
    'Vehicle: ' || ft.vehicle_type || CASE WHEN ft.status = 'planned' THEN ' — TO BOOK' ELSE ' — pickup' END,
    COALESCE(ft.notes,'') || ' (' || COALESCE(ft.vehicle_purpose,'') || ')',
    ft.pickup_date, ft.pickup_time,
    (ft.pickup_date::text || ' ' || COALESCE(ft.pickup_time::text,'09:00:00'))::timestamptz,
    ft.status,
    CASE WHEN ft.status = 'planned' THEN 'high' ELSE 'normal' END,
    'Marius'::text,
    NULL::uuid, NULL::text,
    CASE WHEN ft.pickup_date < CURRENT_DATE THEN 'overdue'
         WHEN ft.pickup_date = CURRENT_DATE THEN 'today'
         WHEN ft.pickup_date <= CURRENT_DATE + 7 THEN 'this-week'
         ELSE 'later' END
FROM festival_transport ft
JOIN festivals f ON f.id = ft.festival_id
WHERE ft.pickup_date IS NOT NULL AND ft.pickup_date >= CURRENT_DATE - 1
  AND ft.status IN ('planned','booked')

UNION ALL
-- 7. Façade
SELECT f.id, f.name, f.slug, f.start_date,
    'festival_facade_status', ffs.id, 'Card #3 Equipment Setup',
    'Façade — ' || c.name || ' — ' || ffs.design_status,
    'Façade design status: ' || ffs.design_status || COALESCE('. Notes: ' || ffs.notes,''),
    ffs.print_deadline, NULL::time, ffs.print_deadline::timestamptz,
    ffs.design_status,
    CASE WHEN ffs.design_status IN ('not-started','in-progress') THEN 'critical'
         WHEN ffs.design_status = 'designed' THEN 'high' ELSE 'normal' END,
    'Alexandra'::text,
    c.id, c.name,
    CASE WHEN ffs.print_deadline < CURRENT_DATE THEN 'overdue'
         WHEN ffs.print_deadline = CURRENT_DATE THEN 'today'
         WHEN ffs.print_deadline <= CURRENT_DATE + 7 THEN 'this-week'
         ELSE 'later' END
FROM festival_facade_status ffs
JOIN festivals f ON f.id = ffs.festival_id
JOIN concepts c ON c.id = ffs.concept_id
WHERE ffs.print_deadline IS NOT NULL AND ffs.design_status NOT IN ('ready','installed')

UNION ALL
-- 8. DAKA
SELECT f.id, f.name, f.slug, f.start_date,
    'festival_daka', fd.id, 'Card #4 Cooling',
    'DAKA pickup — ' || COALESCE(c.name,'all concepts'),
    COALESCE(fd.notes,'') || ' Pickup arrangement: ' || COALESCE(fd.pickup_arrangement,'TBD'),
    fd.pickup_date, NULL::time, fd.pickup_date::timestamptz,
    'pending'::text, 'normal'::text, 'Costel'::text,
    c.id, c.name,
    CASE WHEN fd.pickup_date < CURRENT_DATE THEN 'overdue'
         WHEN fd.pickup_date = CURRENT_DATE THEN 'today'
         WHEN fd.pickup_date <= CURRENT_DATE + 7 THEN 'this-week'
         ELSE 'later' END
FROM festival_daka fd
JOIN festivals f ON f.id = fd.festival_id
LEFT JOIN concepts c ON c.id = fd.concept_id
WHERE fd.pickup_date IS NOT NULL AND fd.pickup_date >= CURRENT_DATE - 1;

CREATE VIEW v_attention_summary AS
SELECT
    festival_id, festival_name, festival_slug, festival_start_date,
    COUNT(*) FILTER (WHERE urgency_bucket = 'overdue')   AS count_overdue,
    COUNT(*) FILTER (WHERE urgency_bucket = 'today')     AS count_today,
    COUNT(*) FILTER (WHERE urgency_bucket = 'this-week') AS count_this_week,
    COUNT(*) FILTER (WHERE urgency_bucket = 'later')     AS count_later,
    COUNT(*) FILTER (WHERE priority = 'critical')        AS count_critical,
    COUNT(*) AS total_attention_items,
    CASE
        WHEN COUNT(*) FILTER (WHERE urgency_bucket = 'overdue')   > 0 THEN 'overdue'
        WHEN COUNT(*) FILTER (WHERE urgency_bucket = 'today')     > 0 THEN 'today'
        WHEN COUNT(*) FILTER (WHERE urgency_bucket = 'this-week') > 0 THEN 'this-week'
        WHEN COUNT(*) FILTER (WHERE urgency_bucket = 'later')     > 0 THEN 'later'
        ELSE 'clear'
    END AS worst_bucket
FROM v_attention_items
GROUP BY festival_id, festival_name, festival_slug, festival_start_date;

CREATE OR REPLACE FUNCTION mark_attention_done(p_source_table text, p_source_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result text;
BEGIN
    CASE p_source_table
        WHEN 'festival_action_items' THEN
            UPDATE festival_action_items SET status = 'closed', completed_at = now(), updated_at = now() WHERE id = p_source_id;
            v_result := 'Action item marked done';
        WHEN 'festival_contracts' THEN
            UPDATE festival_contracts SET notes = COALESCE(notes,'') || ' || INSPECTION COMPLETED ' || CURRENT_DATE, updated_at = now() WHERE id = p_source_id;
            v_result := 'Contract inspection marked done (note added)';
        WHEN 'festival_cooling' THEN
            UPDATE festival_cooling SET notes = COALESCE(notes,'') || ' || COMPLETED ' || CURRENT_DATE, updated_at = now() WHERE id = p_source_id;
            v_result := 'Cooling item marked completed (note added)';
        WHEN 'festival_accommodation' THEN
            UPDATE festival_accommodation SET status = 'booked', updated_at = now() WHERE id = p_source_id;
            v_result := 'Accommodation marked booked';
        WHEN 'festival_setup' THEN
            UPDATE festival_setup SET status = 'completed', updated_at = now() WHERE id = p_source_id;
            v_result := 'Setup phase marked completed';
        WHEN 'festival_transport' THEN
            UPDATE festival_transport SET status = 'picked-up', updated_at = now() WHERE id = p_source_id;
            v_result := 'Transport marked picked-up';
        WHEN 'festival_facade_status' THEN
            UPDATE festival_facade_status SET design_status = 'ready', updated_at = now() WHERE id = p_source_id;
            v_result := 'Façade marked ready';
        WHEN 'festival_daka' THEN
            UPDATE festival_daka SET notes = COALESCE(notes,'') || ' || PICKED UP ' || CURRENT_DATE WHERE id = p_source_id;
            v_result := 'DAKA pickup marked done (note added)';
        ELSE
            v_result := 'ERROR: unknown source_table: ' || p_source_table;
    END CASE;
    RETURN v_result;
END;
$$;

INSERT INTO festival_action_items (festival_id, title, description, category, owner, due_date, status, priority)
SELECT id,
    'Build Attention card UI in Lovable',
    E'Backend ready. Build UI:\n1. Header widget showing v_attention_summary counts by bucket\n2. Click → page with v_attention_items grouped by urgency_bucket\n3. Mark Done button → mark_attention_done(source_table, source_id)\n4. Global Attention page across all festivals\n5. Refresh on every page load',
    'operations', 'Alexandra', DATE '2026-05-12', 'open', 'high'
FROM festivals WHERE slug = 'jelling-2026';

COMMIT;
