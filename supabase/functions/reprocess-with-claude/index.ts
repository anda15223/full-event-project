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
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 5;
    const testMode = body.test_mode || false; // true = only 5 most recent invoice emails
    const jobId = body.job_id || null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find emails to reprocess: skipped/pending or no invoice created
    let query = supabase
      .from("emails")
      .select("id, subject, classification, router_status")
      .gte("received_at", "2026-01-01T00:00:00.000Z")
      .order("received_at", { ascending: false });

    if (testMode) {
      // Test mode: only 5 most recent invoice-classified emails
      query = query.eq("classification", "invoice").limit(5);
    } else {
      // Full mode: emails that were skipped, pending, or have no invoice
      query = query.limit(batchSize);
    }

    const { data: emails, error: queryError } = await query;
    if (queryError) throw queryError;

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({
        processed: 0, extracted: 0, skipped: 0, errors: 0,
        message: "No emails to process",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter to emails without an invoice record
    const emailIds = emails.map(e => e.id);
    const { data: existingInvoices } = await supabase
      .from("invoices").select("email_id").in("email_id", emailIds);
    const existingIds = new Set((existingInvoices || []).map(i => i.email_id));

    // In test mode, process all 5 even if they have invoices (to show Claude response)
    const toProcess = testMode
      ? emailIds
      : emailIds.filter(id => !existingIds.has(id));

    let extracted = 0;
    let skipped = 0;
    let errors = 0;
    const details: any[] = [];

    for (const emailId of toProcess) {
      try {
        const { data, error } = await supabase.functions.invoke("extract-invoice", {
          body: { email_id: emailId },
        });

        if (error) {
          errors++;
          details.push({ email_id: emailId, status: "error", error: error.message });
          continue;
        }

        const ex = data?.extracted || 0;
        const er = data?.errors || 0;
        extracted += ex;
        if (er > 0) errors += er;
        if (ex === 0 && er === 0) skipped++;
        details.push({ email_id: emailId, status: ex > 0 ? "extracted" : "skipped", data });
      } catch (err) {
        errors++;
        details.push({ email_id: emailId, status: "error", error: err instanceof Error ? err.message : "Unknown" });
      }
    }

    // Update job progress if provided
    if (jobId) {
      await supabase.from("email_sync_jobs").update({
        total_processed: extracted + skipped + errors,
        total_invoices_extracted: extracted,
        total_skipped: skipped,
      }).eq("id", jobId);
    }

    // Get remaining count
    const { count: remaining } = await supabase
      .from("emails")
      .select("id", { count: "exact", head: true })
      .gte("received_at", "2026-01-01T00:00:00.000Z");

    const { count: invoiceCount } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true });

    return new Response(JSON.stringify({
      processed: toProcess.length,
      extracted,
      skipped,
      errors,
      total_emails: remaining || 0,
      total_invoices: invoiceCount || 0,
      test_mode: testMode,
      details,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Reprocess error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
