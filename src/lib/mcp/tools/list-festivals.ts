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
  name: "list_festivals",
  title: "List festivals",
  description: "List festivals visible to the signed-in user, ordered by start date.",
  inputSchema: {
    year: z.number().int().optional().describe("Filter by year (e.g. 2026)"),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 25)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ year, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("festivals")
      .select("id, slug, name, city, year, setup_date, breakdown_date, is_active")
      .order("setup_date", { ascending: true })
      .limit(limit ?? 25);
    if (year) q = q.eq("year", year);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { festivals: data ?? [] },
    };
  },
});
