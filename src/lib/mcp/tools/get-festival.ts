import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_festival",
  title: "Get festival details",
  description:
    "Get a festival's details including contracts, concepts and staff counts. Look up by slug (preferred) or id.",
  inputSchema: {
    slug: z.string().optional().describe("Festival slug, e.g. 'gron-tarnby-16-2026'"),
    id: z.string().uuid().optional().describe("Festival UUID"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ slug, id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!slug && !id) {
      return { content: [{ type: "text", text: "Provide slug or id" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let fq = sb.from("festivals").select("*").limit(1);
    if (slug) fq = fq.eq("slug", slug);
    else fq = fq.eq("id", id!);
    const { data: festival, error } = await fq.maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!festival) return { content: [{ type: "text", text: "Festival not found" }], isError: true };

    const [{ data: contracts }, { data: concepts }, { count: staffCount }] = await Promise.all([
      sb.from("festival_contracts").select("id, alias, concept_id").eq("festival_id", festival.id),
      sb.from("festival_concepts").select("id, name").eq("festival_id", festival.id),
      sb
        .from("festival_staff")
        .select("id", { count: "exact", head: true })
        .eq("festival_id", festival.id),
    ]);

    const payload = {
      festival,
      contracts: contracts ?? [],
      concepts: concepts ?? [],
      staff_count: staffCount ?? 0,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
