import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* Suppliers/senders to always ignore */
const IGNORE_SENDERS = ["livet på øen", "livet paa øen", "livet paa oen"];
const IGNORE_SUBJECTS = /kontoudtog|kontoopgørelse|account\s*statement/i;

function shouldSkipEmail(email: any): string | null {
  const sender = (email.sender || "").toLowerCase();
  for (const ign of IGNORE_SENDERS) {
    if (sender.includes(ign)) return "ignore:livet_paa_oen";
  }
  const subject = (email.subject || "").toLowerCase();
  if (IGNORE_SUBJECTS.test(subject)) return "ignore:kontoudtog";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 10;
    const testMode = body.test_mode || false;
    const offset = body.offset || 0;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Reprocess: test=${testMode}, batch=${batchSize}, offset=${offset}`);

    // STEP 1: Find emails that COULD contain invoices
    // - classified as "invoice", or unclassified with attachments, or has invoice-like subjects
    let query = supabase
      .from("emails")
      .select("id, subject, sender, classification, router_status, has_attachments")
      .gte("received_at", "2026-01-01T00:00:00.000Z")
      .order("received_at", { ascending: false });

    if (testMode) {
      query = query.eq("classification", "invoice").limit(5);
    } else {
      // Only process emails that are likely invoices:
      // - classified as "invoice"
      // - OR unclassified/null (never classified yet)
      // - OR have attachments (could be PDF invoices)
      query = query.or("classification.eq.invoice,classification.is.null,has_attachments.eq.true")
        .range(offset, offset + batchSize - 1);
    }

    const { data: emails, error: queryError } = await query;
    if (queryError) throw queryError;

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({
        processed: 0, extracted: 0, skipped: 0, ignored: 0, errors: 0,
        message: "No more emails to process", done: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // STEP 2: Filter out emails that already have invoices
    const emailIds = emails.map((e: any) => e.id);
    const { data: existingInvoices } = await supabase
      .from("invoices").select("email_id").in("email_id", emailIds);
    const existingIds = new Set((existingInvoices || []).map((i: any) => i.email_id));
    const toProcess = emailIds.filter((id: string) => !existingIds.has(id));

    console.log(`Batch: ${emails.length} fetched, ${existingIds.size} already have invoices, ${toProcess.length} to process`);

    if (toProcess.length === 0) {
      return new Response(JSON.stringify({
        processed: 0, extracted: 0, skipped: 0, ignored: 0, errors: 0,
        message: "All emails in this batch already processed",
        next_offset: offset + batchSize,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let extracted = 0;
    let skipped = 0;
    let ignored = 0;
    let errors = 0;
    const details: any[] = [];
    let currentSubject = "";

    const extractUrl = `${supabaseUrl}/functions/v1/extract-invoice`;

    for (const emailId of toProcess) {
      const email = emails.find((e: any) => e.id === emailId);
      currentSubject = email?.subject || "";

      // Check ignore rules before calling Claude
      const ignoreReason = email ? shouldSkipEmail(email) : null;
      if (ignoreReason) {
        console.log(`Ignoring ${emailId}: ${ignoreReason}`);
        await supabase.from("emails").update({
          router_status: "ignored",
          assigned_agent: "ignore_agent",
        }).eq("id", emailId);
        ignored++;
        details.push({ email_id: emailId, status: "ignored", reason: ignoreReason, subject: currentSubject });
        continue;
      }

      try {
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
          errors++;
          details.push({ email_id: emailId, status: "error", error: "Non-JSON response: " + responseText.substring(0, 200), subject: currentSubject });
          continue;
        }

        // Handle rate limit — wait and retry once
        if (response.status === 429 || (data.error && data.error.includes("rate_limit"))) {
          console.log(`Rate limited on ${emailId}, waiting 60s then retrying...`);
          await new Promise(r => setTimeout(r, 60000));
          
          const retryResponse = await fetch(extractUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ email_id: emailId }),
          });
          const retryText = await retryResponse.text();
          try { data = JSON.parse(retryText); } catch {
            errors++;
            details.push({ email_id: emailId, status: "error", error: "Retry failed", subject: currentSubject });
            continue;
          }
          if (!retryResponse.ok) {
            errors++;
            details.push({ email_id: emailId, status: "error", error: "Retry: " + (data.error || `HTTP ${retryResponse.status}`), subject: currentSubject });
            continue;
          }
        } else if (!response.ok) {
          errors++;
          details.push({ email_id: emailId, status: "error", error: data.error || `HTTP ${response.status}`, subject: currentSubject });
          continue;
        }

        const ex = data?.extracted || 0;
        const er = data?.errors || 0;
        extracted += ex;
        if (er > 0) errors += er;
        if (ex === 0 && er === 0) skipped++;
        details.push({
          email_id: emailId,
          status: ex > 0 ? "extracted" : "skipped",
          subject: currentSubject,
          data,
        });

        // Small delay between emails to avoid rate limits
        await new Promise(r => setTimeout(r, 3000));

      } catch (err) {
        errors++;
        details.push({ email_id: emailId, status: "error", error: err instanceof Error ? err.message : "Unknown", subject: currentSubject });
      }
    }

    // Get current counts
    const { count: totalEmails } = await supabase
      .from("emails").select("id", { count: "exact", head: true })
      .or("classification.eq.invoice,classification.is.null,has_attachments.eq.true")
      .gte("received_at", "2026-01-01T00:00:00.000Z");

    const { count: totalInvoices } = await supabase
      .from("invoices").select("id", { count: "exact", head: true });

    const { count: totalCashflow } = await supabase
      .from("cashflow_entries").select("id", { count: "exact", head: true });

    // Company breakdown
    const { data: companyBreakdown } = await supabase
      .from("invoices").select("company");
    const byCompany: Record<string, number> = {};
    for (const inv of companyBreakdown || []) {
      const c = inv.company || "Unknown";
      byCompany[c] = (byCompany[c] || 0) + 1;
    }

    console.log(`Batch done: processed=${toProcess.length}, extracted=${extracted}, skipped=${skipped}, ignored=${ignored}, errors=${errors}`);

    return new Response(JSON.stringify({
      processed: toProcess.length,
      extracted,
      skipped,
      ignored,
      errors,
      total_emails: totalEmails || 0,
      total_invoices: totalInvoices || 0,
      total_cashflow: totalCashflow || 0,
      by_company: byCompany,
      current_subject: currentSubject,
      test_mode: testMode,
      next_offset: offset + batchSize,
      details,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Reprocess error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
