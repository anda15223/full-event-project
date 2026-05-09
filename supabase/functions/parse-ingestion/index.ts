import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || Deno.env.get('AIAGENTS') || Deno.env.get('aiagents') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function parseEml(raw: string) {
  const headerEnd = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n');
  const headers = headerEnd > 0 ? raw.slice(0, headerEnd) : raw;
  const body = headerEnd > 0 ? raw.slice(headerEnd).trim() : raw;
  const get = (k: string) => {
    const m = headers.match(new RegExp(`^${k}:\\s*(.+)$`, 'mi'));
    return m ? m[1].trim() : null;
  };
  return {
    subject: get('Subject'),
    sender: get('From'),
    date: get('Date'),
    body,
  };
}

function stripJsonFences(s: string) {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { ingestion_id } = await req.json();
    if (!ingestion_id) {
      return new Response(JSON.stringify({ error: 'ingestion_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Mark parsing
    await sb.from('intelligence_ingestion').update({ status: 'parsing' }).eq('id', ingestion_id);

    // Load row
    const { data: row, error: rowErr } = await sb.from('intelligence_ingestion').select('*').eq('id', ingestion_id).single();
    if (rowErr || !row) throw new Error('Ingestion row not found');

    let rawContent = row.raw_content || '';
    const updates: Record<string, unknown> = {};

    // If file but no raw_content, attempt download for .eml/.txt
    if (row.file_path && !rawContent) {
      const { data: fileData } = await sb.storage.from('intelligence-uploads').download(row.file_path);
      if (fileData) {
        const isText = /\.(eml|msg|txt)$/i.test(row.file_path);
        if (isText) {
          rawContent = await fileData.text();
        }
      }
    }

    // .eml header parse
    if (row.source_type === 'email_paste' || row.source_type === 'email_forward' || /\.eml$/i.test(row.source_filename || '')) {
      const parsed = parseEml(rawContent);
      if (parsed.subject) updates.source_subject = parsed.subject;
      if (parsed.sender) updates.source_sender = parsed.sender;
      if (parsed.date) {
        const d = new Date(parsed.date);
        if (!isNaN(d.getTime())) updates.source_received_at = d.toISOString();
      }
      if (parsed.body && parsed.body.length > 0 && parsed.body.length < rawContent.length) {
        rawContent = parsed.body;
      }
    }

    updates.raw_content = rawContent;

    // Truncate for prompt
    const contentForAi = rawContent.slice(0, 20000);

    // Build context
    const [festivalsRes, conceptsRes, contractsRes, contactsRes] = await Promise.all([
      sb.from('festivals').select('id, slug, name, start_date, end_date'),
      sb.from('concepts').select('id, slug, name'),
      row.hint_festival_id
        ? sb.from('festival_contracts').select('id, festival_id, concept_id, concept_alias, operating_entity, contract_status').eq('festival_id', row.hint_festival_id)
        : Promise.resolve({ data: [] }),
      row.hint_festival_id
        ? sb.from('festival_contacts').select('id, full_name, role, email, phone, organization').eq('festival_id', row.hint_festival_id)
        : Promise.resolve({ data: [] }),
    ]);

    let rules: unknown = [];
    if (row.hint_festival_id && festivalsRes.data) {
      const f = festivalsRes.data.find((x: any) => x.id === row.hint_festival_id);
      if (f) {
        const { data: rulesData } = await sb.rpc('get_active_rules_for_festival', { festival_slug: f.slug });
        rules = rulesData || [];
      }
    } else {
      const { data: allRules } = await sb.from('cross_festival_rules').select('id, rule_name, rule_description, severity, applies_to_festivals, category').eq('active', true);
      rules = allRules || [];
    }

    const systemPrompt = `You are an intelligence parser for The Fish Project's festival operations system.

Read incoming content and produce structured DB updates that match the schema below.

═══ TABLES YOU CAN PROPOSE UPDATES TO ═══

1. festival_action_items (insert) — fields: title, description, due_date, priority, owner. Provide festival_slug, optionally concept_slug.
2. festival_open_questions (insert) — fields: question, context, question_type, priority, decision_owner, deadline, blocking_what.
3. festival_contracts (update) — fields: contract_status, contract_signed_date, signing_platform, contract_value_dkk, payment_terms, payment_status, counterparty_name, counterparty_cvr, key_obligations, contract_signed_by. Use match_by.festival_contract_id_lookup with festival_slug+concept_slug, or match_by.id.
4. festival_facade (update) — fields: design_status, material_orders_status, material_deadline, print_deadline, festival_approval_received_at, notes. Use match_by.festival_contract_id_lookup with festival_slug+concept_slug.
5. festival_safety (update) — fields: gas_safety_status, gas_safety_date, food_authority_status, food_authority_inspection_date, electrical_certification_status, additional_notes. festival_slug required.
6. festival_accommodation (insert) — fields: accommodation_type, provider_name, address, check_in_date, check_out_date, capacity, cost_dkk, payment_status, confirmation_number, contact_name, contact_phone, contact_email, notes. festival_slug required.
7. festival_timeline_event (insert) — fields: event_type, event_date, event_time, location, responsible_party, title, notes, status.
8. festival_contacts (insert/update) — fields: full_name, role, email, phone, organization, contact_type, is_primary, notes, last_contact_date. festival_slug required. For update use match_by.id with existing contact id.

═══ FESTIVALS ═══
${JSON.stringify(festivalsRes.data || [], null, 0)}

═══ CONCEPTS ═══
${JSON.stringify(conceptsRes.data || [], null, 0)}

═══ ACTIVE RULES (do not propose updates that violate these) ═══
${JSON.stringify(rules, null, 0)}

═══ EXISTING CONTACTS (for matching by email) ═══
${JSON.stringify(contactsRes.data || [], null, 0)}

═══ EXISTING CONTRACTS ═══
${JSON.stringify(contractsRes.data || [], null, 0)}

═══ INSTRUCTIONS ═══
Return ONLY valid JSON in this exact structure:

{
  "summary": "one-line description",
  "confidence": 0.92,
  "festival_matches": [{"slug": "tinderbox-2026", "confidence": 0.95}],
  "proposed_updates": [
    {
      "table": "festival_facade",
      "action": "update",
      "festival_slug": "tinderbox-2026",
      "concept_slug": "fish-chips",
      "match_by": {"festival_contract_id_lookup": {"festival_slug": "tinderbox-2026", "concept_slug": "fish-chips"}},
      "fields": {"design_status": "festival_approved", "festival_approval_received_at": "2026-05-09T10:00:00Z"},
      "confidence": 0.90,
      "reasoning": "Lisbet explicitly approved atmosphere images"
    }
  ],
  "warnings": [],
  "questions_to_ask_human": []
}

Rules:
- Never propose updates with confidence < 0.50; surface as questions_to_ask_human instead.
- Always include reasoning per proposed_update.
- Respect all active rules. Violations → warnings.
- Parse Danish, English, Romanian dates. Default timezone CET/CEST.
- For contacts: match existing by email first, then name+organization.`;

    const userMsg = `<content>\n${contentForAi}\n</content>\n\n<hints>\n${JSON.stringify({
      festival_id: row.hint_festival_id,
      concept_ids: row.hint_concept_ids,
      card_types: row.hint_card_types,
      notes: row.hint_notes,
      source_type: row.source_type,
      source_subject: updates.source_subject || row.source_subject,
      source_sender: updates.source_sender || row.source_sender,
    })}\n</hints>\n\nReturn proposed updates as JSON.`;

    if (!ANTHROPIC_KEY) throw new Error('No Anthropic API key configured');

    const t0 = Date.now();
    const model = 'claude-opus-4-20250514';
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    const duration = Date.now() - t0;
    const aiJson = await aiRes.json();

    if (!aiRes.ok) {
      await sb.from('intelligence_ingestion').update({
        status: 'failed',
        error_log: JSON.stringify(aiJson).slice(0, 2000),
        ...updates,
      }).eq('id', ingestion_id);
      return new Response(JSON.stringify({ error: 'AI call failed', detail: aiJson }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const text = aiJson?.content?.[0]?.text || '';
    let parsed: any;
    try {
      parsed = JSON.parse(stripJsonFences(text));
    } catch {
      // try to extract JSON object
      const m = text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
      else throw new Error('AI response not parseable as JSON');
    }

    await sb.from('intelligence_ingestion').update({
      ...updates,
      status: 'parsed',
      parsed_at: new Date().toISOString(),
      parse_model: model,
      parse_input_tokens: aiJson?.usage?.input_tokens ?? null,
      parse_output_tokens: aiJson?.usage?.output_tokens ?? null,
      parse_duration_ms: duration,
      parse_confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      ai_summary: parsed.summary || null,
      ai_proposed_updates: parsed.proposed_updates || [],
      ai_warnings: parsed.warnings || [],
    }).eq('id', ingestion_id);

    return new Response(JSON.stringify({ ok: true, parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    try {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      const body = await req.clone().json().catch(() => ({}));
      if (body?.ingestion_id) {
        await sb.from('intelligence_ingestion').update({
          status: 'failed', error_log: msg.slice(0, 2000),
        }).eq('id', body.ingestion_id);
      }
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
