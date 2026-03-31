import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  since_date: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

const DEFAULT_SINCE_DATE = "2026-02-01";

/* ── Lightweight header-only helpers ────────────────────────── */

function decodeWithCharset(bytes: Uint8Array, charset: string): string {
  const normalized = (charset || "utf-8").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const map: Record<string, string> = {
    utf8: "utf-8",
    iso88591: "iso-8859-1",
    latin1: "iso-8859-1",
    windows1252: "windows-1252",
    cp1252: "windows-1252",
    usascii: "utf-8",
    ascii: "utf-8",
  };
  const resolved = map[normalized.replace(/-/g, "")] || normalized || "utf-8";
  try {
    return new TextDecoder(resolved, { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return new TextDecoder("iso-8859-1").decode(bytes);
    }
  }
}

function decodeMimeWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g,
    (match: string, charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === "B") {
          const bytes = Uint8Array.from(Array.from(atob(text), (char: string) => char.charCodeAt(0)));
          return decodeWithCharset(bytes, charset);
        }
        const qp = text
          .replace(/_/g, " ")
          .replace(/=([0-9A-F]{2})/gi, (_m: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
        const bytes = Uint8Array.from(Array.from(qp, (char: string) => char.charCodeAt(0)));
        return decodeWithCharset(bytes, charset);
      } catch {
        return match;
      }
    },
  );
}

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toIsoString(dateValue: string | null | undefined): string {
  if (!dateValue) return new Date().toISOString();
  const d = new Date(dateValue);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function parseHeaders(headerBlock: string) {
  // Unfold continuation lines
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");

  const get = (name: string): string | null => {
    const m = unfolded.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
    return m ? decodeMimeWords(normalizeText(m[1])) : null;
  };

  return {
    subject: get("Subject") || "(no subject)",
    sender: get("From") || "unknown",
    date: get("Date"),
    messageId: get("Message-ID"),
  };
}

/* ── IMAP I/O ─────────────────────────────────────────────── */

async function readResponse(
  conn: Deno.Conn,
  decoder: TextDecoder,
  isComplete: (r: string) => boolean,
  maxChunks = 80,
): Promise<string> {
  const buf = new Uint8Array(16384);
  let response = "";
  for (let i = 0; i < maxChunks; i++) {
    const n = await conn.read(buf);
    if (n === null) break;
    response += decoder.decode(buf.subarray(0, n));
    if (isComplete(response)) break;
  }
  return response;
}

async function sendCommand(
  conn: Deno.Conn,
  encoder: TextEncoder,
  decoder: TextDecoder,
  tag: string,
  command: string,
): Promise<string> {
  await conn.write(encoder.encode(`${tag} ${command}\r\n`));
  return readResponse(
    conn,
    decoder,
    (r) => r.includes(`${tag} OK`) || r.includes(`${tag} NO`) || r.includes(`${tag} BAD`),
    120,
  );
}

/* ── Main handler ─────────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let conn: Deno.Conn | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Default limit is 10 — header-only fetch is cheap
    const { since_date, limit = 10, offset = 0 } = parsed.data;
    const effectiveSinceDate = since_date || DEFAULT_SINCE_DATE;

    const IMAP_EMAIL = Deno.env.get("IMAP_EMAIL");
    const IMAP_PASSWORD = Deno.env.get("IMAP_PASSWORD");
    const IMAP_HOST = Deno.env.get("IMAP_HOST") || "imap.one.com";
    const IMAP_PORT = parseInt(Deno.env.get("IMAP_PORT") || "993", 10);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!IMAP_EMAIL || !IMAP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "IMAP credentials not configured", setup_required: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /* ── Connect & authenticate ─── */
    conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    await readResponse(conn, dec, (r) => r.includes("\r\n"), 10);

    const loginRes = await sendCommand(conn, enc, dec, "A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`);
    if (!loginRes.includes("A1 OK")) {
      return new Response(
        JSON.stringify({ error: "IMAP login failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const selRes = await sendCommand(conn, enc, dec, "A2", "SELECT INBOX");
    const existsMatch = selRes.match(/\* (\d+) EXISTS/);
    const totalEmails = existsMatch ? parseInt(existsMatch[1], 10) : 0;

    if (totalEmails === 0) {
      await sendCommand(conn, enc, dec, "A99", "LOGOUT");
      return new Response(
        JSON.stringify({ total_found: 0, fetched: 0, inserted: 0, skipped: 0, has_more: false, next_offset: offset }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /* ── SEARCH ─── */
    let searchCmd = "SEARCH ALL";
    {
      const d = new Date(effectiveSinceDate);
      if (Number.isNaN(d.getTime())) {
        return new Response(
          JSON.stringify({ error: { since_date: ["Invalid date"] } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      searchCmd = `SEARCH SINCE ${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
    }

    const searchRes = await sendCommand(conn, enc, dec, "A3", searchCmd);
    const searchLine = searchRes.split("\r\n").find((l) => l.startsWith("* SEARCH"));
    const msgNums = searchLine
      ? searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean).map(Number)
      : [];

    const pageEnd = Math.max(0, msgNums.length - offset);
    const pageStart = Math.max(0, pageEnd - limit);
    const fetchIds = msgNums.slice(pageStart, pageEnd);

    if (fetchIds.length === 0) {
      await sendCommand(conn, enc, dec, "A99", "LOGOUT");
      return new Response(
        JSON.stringify({ total_found: msgNums.length, fetched: 0, inserted: 0, skipped: 0, has_more: false, next_offset: offset }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /* ── FETCH headers only (single command for all messages) ─── */
    const seqRange = fetchIds.join(",");
    const tag = "F1";
    const fetchRes = await sendCommand(
      conn,
      enc,
      dec,
      tag,
      `FETCH ${seqRange} (UID BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE MESSAGE-ID)])`,
    );

    await sendCommand(conn, enc, dec, "A99", "LOGOUT");
    conn.close();
    conn = null;

    /* ── Parse the multi-message response ─── */
    // Each message response looks like:
    // * <seq> FETCH (UID <uid> BODY[HEADER.FIELDS ...] {<size>}\r\n<headers>\r\n)\r\n
    const msgPattern = /\* (\d+) FETCH \((?:.*?UID (\d+).*?|.*?)\{(\d+)\}\r\n/g;
    const emails: Array<{
      message_id: string;
      subject: string;
      sender: string;
      body_text: string;
      received_at: string;
    }> = [];

    let match: RegExpExecArray | null;
    while ((match = msgPattern.exec(fetchRes)) !== null) {
      const seqNum = match[1];
      const uid = match[2] || null;
      const literalSize = parseInt(match[3], 10);
      const headerStart = match.index + match[0].length;
      const headerBlock = fetchRes.substring(headerStart, headerStart + literalSize);

      const headers = parseHeaders(headerBlock);
      const messageId = headers.messageId || (uid ? `imap-uid-${uid}` : `imap-seq-${seqNum}`);

      emails.push({
        message_id: messageId,
        subject: headers.subject,
        sender: headers.sender,
        body_text: "", // Body fetched later during classification if needed
        received_at: toIsoString(headers.date),
      });
    }

    /* ── Upsert to database ─── */
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
        { onConflict: "message_id", ignoreDuplicates: true },
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
        total_found: msgNums.length,
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
      try { conn.close(); } catch { /* ignore */ }
    }
  }
});