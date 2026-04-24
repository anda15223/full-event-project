// Categorizes a single extracted_document using Claude (claude-sonnet-4-5 via AIAGENTS).
// Determines: category, festival_slug (if applicable), short summary.
// Handles Danish + English. Respects manual_override.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const Body = z.object({
  document_id: z.string().uuid(),
  force: z.boolean().optional().default(false),
});

const FALLBACK_FESTIVAL_SLUGS = [
  "jelling", "copenhell", "heartland", "tinderbox", "vig",
  "gron-1", "gron-2", "syd-for-solen", "suset", "tonder",
  "roskilde", "smukfest", "northside",
];

const CATEGORIES = ["invoice", "festival", "contract", "hr", "supplier", "authority", "other"] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { document_id, force } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ANTHROPIC_KEY = Deno.env.get("AIAGENTS");
    if (!ANTHROPIC_KEY) throw new Error("AIAGENTS secret not configured");

    const { data: doc, error: docErr } = await supabase
      .from("extracted_documents")
      .select("id, filename, sender, subject, extracted_text, manual_override, email_id, folder")
      .eq("id", document_id)
      .single();
    if (docErr || !doc) throw new Error(`Document not found: ${document_id}`);

    if (doc.manual_override && !force) {
      return new Response(JSON.stringify({ ok: true, skipped: "manual_override" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build festival slug list — DB first, hardcoded fallback
    const { data: festivals } = await supabase.from("festivals").select("slug, name");
    const festivalSlugs = (festivals && festivals.length > 0)
      ? festivals.map((f) => f.slug)
      : FALLBACK_FESTIVAL_SLUGS;
    const festivalLookup = (festivals && festivals.length > 0)
      ? festivals.map((f) => `- ${f.slug} (${f.name})`).join("\n")
      : FALLBACK_FESTIVAL_SLUGS.map((s) => `- ${s}`).join("\n");

    // Get a body snippet from the source email for extra context
    let bodySnippet = "";
    if (doc.email_id) {
      const { data: emailRow } = await supabase
        .from("emails")
        .select("body_clean_text, body_text")
        .eq("id", doc.email_id)
        .single();
      bodySnippet = (emailRow?.body_clean_text || emailRow?.body_text || "").slice(0, 1500);
    }

    const docText = (doc.extracted_text || "").slice(0, 6000);

    const systemPrompt = `You are a document categorization assistant for a Danish food/festival catering business.
You categorize documents from email attachments (Danish + English).

Categories (pick exactly one):
- invoice: any invoice, receipt, faktura, kvittering, regning, kreditnota, opkrævning, PBS notice, payment request
- festival: contracts, menus, production plans, maps, rider docs, briefs, schedules tied to a specific festival
- contract: legal contracts NOT tied to a festival (rental, supplier agreements, insurance)
- hr: employment contracts, payslips, lønsedler, certificates, tax docs for staff
- supplier: supplier-related docs that are NOT invoices (catalogs, price lists, product sheets, web orders)
- authority: docs from public authorities (SKAT, Fødevarestyrelsen, kommune, municipality letters)
- other: anything that doesn't fit

If category=festival, identify which festival from this list:
${festivalLookup}

Match by name, location, or context. Use null if uncertain.

Return a SHORT summary (max 2 sentences, English).`;

    const userPrompt = `EMAIL SUBJECT: ${doc.subject || "(none)"}
SENDER: ${doc.sender || "(unknown)"}
FOLDER: ${doc.folder}
FILENAME: ${doc.filename}

EMAIL BODY SNIPPET:
${bodySnippet || "(empty)"}

DOCUMENT TEXT (first ~6000 chars):
${docText || "(no text extracted)"}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [{
          name: "categorize",
          description: "Return the document category, festival slug if applicable, and a short summary.",
          input_schema: {
            type: "object",
            properties: {
              category: { type: "string", enum: [...CATEGORIES] },
              festival_slug: { type: ["string", "null"], enum: [...festivalSlugs, null] },
              summary: { type: "string", description: "Short 1-2 sentence summary in English" },
            },
            required: ["category", "festival_slug", "summary"],
          },
        }],
        tool_choice: { type: "tool", name: "categorize" },
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error ${claudeRes.status}: ${errText}`);
    }

    const claudeJson = await claudeRes.json();
    const toolUse = claudeJson.content?.find((c: { type: string }) => c.type === "tool_use");
    if (!toolUse) throw new Error("Claude did not return a tool_use block");

    const result = toolUse.input as { category: string; festival_slug: string | null; summary: string };

    const finalCategory = CATEGORIES.includes(result.category as typeof CATEGORIES[number])
      ? result.category : "other";
    const finalFestivalSlug = (result.category === "festival" && result.festival_slug && festivalSlugs.includes(result.festival_slug))
      ? result.festival_slug : null;

    await supabase
      .from("extracted_documents")
      .update({
        category: finalCategory,
        festival_slug: finalFestivalSlug,
        ai_summary: result.summary,
        processed_at: new Date().toISOString(),
        parse_status: "categorized",
      })
      .eq("id", document_id);

    return new Response(JSON.stringify({
      ok: true,
      category: finalCategory,
      festival_slug: finalFestivalSlug,
      summary: result.summary,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("categorize-document error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
