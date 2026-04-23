// Per-section AI chat. Scoped to ONE festival section page.
// Reads the section's questions/answers (and optional SmartCard state) and can:
// - update answers
// - create festival action items (todos with deadlines)
// - add/update lines on the section's SmartCard if one exists
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const tools = [
  {
    type: "function",
    function: {
      name: "update_answer",
      description:
        "Set or update the answer to one of this section's questions. Use the question_key shown in CONTEXT.",
      parameters: {
        type: "object",
        properties: {
          question_key: { type: "string" },
          value: {
            description:
              "Plain value: string for text, number for numeric, ISO date YYYY-MM-DD for dates, true/false for booleans, array of strings for multi-selects.",
          },
        },
        required: ["question_key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_action_item",
      description:
        "Create a todo / action item attached to this section with optional deadline and owner.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          deadline: { type: "string", description: "YYYY-MM-DD" },
          owner: { type: "string" },
          priority: { type: "string", enum: ["low", "normal", "high"] },
          notes: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_card_line",
      description:
        "Add a NEW line to the SmartCard of this section. Only use when the user explicitly asks to add something new.",
      parameters: {
        type: "object",
        properties: {
          section_title: { type: "string" },
          label: { type: "string" },
          value: { type: "string" },
          quantity: { type: "string" },
          notes: { type: "string" },
          due_date: { type: "string" },
        },
        required: ["section_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_card_line",
      description:
        "Update an EXISTING SmartCard line by its id (see smart_card.lines in CONTEXT). Only set the fields the user asked to change; omit the rest.",
      parameters: {
        type: "object",
        properties: {
          line_id: { type: "string" },
          label: { type: "string" },
          value: { type: "string" },
          quantity: { type: "string" },
          notes: { type: "string" },
          due_date: { type: "string" },
        },
        required: ["line_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dismiss_file_warning",
      description:
        "Mark a validation warning on an uploaded source file as resolved/intentional, with the user's reason. Use when the user EXPLAINS why a 'missing' flag is actually correct (e.g. 'this PDF covers all containers, quantity is intentional'). Identify the warning by file_id + the warning's field name from CONTEXT.smart_card.files[].warnings[].field.",
      parameters: {
        type: "object",
        properties: {
          file_id: { type: "string" },
          field: { type: "string", description: "Warning field key, e.g. 'unit_quantity'." },
          reason: { type: "string", description: "User's explanation in their own words." },
        },
        required: ["file_id", "field", "reason"],
      },
    },
  },
];

async function buildContext(
  supabase: any,
  festivalId: string,
  sectionKey: string,
) {
  const [{ data: festival }, { data: section }] = await Promise.all([
    supabase.from("festivals").select("*").eq("id", festivalId).maybeSingle(),
    supabase.from("festival_sections").select("*").eq("key", sectionKey).maybeSingle(),
  ]);
  if (!section) throw new Error(`Unknown section ${sectionKey}`);

  const [{ data: questions }, { data: answers }, { data: actionItems }, { data: card }] =
    await Promise.all([
      supabase
        .from("festival_questions")
        .select("*")
        .eq("section_id", section.id)
        .order("order_index"),
      supabase.from("festival_answers").select("*").eq("festival_id", festivalId),
      supabase
        .from("festival_action_items")
        .select("*")
        .eq("festival_id", festivalId)
        .eq("section_key", sectionKey)
        .order("created_at"),
      supabase
        .from("smart_cards")
        .select("*")
        .eq("festival_id", festivalId)
        .eq("card_key", sectionKey)
        .maybeSingle(),
    ]);

  const qs = (questions || []).map((q: any) => {
    const a = (answers || []).find((x: any) => x.question_id === q.id);
    return {
      id: q.id,
      key: q.key,
      prompt: q.prompt,
      kind: q.kind,
      options: q.options,
      required: q.required,
      current_value: a?.value ?? null,
    };
  });

  let cardSummary: any = null;
  if (card) {
    const [{ data: secs }, { data: files }] = await Promise.all([
      supabase
        .from("smart_sections")
        .select("id,title")
        .eq("card_id", card.id)
        .order("order_index"),
      supabase
        .from("smart_files")
        .select("id, filename, warnings, meta")
        .eq("card_id", card.id)
        .order("uploaded_at", { ascending: false }),
    ]);
    const sectionIds = (secs || []).map((s: any) => s.id);
    let lines: any[] = [];
    if (sectionIds.length) {
      const { data: ls } = await supabase
        .from("smart_lines")
        .select("id, section_id, label, value, quantity, notes, due_date, meta")
        .in("section_id", sectionIds)
        .order("order_index");
      lines = ls || [];
    }
    cardSummary = {
      id: card.id,
      title: card.title,
      sections: (secs || []).map((s: any) => ({ id: s.id, title: s.title })),
      lines: lines.map((l: any) => ({
        id: l.id,
        section_id: l.section_id,
        section_title: (secs || []).find((s: any) => s.id === l.section_id)?.title,
        label: l.label,
        value: l.value,
        quantity: l.quantity,
        notes: l.notes,
        due_date: l.due_date,
      })),
      files: (files || []).map((f: any) => {
        const dismissed = (f.meta?.dismissed_warnings || {}) as Record<string, string>;
        const warnings = (Array.isArray(f.warnings) ? f.warnings : []).map((w: any) => ({
          field: w.field,
          message: w.message,
          severity: w.severity,
          dismissed: !!dismissed[w.field],
          dismiss_reason: dismissed[w.field] || null,
        }));
        return { id: f.id, filename: f.filename, warnings };
      }),
    };
  }

  return {
    festival: { id: festival?.id, name: festival?.name, year: festival?.year },
    section: { id: section.id, key: section.key, title: section.title },
    questions: qs,
    action_items: (actionItems || []).map((a: any) => ({
      id: a.id, title: a.title, deadline: a.deadline, status: a.status, owner: a.owner,
    })),
    smart_card: cardSummary,
  };
}

async function executeTool(
  supabase: any,
  ctx: any,
  festivalId: string,
  sectionKey: string,
  name: string,
  args: any,
) {
  switch (name) {
    case "update_answer": {
      const q = ctx.questions.find((x: any) => x.key === args.question_key);
      if (!q) throw new Error(`Unknown question_key: ${args.question_key}`);
      const { error } = await supabase
        .from("festival_answers")
        .upsert(
          {
            festival_id: festivalId,
            question_id: q.id,
            value: args.value,
            value_type: q.kind,
          },
          { onConflict: "festival_id,question_id" },
        );
      if (error) throw error;
      return { ok: true, question_key: q.key };
    }
    case "create_action_item": {
      const { data, error } = await supabase
        .from("festival_action_items")
        .insert({
          festival_id: festivalId,
          section_key: sectionKey,
          title: args.title,
          deadline: args.deadline ?? null,
          owner: args.owner ?? null,
          priority: args.priority ?? "normal",
          notes: args.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    case "add_card_line": {
      if (!ctx.smart_card) {
        return { ok: false, error: "No SmartCard exists for this section." };
      }
      const cardId = ctx.smart_card.id;
      // find or create section
      let sec = ctx.smart_card.sections.find(
        (s: any) => s.title?.toLowerCase() === args.section_title.toLowerCase(),
      );
      let sectionId = sec?.id;
      if (!sectionId) {
        const order = ctx.smart_card.sections.length;
        const { data: created, error: cerr } = await supabase
          .from("smart_sections")
          .insert({
            card_id: cardId,
            title: args.section_title,
            order_index: order,
            source: "ai",
          })
          .select()
          .single();
        if (cerr) throw cerr;
        sectionId = created.id;
        ctx.smart_card.sections.push({ id: sectionId, title: args.section_title });
      }
      const { data: existing } = await supabase
        .from("smart_lines")
        .select("order_index")
        .eq("section_id", sectionId)
        .order("order_index", { ascending: false })
        .limit(1);
      const order = existing?.[0]?.order_index != null ? existing[0].order_index + 1 : 0;
      const { data, error } = await supabase
        .from("smart_lines")
        .insert({
          section_id: sectionId,
          label: args.label ?? null,
          value: args.value ?? null,
          quantity: args.quantity ?? null,
          notes: args.notes ?? null,
          due_date: args.due_date ?? null,
          order_index: order,
          source: "ai",
        })
        .select()
        .single();
      if (error) throw error;
      return { ok: true, line_id: data.id };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { festival_id, section_key, message, history = [] } = await req.json();
    if (!festival_id || !section_key || !message) {
      return new Response(
        JSON.stringify({ error: "festival_id, section_key, message required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const ctx = await buildContext(supabase, festival_id, section_key);

    const systemPrompt = `You are a focused festival-planning assistant for ONE specific section page.
Festival: ${ctx.festival.name} (${ctx.festival.year})
Section: "${ctx.section.title}" (key: ${ctx.section.key})

You ONLY help with this section. If asked about something else, gently redirect.
You can:
- Read this section's questions and the user's current answers below.
- Update answers via update_answer using the question_key.
- Create action items / todos with deadlines via create_action_item.
${ctx.smart_card ? "- Add lines to this section's SmartCard via add_card_line." : "- (No SmartCard on this section, so do not call add_card_line.)"}

Use tools to apply changes — do not just describe them. After tool calls, briefly confirm in plain language.
Today: ${new Date().toISOString().slice(0, 10)}.

CONTEXT (JSON):
${JSON.stringify(ctx, null, 2)}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    let finalText = "";
    const executedActions: any[] = [];

    for (let iter = 0; iter < 4; iter++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools,
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        if (resp.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit reached, try again in a moment." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (resp.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted. Add credits in Workspace Usage." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        console.error("AI gateway error:", resp.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0) {
        finalText = msg.content || "";
        break;
      }

      messages.push(msg);

      for (const tc of toolCalls) {
        const fname = tc.function?.name;
        let fargs: any = {};
        try {
          fargs = JSON.parse(tc.function?.arguments || "{}");
        } catch {}
        let result: any;
        try {
          result = await executeTool(supabase, ctx, festival_id, section_key, fname, fargs);
          executedActions.push({ tool: fname, args: fargs, result });
        } catch (e: any) {
          result = { ok: false, error: e.message || String(e) };
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (!finalText) finalText = "Done.";

    return new Response(
      JSON.stringify({ reply: finalText, actions: executedActions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("section-page-chat error:", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
