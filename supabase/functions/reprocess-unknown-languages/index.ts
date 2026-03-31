import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  batch_size: z.number().int().min(1).max(200).optional().default(200),
  max_total: z.number().int().min(1).max(2000).optional().default(200),
  dry_run: z.boolean().optional().default(false),
  reparse_from_imap: z.boolean().optional().default(false),
});

/* ── Language detection heuristic ──────────────────────────── */

function detectLanguage(text: string | null | undefined): string {
  if (!text || text.trim().length < 20) return "unknown";

  const cleaned = text.trim().substring(0, 500).toLowerCase();

  const danishSignals = [
    "faktura", "betaling", "vedr", "venlig hilsen", "bestilling", "levering",
    "tak for", "med venlig", "kære", "hermed", "fremsendes", "dato",
    "tilbud", "ordre", "forsikring", "aftale", "virksomhed", "selskab",
    "indkøb", "varenr", "moms", "beløb", "antal", "pris",
    "goddag", "hej", "mvh", "hilsen", "bekræft", "modtag",
  ];
  const romanianSignals = [
    "factura", "plata", "termen", "societate", "societatea", "furnizor",
    "client", "suma", "total", "deviz", "comanda", "livrare",
    "chitanta", "bon fiscal", "scadent", "platit", "buna ziua",
    "va rugam", "multumim", "stimate",
  ];
  const englishSignals = [
    "invoice", "payment", "please find", "attached", "dear", "regards",
    "sincerely", "thank you", "best regards", "hi ", "hello",
    "order", "delivery", "confirm", "receipt",
  ];

  const danishScore = danishSignals.filter(s => cleaned.includes(s)).length;
  const romanianScore = romanianSignals.filter(s => cleaned.includes(s)).length;
  const englishScore = englishSignals.filter(s => cleaned.includes(s)).length;

  const hasDanishChars = /[æøåÆØÅ]/.test(text.substring(0, 500));
  const hasRomanianChars = /[ăâîșțĂÂÎȘȚ]/.test(text.substring(0, 500));

  if (hasDanishChars || danishScore >= 2) return "da";
  if (hasRomanianChars || romanianScore >= 2) return "ro";
  if (englishScore >= 2) return "en";

  // English as default for readable ASCII text
  if (cleaned.length >= 20 && /^[\x20-\x7E\r\n]+$/.test(cleaned.substring(0, 200))) {
    return "en";
  }

  return "unknown";
}

/* ── HTML to clean text (same as fetch-email-body) ─────────── */

function htmlToCleanText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<img[^>]*width\s*=\s*["']?1["']?[^>]*>/gi, "")
    .replace(/<img[^>]*height\s*=\s*["']?1["']?[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(h[1-6])>/gi, "\n\n")
    .replace(/<\/?(table|tbody|thead|tfoot)\b[^>]*>/gi, "\n")
    .replace(/<\/?td\b[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&aelig;/gi, "æ")
    .replace(/&oslash;/gi, "ø")
    .replace(/&aring;/gi, "å")
    .replace(/&AElig;/g, "Æ")
    .replace(/&Oslash;/g, "Ø")
    .replace(/&Aring;/g, "Å")
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCharCode(parseInt(code, 10)); } catch { return " "; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCharCode(parseInt(hex, 16)); } catch { return " "; }
    })
    .replace(/&[a-zA-Z]+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeBinary(text: string): boolean {
  if (!text || text.length < 100) return false;
  const trimmed = text.trim();
  if (/^[A-Za-z0-9+/=\r\n\s]{200,}$/.test(trimmed)) return true;
  const base64Chars = (trimmed.match(/[A-Za-z0-9+/=]/g) || []).length;
  if (base64Chars / trimmed.length > 0.95 && trimmed.length > 500) return true;
  return false;
}

/* ── Main handler ───────────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { batch_size, dry_run, reparse_from_imap } = parsed.data;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Count total unknown
    const { count: totalUnknown } = await supabase
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("language", "unknown");

    const summary = {
      total_unknown: totalUnknown || 0,
      processed: 0,
      changed_to_da: 0,
      changed_to_en: 0,
      changed_to_ro: 0,
      still_unknown: 0,
      reparsed_from_imap: 0,
      reparsed_from_html: 0,
      errors: 0,
    };

    if (dry_run) {
      return new Response(JSON.stringify({ dry_run: true, ...summary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: emails, error: fetchErr } = await supabase
        .from("emails")
        .select("id, body_text, body_html, body_clean_text, parse_status, message_id, language")
        .eq("language", "unknown")
        .range(offset, offset + batch_size - 1)
        .order("received_at", { ascending: false });

      if (fetchErr) {
        console.error("Fetch error:", fetchErr);
        break;
      }

      if (!emails || emails.length === 0) {
        hasMore = false;
        break;
      }

      for (const email of emails) {
        try {
          let bodyCleanText = email.body_clean_text as string | null;
          let bodyText = email.body_text as string | null;
          let bodyHtml = email.body_html as string | null;
          let wasReparsed = false;

          // Step 1: If body_clean_text is empty or binary, try re-extracting from HTML
          const cleanTextBad = !bodyCleanText || bodyCleanText.length < 20 || looksLikeBinary(bodyCleanText);

          if (cleanTextBad && bodyHtml && bodyHtml.length > 20) {
            bodyCleanText = htmlToCleanText(bodyHtml);
            summary.reparsed_from_html++;
            wasReparsed = true;
          }

          // Step 2: If still bad and bodyText exists but looks like it needs cleanup
          if ((!bodyCleanText || bodyCleanText.length < 20) && bodyText && bodyText.length > 20 && !looksLikeBinary(bodyText)) {
            bodyCleanText = bodyText.replace(/\u0000/g, "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
            wasReparsed = true;
          }

          // Step 3: If reparse_from_imap is true and we still have no good text, re-fetch from IMAP
          if (reparse_from_imap && (!bodyCleanText || bodyCleanText.length < 20)) {
            try {
              const { data: reParsed } = await supabase.functions.invoke("fetch-email-body", {
                body: { email_id: email.id, force: true },
              });
              if (reParsed?.body_clean_text) {
                bodyCleanText = reParsed.body_clean_text;
                bodyText = reParsed.body_text || bodyText;
                bodyHtml = reParsed.body_html || bodyHtml;
                summary.reparsed_from_imap++;
                wasReparsed = true;
              }
            } catch (e) {
              console.error(`IMAP reparse failed for ${email.id}:`, e);
            }
          }

          // Step 4: Detect language on the best available text
          const textForDetection = bodyCleanText || bodyText || "";
          const newLang = detectLanguage(textForDetection);

          // Step 5: Update the email record
          const updateFields: Record<string, unknown> = {
            language: newLang,
          };
          if (wasReparsed && bodyCleanText) {
            updateFields.body_clean_text = bodyCleanText;
            updateFields.parse_status = "reparsed";
          }

          await supabase.from("emails").update(updateFields).eq("id", email.id);

          summary.processed++;
          if (newLang === "da") summary.changed_to_da++;
          else if (newLang === "en") summary.changed_to_en++;
          else if (newLang === "ro") summary.changed_to_ro++;
          else summary.still_unknown++;

        } catch (err) {
          console.error(`Error reprocessing ${email.id}:`, err);
          summary.errors++;
        }
      }

      // If we got fewer than batch_size, we're done
      if (emails.length < batch_size) {
        hasMore = false;
      } else {
        // Don't increment offset — the query filters by language=unknown,
        // and we just changed some to non-unknown, so next page naturally shifts
      }

      // Safety: prevent infinite loops
      if (summary.processed > (totalUnknown || 1000) + 100) break;
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Reprocess error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
