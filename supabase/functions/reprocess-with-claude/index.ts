import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const batchSize = body.batch_size || 20;
    const testMode = body.test_mode || false;
    const offset = body.offset || 0;
    const parallel = body.parallel || 5;
    const retryErrors = body.retry_errors || false;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Reprocess: test=${testMode}, batch=${batchSize}, offset=${offset}, parallel=${parallel}, retryErrors=${retryErrors}`);

    // Retry mode: re-process emails that errored previously (body-only, simpler approach)
    if (retryErrors) {
      return await handleRetryErrors(supabase, supabaseUrl, supabaseKey, parallel);
    }

    let query;
    if (testMode) {
      query = supabase
        .from("emails")
        .select("id, subject, sender, classification, router_status, has_attachments, received_at")
        .not("router_status", "eq", "ignored")
        .or("classification.eq.invoice,has_attachments.eq.true")
        .gte("received_at", "2026-01-01T00:00:00.000Z")
        .order("received_at", { ascending: false })
        .limit(5);
    } else {
      query = supabase
        .from("emails")
        .select("id, subject, sender, classification, router_status, has_attachments, received_at")
        .eq("classification", "invoice")
        .not("router_status", "eq", "ignored")
        .gte("received_at", "2026-01-01T00:00:00.000Z")
        .order("received_at", { ascending: false })
        .range(offset, offset + batchSize - 1);
    }

    const { data: emails, error: queryError } = await query;
    if (queryError) throw queryError;

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({
        processed: 0, extracted: 0, skipped: 0, ignored: 0, errors: 0,
        error_breakdown: {},
        message: "No more invoice emails to process", done: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const emailIds = emails.map((e: any) => e.id);

    let toProcess: string[];
    if (testMode) {
      toProcess = emailIds;
    } else {
      const { data: existingInvoices } = await supabase
        .from("invoices").select("email_id").in("email_id", emailIds);
      const existingIds = new Set((existingInvoices || []).map((i: any) => i.email_id));
      toProcess = emailIds.filter((id: string) => !existingIds.has(id));

      if (toProcess.length === 0) {
        return new Response(JSON.stringify({
          processed: 0, extracted: 0, skipped: 0, ignored: 0, errors: 0,
          error_breakdown: {},
          message: "All emails in this batch already have invoices",
          next_offset: offset + batchSize,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    let extracted = 0;
    let skipped = 0;
    let ignored = 0;
    let errors = 0;
    const errorBreakdown: Record<string, number> = {};
    const details: any[] = [];
    let currentSubject = "";
    const extractUrl = `${supabaseUrl}/functions/v1/extract-invoice`;

    for (let i = 0; i < toProcess.length; i += parallel) {
      const chunk = toProcess.slice(i, i + parallel);
      console.log(`▶ Parallel batch ${Math.floor(i / parallel) + 1}: ${chunk.length} emails`);

      const results = await Promise.allSettled(
        chunk.map(async (emailId) => {
          const email = emails.find((e: any) => e.id === emailId);
          const subject = email?.subject || "";

          const ignoreReason = email ? shouldSkipEmail(email) : null;
          if (ignoreReason) {
            await supabase.from("emails").update({
              router_status: "ignored", assigned_agent: "ignore_agent",
            }).eq("id", emailId);
            return { email_id: emailId, status: "ignored", reason: ignoreReason, subject };
          }

          // Call extract-invoice with retry for rate limits
          for (let attempt = 0; attempt < 3; attempt++) {
            const response = await fetch(extractUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
              body: JSON.stringify({ email_id: emailId }),
            });

            if (response.status === 429) {
              const wait = Math.pow(2, attempt) * 5000;
              console.log(`⏳ Rate limited on ${emailId}, waiting ${wait}ms (attempt ${attempt + 1})`);
              await new Promise(r => setTimeout(r, wait));
              continue;
            }

            const responseText = await response.text();
            let data: any;
            try { data = JSON.parse(responseText); } catch {
              return { email_id: emailId, status: "error", error: "Non-JSON response", error_category: "json_parse", subject };
            }

            if (!response.ok) {
              return { email_id: emailId, status: "error", error: data.error || `HTTP ${response.status}`, error_category: data.error_category || "other", subject };
            }

            const ex = data?.extracted || 0;
            const er = data?.errors || 0;
            const firstResult = (data.results || []).find((r: any) => r.status === "extracted");
            const firstError = (data.results || []).find((r: any) => r.status === "error");
            return {
              email_id: emailId,
              status: ex > 0 ? "extracted" : (er > 0 ? "error" : "skipped"),
              subject,
              extracted: ex,
              supplier_name: firstResult?.supplier_name || null,
              amount: firstResult?.amount || null,
              currency: firstResult?.currency || "DKK",
              company: firstResult?.company || null,
              location: firstResult?.location || null,
              invoice_number: firstResult?.invoice_number || null,
              confidence: firstResult?.confidence || null,
              error: er > 0 ? (firstError?.error || "extraction error") : (ex === 0 ? (data.results?.[0]?.error || "skipped") : undefined),
              error_category: firstError?.error_category || undefined,
              results: data.results,
            };
          }
          return { email_id: emailId, status: "error", error: "Rate limited after 3 retries", error_category: "rate_limit", subject };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          const r = result.value;
          if (r.status === "extracted") extracted += (r.extracted || 1);
          else if (r.status === "ignored") ignored++;
          else if (r.status === "error") {
            errors++;
            const cat = r.error_category || categorizeErrorMsg(r.error || "");
            errorBreakdown[cat] = (errorBreakdown[cat] || 0) + 1;
          }
          else skipped++;
          currentSubject = r.subject || currentSubject;
          details.push(r);
        } else {
          errors++;
          const errMsg = result.reason?.message || "Promise rejected";
          const cat = categorizeErrorMsg(errMsg);
          errorBreakdown[cat] = (errorBreakdown[cat] || 0) + 1;
          details.push({ email_id: "unknown", status: "error", error: errMsg, error_category: cat });
        }
      }

      if (i + parallel < toProcess.length) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Get current counts
    const [
      { count: totalEmails },
      { count: totalInvoices },
      { count: totalCashflow },
    ] = await Promise.all([
      supabase.from("emails").select("id", { count: "exact", head: true })
        .eq("classification", "invoice").gte("received_at", "2026-01-01T00:00:00.000Z"),
      supabase.from("invoices").select("id", { count: "exact", head: true }),
      supabase.from("cashflow_entries").select("id", { count: "exact", head: true }),
    ]);

    const { data: companyBreakdown } = await supabase.from("invoices").select("company");
    const byCompany: Record<string, number> = {};
    for (const inv of companyBreakdown || []) {
      const c = inv.company || "Unknown";
      byCompany[c] = (byCompany[c] || 0) + 1;
    }

    console.log(`Batch done: processed=${toProcess.length}, extracted=${extracted}, skipped=${skipped}, ignored=${ignored}, errors=${errors}`);
    console.log(`Error breakdown:`, JSON.stringify(errorBreakdown));

    return new Response(JSON.stringify({
      processed: toProcess.length,
      extracted, skipped, ignored, errors,
      error_breakdown: errorBreakdown,
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

/* ── Retry errored emails with body-only extraction ── */
async function handleRetryErrors(supabase: any, supabaseUrl: string, supabaseKey: string, parallel: number) {
  // Find emails classified as invoice that have no invoice record
  const { data: invoiceEmails } = await supabase
    .from("emails")
    .select("id, subject, sender")
    .eq("classification", "invoice")
    .not("router_status", "eq", "ignored")
    .gte("received_at", "2026-01-01T00:00:00.000Z")
    .order("received_at", { ascending: false })
    .limit(500);

  if (!invoiceEmails || invoiceEmails.length === 0) {
    return new Response(JSON.stringify({ processed: 0, extracted: 0, errors: 0, error_breakdown: {}, message: "No emails to retry" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find which ones don't have invoices yet
  const emailIds = invoiceEmails.map((e: any) => e.id);
  const { data: existingInvoices } = await supabase
    .from("invoices").select("email_id").in("email_id", emailIds);
  const existingIds = new Set((existingInvoices || []).map((i: any) => i.email_id));
  const toRetry = emailIds.filter((id: string) => !existingIds.has(id));

  console.log(`Retry: ${toRetry.length} emails without invoices out of ${emailIds.length} invoice-classified`);

  if (toRetry.length === 0) {
    return new Response(JSON.stringify({ processed: 0, extracted: 0, errors: 0, error_breakdown: {}, message: "All invoice emails already have invoices" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Limit retry to 100
  const batch = toRetry.slice(0, 100);
  let extracted = 0;
  let errors = 0;
  const errorBreakdown: Record<string, number> = {};
  const details: any[] = [];
  const extractUrl = `${supabaseUrl}/functions/v1/extract-invoice`;

  for (let i = 0; i < batch.length; i += parallel) {
    const chunk = batch.slice(i, i + parallel);

    const results = await Promise.allSettled(
      chunk.map(async (emailId) => {
        const email = invoiceEmails.find((e: any) => e.id === emailId);
        const response = await fetch(extractUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ email_id: emailId }),
        });

        const responseText = await response.text();
        let data: any;
        try { data = JSON.parse(responseText); } catch {
          return { email_id: emailId, status: "error", error: "Non-JSON", error_category: "json_parse", subject: email?.subject };
        }

        const ex = data?.extracted || 0;
        const firstError = (data.results || []).find((r: any) => r.status === "error");
        return {
          email_id: emailId,
          status: ex > 0 ? "extracted" : "error",
          subject: email?.subject,
          extracted: ex,
          error: ex === 0 ? (firstError?.error || data.results?.[0]?.error || "retry failed") : undefined,
          error_category: firstError?.error_category || undefined,
        };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const r = result.value;
        if (r.status === "extracted") extracted += (r.extracted || 1);
        else {
          errors++;
          const cat = r.error_category || categorizeErrorMsg(r.error || "");
          errorBreakdown[cat] = (errorBreakdown[cat] || 0) + 1;
        }
        details.push(r);
      } else {
        errors++;
        errorBreakdown["other"] = (errorBreakdown["other"] || 0) + 1;
      }
    }

    if (i + parallel < batch.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return new Response(JSON.stringify({
    processed: batch.length,
    extracted, errors,
    error_breakdown: errorBreakdown,
    retry_mode: true,
    remaining: toRetry.length - batch.length,
    details,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function categorizeErrorMsg(error: string): string {
  const e = (error || "").toLowerCase();
  if (e.includes("timeout") || e.includes("timed out") || e.includes("abort") || e.includes("deadline")) return "claude_timeout";
  if (e.includes("rate") || e.includes("429") || e.includes("too many")) return "rate_limit";
  if (e.includes("parse") || e.includes("json") || e.includes("unexpected token")) return "json_parse";
  if (e.includes("download") || e.includes("storage") || e.includes("no data")) return "attachment_download";
  if (e.includes("too large") || e.includes("token") || e.includes("maximum")) return "pdf_too_large";
  if (e.includes("no body") || e.includes("no text") || e.includes("empty") || e.includes("no invoice")) return "no_content";
  return "other";
}
