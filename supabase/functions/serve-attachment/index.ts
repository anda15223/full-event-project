import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { attachmentId, storagePath } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let path = storagePath;
    let mimeType = "application/pdf";
    let filename = "attachment.pdf";

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
      mimeType = att.mime_type || mimeType;
      filename = att.filename || filename;
    }

    if (!path) {
      return new Response(
        JSON.stringify({ error: "No storagePath or attachmentId provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Download from storage server-side
    const { data: fileData, error: dlError } = await supabase.storage
      .from("email-attachments")
      .download(path);

    if (dlError || !fileData) {
      return new Response(
        JSON.stringify({ error: "Failed to download file", detail: dlError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
