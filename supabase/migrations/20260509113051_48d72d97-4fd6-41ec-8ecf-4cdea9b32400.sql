CREATE OR REPLACE FUNCTION public.get_active_rules_for_festival(festival_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'title', rule_name,
    'description', rule_description,
    'level', severity,
    'category', category,
    'festivals_affected', applies_to_festivals,
    'operators_affected', applies_to_operators,
    'source', source,
    'effective_from', effective_from,
    'effective_until', effective_until
  ) ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END, rule_name), '[]'::jsonb)
  FROM public.cross_festival_rules
  WHERE active = true
    AND visibility = 'public'
    AND (applies_to_festivals IS NULL OR applies_to_festivals = '{}' OR festival_slug = ANY(applies_to_festivals))
    AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
    AND (effective_until IS NULL OR effective_until >= CURRENT_DATE);
$function$;