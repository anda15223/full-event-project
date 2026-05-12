CREATE OR REPLACE FUNCTION public.get_dashboard_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  today date := current_date;
  week_end date := current_date + 7;
BEGIN
  SELECT jsonb_build_object(
    'overdue_actions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type','action_item','id',id,'title',title,'priority',priority,
        'due_date',due_date,'festival_id',festival_id,'concept_id',concept_id,
        'owner',owner,'days_overdue',(today - due_date)
      ) ORDER BY due_date ASC)
      FROM festival_action_items
      WHERE due_date < today AND status IN ('open','in_progress')
        AND (snoozed_until IS NULL OR snoozed_until <= today)
    ), '[]'::jsonb),
    'overdue_questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type','question','id',id,'title',question,'priority',priority,
        'deadline',deadline,'festival_id',festival_id,'concept_id',concept_id,
        'days_overdue',(today - deadline)
      ) ORDER BY deadline ASC)
      FROM festival_open_questions
      WHERE deadline < today AND status = 'open'
    ), '[]'::jsonb),
    'due_today_actions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type','action_item','id',id,'title',title,'priority',priority,
        'due_date',due_date,'festival_id',festival_id,'concept_id',concept_id,'owner',owner
      ))
      FROM festival_action_items
      WHERE due_date = today AND status IN ('open','in_progress')
    ), '[]'::jsonb),
    'due_today_questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type','question','id',id,'title',question,'priority',priority,
        'deadline',deadline,'festival_id',festival_id,'concept_id',concept_id
      ))
      FROM festival_open_questions
      WHERE deadline = today AND status = 'open'
    ), '[]'::jsonb),
    'due_today_events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type','timeline_event','id',id,'title',title,'event_date',event_date,
        'festival_id',festival_id,'responsible_party',responsible_party
      ))
      FROM festival_timeline_event
      WHERE event_date = today AND status <> 'done'
    ), '[]'::jsonb),
    'critical_actions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type','action_item','id',id,'title',title,'priority',priority,
        'due_date',due_date,'festival_id',festival_id,'concept_id',concept_id,
        'created_at',created_at,'owner',owner
      ) ORDER BY created_at ASC)
      FROM festival_action_items
      WHERE priority = 'critical' AND status IN ('open','in_progress')
        AND (due_date IS NULL OR due_date >= today)
    ), '[]'::jsonb),
    'critical_questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type','question','id',id,'title',question,'priority',priority,
        'deadline',deadline,'festival_id',festival_id,'concept_id',concept_id,
        'created_at',created_at
      ) ORDER BY created_at ASC)
      FROM festival_open_questions
      WHERE priority = 'critical' AND status = 'open'
        AND (deadline IS NULL OR deadline >= today)
    ), '[]'::jsonb),
    'this_week_actions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',id,'title',title,'priority',priority,'due_date',due_date,
        'festival_id',festival_id,'concept_id',concept_id,'owner',owner
      ) ORDER BY due_date ASC)
      FROM festival_action_items
      WHERE due_date > today AND due_date <= week_end
        AND status IN ('open','in_progress')
    ), '[]'::jsonb),
    'this_week_events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',id,'title',title,'event_date',event_date,'event_type',event_type,
        'festival_id',festival_id,'responsible_party',responsible_party,
        'concepts_involved',concepts_involved
      ) ORDER BY event_date ASC)
      FROM festival_timeline_event
      WHERE event_date > today AND event_date <= week_end AND status <> 'done'
    ), '[]'::jsonb),
    'this_week_questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',id,'title',question,'deadline',deadline,'priority',priority,
        'festival_id',festival_id
      ) ORDER BY deadline ASC)
      FROM festival_open_questions
      WHERE deadline > today AND deadline <= week_end AND status = 'open'
    ), '[]'::jsonb),
    'festival_grid', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'slug', f.slug,
        'name', f.name,
        'start_date', f.start_date,
        'end_date', f.end_date,
        'countdown_days', (f.start_date - today),
        'open_actions', (SELECT count(*) FROM festival_action_items WHERE festival_id = f.id AND status IN ('open','in_progress')),
        'overdue_count', (SELECT count(*) FROM festival_action_items WHERE festival_id = f.id AND status IN ('open','in_progress') AND due_date < today),
        'critical_count', (SELECT count(*) FROM festival_action_items WHERE festival_id = f.id AND status IN ('open','in_progress') AND priority='critical')
          + (SELECT count(*) FROM festival_open_questions WHERE festival_id = f.id AND status='open' AND priority='critical'),
        'concepts_count', (SELECT count(*) FROM festival_contracts WHERE festival_id = f.id AND is_active = true),
        'operating_entities', (SELECT array_agg(DISTINCT operating_entity) FROM festival_contracts WHERE festival_id = f.id AND is_active = true AND operating_entity IS NOT NULL),
        'stalled_count', (SELECT count(*) FROM festival_contracts WHERE festival_id = f.id AND is_active = true AND contract_status='stalled')
      ) ORDER BY f.start_date)
      FROM festivals f
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'open_actions_total', (SELECT count(*) FROM festival_action_items WHERE status IN ('open','in_progress')),
      'open_actions_week', (SELECT count(*) FROM festival_action_items WHERE status IN ('open','in_progress') AND due_date <= week_end AND due_date >= today),
      'critical_actions', (SELECT count(*) FROM festival_action_items WHERE status IN ('open','in_progress') AND priority='critical'),
      'open_questions_total', (SELECT count(*) FROM festival_open_questions WHERE status='open'),
      'critical_questions', (SELECT count(*) FROM festival_open_questions WHERE status='open' AND priority='critical'),
      'contracts_signed', (SELECT count(*) FROM festival_contracts WHERE is_active = true AND contract_status='signed'),
      'contracts_total', (SELECT count(*) FROM festival_contracts WHERE is_active = true),
      'active_rules', (SELECT count(*) FROM cross_festival_rules WHERE active=true),
      'total_contacts', (SELECT count(*) FROM festival_contacts),
      'stalled_contracts', (SELECT count(*) FROM festival_contracts WHERE is_active = true AND contract_status='stalled')
    )
  ) INTO result;
  RETURN result;
END;
$function$;