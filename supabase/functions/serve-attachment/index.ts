import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const allowedBuckets = new Set(["email-attachments", "festival-photos", "invoice-pdfs"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { attachmentId, storagePath, bucket, mimeType: providedMimeType, filename: providedFilename } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let path = storagePath;
    let storageBucket = bucket || "email-attachments";
    let mimeType = providedMimeType || "application/pdf";
    let filename = providedFilename || "attachment.pdf";

    // If attachmentId provided, look up the record
    if (attachmentId && !path) {
      const { data: att, error } = await supabase
        .from("email_attachments")
        .select("storage_path, filename, mime_type")
        .eq("id", attachmentId)
        .single();

      if (error || !att?.storage_path) {
        return new Response(
          JSON.stringify({ error: "Attachment not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      path = att.storage_path;
      storageBucket = "email-attachments";
      mimeType = att.mime_type || mimeType;
      filename = att.filename || filename;
    }

    if (!allowedBuckets.has(storageBucket)) {
      return new Response(
        JSON.stringify({ error: "Bucket not allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!path) {
      return new Response(
        JSON.stringify({ error: "No storagePath or attachmentId provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Download from storage server-side
    const { data: fileData, error: dlError } = await supabase.storage
      .from(storageBucket)
      .download(path);

    if (dlError || !fileData) {
      const detail = dlError ? (dlError.message || JSON.stringify(dlError)) : "no file returned";
      return new Response(
        JSON.stringify({ error: "Failed to download file", detail, bucket: storageBucket, path }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    return new Response(
      JSON.stringify({ base64, mimeType, filename }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
