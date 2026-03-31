import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  since_date: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
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

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeMimeWords(value: string | null | undefined) {
  if (!value) return "";

  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (match, _charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === "B") {
        return new TextDecoder("utf-8").decode(Uint8Array.from(atob(text), (char) => char.charCodeAt(0)));
      }

      const qp = text
        .replace(/_/g, " ")
        .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

      return new TextDecoder("utf-8").decode(Uint8Array.from(qp, (char) => char.charCodeAt(0)));
    } catch {
      return match;
    }
  });
}

function toIsoString(dateValue: string | null | undefined) {
  if (!dateValue) return new Date().toISOString();

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }

  return parsedDate.toISOString();
}

function extractUid(fetchResponse: string) {
  return fetchResponse.match(/UID (\d+)/)?.[1] ?? null;
}

function extractLiterals(fetchResponse: string) {
  const literals: string[] = [];
  const literalRegex = /\{(\d+)\}\r\n/g;
  let match: RegExpExecArray | null;

  while ((match = literalRegex.exec(fetchResponse)) !== null) {
    const size = Number.parseInt(match[1], 10);
    const start = match.index + match[0].length;
    const literal = fetchResponse.slice(start, start + size);
    literals.push(literal);
    literalRegex.lastIndex = start + size;
  }

  return literals;
}

function parseHeaderBlock(headerBlock: string) {
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");

  const getHeader = (name: string) => {
    const match = unfolded.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
    return decodeMimeWords(normalizeText(match?.[1] ?? null)) || null;
  };

  return {
    subject: getHeader("Subject") || "(no subject)",
    sender: getHeader("From") || "unknown",
    date: getHeader("Date"),
    messageId: getHeader("Message-ID"),
  };
}

function extractBodySnippet(bodySection: string) {
  const decoded = decodeQuotedPrintable(bodySection);
  const stripped = decoded.includes("<html") ? stripHtml(decoded) : decoded;

  return normalizeText(
    stripped
      .replace(/Content-[^\n]+/gi, " ")
      .replace(/--[^\n]+/g, " "),
  ).slice(0, 2500);
}

async function readResponse(
  conn: Deno.Conn,
  decoder: TextDecoder,
  isComplete: (response: string) => boolean,
  maxChunks = 120,
) {
  const buffer = new Uint8Array(32768);
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
    160,
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

    const { since_date, limit = 3, offset = 0 } = parsedRequest.data;

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

    conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });

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
      const tag = `F${seqNum}`;
      const fetchResponse = await sendCommand(
        conn,
        encoder,
        decoder,
        tag,
        `FETCH ${seqNum} (UID BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE MESSAGE-ID)] BODY.PEEK[TEXT]<0.2500>)`,
      );

      const literals = extractLiterals(fetchResponse);
      const uid = extractUid(fetchResponse);
      const headerBlock = literals[0] ?? "";
      const bodySection = literals[1] ?? "";

      if (!headerBlock && !bodySection) {
        console.error("No FETCH literals found for message", seqNum);
        continue;
      }

      const headers = parseHeaderBlock(headerBlock);
      const bodyText = extractBodySnippet(bodySection);
      const messageId = headers.messageId || (uid ? `imap-uid-${uid}` : `imap-seq-${seqNum}`);

      emails.push({
        message_id: messageId,
        subject: headers.subject,
        sender: headers.sender,
        body_text: bodyText,
        received_at: toIsoString(headers.date),
      });
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
        next_offset: offset + fetchIds.length,
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