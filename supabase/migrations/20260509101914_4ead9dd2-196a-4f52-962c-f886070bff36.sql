
-- =========== Table ===========
CREATE TABLE public.intelligence_ingestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN (
    'email_paste','email_forward','pdf_upload','text_paste','photo_upload','voice_transcript'
  )),
  source_filename text,
  source_subject text,
  source_sender text,
  source_received_at timestamptz,
  raw_content text,
  file_path text,
  preview_image_path text,

  hint_festival_id uuid REFERENCES public.festivals(id) ON DELETE SET NULL,
  hint_concept_ids uuid[],
  hint_card_types text[],
  hint_notes text,

  parsed_at timestamptz,
  parse_model text,
  parse_input_tokens int,
  parse_output_tokens int,
  parse_duration_ms int,
  parse_confidence numeric(3,2),
  ai_summary text,
  ai_proposed_updates jsonb,
  ai_warnings text[],

  human_reviewed_at timestamptz,
  human_reviewed_by uuid,
  human_decision text CHECK (human_decision IN ('approved_all','approved_partial','rejected','needs_more_info')),
  human_edits jsonb,
  applied_at timestamptz,
  application_results jsonb,

  resulted_in_action_items uuid[],
  resulted_in_contract_updates uuid[],
  resulted_in_questions uuid[],
  resulted_in_timeline_events uuid[],
  resulted_in_facade_updates uuid[],
  resulted_in_safety_updates uuid[],
  resulted_in_accommodation_updates uuid[],
  resulted_in_contact_updates uuid[],

  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded','parsing','parsed','reviewing','applied','rejected','failed'
  )),
  error_log text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingestion_status ON public.intelligence_ingestion(status);
CREATE INDEX idx_ingestion_festival ON public.intelligence_ingestion(hint_festival_id);
CREATE INDEX idx_ingestion_created ON public.intelligence_ingestion(created_at DESC);

CREATE TRIGGER trg_intelligence_ingestion_updated_at
  BEFORE UPDATE ON public.intelligence_ingestion
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.intelligence_ingestion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users_all_access" ON public.intelligence_ingestion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.intelligence_ingestion;

-- =========== Storage bucket ===========
INSERT INTO storage.buckets (id, name, public)
VALUES ('intelligence-uploads', 'intelligence-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ingest_auth_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'intelligence-uploads');

CREATE POLICY "ingest_auth_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'intelligence-uploads');

CREATE POLICY "ingest_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'intelligence-uploads');

CREATE POLICY "ingest_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'intelligence-uploads');

-- =========== apply_ingestion RPC ===========
CREATE OR REPLACE FUNCTION public.apply_ingestion(p_id uuid, p_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  upd jsonb;
  successes jsonb := '[]'::jsonb;
  failures jsonb := '[]'::jsonb;
  res_action uuid[] := '{}';
  res_contract uuid[] := '{}';
  res_question uuid[] := '{}';
  res_timeline uuid[] := '{}';
  res_facade uuid[] := '{}';
  res_safety uuid[] := '{}';
  res_accom uuid[] := '{}';
  res_contact uuid[] := '{}';
  v_festival_id uuid;
  v_concept_id uuid;
  v_contract_id uuid;
  v_target_id uuid;
  v_table text;
  v_action text;
  v_fields jsonb;
  v_match jsonb;
  v_error text;
BEGIN
  FOR upd IN SELECT jsonb_array_elements(p_updates) LOOP
    BEGIN
      v_table := upd->>'table';
      v_action := COALESCE(upd->>'action','update');
      v_fields := COALESCE(upd->'fields','{}'::jsonb);
      v_match := COALESCE(upd->'match_by','{}'::jsonb);
      v_festival_id := NULL; v_concept_id := NULL; v_contract_id := NULL; v_target_id := NULL;

      -- resolve festival/concept by slug
      IF upd ? 'festival_slug' THEN
        SELECT id INTO v_festival_id FROM festivals WHERE slug = upd->>'festival_slug';
      END IF;
      IF upd ? 'concept_slug' THEN
        SELECT id INTO v_concept_id FROM concepts WHERE slug = upd->>'concept_slug';
      END IF;

      -- resolve contract id from match_by lookup
      IF v_match ? 'festival_contract_id_lookup' THEN
        SELECT fc.id INTO v_contract_id
        FROM festival_contracts fc
        JOIN festivals f ON f.id = fc.festival_id
        JOIN concepts c ON c.id = fc.concept_id
        WHERE f.slug = v_match->'festival_contract_id_lookup'->>'festival_slug'
          AND c.slug = v_match->'festival_contract_id_lookup'->>'concept_slug'
        LIMIT 1;
      ELSIF v_match ? 'id' THEN
        v_target_id := (v_match->>'id')::uuid;
      END IF;

      IF v_table = 'festival_action_items' AND v_action = 'insert' THEN
        INSERT INTO festival_action_items (festival_id, concept_id, contract_id, title, description,
                                           due_date, status, priority, owner, source, source_ref)
        VALUES (
          COALESCE(v_festival_id,(v_fields->>'festival_id')::uuid),
          v_concept_id,
          v_contract_id,
          v_fields->>'title',
          v_fields->>'description',
          NULLIF(v_fields->>'due_date','')::date,
          COALESCE(v_fields->>'status','open'),
          COALESCE(v_fields->>'priority','medium'),
          v_fields->>'owner',
          'ingestion',
          'ingestion:'||p_id::text
        ) RETURNING id INTO v_target_id;
        res_action := array_append(res_action, v_target_id);

      ELSIF v_table = 'festival_open_questions' AND v_action = 'insert' THEN
        INSERT INTO festival_open_questions (festival_id, concept_id, contract_id, question, context,
                                             question_type, priority, decision_owner, deadline, blocking_what, status)
        VALUES (
          COALESCE(v_festival_id,(v_fields->>'festival_id')::uuid),
          v_concept_id, v_contract_id,
          v_fields->>'question', v_fields->>'context',
          v_fields->>'question_type',
          COALESCE(v_fields->>'priority','medium'),
          v_fields->>'decision_owner',
          NULLIF(v_fields->>'deadline','')::date,
          v_fields->>'blocking_what',
          COALESCE(v_fields->>'status','open')
        ) RETURNING id INTO v_target_id;
        res_question := array_append(res_question, v_target_id);

      ELSIF v_table = 'festival_facade' AND v_action = 'update' THEN
        UPDATE festival_facade
          SET design_status = COALESCE(v_fields->>'design_status', design_status),
              material_orders_status = COALESCE(v_fields->>'material_orders_status', material_orders_status),
              material_deadline = COALESCE(NULLIF(v_fields->>'material_deadline','')::date, material_deadline),
              print_deadline = COALESCE(NULLIF(v_fields->>'print_deadline','')::date, print_deadline),
              festival_approval_received_at = COALESCE(NULLIF(v_fields->>'festival_approval_received_at','')::timestamptz, festival_approval_received_at),
              notes = COALESCE(v_fields->>'notes', notes),
              updated_at = now()
          WHERE festival_contract_id = v_contract_id
          RETURNING id INTO v_target_id;
        IF v_target_id IS NOT NULL THEN res_facade := array_append(res_facade, v_target_id); END IF;

      ELSIF v_table = 'festival_contracts' AND v_action = 'update' THEN
        UPDATE festival_contracts
          SET contract_status = COALESCE(v_fields->>'contract_status', contract_status),
              contract_signed_date = COALESCE(NULLIF(v_fields->>'contract_signed_date','')::date, contract_signed_date),
              signing_platform = COALESCE(v_fields->>'signing_platform', signing_platform),
              contract_value_dkk = COALESCE(NULLIF(v_fields->>'contract_value_dkk','')::numeric, contract_value_dkk),
              payment_terms = COALESCE(v_fields->>'payment_terms', payment_terms),
              payment_status = COALESCE(v_fields->>'payment_status', payment_status),
              counterparty_name = COALESCE(v_fields->>'counterparty_name', counterparty_name),
              counterparty_cvr = COALESCE(v_fields->>'counterparty_cvr', counterparty_cvr),
              key_obligations = COALESCE(v_fields->>'key_obligations', key_obligations),
              contract_signed_by = COALESCE(v_fields->>'contract_signed_by', contract_signed_by),
              updated_at = now()
          WHERE id = COALESCE(v_contract_id, v_target_id)
          RETURNING id INTO v_target_id;
        IF v_target_id IS NOT NULL THEN res_contract := array_append(res_contract, v_target_id); END IF;

      ELSIF v_table = 'festival_safety' AND v_action = 'update' THEN
        UPDATE festival_safety
          SET gas_safety_status = COALESCE((v_fields->>'gas_safety_status')::safety_gas_status, gas_safety_status),
              gas_safety_date = COALESCE(NULLIF(v_fields->>'gas_safety_date','')::date, gas_safety_date),
              food_authority_status = COALESCE((v_fields->>'food_authority_status')::safety_food_status, food_authority_status),
              food_authority_inspection_date = COALESCE(NULLIF(v_fields->>'food_authority_inspection_date','')::date, food_authority_inspection_date),
              electrical_certification_status = COALESCE((v_fields->>'electrical_certification_status')::safety_electrical_status, electrical_certification_status),
              additional_notes = COALESCE(v_fields->>'additional_notes', additional_notes),
              updated_at = now()
          WHERE festival_id = COALESCE(v_festival_id,(v_fields->>'festival_id')::uuid)
          RETURNING id INTO v_target_id;
        IF v_target_id IS NOT NULL THEN res_safety := array_append(res_safety, v_target_id); END IF;

      ELSIF v_table = 'festival_accommodation' AND v_action = 'insert' THEN
        INSERT INTO festival_accommodation (festival_id, accommodation_type, provider_name, address,
          check_in_date, check_out_date, capacity, cost_dkk, payment_status, confirmation_number,
          contact_name, contact_phone, contact_email, notes)
        VALUES (
          COALESCE(v_festival_id,(v_fields->>'festival_id')::uuid),
          COALESCE((v_fields->>'accommodation_type')::accommodation_type,'hotel'::accommodation_type),
          v_fields->>'provider_name', v_fields->>'address',
          NULLIF(v_fields->>'check_in_date','')::date,
          NULLIF(v_fields->>'check_out_date','')::date,
          NULLIF(v_fields->>'capacity','')::int,
          NULLIF(v_fields->>'cost_dkk','')::numeric,
          COALESCE((v_fields->>'payment_status')::accommodation_payment_status,'not_paid'::accommodation_payment_status),
          v_fields->>'confirmation_number',
          v_fields->>'contact_name', v_fields->>'contact_phone', v_fields->>'contact_email',
          v_fields->>'notes'
        ) RETURNING id INTO v_target_id;
        res_accom := array_append(res_accom, v_target_id);

      ELSIF v_table = 'festival_timeline_event' AND v_action = 'insert' THEN
        INSERT INTO festival_timeline_event (festival_id, event_type, event_date, event_time, location,
          responsible_party, title, notes, status)
        VALUES (
          COALESCE(v_festival_id,(v_fields->>'festival_id')::uuid),
          v_fields->>'event_type',
          NULLIF(v_fields->>'event_date','')::date,
          NULLIF(v_fields->>'event_time','')::time,
          v_fields->>'location',
          v_fields->>'responsible_party',
          v_fields->>'title',
          v_fields->>'notes',
          COALESCE(v_fields->>'status','planned')
        ) RETURNING id INTO v_target_id;
        res_timeline := array_append(res_timeline, v_target_id);

      ELSIF v_table = 'festival_contacts' AND v_action = 'insert' THEN
        INSERT INTO festival_contacts (festival_id, full_name, role, email, phone, organization,
          contact_type, is_primary, notes, last_contact_date)
        VALUES (
          COALESCE(v_festival_id,(v_fields->>'festival_id')::uuid),
          COALESCE(v_fields->>'full_name', v_fields->>'name'),
          COALESCE(v_fields->>'role','contact'),
          v_fields->>'email', v_fields->>'phone', v_fields->>'organization',
          COALESCE((v_fields->>'contact_type')::contact_type,'festival_organizer'::contact_type),
          COALESCE((v_fields->>'is_primary')::boolean,false),
          v_fields->>'notes',
          NULLIF(v_fields->>'last_contact_date','')::date
        ) RETURNING id INTO v_target_id;
        res_contact := array_append(res_contact, v_target_id);

      ELSIF v_table = 'festival_contacts' AND v_action = 'update' THEN
        UPDATE festival_contacts
          SET full_name = COALESCE(v_fields->>'full_name', full_name),
              role = COALESCE(v_fields->>'role', role),
              email = COALESCE(v_fields->>'email', email),
              phone = COALESCE(v_fields->>'phone', phone),
              organization = COALESCE(v_fields->>'organization', organization),
              notes = COALESCE(v_fields->>'notes', notes),
              last_contact_date = COALESCE(NULLIF(v_fields->>'last_contact_date','')::date, last_contact_date),
              updated_at = now()
          WHERE id = v_target_id
          RETURNING id INTO v_target_id;
        IF v_target_id IS NOT NULL THEN res_contact := array_append(res_contact, v_target_id); END IF;

      ELSE
        RAISE EXCEPTION 'Unsupported table/action: % %', v_table, v_action;
      END IF;

      successes := successes || jsonb_build_object('table',v_table,'action',v_action,'id',v_target_id);

    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      failures := failures || jsonb_build_object('table',v_table,'action',v_action,'error',v_error,'update',upd);
      RAISE EXCEPTION 'Apply failed on % %: %', v_table, v_action, v_error;
    END;
  END LOOP;

  UPDATE intelligence_ingestion
  SET status = 'applied',
      applied_at = now(),
      application_results = jsonb_build_object('successes',successes,'failures',failures),
      resulted_in_action_items = res_action,
      resulted_in_contract_updates = res_contract,
      resulted_in_questions = res_question,
      resulted_in_timeline_events = res_timeline,
      resulted_in_facade_updates = res_facade,
      resulted_in_safety_updates = res_safety,
      resulted_in_accommodation_updates = res_accom,
      resulted_in_contact_updates = res_contact,
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('successes',successes,'failures',failures);
END;
$$;
