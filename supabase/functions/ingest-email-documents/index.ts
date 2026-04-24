// Pulls every supported attachment from a single email into extracted_documents,
// copies the file from email-attachments → documents bucket, then triggers
// categorize-document for AI categorization. Idempotent on (email_id, filename).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const Body = z.object({
  email_id: z.string().uuid(),
  folder: z.enum(["inbox", "sent"]).optional().default("inbox"),
});

const SUPPORTED_MIME_PREFIXES = ["application/pdf", "image/", "text/csv", "text/plain"];
const SUPPORTED_MIME_EXACT = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.ms-excel", // xls
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/msword", // doc
]);
const SUPPORTED_EXTENSIONS = /\.(pdf|xlsx|xls|docx|doc|jpg|jpeg|png|heic|webp|csv|txt)$/i;

function isSupported(mime: string | null, filename: string | null): boolean {
  if (filename && SUPPORTED_EXTENSIONS.test(filename)) return true;
  if (!mime) return false;
  if (SUPPORTED_MIME_EXACT.has(mime)) return true;
  return SUPPORTED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { email_id, folder } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: email, error: emailErr } = await supabase
      .from("emails")
      .select("id, sender, subject, received_at, folder")
      .eq("id", email_id)
      .single();
    if (emailErr || !email) throw new Error(`Email not found: ${email_id}`);

    const effectiveFolder = email.folder || folder;

    const { data: attachments } = await supabase
      .from("email_attachments")
      .select("id, filename, mime_type, size, storage_path, extracted_text, extracted_summary, is_inline")
      .eq("email_id", email_id)
      .eq("is_inline", false);

    if (!attachments || attachments.length === 0) {
      return new Response(JSON.stringify({ ok: true, ingested: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let ingested = 0;
    for (const att of attachments) {
      if (!isSupported(att.mime_type, att.filename)) continue;
      if (!att.storage_path) continue;

      // Idempotency: skip if already ingested for this email + filename
      const { data: existing } = await supabase
        .from("extracted_documents")
        .select("id")
        .eq("email_id", email_id)
        .eq("filename", att.filename || `attachment-${att.id}`)
        .maybeSingle();
      if (existing) continue;

      // Copy file from email-attachments to documents bucket
      let newPath = `${effectiveFolder}/${email_id}/${att.id}-${(att.filename || "file").replace(/[^\w.\-]/g, "_")}`;
      try {
        const { data: blob, error: dlErr } = await supabase.storage
          .from("email-attachments")
          .download(att.storage_path);
        if (dlErr || !blob) throw dlErr || new Error("download failed");

        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(newPath, blob, {
            contentType: att.mime_type || "application/octet-stream",
            upsert: true,
          });
        if (upErr) throw upErr;
      } catch (copyErr) {
        console.error(`Failed to copy attachment ${att.id}:`, copyErr);
        continue;
      }

      const { data: docRow, error: insErr } = await supabase
        .from("extracted_documents")
        .insert({
          email_id,
          filename: att.filename || `attachment-${att.id}`,
          mime_type: att.mime_type,
          storage_path: newPath,
          size_bytes: att.size,
          folder: effectiveFolder,
          received_at: email.received_at,
          sender: email.sender,
          subject: email.subject,
          extracted_text: att.extracted_text,
          ai_summary: att.extracted_summary,
          parse_status: "uploaded",
        })
        .select("id")
        .single();

      if (insErr || !docRow) {
        console.error(`Failed to insert extracted_document:`, insErr);
        continue;
      }

      ingested++;

      // Fire categorize-document (don't block on it)
      try {
        await supabase.functions.invoke("categorize-document", {
          body: { document_id: docRow.id },
        });
      } catch (catErr) {
        console.error(`categorize-document failed for ${docRow.id}:`, catErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, ingested }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ingest-email-documents error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
