// Per-SmartCard AI chat with tool-calling.
// The AI can read the card, edit/add sections & lines, and create todos.
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
      name: "add_section",
      description: "Add a new section/group to the card.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_section",
      description: "Rename or update a section.",
      parameters: {
        type: "object",
        properties: {
          section_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["section_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_section",
      description: "Delete a section and all its lines.",
      parameters: {
        type: "object",
        properties: { section_id: { type: "string" } },
        required: ["section_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_line",
      description:
        "Add a line to a section. If section_id is unknown, pass section_title to auto-create or match.",
      parameters: {
        type: "object",
        properties: {
          section_id: { type: "string" },
          section_title: { type: "string" },
          label: { type: "string" },
          value: { type: "string" },
          quantity: { type: "string" },
          notes: { type: "string" },
          due_date: { type: "string", description: "YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_line",
      description: "Update fields on an existing line.",
      parameters: {
        type: "object",
        properties: {
          line_id: { type: "string" },
          label: { type: "string" },
          value: { type: "string" },
          quantity: { type: "string" },
          notes: { type: "string" },
          status: { type: "string" },
          owner: { type: "string" },
          due_date: { type: "string" },
        },
        required: ["line_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_line",
      description: "Delete a line.",
      parameters: {
        type: "object",
        properties: { line_id: { type: "string" } },
        required: ["line_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_todo",
      description: "Create a todo item for this card with optional deadline.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          due_date: { type: "string", description: "YYYY-MM-DD" },
          owner: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
];

async function buildContext(supabase: any, cardId: string) {
  const [{ data: card }, { data: sections }, { data: todos }] = await Promise.all([
    supabase.from("smart_cards").select("*").eq("id", cardId).single(),
    supabase.from("smart_sections").select("*").eq("card_id", cardId).order("order_index"),
    supabase.from("smart_todos").select("*").eq("card_id", cardId).order("order_index"),
  ]);
  let lines: any[] = [];
  if (sections?.length) {
    const { data: lns } = await supabase
      .from("smart_lines")
      .select("*")
      .in("section_id", sections.map((s: any) => s.id))
      .order("order_index");
    lines = lns || [];
  }
  const summary = {
    card: { id: card?.id, key: card?.card_key, title: card?.title },
    sections: (sections || []).map((s: any) => ({
      id: s.id,
      title: s.title,
      lines: lines.filter((l) => l.section_id === s.id).map((l) => ({
        id: l.id,
        label: l.label,
        value: l.value,
        quantity: l.quantity,
        notes: l.notes,
        status: l.status,
        due_date: l.due_date,
      })),
    })),
    todos: (todos || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      status: t.status,
    })),
  };
  return summary;
}

async function executeTool(supabase: any, cardId: string, name: string, args: any) {
  switch (name) {
    case "add_section": {
      const { data: existing } = await supabase
        .from("smart_sections")
        .select("order_index")
        .eq("card_id", cardId)
        .order("order_index", { ascending: false })
        .limit(1);
      const order = existing?.[0]?.order_index != null ? existing[0].order_index + 1 : 0;
      const { data, error } = await supabase
        .from("smart_sections")
        .insert({
          card_id: cardId,
          title: args.title,
          description: args.description ?? null,
          order_index: order,
          source: "ai",
        })
        .select()
        .single();
      if (error) throw error;
      return { ok: true, section_id: data.id };
    }
    case "update_section": {
      const patch: any = {};
      if (args.title != null) patch.title = args.title;
      if (args.description != null) patch.description = args.description;
      const { error } = await supabase.from("smart_sections").update(patch).eq("id", args.section_id);
      if (error) throw error;
      return { ok: true };
    }
    case "delete_section": {
      const { error } = await supabase.from("smart_sections").delete().eq("id", args.section_id);
      if (error) throw error;
      return { ok: true };
    }
    case "add_line": {
      let sectionId = args.section_id;
      if (!sectionId && args.section_title) {
        const { data: secs } = await supabase
          .from("smart_sections")
          .select("id,title")
          .eq("card_id", cardId);
        const match = secs?.find((s: any) => s.title?.toLowerCase() === args.section_title.toLowerCase());
        if (match) sectionId = match.id;
        else {
          const order = (secs?.length || 0);
          const { data: created } = await supabase
            .from("smart_sections")
            .insert({ card_id: cardId, title: args.section_title, order_index: order, source: "ai" })
            .select()
            .single();
          sectionId = created?.id;
        }
      }
      if (!sectionId) throw new Error("section_id or section_title required");
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
      return { ok: true, line_id: data.id, section_id: sectionId };
    }
    case "update_line": {
      const patch: any = {};
      for (const k of ["label", "value", "quantity", "notes", "status", "owner", "due_date"]) {
        if (args[k] != null) patch[k] = args[k];
      }
      const { error } = await supabase.from("smart_lines").update(patch).eq("id", args.line_id);
      if (error) throw error;
      return { ok: true };
    }
    case "delete_line": {
      const { error } = await supabase.from("smart_lines").delete().eq("id", args.line_id);
      if (error) throw error;
      return { ok: true };
    }
    case "create_todo": {
      const { data: existing } = await supabase
        .from("smart_todos")
        .select("order_index")
        .eq("card_id", cardId)
        .order("order_index", { ascending: false })
        .limit(1);
      const order = existing?.[0]?.order_index != null ? existing[0].order_index + 1 : 0;
      const { data, error } = await supabase
        .from("smart_todos")
        .insert({
          card_id: cardId,
          title: args.title,
          description: args.description ?? null,
          due_date: args.due_date ?? null,
          owner: args.owner ?? null,
          source: "ai",
          order_index: order,
        })
        .select()
        .single();
      if (error) throw error;
      return { ok: true, todo_id: data.id };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { card_id, message, history = [] } = await req.json();
    if (!card_id || !message) {
      return new Response(JSON.stringify({ error: "card_id and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const ctx = await buildContext(supabase, card_id);

    const systemPrompt = `You are a helpful festival-planning assistant attached to ONE specific card called "${ctx.card.title}" (key: ${ctx.card.key}).
You can:
- Read the current state of this card (sections, lines, todos) shown below.
- Edit it via tool calls (add/update/delete sections and lines).
- Create todos with deadlines for this card.

When the user asks you to add or change information, use the tools — do not just describe what should be done. After tool calls, briefly confirm what you did in plain language. Today's date: ${new Date().toISOString().slice(0, 10)}.

CURRENT CARD STATE (JSON):
${JSON.stringify(ctx, null, 2)}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    // Persist user message
    await supabase.from("smart_chat_messages").insert({
      card_id,
      role: "user",
      content: message,
    });

    let finalText = "";
    const executedActions: any[] = [];

    // Tool-calling loop (max 4 iterations)
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

      // Push assistant turn with tool_calls
      messages.push(msg);

      for (const tc of toolCalls) {
        const fname = tc.function?.name;
        let fargs: any = {};
        try {
          fargs = JSON.parse(tc.function?.arguments || "{}");
        } catch {}
        let result: any;
        try {
          result = await executeTool(supabase, card_id, fname, fargs);
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

    await supabase.from("smart_chat_messages").insert({
      card_id,
      role: "assistant",
      content: finalText,
      tool_calls: executedActions.length ? executedActions : null,
    });

    return new Response(
      JSON.stringify({ reply: finalText, actions: executedActions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("smart-card-chat error:", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
