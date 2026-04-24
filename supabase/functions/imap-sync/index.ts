import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  sync_from: z.string().optional().default("2026-01-01"),
  sync_to: z.string().optional(),
  batch_size: z.number().int().min(1).max(10).optional().default(5),
  job_id: z.string().uuid().optional(),
  folders: z.array(z.enum(["inbox", "sent"])).optional().default(["inbox", "sent"]),
});

/* ── IMAP helpers ── */

function concatU8(arrays: Uint8Array[], total: number): Uint8Array {
  const r = new Uint8Array(total);
  let o = 0;
  for (const a of arrays) { r.set(a, o); o += a.length; }
  return r;
}

async function readRaw(conn: Deno.Conn, isDone: (tail: string) => boolean, max = 16384): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const buf = new Uint8Array(32768);
  const dec = new TextDecoder("iso-8859-1");
  let tail = "";
  for (let i = 0; i < 200; i++) {
    const n = await conn.read(buf);
    if (n === null) break;
    const chunk = buf.slice(0, n);
    chunks.push(chunk);
    total += n;
    tail = (tail + dec.decode(chunk, { stream: true })).slice(-8192);
    if (isDone(tail) || total > max) break;
  }
  return concatU8(chunks, total);
}

async function imapCmd(conn: Deno.Conn, tag: string, cmd: string, max = 16384): Promise<string> {
  await conn.write(new TextEncoder().encode(`${tag} ${cmd}\r\n`));
  const raw = await readRaw(conn, (t) => t.includes(`${tag} OK`) || t.includes(`${tag} NO`) || t.includes(`${tag} BAD`), max);
  return new TextDecoder("iso-8859-1").decode(raw);
}

/** Try several common Sent-folder names; return the first one the server accepts. */
async function selectSentFolder(conn: Deno.Conn, tagPrefix: string): Promise<string | null> {
  const candidates = ["Sent", "Sent Items", "Sendt", "INBOX.Sent", "INBOX.Sent Items"];
  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i];
    const res = await imapCmd(conn, `${tagPrefix}${i}`, `SELECT "${name}"`, 4096);
    if (res.includes(" OK")) {
      console.log(`Sent folder detected: "${name}"`);
      return name;
    }
  }
  console.warn("No Sent folder found on this account");
  return null;
}

/* ── Main handler ── */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let conn: Deno.Conn | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sync_from, sync_to, batch_size, job_id, folders } = parsed.data;
    const effectiveSyncTo = sync_to || new Date().toISOString().split("T")[0];

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const IMAP_EMAIL = Deno.env.get("IMAP_EMAIL");
    const IMAP_PASSWORD = Deno.env.get("IMAP_PASSWORD");
    const IMAP_HOST = Deno.env.get("IMAP_HOST") || "imap.one.com";
    const IMAP_PORT = parseInt(Deno.env.get("IMAP_PORT") || "993", 10);

    if (!IMAP_EMAIL || !IMAP_PASSWORD) {
      return new Response(JSON.stringify({ error: "IMAP credentials not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create or resume sync job
    let jobId = job_id;
    if (!jobId) {
      const { data: job, error: jobErr } = await supabase
        .from("email_sync_jobs")
        .insert({
          status: "running",
          sync_from,
          sync_to: effectiveSyncTo,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (jobErr) throw jobErr;
      jobId = job.id;
    } else {
      await supabase.from("email_sync_jobs").update({ status: "running" }).eq("id", jobId);
    }

    const updateJob = async (fields: Record<string, unknown>) => {
      await supabase.from("email_sync_jobs").update(fields).eq("id", jobId);
    };

    /* ── IMAP Connect ── */
    conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });
    await readRaw(conn, (t) => t.includes("\r\n"), 4096);

    const loginRes = await imapCmd(conn, "A1", `LOGIN "${IMAP_EMAIL}" "${IMAP_PASSWORD}"`, 4096);
    if (!loginRes.includes("A1 OK")) {
      await updateJob({ status: "failed", error_log: [{ error: "IMAP login failed" }] });
      return new Response(JSON.stringify({ error: "IMAP login failed" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── Build folder plan ── */
    type FolderPlan = { folder: "inbox" | "sent"; mailbox: string };
    const plan: FolderPlan[] = [];
    if (folders.includes("inbox")) plan.push({ folder: "inbox", mailbox: "INBOX" });
    if (folders.includes("sent")) {
      const sentName = await selectSentFolder(conn, "S");
      if (sentName) plan.push({ folder: "sent", mailbox: sentName });
    }

    let totalFoundAll = 0;
    let processed = 0;
    let invoicesExtracted = 0;
    let skipped = 0;
    const errors: Array<{ seq: number; folder: string; error: string }> = [];

    /* ── Iterate folders ── */
    for (let folderIdx = 0; folderIdx < plan.length; folderIdx++) {
      const { folder, mailbox } = plan[folderIdx];
      const tagBase = folder === "inbox" ? "I" : "T";

      await imapCmd(conn, `${tagBase}S`, `SELECT "${mailbox}"`, 4096);

      // SEARCH for date range
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const fromDate = new Date(sync_from);
      const searchCmd = `SEARCH SINCE ${fromDate.getDate()}-${months[fromDate.getMonth()]}-${fromDate.getFullYear()}`;

      const searchRes = await imapCmd(conn, `${tagBase}SR`, searchCmd, 65536);
      const searchLine = searchRes.split("\r\n").find((l) => l.startsWith("* SEARCH"));
      const allMsgNums = searchLine
        ? searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean).map(Number)
        : [];

      const totalFound = allMsgNums.length;
      const totalBatches = Math.ceil(totalFound / batch_size);
      totalFoundAll += totalFound;

      await updateJob({
        total_emails_found: totalFoundAll,
        total_batches: totalBatches,
        current_subject: `[${folder}] scanning ${totalFound} emails...`,
      });

      if (totalFound === 0) continue;

      // Process newest first
      const sortedMsgs = [...allMsgNums].reverse();

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const batchStart = batchIdx * batch_size;
        const batchMsgs = sortedMsgs.slice(batchStart, batchStart + batch_size);
        if (batchMsgs.length === 0) break;

        await updateJob({
          current_batch: batchIdx + 1,
          total_processed: processed,
          total_invoices_extracted: invoicesExtracted,
          total_skipped: skipped,
        });

        const seqRange = batchMsgs.join(",");
        const fetchRes = await imapCmd(
          conn,
          `${tagBase}F${batchIdx}`,
          `FETCH ${seqRange} (UID BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE MESSAGE-ID)])`,
          131072,
        );

        const msgPattern = /\* (\d+) FETCH \((?:.*?UID (\d+).*?|.*?)\{(\d+)\}\r\n/g;
        let match: RegExpExecArray | null;
        const batchEmails: Array<{ seq: number; uid: string; subject: string; sender: string; date: string; messageId: string }> = [];

        while ((match = msgPattern.exec(fetchRes)) !== null) {
          const seqNum = parseInt(match[1], 10);
          const uid = match[2] || `seq-${seqNum}`;
          const literalSize = parseInt(match[3], 10);
          const headerStart = match.index + match[0].length;
          const headerBlock = fetchRes.substring(headerStart, headerStart + literalSize);

          const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
          const getHeader = (name: string): string | null => {
            const m = unfolded.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
            return m ? decodeMimeWords(m[1].trim()) : null;
          };

          batchEmails.push({
            seq: seqNum,
            uid,
            subject: getHeader("Subject") || "(no subject)",
            sender: getHeader("From") || "unknown",
            date: getHeader("Date") || new Date().toISOString(),
            messageId: getHeader("Message-ID") || `imap-${folder}-uid-${uid}`,
          });
        }

        for (const em of batchEmails) {
          try {
            await updateJob({ current_subject: `[${folder}] ${em.subject}` });

            const { data: existing } = await supabase
              .from("emails")
              .select("id, processed, folder")
              .eq("message_id", em.messageId)
              .limit(1);

            if (existing && existing.length > 0 && existing[0].processed) {
              // Make sure folder tag is set even if previously processed
              if (!existing[0].folder || existing[0].folder !== folder) {
                await supabase.from("emails").update({ folder }).eq("id", existing[0].id);
              }
              const { count: invCount } = await supabase
                .from("invoices")
                .select("id", { count: "exact", head: true })
                .eq("email_id", existing[0].id);
              if (invCount && invCount > 0) invoicesExtracted++;
              skipped++;
              processed++;
              continue;
            }

            const receivedAt = (() => {
              const d = new Date(em.date);
              return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
            })();

            const { data: upserted, error: upsertErr } = await supabase
              .from("emails")
              .upsert({
                message_id: em.messageId,
                subject: em.subject,
                sender: em.sender,
                body_text: "",
                received_at: receivedAt,
                processed: false,
                folder,
              }, { onConflict: "message_id" })
              .select("id")
              .single();

            if (upsertErr || !upserted) {
              errors.push({ seq: em.seq, folder, error: upsertErr?.message || "Upsert failed" });
              processed++;
              continue;
            }

            const emailId = upserted.id;

            try {
              await supabase.functions.invoke("fetch-email-body", {
                body: { email_id: emailId, force: true },
              });
            } catch (parseErr) {
              console.error(`Body parse failed for ${emailId}:`, parseErr);
            }

            // Classification only meaningful for inbox; skip for sent to save tokens
            if (folder === "inbox") {
              try {
                await supabase.functions.invoke("classify-emails", {
                  body: { email_ids: [emailId] },
                });
              } catch (classifyErr) {
                console.error(`Classification failed for ${emailId}:`, classifyErr);
              }

              const { data: classifiedEmail } = await supabase
                .from("emails")
                .select("classification, has_attachments")
                .eq("id", emailId)
                .single();

              if (classifiedEmail?.classification === "invoice" && classifiedEmail?.has_attachments) {
                const { data: storedAtts } = await supabase
                  .from("email_attachments")
                  .select("id, parse_status, storage_path, part_number")
                  .eq("email_id", emailId)
                  .eq("is_inline", false);

                const needsDownload = (storedAtts || []).filter(
                  (a) => a.part_number && (!a.storage_path || a.parse_status === "pending_upload" || a.parse_status === "pending")
                );

                for (const att of needsDownload) {
                  try {
                    await supabase.functions.invoke("fetch-email-attachment", {
                      body: { attachment_id: att.id },
                    });
                  } catch (dlErr) {
                    console.error(`Attachment download failed for ${att.id}:`, dlErr);
                  }
                }

                try {
                  await supabase.functions.invoke("extract-invoice", {
                    body: { email_id: emailId },
                  });
                  invoicesExtracted++;
                } catch (extractErr) {
                  console.error(`Invoice extraction failed for ${emailId}:`, extractErr);
                }
              }
            }

            // === Document extraction (both folders) ===
            // After body+attachments are fetched, push every supported attachment
            // into extracted_documents and trigger categorize-document.
            try {
              await supabase.functions.invoke("ingest-email-documents", {
                body: { email_id: emailId, folder },
              });
            } catch (docErr) {
              console.error(`Document ingestion failed for ${emailId}:`, docErr);
            }

            processed++;
            await updateJob({
              total_processed: processed,
              total_invoices_extracted: invoicesExtracted,
              total_skipped: skipped,
              last_uid_processed: `${folder}:${em.uid}`,
            });

          } catch (emailErr) {
            console.error(`Error processing email seq=${em.seq}:`, emailErr);
            errors.push({ seq: em.seq, folder, error: emailErr instanceof Error ? emailErr.message : "Unknown" });
            processed++;
          }
        }
      }
    }

    await imapCmd(conn, "Z99", "LOGOUT", 1024);
    conn.close(); conn = null;

    await updateJob({
      status: "completed",
      completed_at: new Date().toISOString(),
      total_processed: processed,
      total_invoices_extracted: invoicesExtracted,
      total_skipped: skipped,
      error_log: errors.length > 0 ? errors : [],
      current_subject: null,
    });

    return new Response(JSON.stringify({
      job_id: jobId,
      status: "completed",
      total_found: totalFoundAll,
      processed,
      invoices_extracted: invoicesExtracted,
      skipped,
      errors: errors.length,
      folders_synced: plan.map((p) => `${p.folder} (${p.mailbox})`),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("imap-sync error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (conn) { try { conn.close(); } catch { /* */ } }
  }
});

function decodeMimeWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g,
    (_match, charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === "B") {
          const bytes = Uint8Array.from(Array.from(atob(text), (c: string) => c.charCodeAt(0)));
          return new TextDecoder(charset).decode(bytes);
        }
        const qp = text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
        return qp;
      } catch { return text; }
    },
  );
}
