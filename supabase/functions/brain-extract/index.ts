// Extracts text+summary from an uploaded brain document (PDF / image / text).
// Uses Lovable AI Gateway (google/gemini-2.5-flash) with multimodal input.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function cleanBase64(base64String: string): string {
  const cleaned = base64String.trim().replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  if (!cleaned) {
    throw new Error("The uploaded file is empty. Please choose a non-empty JPG, PNG, WebP, GIF, or PDF.");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new Error("Invalid base64 string after cleaning");
  }
  return cleaned;
}

function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { storage_path, file_data_url, mime_type, category, pasted_text, filename } =
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
    } else if (file_data_url) {
      const mt = (mime_type || file_data_url.match(/^data:([^;]+);base64,/)?.[1] || "").split(";")[0].trim().toLowerCase();
      const ext = (filename || "").split(".").pop()?.toLowerCase();
      const isJpg = ext === "jpg" || ext === "jpeg" || mt === "image/jpg" || mt === "image/jpeg";
      const isImage = mt.startsWith("image/") || ["png", "webp", "gif"].includes(ext || "") || isJpg;
      const isPdf = mt.includes("pdf") || ext === "pdf";
      const b64 = cleanBase64(file_data_url);
      if (isImage) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const detectedMime = detectImageMime(bytes);
        if (!detectedMime) {
          throw new Error("This image is not a valid JPG, PNG, WebP, or GIF. Please re-save it as a real JPG or PNG and upload again.");
        }
        userParts.push({
          type: "text",
          text: `Extract the full readable content from this image (filename: ${filename}, category: ${category}). Then write a 1-2 sentence summary on the first line prefixed with "SUMMARY:". After that, return the cleaned full text.`,
        });
        userParts.push({ type: "image_url", image_url: { url: `data:${detectedMime};base64,${b64}` } });
      } else if (isPdf) {
        userParts.push({
          type: "text",
          text: `Extract the full readable content from this PDF (filename: ${filename}, category: ${category}). Then write a 1-2 sentence summary on the first line prefixed with "SUMMARY:". After that, return the cleaned full text.`,
        });
        userParts.push({ type: "image_url", image_url: { url: `data:application/pdf;base64,${b64}` } });
      } else {
        // Fallback: try to decode as text
        try {
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).slice(0, 50000);
          if (!text.trim()) {
            throw new Error("empty");
          }
          userParts.push({
            type: "text",
            text: `Extract the full readable content from this file (filename: ${filename}, mime: ${mt}, category: ${category}). Then write a 1-2 sentence summary on the first line prefixed with "SUMMARY:". After that, return the cleaned full text.\n\nFILE CONTENTS:\n${text}`,
          });
        } catch {
          throw new Error(`This file type (${mt || ext || "unknown"}) cannot be read by AI yet. Please upload a JPG, PNG, WebP, GIF, PDF, or paste text.`);
        }
      }
    } else if (storage_path) {
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/festival-photos/${storage_path}`;
      const mt = (mime_type || "").split(";")[0].trim().toLowerCase();
      const ext = (filename || storage_path || "").split(".").pop()?.toLowerCase();
      const isJpg = ext === "jpg" || ext === "jpeg" || mt === "image/jpg" || mt === "image/jpeg";
      const isImage = mt.startsWith("image/") || ["png", "webp", "gif"].includes(ext || "") || isJpg;
      const isPdf = mt.includes("pdf") || ext === "pdf";

      if (isImage) {
        // Binary image: send bytes as base64 to Gemini vision.
        const r = await fetch(publicUrl);
        if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
        const buf = new Uint8Array(await r.arrayBuffer());
        const detectedMime = detectImageMime(buf);

        if (!detectedMime) {
          const preview = new TextDecoder().decode(buf.slice(0, 120));
          console.error("brain-extract invalid image bytes", {
            filename,
            storage_path,
            mime_type,
            response_content_type: r.headers.get("content-type"),
            size: buf.length,
            preview,
          });
          throw new Error("This file is not a readable JPG/PNG/WebP/GIF image. Please re-save it as a real JPG or PNG and upload again.");
        }

        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk) as any);
        }
        const b64 = cleanBase64(btoa(binary));

        userParts.push({
          type: "text",
          text: `Extract the full readable content from this image (filename: ${filename}, category: ${category}). Then write a 1-2 sentence summary on the first line prefixed with "SUMMARY:". After that, return the cleaned full text.`,
        });
        userParts.push({
          type: "image_url",
          image_url: {
            url: `data:${detectedMime};base64,${b64}`,
          },
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
          binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk) as any);
        }
        const b64 = cleanBase64(btoa(binary));
        userParts.push({
          type: "text",
          text: `Extract the full readable content from this PDF (filename: ${filename}, category: ${category}). Then write a 1-2 sentence summary on the first line prefixed with "SUMMARY:". After that, return the cleaned full text.`,
        });
        userParts.push({
          type: "image_url",
          image_url: { url: `data:application/pdf;base64,${b64}` },
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
