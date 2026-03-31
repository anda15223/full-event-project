import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple IMAP email fetcher using one.com
// Since Deno doesn't have native IMAP, we use a REST-based approach
// For production, you'd use a proper IMAP library or proxy

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { since_date, limit = 50 } = await req.json();

    const IMAP_EMAIL = Deno.env.get("IMAP_EMAIL");
    const IMAP_PASSWORD = Deno.env.get("IMAP_PASSWORD");
    const IMAP_HOST = Deno.env.get("IMAP_HOST") || "imap.one.com";
    const IMAP_PORT = Deno.env.get("IMAP_PORT") || "993";

    if (!IMAP_EMAIL || !IMAP_PASSWORD) {
      return new Response(
        JSON.stringify({ 
          error: "IMAP credentials not configured",
          setup_required: true,
          message: "Please add IMAP_EMAIL, IMAP_PASSWORD, and optionally IMAP_HOST secrets"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use a Python-based IMAP fetch via subprocess or external service
    // For now, we'll use a direct TCP connection approach
    // In production, this should be a dedicated IMAP microservice
    
    // Connect to IMAP server using Deno's TCP with TLS
    const conn = await Deno.connectTls({
      hostname: IMAP_HOST,
      port: parseInt(IMAP_PORT),
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    async function readResponse(): Promise<string> {
      const buf = new Uint8Array(8192);
      let result = "";
      let attempts = 0;
      while (attempts < 10) {
        const n = await conn.read(buf);
        if (n === null) break;
        result += decoder.decode(buf.subarray(0, n));
        if (result.includes("\r\n") && !result.endsWith("}\r\n")) break;
        attempts++;
      }
      return result;
    }

    async function sendCommand(tag: string, command: string): Promise<string> {
      await conn.write(encoder.encode(`${tag} ${command}\r\n`));
      let response = "";
      let attempts = 0;
      while (attempts < 20) {
        const buf = new Uint8Array(16384);
        const n = await conn.read(buf);
        if (n === null) break;
        response += decoder.decode(buf.subarray(0, n));
        if (response.includes(`${tag} OK`) || response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) break;
        attempts++;
      }
      return response;
    }

    // Read greeting
    await readResponse();

    // Login
    const loginResp = await sendCommand("A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`);
    if (!loginResp.includes("A1 OK")) {
      conn.close();
      return new Response(
        JSON.stringify({ error: "IMAP login failed", details: loginResp }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Select INBOX
    const selectResp = await sendCommand("A2", "SELECT INBOX");
    const existsMatch = selectResp.match(/\* (\d+) EXISTS/);
    const totalEmails = existsMatch ? parseInt(existsMatch[1]) : 0;

    if (totalEmails === 0) {
      await sendCommand("A3", "LOGOUT");
      conn.close();
      return new Response(
        JSON.stringify({ emails: [], total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Search for emails since date
    let searchCmd = "SEARCH ALL";
    if (since_date) {
      const d = new Date(since_date);
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const dateStr = `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
      searchCmd = `SEARCH SINCE ${dateStr}`;
    }
    
    const searchResp = await sendCommand("A3", searchCmd);
    const searchLine = searchResp.split("\r\n").find(l => l.startsWith("* SEARCH"));
    const messageIds = searchLine 
      ? searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean).map(Number)
      : [];

    const fetchIds = messageIds.slice(-limit);

    const emails: Array<{
      message_id: string;
      subject: string;
      sender: string;
      body_text: string;
      received_at: string;
    }> = [];

    for (const seqNum of fetchIds) {
      try {
        const fetchResp = await sendCommand("F" + seqNum, 
          `FETCH ${seqNum} (BODY[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)] BODY[TEXT])`
        );
        
        // Parse headers
        const fromMatch = fetchResp.match(/From:\s*(.+?)(?:\r\n(?!\s)|\r\n\))/i);
        const subjectMatch = fetchResp.match(/Subject:\s*(.+?)(?:\r\n(?!\s)|\r\n\))/i);
        const dateMatch = fetchResp.match(/Date:\s*(.+?)(?:\r\n(?!\s)|\r\n\))/i);
        const msgIdMatch = fetchResp.match(/Message-ID:\s*(.+?)(?:\r\n(?!\s)|\r\n\))/i);

        // Extract body text (simplified - gets text between body markers)
        let bodyText = "";
        const bodyParts = fetchResp.split("BODY[TEXT]");
        if (bodyParts.length > 1) {
          bodyText = bodyParts[1]
            .replace(/\{(\d+)\}\r\n/, "")
            .replace(/\)\r\n.*$/, "")
            .replace(/<[^>]*>/g, " ")  // strip HTML
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 3000); // limit body size
        }

        const sender = fromMatch ? fromMatch[1].trim() : "unknown";
        const subject = subjectMatch ? subjectMatch[1].trim() : "(no subject)";
        const dateStr = dateMatch ? dateMatch[1].trim() : new Date().toISOString();
        const messageId = msgIdMatch ? msgIdMatch[1].trim() : `${seqNum}-${Date.now()}`;

        let receivedAt: string;
        try {
          receivedAt = new Date(dateStr).toISOString();
        } catch {
          receivedAt = new Date().toISOString();
        }

        emails.push({
          message_id: messageId,
          subject,
          sender,
          body_text: bodyText,
          received_at: receivedAt,
        });
      } catch (e) {
        console.error(`Failed to fetch email ${seqNum}:`, e);
      }
    }

    // Logout
    await sendCommand("A99", "LOGOUT");
    conn.close();

    // Store emails in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
        { onConflict: "message_id" }
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
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("Fetch emails error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
