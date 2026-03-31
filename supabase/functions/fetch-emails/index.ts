import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import PostalMime from "npm:postal-mime";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  since_date: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function formatAddress(address: unknown): string {
  if (!address) return "unknown";
  if (typeof address === "string") return address;

  if (Array.isArray(address)) {
    return formatAddress(address[0]);
  }

  if (typeof address === "object") {
    const value = address as {
      name?: string;
      address?: string;
      text?: string;
      value?: unknown[];
    };

    if (Array.isArray(value.value) && value.value.length > 0) {
      return formatAddress(value.value[0]);
    }

    if (value.text) return value.text;
    if (value.name && value.address) return `${value.name} <${value.address}>`;
    if (value.address) return value.address;
    if (value.name) return value.name;
  }

  return "unknown";
}

function toIsoString(dateValue: string | null | undefined) {
  if (!dateValue) return new Date().toISOString();

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }

  return parsedDate.toISOString();
}

function extractRawEmail(fetchResponse: string, tag: string) {
  const literalMatch = fetchResponse.match(/BODY\.PEEK\[\] \{\d+\}\r\n/);
  if (!literalMatch || literalMatch.index === undefined) {
    return { rawEmail: null, uid: null };
  }

  const start = literalMatch.index + literalMatch[0].length;
  const endMarker = `\r\n)\r\n${tag} `;
  const end = fetchResponse.lastIndexOf(endMarker);
  const rawEmail = end === -1 ? fetchResponse.slice(start) : fetchResponse.slice(start, end);
  const uidMatch = fetchResponse.match(/UID (\d+)/);

  return {
    rawEmail,
    uid: uidMatch?.[1] ?? null,
  };
}

async function readResponse(
  conn: Deno.Conn,
  decoder: TextDecoder,
  isComplete: (response: string) => boolean,
  maxChunks = 200,
) {
  const buffer = new Uint8Array(65536);
  let response = "";

  for (let i = 0; i < maxChunks; i++) {
    const bytesRead = await conn.read(buffer);
    if (bytesRead === null) break;

    response += decoder.decode(buffer.subarray(0, bytesRead));

    if (isComplete(response)) {
      break;
    }
  }

  return response;
}

async function sendCommand(
  conn: Deno.Conn,
  encoder: TextEncoder,
  decoder: TextDecoder,
  tag: string,
  command: string,
) {
  await conn.write(encoder.encode(`${tag} ${command}\r\n`));

  return readResponse(
    conn,
    decoder,
    (response) =>
      response.includes(`${tag} OK`) ||
      response.includes(`${tag} NO`) ||
      response.includes(`${tag} BAD`),
    400,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let conn: Deno.Conn | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const parsedRequest = RequestSchema.safeParse(body);

    if (!parsedRequest.success) {
      return new Response(
        JSON.stringify({ error: parsedRequest.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { since_date, limit = 100, offset = 0 } = parsedRequest.data;

    const IMAP_EMAIL = Deno.env.get("IMAP_EMAIL");
    const IMAP_PASSWORD = Deno.env.get("IMAP_PASSWORD");
    const IMAP_HOST = Deno.env.get("IMAP_HOST") || "imap.one.com";
    const IMAP_PORT = Number.parseInt(Deno.env.get("IMAP_PORT") || "993", 10);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!IMAP_EMAIL || !IMAP_PASSWORD) {
      return new Response(
        JSON.stringify({
          error: "IMAP credentials not configured",
          setup_required: true,
          message: "Please add IMAP_EMAIL, IMAP_PASSWORD, and optionally IMAP_HOST secrets",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    conn = await Deno.connectTls({
      hostname: IMAP_HOST,
      port: IMAP_PORT,
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    await readResponse(conn, decoder, (response) => response.includes("\r\n"), 20);

    const loginResponse = await sendCommand(conn, encoder, decoder, "A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`);
    if (!loginResponse.includes("A1 OK")) {
      return new Response(
        JSON.stringify({ error: "IMAP login failed", details: loginResponse }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const selectResponse = await sendCommand(conn, encoder, decoder, "A2", "SELECT INBOX");
    const existsMatch = selectResponse.match(/\* (\d+) EXISTS/);
    const totalEmails = existsMatch ? Number.parseInt(existsMatch[1], 10) : 0;

    if (totalEmails === 0) {
      await sendCommand(conn, encoder, decoder, "A99", "LOGOUT");
      return new Response(
        JSON.stringify({ emails: [], total: 0, fetched: 0, inserted: 0, skipped: 0, has_more: false, next_offset: offset }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let searchCommand = "SEARCH ALL";
    if (since_date) {
      const date = new Date(since_date);
      if (Number.isNaN(date.getTime())) {
        return new Response(
          JSON.stringify({ error: { since_date: ["Invalid date"] } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      searchCommand = `SEARCH SINCE ${date.getDate()}-${months[date.getMonth()]}-${date.getFullYear()}`;
    }

    const searchResponse = await sendCommand(conn, encoder, decoder, "A3", searchCommand);
    const searchLine = searchResponse.split("\r\n").find((line) => line.startsWith("* SEARCH"));
    const messageIds = searchLine
      ? searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean).map(Number)
      : [];

    const pageEnd = Math.max(0, messageIds.length - offset);
    const pageStart = Math.max(0, pageEnd - limit);
    const fetchIds = messageIds.slice(pageStart, pageEnd);

    const emails: Array<{
      message_id: string;
      subject: string;
      sender: string;
      body_text: string;
      received_at: string;
    }> = [];

    for (const seqNum of fetchIds) {
      try {
        const tag = `F${seqNum}`;
        const fetchResponse = await sendCommand(conn, encoder, decoder, tag, `FETCH ${seqNum} (UID BODY.PEEK[])`);
        const { rawEmail, uid } = extractRawEmail(fetchResponse, tag);

        if (!rawEmail) {
          continue;
        }

        const parsedEmail = await PostalMime.parse(rawEmail);
        const bodyText = normalizeText(parsedEmail.text || stripHtml(parsedEmail.html || "")).slice(0, 5000);
        const sender = formatAddress(parsedEmail.from);
        const subject = normalizeText(parsedEmail.subject) || "(no subject)";
        const receivedAt = toIsoString(parsedEmail.date);
        const messageId = normalizeText(parsedEmail.messageId) || (uid ? `imap-uid-${uid}` : `imap-seq-${seqNum}`);

        emails.push({
          message_id: messageId,
          subject,
          sender,
          body_text: bodyText,
          received_at: receivedAt,
        });
      } catch (error) {
        console.error(`Failed to parse email ${seqNum}:`, error);
      }
    }

    await sendCommand(conn, encoder, decoder, "A99", "LOGOUT");
    conn.close();
    conn = null;

    const supabase = createClient(supabaseUrl, supabaseKey);

    let inserted = 0;
    let skipped = 0;

    for (const email of emails) {
      const { error } = await supabase.from("emails").upsert(
        {
          message_id: email.message_id,
          subject: email.subject,
          sender: email.sender,
          body_text: email.body_text,
          received_at: email.received_at,
          processed: false,
        },
        { onConflict: "message_id" },
      );

      if (error) {
        console.error("Insert error:", error);
        skipped++;
      } else {
        inserted++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_found: messageIds.length,
        fetched: emails.length,
        inserted,
        skipped,
        has_more: pageStart > 0,
        next_offset: offset + emails.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Fetch emails error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } finally {
    if (conn) {
      try {
        conn.close();
      } catch {
        // ignore close errors
      }
    }
  }
});