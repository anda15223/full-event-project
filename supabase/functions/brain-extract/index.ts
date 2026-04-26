// Extracts text+summary from an uploaded brain document (PDF / image / text).
// Uses Lovable AI Gateway (google/gemini-2.5-flash) with multimodal input.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { storage_path, mime_type, category, pasted_text, filename } =
      await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    const userParts: any[] = [];
    let sourceLabel = filename || "document";

    if (pasted_text && pasted_text.trim()) {
      userParts.push({
        type: "text",
        text: `The user pasted the following content (category: ${category}):\n\n${pasted_text}`,
      });
      sourceLabel = "pasted text";
    } else if (storage_path) {
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/festival-photos/${storage_path}`;
      const mt = (mime_type || "").toLowerCase();
      const isImage = mt.startsWith("image/");
      const isPdf = mt.includes("pdf");

      if (isImage) {
        // Fetch image server-side and inline as base64 data URL
        const r = await fetch(publicUrl);
        if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
        const buf = new Uint8Array(await r.arrayBuffer());
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode(...buf.subarray(i, i + chunk));
        }
        const b64 = btoa(binary).replace(/\s/g, "");

        // Resolve a clean MIME type Gemini accepts
        const ctHeader = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        let imgMime = ctHeader || mt;
        const ext = (filename || storage_path || "").split(".").pop()?.toLowerCase();
        if (!imgMime || !imgMime.startsWith("image/")) {
          if (ext === "jpg" || ext === "jpeg") imgMime = "image/jpeg";
          else if (ext === "webp") imgMime = "image/webp";
          else if (ext === "gif") imgMime = "image/gif";
          else imgMime = "image/png";
        }
        if (imgMime === "image/jpg") imgMime = "image/jpeg";

        const dataUrl = `data:${imgMime};base64,${b64}`;
        userParts.push({ type: "image_url", image_url: { url: dataUrl } });
        userParts.push({
          type: "text",
          text: `Extract the full readable content from this image (filename: ${filename}, category: ${category}). Then write a 1-2 sentence summary on the first line prefixed with "SUMMARY:". After that, return the cleaned full text.`,
        });
      } else if (isPdf) {
        // PDFs: must be sent as base64 data URL with application/pdf MIME type
        const r = await fetch(publicUrl);
        if (!r.ok) throw new Error(`Failed to fetch PDF: ${r.status}`);
        const buf = new Uint8Array(await r.arrayBuffer());
        // Base64 encode in chunks to avoid call-stack limits on large PDFs
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode(...buf.subarray(i, i + chunk));
        }
        const b64 = btoa(binary);
        const dataUrl = `data:application/pdf;base64,${b64}`;
        userParts.push({
          type: "image_url",
          image_url: { url: dataUrl },
        });
        userParts.push({
          type: "text",
          text: `Extract the full readable content from this PDF (filename: ${filename}, category: ${category}). Then write a 1-2 sentence summary on the first line prefixed with "SUMMARY:". After that, return the cleaned full text.`,
        });
      } else {
        // Fallback: try to fetch as text
        const r = await fetch(publicUrl);
        const text = await r.text();
        userParts.push({
          type: "text",
          text: `File contents (filename: ${filename}, category: ${category}):\n\n${text.slice(
            0,
            50000
          )}`,
        });
      }
    } else {
      throw new Error("Either storage_path or pasted_text is required");
    }

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are a knowledge extractor for a festival catering operations platform. Your job is to read uploaded documents (contracts, electricity plans, supplier quotes, emails, rules, notes) and return clean, structured plain text that humans and AI can later search. Always start with a one-line 'SUMMARY: ...' then the full content.",
            },
            { role: "user", content: userParts },
          ],
        }),
      }
    );

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429)
        return new Response(
          JSON.stringify({ error: "Rate limited. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      if (aiRes.status === 402)
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Lovable workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      throw new Error(`AI gateway: ${aiRes.status} ${t}`);
    }

    const data = await aiRes.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";

    let summary = "";
    let content = raw;
    const m = raw.match(/^SUMMARY:\s*(.+?)\n([\s\S]*)$/);
    if (m) {
      summary = m[1].trim();
      content = m[2].trim();
    }

    return new Response(
      JSON.stringify({ summary, content, source_label: sourceLabel }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("brain-extract error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
