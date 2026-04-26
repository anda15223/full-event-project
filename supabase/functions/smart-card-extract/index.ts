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

async function sb(
  method: string,
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
) {
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

// SheetJS for XLSX/XLS parsing in Deno
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

async function downloadFileText(
  url: string,
  mime: string,
  fileName = "",
): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed ${r.status}`);

  const isXlsx =
    /spreadsheetml|excel|ms-excel/i.test(mime) ||
    /\.(xlsx|xls|xlsm|xlsb|ods)$/i.test(url) ||
    /\.(xlsx|xls|xlsm|xlsb|ods)$/i.test(fileName);

  if (isXlsx) {
    try {
      const buf = new Uint8Array(await r.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array" });
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        // Render as CSV — preserves rows/columns the AI can read
        const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
        if (csv && csv.trim()) {
          parts.push(`===== Sheet: ${sheetName} =====\n${csv}`);
        }
      }
      return parts.join("\n\n");
    } catch (e) {
      console.error("xlsx parse failed:", e);
      return "";
    }
  }

  // Plain text / CSV / json
  if (
    /^text\//i.test(mime) ||
    /\b(csv|json|xml|html)\b/i.test(mime) ||
    /\.(txt|csv|json|xml|html|md)$/i.test(url) ||
    /\.(txt|csv|json|xml|html|md)$/i.test(fileName)
  ) {
    return await r.text();
  }
  return "";
}

async function downloadFileBase64(
  url: string,
): Promise<{ b64: string; mime: string }> {
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
    body.tool_choice = {
      type: "function",
      function: { name: "structure_card" },
    };
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
  if (r.status === 402)
    throw new Error(
      "AI credits exhausted - add funds in Settings → Workspace → Usage",
    );
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
    summary: {
      type: "string",
      description: "1-2 sentence summary of what this document contains",
    },
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
                label: {
                  type: "string",
                  description: "Item name / left side label",
                },
                value: {
                  type: "string",
                  description: "Right side value (e.g. spec)",
                },
                quantity: { type: "string", description: "How many" },
                notes: { type: "string" },
                status: {
                  type: "string",
                  description: "todo/done/ordered/blocked - if discoverable",
                },
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
  equipment_list: `This is an EQUIPMENT LIST (supplier offer, packing list, photo of a handwritten list, kitchen inventory, rental quote, or a multi-sheet Excel/CSV).
Perform careful OCR — read EVERY single item, even if the document is a phone photo or scan.
If the document contains MULTIPLE sheets (marked "===== Sheet: <name> ====="), treat EACH sheet as its own section (use the sheet name as the section title) AND ALSO map items into the canonical sections below when possible. Read EVERY row of EVERY sheet — never skip rows.

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
  cooking_equipment:
    "Extract cooking equipment per concept. Group into categories: cooking appliances, prep tools, serving equipment, small wares, spare parts.",
  safety:
    "This is a safety / compliance document. Extract sections like Fire safety, Gas safety, Food hygiene, Allergens, Certificates & permits, Risk assessment, Emergency contacts, Inspection checklist, Expiry dates.",
  setup_timeline:
    "This is a setup timeline / schedule. Extract steps and group by phase (Pre-festival, Build days D-3/D-2/D-1, Festival days, Teardown). Include owners and times when present.",
  transportation:
    "This relates to transportation. Extract: Vehicles, Drivers, Loads, Trips, Schedule, Documents.",
  fidibus:
    "This relates to the Fidibus arrival / setup. Extract: Arrival, Setup, Car loading, Wrapping plan, People, Equipment to set up.",
  power_requirements:
    "This is an electricity / power order. Extract per zone or per concept: plug types (16A/32A/63A), phase (1P/3P), counts, cable length, total kW.",
  concepts: `This is the CONCEPTS card — the food concepts/booths sold at the festival.
Produce ONE section per concept (e.g. "Crispy Chicken", "Smash Burger", "Loaded Fries"). Inside each concept-section, lines describe that concept ONLY:
  • label "Zone" / value = zone or location name
  • label "Tent size" / value = e.g. "3x6m"
  • label "Products sold" / value = comma-separated menu items
  • label "Sales hours Thu/Fri/Sat/Sun" / value = "12:00–22:00"
  • label "Wristbands (normal/black/max)" / value = counts
  • label "Power baseline" / value = e.g. "63A 3P"
  • label "Gas required" / value = "yes/no" + supplier
Do NOT create generic sections like "Operations" or "General info". If the Brain source is a broad operations document, ONLY pull rows that clearly describe a concept/booth. If nothing concept-specific is present, return an empty sections array.`,
  introduction: `This is the INTRODUCTION card — high-level festival facts.
Produce ONE section "Festival overview" with lines: Name, Dates, Location, Organiser, Contact email, Contact phone, Expected guests, Site address, Load-in date, Load-out date, Crew count, Notes. Skip any field not in the source.`,
  facade: `This is the FACADE / branding card. Produce sections:
1. "Design" — colours, logo files, materials.
2. "Dimensions" — front/side/back panel sizes.
3. "Production" — supplier, deadline, cost.
4. "Install" — install date, contact, tools needed.
Only include lines actually present in the source.`,
  recipes: `This is the RECIPES card. Produce ONE section per dish/product. Lines: Ingredient name (label), quantity (value), unit/notes (notes). Add a final line "Allergens" with the allergen list. Skip if source has no recipe data.`,
  trolley: `This is the BC TROLLEY packing card. Extract the actual trolley inventory/checklist from photos, OCR text, Brain notes, or corrected card data.
Create one section per source list/concept when possible. Every physical item must become its own line.
For each line:
  • label = item name (bowls, whisker, knives, napkins, gloves, garbage bags, etc.)
  • quantity = the count/text after ':' or trailing quantity (e.g. "2", "5000 pcs", "S M L")
  • value = size/spec only if present
  • notes = category/source if useful (cleaning, packaging, small equipment)
Do not skip cleaning/packaging lists. Do not summarise — preserve every item as editable checklist rows.`,
  extra_details: `This is the EXTRA DETAILS card — miscellaneous facts that don't fit elsewhere. Produce sections grouped by topic (e.g. "Wifi", "Waste", "Water"). Each line: label = fact name, value = the fact.`,
};

const isTrolleyCardKey = (key: string) => /^trolley[_-]/i.test(String(key || ""));
const cardPromptForKey = (key: string) => CARD_PROMPTS[key] || (isTrolleyCardKey(key) ? CARD_PROMPTS.trolley : "Extract logical sections and lines from this document.");

async function extractFromFile({
  file_id,
  card_id,
  card_key,
  festival_id,
  concept_id,
  file_url,
  file_name,
  mime_type,
  dry_run,
}: any) {
  await sb("PATCH", `smart_files?id=eq.${file_id}`, {
    parse_status: "processing",
  });

  const cardPrompt = cardPromptForKey(card_key);

  const summaryInstruction = `\n\nIMPORTANT:
- Always populate the "summary" field with a thorough plain-text summary (5-15 lines) of EVERYTHING you can read in the document — supplier, items, prices, dates, addresses, contacts, notes. This is the user's safety net if structured extraction misses something.
- Then, in addition, organise the same information into the requested sections + lines.
- If the document is a scan / image / unclear, do your best OCR and still write the summary with whatever you can read.`;

  let userContent: any;
  const text = await downloadFileText(
    file_url,
    mime_type || "",
    file_name || "",
  );
  if (text) {
    userContent = `${cardPrompt}${summaryInstruction}\n\nDocument content (parsed from ${file_name}):\n${text.slice(0, 180000)}`;
  } else {
    // Binary file: send bytes as base64 to Gemini vision (works for PDF + images).
    try {
      const { b64, mime: detectedMime } = await downloadFileBase64(file_url);
      const effectiveMime = mime_type || detectedMime;
      const isImage = /^image\//i.test(effectiveMime);
      const isPdf =
        /pdf/i.test(effectiveMime) || /\.pdf$/i.test(file_name || "");

      if (isImage || isPdf) {
        userContent = [
          {
            type: "text",
            text:
              cardPrompt + summaryInstruction + `\n\nFile name: ${file_name}`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${isPdf ? "application/pdf" : effectiveMime};base64,${b64}`,
            },
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
      description:
        "Raw AI read of the document. Move/split any line into the right section manually.",
      lines: [
        {
          label: "Summary",
          value: summaryText,
          notes: "Source: AI OCR/read of the uploaded document.",
        },
      ],
    });
  }
  for (const s of extracted.sections || []) sectionsToCreate.push(s);
  extracted.sections = sectionsToCreate;

  // ---- Schema sanitiser: drop dump-like sections / lines that don't fit the card ----
  const sanitised = sanitizeSections(card_key, extracted.sections || []);
  extracted.sections = sanitised.sections;
  if (sanitised.rejected.length) {
    console.log(
      `[sanitiser] ${card_key}: rejected`,
      sanitised.rejected,
    );
  }

  // ---- Per-card validation: flag missing required info ----
  const warnings = validateExtraction(card_key, extracted.sections || []);

  // === DRY RUN: store the proposal but DO NOT create sections/lines yet ===
  if (dry_run) {
    await sb("PATCH", `smart_files?id=eq.${file_id}`, {
      parse_status: "preview",
      ai_summary: extracted.summary || null,
      warnings,
      meta: { proposal: extracted, proposed_at: new Date().toISOString() },
    });

    // Post the AI summary into the card's chat thread so it shows up in the chat box
    try {
      const summaryMsg =
        `📄 **${file_name || "Uploaded file"}** — AI read complete\n\n` +
        `${extracted.summary || "(no summary)"}\n\n` +
        `**Proposed structure:** ${(extracted.sections || []).length} section(s), ` +
        `${(extracted.sections || []).reduce((n: number, s: any) => n + (s.lines?.length || 0), 0)} line(s).\n\n` +
        `Review the preview on the card and click **Apply** to add it, or **Discard** to throw it away.`;
      await sb("POST", "smart_chat_messages", {
        card_id,
        role: "assistant",
        content: summaryMsg,
      });
    } catch (e) {
      console.error("chat post failed:", e);
    }

    return {
      ok: true,
      preview: true,
      sections_proposed: (extracted.sections || []).length,
      summary: extracted.summary,
      proposal: extracted,
      warnings,
    };
  }

  // === REAL WRITE: insert sections + lines ===
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
    warnings,
    meta: {},
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

  return {
    ok: true,
    sections_created: created.length,
    summary: extracted.summary,
    warnings,
  };
}

// Apply a previously-stored proposal (from dry_run) to the card.
async function applyProposal({
  file_id,
  card_id,
  card_key,
  festival_id,
  concept_id,
}: any) {
  const fileRows = (await sb(
    "GET",
    `smart_files?id=eq.${file_id}&select=*`,
  )) as any[];
  const file = fileRows?.[0];
  if (!file) throw new Error("file not found");
  const proposal = file?.meta?.proposal;
  if (!proposal || !Array.isArray(proposal.sections)) {
    throw new Error("No pending proposal to apply for this file");
  }

  const existing = (await sb(
    "GET",
    `smart_sections?card_id=eq.${card_id}&select=order_index&order=order_index.desc&limit=1`,
  )) as Array<{ order_index: number }>;
  let order = (existing?.[0]?.order_index ?? -1) + 1;

  const created: any[] = [];
  for (const s of proposal.sections) {
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

  // Clear the proposal, mark file as done
  const meta = { ...(file.meta || {}) };
  delete meta.proposal;
  delete meta.proposed_at;
  await sb("PATCH", `smart_files?id=eq.${file_id}`, {
    parse_status: "done",
    meta,
  });

  // Post a confirmation message to the chat
  try {
    await sb("POST", "smart_chat_messages", {
      card_id,
      role: "assistant",
      content: `✅ Applied ${created.length} section(s) from **${file.filename || "the uploaded file"}** to the card.`,
    });
  } catch (e) {
    console.error("chat post failed:", e);
  }

  // Feed Brain
  try {
    const brainRows: any[] = [];
    for (const s of proposal.sections) {
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
    if (brainRows.length) await sb("POST", "brain_entries", brainRows);
  } catch (e) {
    console.error("brain feed failed:", e);
  }

  return { ok: true, sections_created: created.length };
}

// Discard a pending proposal without writing anything.
async function discardProposal({ file_id, card_id }: any) {
  const fileRows = (await sb(
    "GET",
    `smart_files?id=eq.${file_id}&select=*`,
  )) as any[];
  const file = fileRows?.[0];
  if (!file) throw new Error("file not found");
  const meta = { ...(file.meta || {}) };
  delete meta.proposal;
  delete meta.proposed_at;
  await sb("PATCH", `smart_files?id=eq.${file_id}`, {
    parse_status: "discarded",
    meta,
  });
  try {
    await sb("POST", "smart_chat_messages", {
      card_id,
      role: "assistant",
      content: `🗑️ Discarded the AI proposal from **${file.filename || "the uploaded file"}**. The file is still attached.`,
    });
  } catch (e) {
    console.error("chat post failed:", e);
  }
  return { ok: true };
}

/* ---------------- Validators per card_key ---------------- */
type ValidationWarning = {
  field: string;
  message: string;
  severity: "error" | "warn";
};

function validateExtraction(
  card_key: string,
  sections: any[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const allLines = sections.flatMap((s: any) =>
    (s.lines || []).map((l: any) => ({
      ...l,
      _section: (s.title || "").toLowerCase(),
    })),
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
        message:
          "No fridge / freezer / container units detected. Add the unit type(s).",
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
    const invoiceDeadline = findLine(
      /invoice|payment|betaling|faktura|pay.*by|due/,
    );
    if (
      !invoiceDeadline ||
      (!hasNonEmpty(invoiceDeadline.value) &&
        !hasNonEmpty(invoiceDeadline.due_date))
    ) {
      warnings.push({
        field: "invoice_deadline",
        message: "No invoice/payment deadline found.",
        severity: "warn",
      });
    }

    // 3. Delivery deadline
    const deliveryDeadline = findLine(
      /deliver|drop.?off|on.?site|levering|leverings/,
    );
    if (
      !deliveryDeadline ||
      (!hasNonEmpty(deliveryDeadline.value) &&
        !hasNonEmpty(deliveryDeadline.due_date))
    ) {
      warnings.push({
        field: "delivery_deadline",
        message: "No on-site delivery deadline found.",
        severity: "error",
      });
    }

    // 4. Supplier name
    const supplier = allLines.find((l: any) =>
      /supplier|vendor|firma|company|leverandør/i.test(
        `${l.label || ""} ${l._section || ""}`,
      ),
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
        message:
          "Delivery plan (address, time window, on-site contact) is missing.",
        severity: "warn",
      });
    }
  }

  return warnings;
}

/* ---------------- Schema-based sanitiser ---------------- */
// Allowed line-label patterns per card. Lines whose label doesn't match are dropped.
const CARD_LINE_PATTERNS: Record<string, RegExp> = {
  concepts:
    /^(zone|location|tent.?size|tent|products?.?sold|menu|sales?.?hours?(.*?(thu|fri|sat|sun))?|opening.?hours?|wristbands?(.*?(normal|black|max|partout))?|power.?baseline|power|gas|gas.?supplier|notes?)$/i,
  introduction:
    /^(name|festival.?name|dates?|start.?date|end.?date|location|site.?address|address|organiser|organizer|contact.?(email|phone|name)?|email|phone|expected.?guests|guests|load.?[-_ ]?in|load.?[-_ ]?out|crew.?count|crew|notes?)$/i,
};

const DUMP_TITLE_PATTERNS: RegExp[] = [
  /^(general|misc|miscellaneous|other|operations?|document.?content|content|info|information|overview|notes?|details?|extracted|raw|dump|summary)$/i,
];

function isDumpTitle(title: string): boolean {
  const t = (title || "").trim();
  if (!t) return true;
  if (t.length > 80) return true;
  return DUMP_TITLE_PATTERNS.some((re) => re.test(t));
}

function isDumpLine(line: any): boolean {
  const label = String(line?.label || "").trim();
  const value = String(line?.value || "").trim();
  if (!label) return true;
  if (label.length > 80) return true;
  if (value.length > 400 && !line.quantity && !line.due_date) return true;
  return false;
}

function sanitizeSections(
  card_key: string,
  sections: any[],
): { sections: any[]; rejected: { title: string; reason: string }[] } {
  const rejected: { title: string; reason: string }[] = [];
  const labelRe = CARD_LINE_PATTERNS[card_key];
  const cleaned: any[] = [];

  for (const s of sections || []) {
    const title = String(s?.title || "").trim();
    if (isDumpTitle(title)) {
      rejected.push({ title: title || "(empty)", reason: "dump-like section title" });
      continue;
    }

    const keptLines: any[] = [];
    for (const l of s.lines || []) {
      if (isDumpLine(l)) continue;
      if (labelRe && !labelRe.test(String(l.label).trim())) continue;
      keptLines.push(l);
    }

    if (!keptLines.length) {
      rejected.push({
        title,
        reason: labelRe
          ? `no lines matched the ${card_key} schema`
          : "all lines were dump-like",
      });
      continue;
    }

    cleaned.push({ ...s, lines: keptLines });
  }

  return { sections: cleaned, rejected };
}

const CARD_BRAIN_HINTS: Record<string, string[]> = {
  concepts_brain: [
    "concept",
    "concepts",
    "contract",
    "email",
    "other",
    "facade",
    "power_requirements",
    "setup_timeline",
  ],
  intro: ["intro", "introduction", "contract", "email", "other"],
  equipment_list: ["equipment_list", "equipment", "other", "contract", "email"],
  cooling_storage: [
    "cooling_storage",
    "cooling",
    "equipment_list",
    "other",
    "contract",
    "email",
  ],
  cooking_equipment: [
    "cooking_equipment",
    "equipment_list",
    "equipment",
    "other",
    "contract",
    "email",
  ],
  safety_compliance: [
    "safety_compliance",
    "safety",
    "contract",
    "other",
    "email",
  ],
  setup_timeline: ["setup_timeline", "timeline", "contract", "email", "other"],
  transportation: ["transportation", "transport", "contract", "email", "other"],
  power_requirements: [
    "power_requirements",
    "power",
    "electric",
    "electricity",
    "contract",
    "email",
    "other",
  ],
  trolley: ["trolley", "bc trolley", "cleaning", "packaging", "packing", "inventory", "equipment_list", "equipment", "other"],
};

const CARD_BRAIN_TERMS: Record<string, RegExp> = {
  concepts_brain:
    /concept|stall|stand|bod|brand|menu|food|mad|gyros|creperie|chicks|fish|burger|zone|inside|camping|facade|sign/i,
  intro:
    /organiser|kontakt|contact|deadline|festival|address|location|phone|email|contract|aftale/i,
  equipment_list:
    /equipment|udstyr|table|tent|fridge|freezer|burner|oven|fryer|grill|container|inventory|packing/i,
  cooling_storage:
    /cool|cold|fridge|freezer|køl|frost|container|ice|temperature/i,
  cooking_equipment:
    /cooking|kitchen|burner|oven|fryer|grill|gas|stove|pan|pot/i,
  safety_compliance:
    /safety|fire|brand|gas|hygiene|allergen|certificate|permit|inspection|compliance/i,
  setup_timeline:
    /setup|timeline|schedule|deadline|arrival|build|teardown|pickup|delivery/i,
  transportation:
    /transport|vehicle|car|truck|driver|load|trip|parking|delivery|pickup/i,
  power_requirements:
    /power|electric|amp|kw|kwh|socket|plug|16a|32a|63a|phase|strøm/i,
  trolley:
    /trolley|bc trolley|packing|cleaning|packaging|inventory|stocklist|small equipment|bowls|whisk|kniv|knife|napkin|gloves|garbage|boxes|spatula|forks|serving/i,
};

function uniqRows(rows: any[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row?.id || row?.key_name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreBrainRow(
  row: any,
  cardKey: string,
  festivalId?: string,
  conceptId?: string,
) {
  const targetKey = isTrolleyCardKey(cardKey) ? "trolley" : cardKey;
  const category = String(row.category || "").toLowerCase();
  const keyName = String(row.key_name || "").toLowerCase();
  const subjectType = String(row.subject_type || "").toLowerCase();
  const haystack = `${row.display_name || ""}
${row.content || ""}
${JSON.stringify(row.structured_data || {})}`;
  const hints = CARD_BRAIN_HINTS[targetKey] || [targetKey];
  const terms = CARD_BRAIN_TERMS[targetKey];
  let score = 0;

  if (category === cardKey || category === targetKey) score += 120;
  if (subjectType === cardKey || subjectType === targetKey) score += 60;
  if (hints.some((hint) => category.includes(hint))) score += 45;
  if (hints.some((hint) => keyName.includes(hint))) score += 35;
  if (terms?.test(haystack)) score += 30;
  if (isTrolleyCardKey(cardKey) && /(^|\n).+(:|\s\d)/.test(String(row.content || ""))) score += 20;
  if (
    festivalId &&
    (row.festival_id === festivalId || row.last_seen_festival_id === festivalId)
  )
    score += 20;
  if (conceptId && row.subject_id === conceptId) score += 80;
  if (!conceptId && row.scope === "festival") score += 8;
  if (String(row.content || "").trim().length > 120) score += 10;
  if (row.structured_data?.section || row.structured_data?.label) score += 15;

  return score;
}

// List Brain documents that COULD be used for this card, with score + role.
// Used by the UI to let the user hand-pick which documents to feed the AI.
async function listBrainDocs({ card_key, festival_id, concept_id }: any) {
  const queries: string[] = [];
  const select = "select=*&order=frequency.desc,last_seen_at.desc&limit=200";
  // Primary scope: same card_key
  queries.push(
    `brain_entries?category=eq.${encodeURIComponent(card_key)}&${select}`,
  );
  // Cross-card: ALL brain entries for this festival, regardless of category,
  // so the user can pull info that lives on a different card.
  if (festival_id) {
    queries.push(
      `brain_entries?festival_id=eq.${encodeURIComponent(festival_id)}&${select}`,
    );
    queries.push(
      `brain_entries?last_seen_festival_id=eq.${encodeURIComponent(festival_id)}&${select}`,
    );
  }
  if (concept_id)
    queries.push(
      `brain_entries?subject_id=eq.${encodeURIComponent(concept_id)}&${select}`,
    );
  // Global, cross-festival knowledge
  queries.push(`brain_entries?scope=eq.global&${select}`);

  const fetched = await Promise.all(
    queries.map(async (q) => {
      try { return ((await sb("GET", q)) as any[]) || []; }
      catch { return []; }
    }),
  );
  const allUnique = uniqRows(fetched.flat());
  const items = allUnique
    .map((row) => {
      const score = scoreBrainRow(row, card_key, festival_id, concept_id);
      const hasStructured =
        row.structured_data?.section || row.structured_data?.label;
      const sameCard = row.category === card_key;
      return {
        id: row.id,
        key_name: row.key_name,
        display_name: row.display_name || row.key_name,
        category: row.category,
        same_card: sameCard,
        scope: row.scope,
        festival_id: row.festival_id,
        frequency: row.frequency || 0,
        last_seen_at: row.last_seen_at,
        score,
        // Recommend by default only docs scored against this card.
        // Cross-card docs are visible but unselected so the user opts in.
        recommended: score > 0 && sameCard,
        role: hasStructured ? "structured_line" : "ai_source",
        content_preview: String(row.content || "").slice(0, 240),
        content_chars: String(row.content || "").length,
      };
    })
    .sort((a, b) =>
      // Same-card first, then score, then frequency
      (Number(b.same_card) - Number(a.same_card)) ||
      (b.score - a.score) ||
      (b.frequency - a.frequency),
    );
  return { ok: true, items };
}

async function grabFromSourceCard({ card_key, festival_id, concept_id, source_card_key }: any) {
  const cardFilter = [
    `festival_id=eq.${encodeURIComponent(festival_id)}`,
    `card_key=eq.${encodeURIComponent(source_card_key)}`,
    "select=id,title,card_key,concept_id",
    "limit=20",
  ].join("&");
  const cards = (await sb("GET", `smart_cards?${cardFilter}`)) as any[];
  const sourceCards = concept_id
    ? cards.filter((c) => !c.concept_id || c.concept_id === concept_id)
    : cards;

  if (!sourceCards.length) {
    return {
      ok: true,
      suggestions: [],
      diagnostics: {
        card_key,
        festival_id,
        concept_id: concept_id || null,
        source_card_key,
        selection_mode: "source_card",
        notes: [`No saved card data found for ${source_card_key}.`],
      },
    };
  }

  const cardIds = sourceCards.map((c) => c.id);
  const cardIdList = cardIds.join(",");
  const sections = (await sb(
    "GET",
    `smart_sections?card_id=in.(${cardIdList})&select=*&order=order_index.asc&limit=500`,
  )) as any[];

  const sectionIds = sections.map((s) => s.id);
  let lines: any[] = [];
  if (sectionIds.length) {
    const sectionIdList = sectionIds.join(",");
    lines = (await sb(
      "GET",
      `smart_lines?section_id=in.(${sectionIdList})&select=*&order=order_index.asc&limit=2000`,
    )) as any[];
  }

  const linesBySection = new Map<string, any[]>();
  for (const line of lines) {
    const existing = linesBySection.get(line.section_id) || [];
    existing.push(line);
    linesBySection.set(line.section_id, existing);
  }

  const sourceText = sourceCards.map((card) => {
    const cardSections = sections.filter((s) => s.card_id === card.id);
    return [
      `SOURCE CARD: ${card.title || card.card_key}`,
      ...cardSections.map((section) => {
        const sectionLines = linesBySection.get(section.id) || [];
        return [
          `SECTION: ${section.title}`,
          section.description ? `DESCRIPTION: ${section.description}` : "",
          ...sectionLines.map((line) => {
            const parts = [
              line.label ? `label=${line.label}` : "",
              line.value ? `value=${line.value}` : "",
              line.quantity ? `quantity=${line.quantity}` : "",
              line.notes ? `notes=${line.notes}` : "",
              line.status ? `status=${line.status}` : "",
            ].filter(Boolean);
            return `- ${parts.join(" | ")}`;
          }),
        ].filter(Boolean).join("\n");
      }),
    ].join("\n\n");
  }).join("\n\n---\n\n");

  if (!sourceText.trim() || !lines.length) {
    return {
      ok: true,
      suggestions: [],
      diagnostics: {
        card_key,
        festival_id,
        concept_id: concept_id || null,
        source_card_key,
        source_cards_found: sourceCards.length,
        source_sections_found: sections.length,
        source_lines_found: lines.length,
        selection_mode: "source_card",
        notes: [`${source_card_key} has no saved lines to extract from.`],
      },
    };
  }

  const cardPrompt = CARD_PROMPTS[card_key] || "Extract logical sections and lines from this source card.";
  const structured = await callAI(
    [
      {
        role: "system",
        content:
          `You convert already-corrected source card data into another festival operations card. STRICT RULES:\n` +
          `1. Use ONLY the source card content provided.\n` +
          `2. Extract only information that fits the target card "${card_key}".\n` +
          `3. Preserve corrected quantities, names, notes, and statuses from the source card.\n` +
          `4. Do not use all Brain documents or invent missing data.\n` +
          `5. Return empty sections if the source card contains nothing relevant.`,
      },
      {
        role: "user",
        content: `${cardPrompt}\n\nTarget card key: ${card_key}\nSource card key: ${source_card_key}\n\nCorrected source card content:\n\n${sourceText.slice(0, 180000)}`,
      },
    ],
    STRUCTURE_SCHEMA,
  );

  const rawAiSections = structured.sections || [];
  const sanitised = sanitizeSections(card_key, rawAiSections);
  const suggestions = sanitised.sections;

  return {
    ok: true,
    suggestions,
    diagnostics: {
      card_key,
      festival_id,
      concept_id: concept_id || null,
      source_card_key,
      source_cards_found: sourceCards.length,
      source_sections_found: sections.length,
      source_lines_found: lines.length,
      selection_mode: "source_card",
      ai_extraction: {
        attempted: true,
        succeeded: true,
        sections_returned: rawAiSections.length,
        sections_kept: suggestions.length,
        sections_rejected: sanitised.rejected,
        summary: structured.summary || null,
      },
      notes: suggestions.length ? [] : [`No ${card_key} info found in ${source_card_key}.`],
    },
  };
}

async function grabBrain({ card_key, festival_id, concept_id, brain_ids, source_card_key }: any) {
  if (source_card_key && source_card_key !== "all") {
    return await grabFromSourceCard({ card_key, festival_id, concept_id, source_card_key });
  }
  const queries: string[] = [];
  const select = "select=*&order=frequency.desc,last_seen_at.desc&limit=200";

  queries.push(
    `brain_entries?category=eq.${encodeURIComponent(card_key)}&${select}`,
  );
  if (festival_id) {
    queries.push(
      `brain_entries?festival_id=eq.${encodeURIComponent(festival_id)}&${select}`,
    );
    queries.push(
      `brain_entries?last_seen_festival_id=eq.${encodeURIComponent(festival_id)}&${select}`,
    );
  }
  if (concept_id)
    queries.push(
      `brain_entries?subject_id=eq.${encodeURIComponent(concept_id)}&${select}`,
    );
  queries.push(`brain_entries?scope=eq.global&${select}`);

  // If the caller pinned a specific set of Brain ids, also fetch those directly
  // so a manual pick can never be filtered out by the scope queries.
  const pinnedIds: string[] = Array.isArray(brain_ids)
    ? brain_ids.filter((x: any) => typeof x === "string" && x.length > 0)
    : [];
  if (pinnedIds.length) {
    const inList = pinnedIds.map((id) => `"${id}"`).join(",");
    queries.push(`brain_entries?id=in.(${inList})&select=*&limit=200`);
  }

  const fetched = await Promise.all(
    queries.map(async (query) => {
      try {
        return ((await sb("GET", query)) as any[]) || [];
      } catch (e) {
        console.error("brain query failed", query, e);
        return [];
      }
    }),
  );

  const allUnique = uniqRows(fetched.flat());

  // If the user pinned specific docs, ONLY use those (skip scoring filter).
  let ranked: { row: any; score: number }[];
  if (pinnedIds.length) {
    const pinnedSet = new Set(pinnedIds);
    ranked = allUnique
      .filter((r) => pinnedSet.has(r.id))
      .map((row) => ({
        row,
        score: scoreBrainRow(row, card_key, festival_id, concept_id) || 1,
      }));
  } else {
    const scored = allUnique.map((row) => ({
      row,
      score: scoreBrainRow(row, card_key, festival_id, concept_id),
    }));
    ranked = scored
      .filter(({ score }) => score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || (b.row.frequency || 0) - (a.row.frequency || 0),
      )
      .slice(0, 40);
  }
  const scored = allUnique.map((row) => ({
    row,
    score: scoreBrainRow(row, card_key, festival_id, concept_id),
  }));
  const rows = ranked.map(({ row }) => row);
  const scoreById = new Map(ranked.map(({ row, score }) => [row.id, score]));


  // Diagnostics: per-Brain-document decisions
  const diagnostics: any = {
    card_key,
    festival_id: festival_id || null,
    concept_id: concept_id || null,
    queries_run: queries.length,
    brain_rows_fetched: allUnique.length,
    brain_rows_considered: scored.length,
    brain_rows_selected: rows.length,
    user_pinned_ids: pinnedIds,
    selection_mode: pinnedIds.length ? "manual" : "auto",
    documents: [] as any[],
    notes: [] as string[],
  };
  for (const r of rows) {
    diagnostics.documents.push({
      id: r.id,
      key_name: r.key_name,
      display_name: r.display_name,
      category: r.category,
      scope: r.scope,
      festival_id: r.festival_id,
      score: scoreById.get(r.id) ?? 0,
      role:
        r.structured_data?.section || r.structured_data?.label
          ? "structured_line"
          : "ai_source",
      content_chars: String(r.content || "").length,
    });
  }
  // Also surface top rejected rows so the user knows what was almost picked
  const rejected = scored
    .filter(({ score }) => score === 0)
    .slice(0, 5)
    .map(({ row }) => ({
      id: row.id,
      key_name: row.key_name,
      category: row.category,
      reason: "no card-specific signal (category/keyword/scope mismatch)",
    }));
  diagnostics.rejected_examples = rejected;

  const bySection: Record<string, any[]> = {};
  const sourceDocs: string[] = [];
  for (const r of rows) {
    const hasStructuredLine =
      r.structured_data?.section || r.structured_data?.label;
    if (hasStructuredLine) {
      const section = r.structured_data?.section || "General";
      if (!bySection[section]) bySection[section] = [];
      bySection[section].push({
        label: r.structured_data?.label || r.display_name || r.key_name,
        value: r.structured_data?.value || r.content || null,
        quantity: r.structured_data?.quantity || null,
        notes: r.structured_data?.notes || null,
        frequency: r.frequency,
      });
    } else if (String(r.content || "").trim()) {
      sourceDocs.push(
        `SOURCE: ${r.display_name || r.key_name || r.category}
CATEGORY: ${r.category || "unknown"}
${String(r.content).slice(0, 12000)}`,
      );
    }
  }

  let suggestions = Object.entries(bySection).map(([title, lines]) => ({
    title,
    lines,
  }));
  diagnostics.structured_sections = suggestions.length;
  diagnostics.ai_source_docs = sourceDocs.length;

  if (sourceDocs.length) {
    const cardPrompt =
      CARD_PROMPTS[card_key] ||
      "Extract logical sections and lines from this Brain knowledge.";
    try {
      const structured = await callAI(
        [
          {
            role: "system",
            content:
              `You convert stored Brain knowledge into editable card sections for a festival operations app. STRICT RULES:
1. ONLY extract content that directly fits the requested card "${card_key}". Ignore everything else in the sources, even if useful for another card.
2. Follow the card-specific structure in the user prompt EXACTLY — do not invent generic sections like "Operations", "General", "Misc", "Document content".
3. Each line must be a discrete fact (label + value), not a paragraph dump.
4. If the Brain sources contain NO information that matches this card's purpose, return {"sections": []} — do NOT fabricate or pad.
5. Never copy raw paragraphs into a single line — split them into structured fields.`,
          },
          {
            role: "user",
            content: `${cardPrompt}

Requested card key: ${card_key}

Brain sources (may contain unrelated content — filter strictly):

${sourceDocs.join("\\n\\n---\\n\\n")}`,
          },
        ],
        STRUCTURE_SCHEMA,
      );
      const rawAiSections = structured.sections || [];
      const sanitised = sanitizeSections(card_key, rawAiSections);
      const aiSections = sanitised.sections;
      diagnostics.ai_extraction = {
        attempted: true,
        succeeded: true,
        sections_returned: rawAiSections.length,
        sections_kept: aiSections.length,
        sections_rejected: sanitised.rejected,
        summary: structured.summary || null,
      };
      if (sanitised.rejected.length) {
        diagnostics.notes.push(
          `Rejected ${sanitised.rejected.length} dump-like section(s): ${sanitised.rejected.map((r) => `"${r.title}" (${r.reason})`).join(", ")}`,
        );
      }
      if (!aiSections.length) {
        diagnostics.notes.push(
          rawAiSections.length
            ? "All AI sections were rejected by the schema validator — Brain sources didn't contain card-specific structured info."
            : "AI returned 0 sections — Brain sources may not contain card-specific info.",
        );
      }
      suggestions = [...aiSections, ...suggestions];
    } catch (e) {
      diagnostics.ai_extraction = {
        attempted: true,
        succeeded: false,
        error: String((e as Error).message || e),
      };
      diagnostics.notes.push(`AI extraction failed: ${(e as Error).message || e}`);
    }
  } else {
    diagnostics.ai_extraction = {
      attempted: false,
      reason:
        rows.length === 0
          ? "No Brain documents matched this card."
          : "All matched Brain rows were already structured lines (no free-text source to extract from).",
    };
  }

  if (!suggestions.length) {
    diagnostics.notes.push(
      "No suggestions produced. Check the rejected examples or upload a card-specific document.",
    );
  }

  return { ok: true, suggestions, diagnostics };
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
      structured_data: {
        ...(existing[0].structured_data || {}),
        ...(payload.structured_data || {}),
      },
    });
  } else {
    await sb("POST", "brain_entries", {
      key_name: payload.key,
      display_name: payload.display_name || payload.key,
      category: payload.card_key || "manual",
      source: "user_correction",
      content: payload.value,
      scope: payload.concept_id
        ? "concept"
        : payload.festival_id
          ? "festival"
          : "global",
      festival_id: payload.festival_id || null,
      last_seen_festival_id: payload.festival_id || null,
      subject_type: payload.subject_type || payload.card_key,
      subject_id:
        payload.subject_id || payload.concept_id || payload.festival_id,
      structured_data: payload.structured_data || {},
      frequency: 1,
      confidence: payload.confidence ?? 0.7,
    });
  }
  return { ok: true };
}

// Lightweight summarize-only action: read the file, generate a short AI summary,
// save it on smart_files. Does NOT create sections/lines and does NOT post in chat.
// Used by the Brain "store silently" upload flow. The user must click
// "Propose changes" later to run the full extract.
async function summarizeFile({ file_id, file_url, file_name, mime_type }: any) {
  await sb("PATCH", `smart_files?id=eq.${file_id}`, {
    parse_status: "processing",
  });
  let userContent: any;
  const text = await downloadFileText(
    file_url,
    mime_type || "",
    file_name || "",
  );
  const instr = `Read this document and write a concise plain-text summary (5-12 lines) capturing supplier, items, prices, dates, addresses, contacts and anything else useful. No JSON, no markdown headings — just the summary text.`;
  if (text) {
    userContent = `${instr}\n\nFile: ${file_name}\n\n${text.slice(0, 180000)}`;
  } else {
    try {
      const { b64, mime: detectedMime } = await downloadFileBase64(file_url);
      const effectiveMime = mime_type || detectedMime;
      const isImage = /^image\//i.test(effectiveMime);
      const isPdf =
        /pdf/i.test(effectiveMime) || /\.pdf$/i.test(file_name || "");
      if (isImage || isPdf) {
        userContent = [
          { type: "text", text: `${instr}\n\nFile name: ${file_name}` },
          {
            type: "image_url",
            image_url: {
              url: `data:${isPdf ? "application/pdf" : effectiveMime};base64,${b64}`,
            },
          },
        ];
      } else {
        userContent = `${instr}\n\nFile: ${file_name} (${effectiveMime}) — binary file, summarise from the filename.`;
      }
    } catch (e) {
      userContent = `${instr}\n\nFile: ${file_name} (could not download contents).`;
    }
  }
  let summary = "";
  try {
    summary = await callAI([
      {
        role: "system",
        content:
          "You read messy real-world festival documents and produce short, accurate plain-text summaries. Always perform OCR on images/PDFs.",
      },
      { role: "user", content: userContent },
    ]);
  } catch (e) {
    await sb("PATCH", `smart_files?id=eq.${file_id}`, {
      parse_status: "error",
      parse_error: String((e as Error).message || e),
    });
    throw e;
  }
  await sb("PATCH", `smart_files?id=eq.${file_id}`, {
    parse_status: "stored",
    ai_summary: (summary || "").trim() || null,
    meta: {},
  });
  return { ok: true, stored: true, summary };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    let result: any;
    switch (body.action) {
      case "extract":
        result = await extractFromFile(body);
        break;
      case "summarize":
        result = await summarizeFile(body);
        break;
      case "apply_proposal":
        result = await applyProposal(body);
        break;
      case "discard_proposal":
        result = await discardProposal(body);
        break;
      case "grab_brain":
        result = await grabBrain(body);
        break;
      case "list_brain_docs":
        result = await listBrainDocs(body);
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
    return new Response(
      JSON.stringify({ error: String((e as Error).message || e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
