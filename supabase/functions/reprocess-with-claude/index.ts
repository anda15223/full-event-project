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

    // For test mode: grab 5 most recent emails regardless of classification
    // For full mode: only process invoice-classified emails
    let query;
    if (testMode) {
      query = supabase
        .from("emails")
        .select("id, subject, sender, classification, router_status, has_attachments")
        .gte("received_at", "2026-01-01T00:00:00.000Z")
        .not("router_status", "eq", "ignored")
        .order("received_at", { ascending: false })
        .limit(5);
    } else {
      query = supabase
        .from("emails")
        .select("id, subject, sender, classification, router_status, has_attachments")
        .eq("classification", "invoice")
        .gte("received_at", "2026-01-01T00:00:00.000Z")
        .order("received_at", { ascending: false })
        .range(offset, offset + batchSize - 1);
    }

    const { data: emails, error: queryError } = await query;
    if (queryError) throw queryError;

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({
        processed: 0, extracted: 0, skipped: 0, ignored: 0, errors: 0,
        message: "No more invoice emails to process", done: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter out emails that already have invoices — but NOT in test mode (we want to see results)
    let toProcess: string[];
    if (testMode) {
      // Test mode: process all fetched emails regardless of existing invoices
      toProcess = emailIds;
      console.log(`Test mode: processing all ${toProcess.length} emails (ignoring existing invoices)`);
    } else {
      const { data: existingInvoices } = await supabase
        .from("invoices").select("email_id").in("email_id", emailIds);
      const existingIds = new Set((existingInvoices || []).map((i: any) => i.email_id));
      toProcess = emailIds.filter((id: string) => !existingIds.has(id));

      console.log(`Batch offset=${offset}: ${emails.length} invoice emails fetched, ${existingIds.size} already have invoices, ${toProcess.length} to process`);

      if (toProcess.length === 0) {
        return new Response(JSON.stringify({
          processed: 0, extracted: 0, skipped: 0, ignored: 0, errors: 0,
          message: "All emails in this batch already have invoices",
          next_offset: offset + batchSize,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
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
        console.log(`Ignoring ${emailId}: ${ignoreReason} — "${currentSubject}"`);
        await supabase.from("emails").update({
          router_status: "ignored",
          assigned_agent: "ignore_agent",
        }).eq("id", emailId);
        ignored++;
        details.push({ email_id: emailId, status: "ignored", reason: ignoreReason, subject: currentSubject });
        continue;
      }

      try {
        console.log(`▶ Calling extract-invoice for ${emailId}: "${currentSubject}"`);
        
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
          console.error(`Non-JSON response for ${emailId}:`, responseText.substring(0, 300));
          details.push({ email_id: emailId, status: "error", error: "Non-JSON response", subject: currentSubject });
          continue;
        }

        // Handle rate limit — wait 65 seconds and retry once
        if (response.status === 429 || (data.error && typeof data.error === 'string' && data.error.includes("rate_limit"))) {
          console.log(`⏳ Rate limited on ${emailId}, waiting 65s then retrying...`);
          await new Promise(r => setTimeout(r, 65000));
          
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
            details.push({ email_id: emailId, status: "error", error: "Retry non-JSON", subject: currentSubject });
            continue;
          }
          if (!retryResponse.ok) {
            errors++;
            details.push({ email_id: emailId, status: "error", error: "Retry: " + (data.error || `HTTP ${retryResponse.status}`), subject: currentSubject });
            continue;
          }
        } else if (!response.ok) {
          errors++;
          console.error(`HTTP ${response.status} for ${emailId}:`, JSON.stringify(data).substring(0, 300));
          details.push({ email_id: emailId, status: "error", error: data.error || `HTTP ${response.status}`, subject: currentSubject });
          continue;
        }

        const ex = data?.extracted || 0;
        const er = data?.errors || 0;
        extracted += ex;
        if (er > 0) errors += er;
        if (ex === 0 && er === 0) skipped++;
        
        console.log(`${ex > 0 ? '✅' : '⏭'} ${emailId}: extracted=${ex}, errors=${er}, subject="${currentSubject}"`);
        details.push({
          email_id: emailId,
          status: ex > 0 ? "extracted" : (er > 0 ? "error" : "skipped"),
          subject: currentSubject,
          extracted: ex,
          results: data.results,
        });

        // 5 second delay between emails to stay under 30k tokens/min
        await new Promise(r => setTimeout(r, 5000));

      } catch (err) {
        errors++;
        console.error(`Exception for ${emailId}:`, err instanceof Error ? err.message : JSON.stringify(err));
        details.push({ email_id: emailId, status: "error", error: err instanceof Error ? err.message : "Unknown", subject: currentSubject });
      }
    }

    // Get current counts
    const { count: totalEmails } = await supabase
      .from("emails").select("id", { count: "exact", head: true })
      .eq("classification", "invoice")
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
