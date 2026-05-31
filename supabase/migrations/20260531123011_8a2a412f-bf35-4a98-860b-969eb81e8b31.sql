DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'festival_accommodation',
    'festival_action_items',
    'festival_concept_assignments',
    'festival_concept_hours',
    'festival_concept_prices',
    'festival_contacts',
    'festival_contracts',
    'festival_cooling',
    'festival_cooling_unit',
    'festival_daka',
    'festival_deadlines',
    'festival_equipment',
    'festival_equipment_transport',
    'festival_facade_status',
    'festival_hours',
    'festival_ingredient_manual',
    'festival_location_documents',
    'festival_open_questions',
    'festival_safety',
    'festival_safety_zone',
    'festival_schedule_position',
    'festival_service_hours',
    'festival_setup',
    'festival_shifts',
    'festival_staff',
    'festival_staff_vehicles',
    'festival_timeline_event',
    'festival_transport',
    'festival_trolley_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS draft_source_festival_id uuid NULL REFERENCES public.festivals(id) ON DELETE SET NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (festival_id) WHERE is_draft = true', 'idx_' || t || '_draft', t);
  END LOOP;
END $$;