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
    const testMode = body.test_mode || false;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Reprocess started: test_mode=${testMode}, batch_size=${batchSize}`);

    // Find emails to reprocess
    let query = supabase
      .from("emails")
      .select("id, subject, classification, router_status")
      .gte("received_at", "2026-01-01T00:00:00.000Z")
      .order("received_at", { ascending: false });

    if (testMode) {
      query = query.eq("classification", "invoice").limit(5);
    } else {
      query = query.limit(batchSize);
    }

    const { data: emails, error: queryError } = await query;
    if (queryError) {
      console.error("Query error:", queryError);
      throw queryError;
    }

    console.log(`Found ${emails?.length || 0} emails to process`);

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({
        processed: 0, extracted: 0, skipped: 0, errors: 0,
        message: "No emails to process",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter to emails without an invoice record (unless test mode)
    const emailIds = emails.map(e => e.id);
    const { data: existingInvoices } = await supabase
      .from("invoices").select("email_id").in("email_id", emailIds);
    const existingIds = new Set((existingInvoices || []).map(i => i.email_id));

    const toProcess = testMode
      ? emailIds
      : emailIds.filter(id => !existingIds.has(id));

    console.log(`Will process ${toProcess.length} emails (${existingIds.size} already have invoices)`);

    let extracted = 0;
    let skipped = 0;
    let errors = 0;
    const details: any[] = [];

    // Call extract-invoice directly via HTTP (not supabase.functions.invoke)
    const extractUrl = `${supabaseUrl}/functions/v1/extract-invoice`;

    for (const emailId of toProcess) {
      try {
        console.log(`Processing email ${emailId}...`);
        const response = await fetch(extractUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ email_id: emailId }),
        });

        const responseText = await response.text();
        let data: any;
        try {
          data = JSON.parse(responseText);
        } catch {
          console.error(`Non-JSON response for ${emailId}:`, responseText.substring(0, 300));
          errors++;
          details.push({ email_id: emailId, status: "error", error: "Non-JSON response from extract-invoice" });
          continue;
        }

        if (!response.ok) {
          console.error(`Extract error for ${emailId}:`, response.status, data);
          errors++;
          details.push({ email_id: emailId, status: "error", error: data.error || `HTTP ${response.status}` });
          continue;
        }

        const ex = data?.extracted || 0;
        const er = data?.errors || 0;
        extracted += ex;
        if (er > 0) errors += er;
        if (ex === 0 && er === 0) skipped++;
        details.push({ email_id: emailId, status: ex > 0 ? "extracted" : "skipped", data });
        console.log(`Email ${emailId}: extracted=${ex}, errors=${er}`);
      } catch (err) {
        console.error(`Exception processing ${emailId}:`, err);
        errors++;
        details.push({ email_id: emailId, status: "error", error: err instanceof Error ? err.message : "Unknown" });
      }
    }

    // Get counts
    const { count: remaining } = await supabase
      .from("emails")
      .select("id", { count: "exact", head: true })
      .gte("received_at", "2026-01-01T00:00:00.000Z");

    const { count: invoiceCount } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true });

    console.log(`Batch complete: processed=${toProcess.length}, extracted=${extracted}, skipped=${skipped}, errors=${errors}`);

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
    console.error("Reprocess top-level error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
