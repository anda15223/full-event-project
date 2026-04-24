// Backfills extracted_documents from existing email_attachments.
// Iterates over all emails that have at least one non-inline attachment
// and invokes ingest-email-documents for each. Idempotent — safe to re-run.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: { limit?: number; offset?: number } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const limit = Math.min(body.limit ?? 100, 500);
    const offset = body.offset ?? 0;

    // Get distinct email_ids that have non-inline attachments
    const { data: rows, error } = await supabase
      .from("email_attachments")
      .select("email_id")
      .eq("is_inline", false)
      .not("storage_path", "is", null)
      .order("email_id")
      .range(offset, offset + limit * 5); // overfetch since we dedupe
    if (error) throw error;

    const seen = new Set<string>();
    const emailIds: string[] = [];
    for (const r of rows ?? []) {
      if (r.email_id && !seen.has(r.email_id)) {
        seen.add(r.email_id);
        emailIds.push(r.email_id);
        if (emailIds.length >= limit) break;
      }
    }

    let processed = 0;
    let ingested = 0;
    let failed = 0;

    for (const email_id of emailIds) {
      try {
        const { data, error: invErr } = await supabase.functions.invoke(
          "ingest-email-documents",
          { body: { email_id } },
        );
        if (invErr) throw invErr;
        ingested += (data as any)?.ingested ?? 0;
        processed++;
      } catch (e) {
        failed++;
        console.error(`backfill failed for ${email_id}:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        emails_scanned: emailIds.length,
        processed,
        ingested,
        failed,
        next_offset: emailIds.length === limit ? offset + limit : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("backfill-documents error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
