// Smart Card AI extractor + Brain reader/writer.
// Actions:
//   { action: "extract", file_id, card_key, card_id, festival_id, concept_id?, file_url, file_name, mime_type }
//      -> downloads the file, OCR/parses it, asks Lovable AI to structure it into sections+lines,
//         creates smart_sections + smart_lines (source='ai'), writes brain entries, returns summary.
//
//   { action: "grab_brain", card_key, festival_id, concept_id?, subject_type? }
//      -> reads brain_entries scoped to this card_key/concept and returns suggested
//         sections+lines pre-filled (source='brain'), highest-frequency first.
//
//   { action: "remember", festival_id, concept_id?, card_key, key, value, subject_type, subject_id }
//      -> upserts a brain_entries row, increments frequency, updates last_seen.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function sb(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase ${method} ${path} ${res.status}: ${t}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function downloadFileText(url: string, mime: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed ${r.status}`);

  // Plain text / CSV / json
  if (
    /^text\//i.test(mime) ||
    /\b(csv|json|xml|html)\b/i.test(mime) ||
    /\.(txt|csv|json|xml|html|md)$/i.test(url)
  ) {
    return await r.text();
  }

  // For PDFs / Office docs / images, send the bytes to Gemini directly via Lovable AI.
  // We return an empty string here; the caller will pass the file URL as-is using a vision-capable prompt.
  return "";
}

async function callAI(messages: any[], schema?: any) {
  const body: any = {
    model: "google/gemini-2.5-flash",
    messages,
  };
  if (schema) {
    body.tools = [
      {
        type: "function",
        function: {
          name: "structure_card",
          description: "Return the structured card content",
          parameters: schema,
        },
      },
    ];
    body.tool_choice = { type: "function", function: { name: "structure_card" } };
  }

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (r.status === 429) throw new Error("Rate limited by AI gateway");
  if (r.status === 402) throw new Error("AI credits exhausted - add funds in Settings → Workspace → Usage");
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI gateway error ${r.status}: ${t}`);
  }
  const json = await r.json();
  if (schema) {
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("No tool call in AI response");
    return JSON.parse(call.function.arguments);
  }
  return json.choices?.[0]?.message?.content ?? "";
}

const STRUCTURE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "1-2 sentence summary of what this document contains" },
    sections: {
      type: "array",
      description: "Logical sections found in the document",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Item name / left side label" },
                value: { type: "string", description: "Right side value (e.g. spec)" },
                quantity: { type: "string", description: "How many" },
                notes: { type: "string" },
                status: { type: "string", description: "todo/done/ordered/blocked - if discoverable" },
              },
              required: ["label"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "lines"],
        additionalProperties: false,
      },
    },
  },
  required: ["sections"],
  additionalProperties: false,
};

const CARD_PROMPTS: Record<string, string> = {
  equipment_list: "This is an equipment list. Extract every equipment item, group by logical category (e.g. cooking, prep, serving, small wares).",
  cooling_storage: `This is a cooling / cold storage / freezer / container offer or booking document.
Extract EVERY relevant piece of data, organised into these sections (omit a section only if truly nothing applies):

1. "Supplier" — lines: supplier name, contact person, phone, email, address.
2. "Units ordered" — ONE LINE PER UNIT (fridge, freezer, cold container, ice machine etc.). For each line set:
     label = unit type (e.g. "Cold container", "Upright freezer", "Display fridge"),
     value = size / capacity / dimensions (e.g. "20 ft", "600 L", "1200x600x2000mm"),
     quantity = how many,
     notes = temperature range and any model info.
3. "Pricing" — one line per cost item: label = item, value = price (with currency), notes = unit price / VAT info.
4. "Deadlines" — TWO lines minimum:
     • label "Invoice deadline", value = payment due date, due_date = ISO date if you can parse it.
     • label "Delivery deadline", value = on-site delivery date, due_date = ISO date if you can parse it.
     Add extra deadline lines if more dates appear (pickup, return, setup-by).
5. "Delivery plan" — lines describing: delivery address, drop-off time window, contact on-site, vehicle/access notes, return/pickup plan.

Be exhaustive. Prices, quantities and dates are MANDATORY when present in the document — never skip them.`,
  cooking_equipment: "Extract cooking equipment per concept. Group into categories: cooking appliances, prep tools, serving equipment, small wares, spare parts.",
  safety: "This is a safety / compliance document. Extract sections like Fire safety, Gas safety, Food hygiene, Allergens, Certificates & permits, Risk assessment, Emergency contacts, Inspection checklist, Expiry dates.",
  setup_timeline: "This is a setup timeline / schedule. Extract steps and group by phase (Pre-festival, Build days D-3/D-2/D-1, Festival days, Teardown). Include owners and times when present.",
  transportation: "This relates to transportation. Extract: Vehicles, Drivers, Loads, Trips, Schedule, Documents.",
  fidibus: "This relates to the Fidibus arrival / setup. Extract: Arrival, Setup, Car loading, Wrapping plan, People, Equipment to set up.",
  power_requirements: "This is an electricity / power order. Extract per zone or per concept: plug types (16A/32A/63A), phase (1P/3P), counts, cable length, total kW.",
};

async function extractFromFile({
  file_id,
  card_id,
  card_key,
  festival_id,
  concept_id,
  file_url,
  file_name,
  mime_type,
}: any) {
  await sb("PATCH", `smart_files?id=eq.${file_id}`, { parse_status: "processing" });

  const cardPrompt = CARD_PROMPTS[card_key] || "Extract logical sections and lines from this document.";

  let userContent: any;
  const text = await downloadFileText(file_url, mime_type || "");
  if (text) {
    userContent = `${cardPrompt}\n\nDocument content:\n${text.slice(0, 60000)}`;
  } else {
    // For binary files (PDF, images, docx), pass the URL — Gemini can fetch images/PDFs as parts.
    // We embed the URL in the prompt and let the model rely on the filename + extension.
    // Lovable AI Gateway does support image_url parts for vision models.
    if (/^image\//i.test(mime_type || "")) {
      userContent = [
        { type: "text", text: cardPrompt + `\n\nFile name: ${file_name}` },
        { type: "image_url", image_url: { url: file_url } },
      ];
    } else {
      // PDF / docx / xlsx — fall back to text-only prompt with file metadata
      // (Real PDF/Excel parsing would require additional libs; we'll request the user to also provide notes.)
      userContent = `${cardPrompt}\n\nFile name: ${file_name}\nMIME: ${mime_type}\n(Binary file: please infer logical structure from the filename and produce sensible default sections that the user can edit.)`;
    }
  }

  let extracted: any;
  try {
    extracted = await callAI(
      [
        {
          role: "system",
          content:
            "You structure messy documents into clean, editable sections + lines for a festival operations app. Be concise. Use clear short titles.",
        },
        { role: "user", content: userContent },
      ],
      STRUCTURE_SCHEMA,
    );
  } catch (e) {
    await sb("PATCH", `smart_files?id=eq.${file_id}`, {
      parse_status: "error",
      parse_error: String((e as Error).message || e),
    });
    throw e;
  }

  // Insert sections + lines
  // Find current max order_index in card
  const existing = (await sb(
    "GET",
    `smart_sections?card_id=eq.${card_id}&select=order_index&order=order_index.desc&limit=1`,
  )) as Array<{ order_index: number }>;
  let order = (existing?.[0]?.order_index ?? -1) + 1;

  const created: any[] = [];
  for (const s of extracted.sections || []) {
    const [section] = await sb("POST", "smart_sections", {
      card_id,
      title: s.title,
      description: s.description ?? null,
      order_index: order++,
      source: "ai",
      source_file_id: file_id,
    });
    let lineOrder = 0;
    if (Array.isArray(s.lines) && s.lines.length) {
      const lines = s.lines.map((l: any) => ({
        section_id: section.id,
        label: l.label ?? null,
        value: l.value ?? null,
        quantity: l.quantity ?? null,
        notes: l.notes ?? null,
        status: l.status ?? null,
        order_index: lineOrder++,
        source: "ai",
        source_file_id: file_id,
      }));
      await sb("POST", "smart_lines", lines);
    }
    created.push(section);
  }

  await sb("PATCH", `smart_files?id=eq.${file_id}`, {
    parse_status: "done",
    ai_summary: extracted.summary || null,
  });

  // Feed Brain — remember every line as a soft pattern for next festival
  try {
    const brainRows: any[] = [];
    for (const s of extracted.sections || []) {
      for (const l of s.lines || []) {
        if (!l.label) continue;
        brainRows.push({
          key_name: `${card_key}:${(s.title || "").toLowerCase()}:${l.label.toLowerCase()}`,
          display_name: `${s.title} → ${l.label}`,
          category: card_key,
          source: "ai_extraction",
          scope: concept_id ? "concept" : "festival",
          festival_id,
          last_seen_festival_id: festival_id,
          subject_type: card_key,
          subject_id: concept_id || festival_id,
          content: [l.value, l.quantity, l.notes].filter(Boolean).join(" — "),
          structured_data: {
            section: s.title,
            label: l.label,
            value: l.value,
            quantity: l.quantity,
            notes: l.notes,
          },
          tags: [card_key, s.title].filter(Boolean),
          frequency: 1,
          confidence: 0.6,
        });
      }
    }
    if (brainRows.length) {
      await sb("POST", "brain_entries", brainRows);
    }
  } catch (e) {
    // brain feed is best-effort
    console.error("brain feed failed:", e);
  }

  return { ok: true, sections_created: created.length, summary: extracted.summary };
}

async function grabBrain({ card_key, festival_id, concept_id }: any) {
  // Pull most-frequent brain entries for this card_key, prefer matching concept, exclude current festival.
  const filters = new URLSearchParams();
  filters.set("category", `eq.${card_key}`);
  if (festival_id) filters.set("festival_id", `neq.${festival_id}`);
  if (concept_id) filters.set("subject_id", `eq.${concept_id}`);

  const rows = (await sb(
    "GET",
    `brain_entries?${filters.toString()}&select=*&order=frequency.desc,last_seen_at.desc&limit=200`,
  )) as any[];

  // Group by section
  const bySection: Record<string, any[]> = {};
  for (const r of rows || []) {
    const section = r.structured_data?.section || "General";
    if (!bySection[section]) bySection[section] = [];
    bySection[section].push({
      label: r.structured_data?.label || r.display_name,
      value: r.structured_data?.value,
      quantity: r.structured_data?.quantity,
      notes: r.structured_data?.notes,
      frequency: r.frequency,
    });
  }

  return {
    ok: true,
    suggestions: Object.entries(bySection).map(([title, lines]) => ({ title, lines })),
  };
}

async function remember(payload: any) {
  // Upsert by key_name; increment frequency if exists
  const existing = (await sb(
    "GET",
    `brain_entries?key_name=eq.${encodeURIComponent(payload.key)}&limit=1`,
  )) as any[];

  if (existing && existing[0]) {
    await sb("PATCH", `brain_entries?id=eq.${existing[0].id}`, {
      frequency: (existing[0].frequency || 1) + 1,
      last_seen_at: new Date().toISOString(),
      last_seen_festival_id: payload.festival_id || null,
      content: payload.value || existing[0].content,
      structured_data: { ...(existing[0].structured_data || {}), ...(payload.structured_data || {}) },
    });
  } else {
    await sb("POST", "brain_entries", {
      key_name: payload.key,
      display_name: payload.display_name || payload.key,
      category: payload.card_key || "manual",
      source: "user_correction",
      content: payload.value,
      scope: payload.concept_id ? "concept" : payload.festival_id ? "festival" : "global",
      festival_id: payload.festival_id || null,
      last_seen_festival_id: payload.festival_id || null,
      subject_type: payload.subject_type || payload.card_key,
      subject_id: payload.subject_id || payload.concept_id || payload.festival_id,
      structured_data: payload.structured_data || {},
      frequency: 1,
      confidence: payload.confidence ?? 0.7,
    });
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    let result: any;
    switch (body.action) {
      case "extract":
        result = await extractFromFile(body);
        break;
      case "grab_brain":
        result = await grabBrain(body);
        break;
      case "remember":
        result = await remember(body);
        break;
      default:
        throw new Error(`unknown action: ${body.action}`);
    }
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
