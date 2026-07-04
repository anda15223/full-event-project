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
  name: "list_festival_staff",
  title: "List festival staff",
  description: "List staff assigned to a festival, optionally filtered by contract alias (e.g. 'Fish 1').",
  inputSchema: {
    festival_id: z.string().uuid().describe("Festival UUID"),
    contract_alias: z
      .string()
      .optional()
      .describe("Filter to one contract group by alias, e.g. 'Fish 1', 'Gyros 2'"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ festival_id, contract_alias }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let contractId: string | null = null;
    if (contract_alias) {
      const { data: contract } = await sb
        .from("festival_contracts")
        .select("id")
        .eq("festival_id", festival_id)
        .eq("alias", contract_alias)
        .maybeSingle();
      if (!contract) {
        return {
          content: [{ type: "text", text: `No contract with alias '${contract_alias}' for festival` }],
          isError: true,
        };
      }
      contractId = contract.id;
    }
    let q = sb
      .from("festival_staff")
      .select("id, staff_number, full_name, role, phone, wristband_type, contract_id, concept_id")
      .eq("festival_id", festival_id)
      .order("staff_number", { ascending: true });
    if (contractId) q = q.eq("contract_id", contractId);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { staff: data ?? [] },
    };
  },
});
