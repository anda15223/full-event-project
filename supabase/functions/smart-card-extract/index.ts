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
  return "";
}

async function downloadFileBase64(url: string): Promise<{ b64: string; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed ${r.status}`);
  const mime = r.headers.get("content-type") || "application/octet-stream";
  const buf = new Uint8Array(await r.arrayBuffer());
  // Encode in chunks to avoid call-stack overflow on large files
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk) as any);
  }
  return { b64: btoa(bin), mime };
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
  equipment_list: `This is an EQUIPMENT LIST (supplier offer, packing list, photo of a handwritten list, kitchen inventory, or rental quote).
Perform careful OCR — read EVERY single item, even if the document is a phone photo or scan.

Organise into these sections (omit only if truly nothing applies):

1. "Supplier / source" — lines: supplier or shop name, contact person, phone, email, document date, quote/order number.
2. "Cooking equipment" — stoves, ovens, fryers, grills, induction plates, gas burners, microwaves, salamanders, etc.
3. "Prep equipment" — tables, cutting boards, mixers, slicers, blenders, scales, peelers.
4. "Cold equipment" — fridges, freezers, ice machines, cold tables (only if mixed in this list — otherwise skip; cooling has its own card).
5. "Serving & front-of-house" — counters, heat lamps, display units, trays, baskets.
6. "Small wares & tools" — knives, pots, pans, ladles, tongs, containers, GN trays, gloves, aprons.
7. "Consumables" — packaging, cups, napkins, gas bottles, cleaning supplies.
8. "Pricing" — one line per cost item: label = item, value = unit price (with currency), quantity = qty, notes = total / VAT.
9. "Deadlines & delivery" — order deadline, delivery date, pickup/return date — with due_date in ISO format if parseable.

For EVERY line, fill these fields when present in the document:
  • label   = item name (e.g. "Gas burner 2-ring")
  • value   = size/spec/model (e.g. "70x70 cm", "10 kW", "model XYZ")
  • quantity = how many (e.g. "4", "2 stk", "1 set")
  • notes   = condition (new/used), brand, owner ("ours" / "rented" / "to buy"), or any extra detail
  • status  = "ordered" / "delivered" / "to_buy" / "have" if discoverable

Be exhaustive. Do not summarise — list every distinct item on its own line so the user can edit/check off each one.`,
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

  const summaryInstruction = `\n\nIMPORTANT:
- Always populate the "summary" field with a thorough plain-text summary (5-15 lines) of EVERYTHING you can read in the document — supplier, items, prices, dates, addresses, contacts, notes. This is the user's safety net if structured extraction misses something.
- Then, in addition, organise the same information into the requested sections + lines.
- If the document is a scan / image / unclear, do your best OCR and still write the summary with whatever you can read.`;

  let userContent: any;
  const text = await downloadFileText(file_url, mime_type || "");
  if (text) {
    userContent = `${cardPrompt}${summaryInstruction}\n\nDocument content:\n${text.slice(0, 60000)}`;
  } else {
    // Binary file: send bytes as base64 to Gemini vision (works for PDF + images).
    try {
      const { b64, mime: detectedMime } = await downloadFileBase64(file_url);
      const effectiveMime = mime_type || detectedMime;
      const isImage = /^image\//i.test(effectiveMime);
      const isPdf = /pdf/i.test(effectiveMime) || /\.pdf$/i.test(file_name || "");

      if (isImage || isPdf) {
        userContent = [
          { type: "text", text: cardPrompt + summaryInstruction + `\n\nFile name: ${file_name}` },
          {
            type: "image_url",
            image_url: { url: `data:${isPdf ? "application/pdf" : effectiveMime};base64,${b64}` },
          },
        ];
      } else {
        userContent = `${cardPrompt}${summaryInstruction}\n\nFile name: ${file_name}\nMIME: ${effectiveMime}\n(Binary file the AI cannot read directly — produce sensible default sections from the filename so the user can edit.)`;
      }
    } catch (e) {
      console.error("base64 fetch failed:", e);
      userContent = `${cardPrompt}${summaryInstruction}\n\nFile name: ${file_name}\n(Could not fetch binary contents.)`;
    }
  }

  let extracted: any;
  try {
    extracted = await callAI(
      [
        {
          role: "system",
          content:
            "You read messy real-world documents (including scanned PDFs and photos) and structure them into clean editable sections + lines for a festival operations app. Always perform OCR on images/PDFs. Always fill the summary field, even when structure is unclear.",
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

  // Always prepend a "Document summary" section so the user has the raw AI read
  // and can manually split it into other sections/lines.
  const summaryText = (extracted.summary || "").trim();
  const sectionsToCreate: any[] = [];
  if (summaryText) {
    sectionsToCreate.push({
      title: `📄 Document summary — ${file_name || "uploaded file"}`,
      description: "Raw AI read of the document. Move/split any line into the right section manually.",
      lines: [
        { label: "Summary", value: summaryText, notes: "Source: AI OCR/read of the uploaded document." },
      ],
    });
  }
  for (const s of extracted.sections || []) sectionsToCreate.push(s);
  extracted.sections = sectionsToCreate;

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

  // ---- Per-card validation: flag missing required info ----
  const warnings = validateExtraction(card_key, extracted.sections || []);

  await sb("PATCH", `smart_files?id=eq.${file_id}`, {
    parse_status: "done",
    ai_summary: extracted.summary || null,
    warnings,
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

  return { ok: true, sections_created: created.length, summary: extracted.summary, warnings };
}

/* ---------------- Validators per card_key ---------------- */
type ValidationWarning = { field: string; message: string; severity: "error" | "warn" };

function validateExtraction(card_key: string, sections: any[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const allLines = sections.flatMap((s: any) =>
    (s.lines || []).map((l: any) => ({ ...l, _section: (s.title || "").toLowerCase() })),
  );
  const findLine = (re: RegExp) =>
    allLines.find((l: any) =>
      re.test(`${l.label || ""} ${l._section}`.toLowerCase()),
    );
  const hasNonEmpty = (v: any) => v != null && String(v).trim() !== "";

  if (card_key === "cooling_storage") {
    // 1. At least one fridge/freezer/container UNIT line
    const unitLines = allLines.filter((l: any) =>
      /(fridge|freezer|container|cold|køl|frys|kühl|gefrier)/i.test(
        `${l.label || ""} ${l._section || ""}`,
      ),
    );
    if (!unitLines.length) {
      warnings.push({
        field: "unit_type",
        message: "No fridge / freezer / container units detected. Add the unit type(s).",
        severity: "error",
      });
    } else {
      // For each unit, check size + quantity
      const missingSize = unitLines.filter((l: any) => !hasNonEmpty(l.value));
      const missingQty = unitLines.filter((l: any) => !hasNonEmpty(l.quantity));
      if (missingSize.length) {
        warnings.push({
          field: "unit_size",
          message: `${missingSize.length} cooling unit(s) missing size/capacity.`,
          severity: "error",
        });
      }
      if (missingQty.length) {
        warnings.push({
          field: "unit_quantity",
          message: `${missingQty.length} cooling unit(s) missing quantity.`,
          severity: "error",
        });
      }
    }

    // 2. Invoice deadline
    const invoiceDeadline = findLine(/invoice|payment|betaling|faktura|pay.*by|due/);
    if (!invoiceDeadline || (!hasNonEmpty(invoiceDeadline.value) && !hasNonEmpty(invoiceDeadline.due_date))) {
      warnings.push({
        field: "invoice_deadline",
        message: "No invoice/payment deadline found.",
        severity: "warn",
      });
    }

    // 3. Delivery deadline
    const deliveryDeadline = findLine(/deliver|drop.?off|on.?site|levering|leverings/);
    if (!deliveryDeadline || (!hasNonEmpty(deliveryDeadline.value) && !hasNonEmpty(deliveryDeadline.due_date))) {
      warnings.push({
        field: "delivery_deadline",
        message: "No on-site delivery deadline found.",
        severity: "error",
      });
    }

    // 4. Supplier name
    const supplier = allLines.find((l: any) =>
      /supplier|vendor|firma|company|leverandør/i.test(`${l.label || ""} ${l._section || ""}`),
    );
    if (!supplier || !hasNonEmpty(supplier.value)) {
      warnings.push({
        field: "supplier",
        message: "Supplier name missing.",
        severity: "warn",
      });
    }

    // 5. Pricing
    const pricing = allLines.find((l: any) =>
      /(price|cost|kr|dkk|eur|usd|amount|total|pris)/i.test(
        `${l.label || ""} ${l.value || ""} ${l._section || ""}`,
      ),
    );
    if (!pricing) {
      warnings.push({
        field: "pricing",
        message: "No pricing detected.",
        severity: "warn",
      });
    }

    // 6. Delivery plan section presence
    const deliveryPlan = sections.find((s: any) =>
      /delivery.*plan|delivery|drop|leverings/i.test(s.title || ""),
    );
    if (!deliveryPlan || !(deliveryPlan.lines || []).length) {
      warnings.push({
        field: "delivery_plan",
        message: "Delivery plan (address, time window, on-site contact) is missing.",
        severity: "warn",
      });
    }
  }

  return warnings;
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
