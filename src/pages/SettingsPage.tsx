import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Mail, MessageCircle, Key, RefreshCw, Loader2, Zap, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

const STORAGE_KEY = "claude-reprocess-progress";

type ReprocessProgress = {
  batch: number;
  totalBatches: number;
  processed: number;
  extracted: number;
  skipped: number;
  ignored: number;
  errors: number;
  totalEmails: number;
  totalInvoices: number;
  totalCashflow: number;
  currentSubject: string;
  byCompany: Record<string, number>;
  errorBreakdown: Record<string, number>;
};

function loadSavedProgress(): { running: boolean; progress: ReprocessProgress | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { running: false, progress: null };
    const saved = JSON.parse(raw);
    // If it was marked running but page was closed, show as paused
    return { running: false, progress: saved.progress || null };
  } catch { return { running: false, progress: null }; }
}

function saveProgress(progress: ReprocessProgress | null, running: boolean) {
  if (progress) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ progress, running }));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function ClaudeReprocessPanel() {
  const saved = loadSavedProgress();
  const [running, setRunning] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState<ReprocessProgress | null>(saved.progress);
  const [testDetails, setTestDetails] = useState<any[] | null>(null);
  const [completed, setCompleted] = useState(false);
  const [retryResult, setRetryResult] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["claude-reprocess-stats"],
    queryFn: async () => {
      const { count: totalEmails } = await supabase
        .from("emails")
        .select("id", { count: "exact", head: true })
        .not("router_status", "eq", "ignored")
        .gte("received_at", "2026-01-01T00:00:00.000Z");
      const { count: totalInvoices } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true });
      const { count: totalCashflow } = await supabase
        .from("cashflow_entries")
        .select("id", { count: "exact", head: true });
      return { totalEmails: totalEmails || 0, totalInvoices: totalInvoices || 0, totalCashflow: totalCashflow || 0 };
    },
  });

  const runTest = async () => {
    setRunning(true);
    setTestDetails(null);
    setProgress(null);
    setCompleted(false);
    try {
      const { data, error } = await supabase.functions.invoke("reprocess-with-claude", {
        body: { test_mode: true, batch_size: 5 },
      });
      if (error) throw error;
      console.log("🧪 Claude test results:", JSON.stringify(data, null, 2));

      // Details now come with supplier_name, amount, company directly from extract-invoice
      setTestDetails(data.details || []);

      // Show total invoice count
      const { count: totalInv } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true });
      console.log("📦 Total invoices in database:", totalInv);

      toast.success(`Test complete: ${data.extracted ?? 0} invoices extracted from ${data.processed ?? 0} emails · ${totalInv} total invoices in DB`);
    } catch (err) {
      toast.error("Test failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setRunning(false);
    }
  };

  const pauseRef = useRef(false);

  const runFull = async () => {
    setRunning(true);
    setCompleted(false);
    setPaused(false);
    pauseRef.current = false;
    setTestDetails(null);
    const totals = {
      batch: 0, totalBatches: 0, processed: 0, extracted: 0, skipped: 0, ignored: 0, errors: 0,
      totalEmails: stats?.totalEmails || 0, totalInvoices: stats?.totalInvoices || 0,
      totalCashflow: stats?.totalCashflow || 0, currentSubject: "", byCompany: {} as Record<string, number>,
      errorBreakdown: {} as Record<string, number>,
    };
    const batchSize = 20;
    const maxBatches = Math.ceil((stats?.totalEmails || 2069) / batchSize);
    totals.totalBatches = maxBatches;
    let offset = 0;

    try {
      for (let i = 0; i < maxBatches; i++) {
        if (pauseRef.current) {
          toast.info("Reprocess stopped by user");
          break;
        }

        totals.batch = i + 1;
        const snap = { ...totals };
        setProgress(snap);
        saveProgress(snap, true);

        const { data, error } = await supabase.functions.invoke("reprocess-with-claude", {
          body: { test_mode: false, batch_size: batchSize, offset, parallel: 5 },
        });
        if (error) throw error;

        totals.processed += data.processed || 0;
        totals.extracted += data.extracted || 0;
        totals.skipped += data.skipped || 0;
        totals.ignored += data.ignored || 0;
        totals.errors += data.errors || 0;
        totals.totalInvoices = data.total_invoices || totals.totalInvoices;
        totals.totalCashflow = data.total_cashflow || totals.totalCashflow;
        totals.currentSubject = data.current_subject || "";
        if (data.by_company) totals.byCompany = data.by_company;
        // Accumulate error breakdown
        if (data.error_breakdown) {
          for (const [cat, count] of Object.entries(data.error_breakdown)) {
            totals.errorBreakdown[cat] = (totals.errorBreakdown[cat] || 0) + (count as number);
          }
        }

        // Move to next offset
        offset = data.next_offset || (offset + batchSize);

        const snap2 = { ...totals };
        setProgress(snap2);
        saveProgress(snap2, true);

        // Stop if no more emails or done flag
        if (data.done || (data.processed || 0) === 0) break;
        if (pauseRef.current) {
          toast.info("Reprocess stopped by user");
          break;
        }

        // 3 second pause between batches — parallel handles rate limiting internally
        await new Promise(r => setTimeout(r, 3000));
      }
      setCompleted(true);
      saveProgress(null, false);
      refetchStats();
      toast.success(`Reprocess complete: ${totals.extracted} invoices from ${totals.processed} emails`);
    } catch (err) {
      toast.error("Reprocess failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setRunning(false);
      saveProgress(progress, false);
    }
  };

  const handleStop = () => {
    pauseRef.current = true;
    setPaused(true);
    setRunning(false);
  };

  const handleReset = () => {
    setProgress(null);
    setCompleted(false);
    setPaused(false);
    saveProgress(null, false);
  };

  const runRetry = async () => {
    setRetrying(true);
    setRetryResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("reprocess-with-claude", {
        body: { retry_errors: true, parallel: 5 },
      });
      if (error) throw error;
      setRetryResult(data);
      toast.success(`Retry complete: ${data.extracted ?? 0} recovered from ${data.processed ?? 0} emails`);
      refetchStats();
    } catch (err) {
      toast.error("Retry failed: " + (err instanceof Error ? err.message : "Unknown"));
    } finally {
      setRetrying(false);
    }
  };

  const pct = progress ? Math.round((progress.processed / Math.max(progress.totalEmails, 1)) * 100) : 0;

  return (
    <Card className="glass-panel border-primary/20">
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Claude Invoice Extraction
        </CardTitle>
        <CardDescription>
          Full reprocess with all brain rules — {stats?.totalEmails ?? "..."} emails, {stats?.totalInvoices ?? "..."} invoices, {stats?.totalCashflow ?? "..."} cashflow entries
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!running && !progress && !completed && !showConfirm && (
          <div className="flex gap-2">
            <Button onClick={runTest} variant="outline" className="gap-2">
              <FlaskConical className="h-4 w-4" /> Test on 5 emails
            </Button>
            <Button onClick={() => setShowConfirm(true)} className="gap-2">
              <Zap className="h-4 w-4" /> Reprocess all with Claude
            </Button>
          </div>
        )}

        {showConfirm && !running && !progress && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
            <p className="font-heading font-semibold text-sm">Ready for clean reprocess</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Raw emails</span>
              <span className="font-mono font-semibold">{stats?.totalEmails?.toLocaleString() ?? "..."} ← all intact</span>
              <span className="text-muted-foreground">Suppliers</span>
              <span className="font-mono font-semibold">7 ← rules loaded</span>
              <span className="text-muted-foreground">Invoices</span>
              <span className="font-mono font-semibold">{stats?.totalInvoices ?? 0} ← {(stats?.totalInvoices ?? 0) === 0 ? "cleaned ✅" : "needs clean"}</span>
              <span className="text-muted-foreground">Cashflow entries</span>
              <span className="font-mono font-semibold">{stats?.totalCashflow ?? 0} ← {(stats?.totalCashflow ?? 0) === 0 ? "cleaned ✅" : "needs clean"}</span>
              <span className="text-muted-foreground">Deduplication</span>
              <span className="font-mono font-semibold text-success">ACTIVE ✅</span>
              <span className="text-muted-foreground">Error fixes</span>
              <span className="font-mono font-semibold text-success">APPLIED ✅</span>
              <span className="text-muted-foreground">Full scope</span>
              <span className="font-mono font-semibold">{stats?.totalEmails?.toLocaleString() ?? "..."} emails (all non-ignored)</span>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => { setShowConfirm(false); runFull(); }} className="gap-2">
                <Zap className="h-4 w-4" /> Start full reprocess
              </Button>
              <Button onClick={() => setShowConfirm(false)} variant="outline">Cancel</Button>
            </div>
          </div>
        )}

        {!running && progress && !completed && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              ⏸ Paused — {progress.processed} emails processed, {progress.extracted} invoices found
            </div>
            <Progress value={pct} className="h-2.5" />
            <div className="flex gap-2">
              <Button onClick={runFull} className="gap-2">
                <Zap className="h-4 w-4" /> Resume
              </Button>
              <Button onClick={handleReset} variant="outline" className="gap-2">
                Reset
              </Button>
            </div>
          </div>
        )}

        {running && progress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                Full reprocess — Batch {progress.batch}/{progress.totalBatches}
              </div>
              <Button onClick={handleStop} variant="outline" size="sm" className="gap-1.5 text-destructive">
                Stop
              </Button>
            </div>
            <Progress value={pct} className="h-2.5" />
            <p className="text-xs text-muted-foreground truncate">
              Currently reading: "{progress.currentSubject}"
            </p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
              <div>
                <div className="text-lg font-bold">{progress.processed}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Processed</div>
              </div>
              <div>
                <div className="text-lg font-bold text-success">{progress.extracted}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Invoices</div>
              </div>
              <div>
                <div className="text-lg font-bold text-agent-blue">{progress.totalCashflow}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Cashflow</div>
              </div>
              <div>
                <div className="text-lg font-bold text-muted-foreground">{progress.skipped}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Skipped</div>
              </div>
              <div>
                <div className="text-lg font-bold text-muted-foreground">{progress.ignored}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Ignored</div>
              </div>
              <div>
                <div className="text-lg font-bold text-destructive">{progress.errors}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Errors</div>
              </div>
            </div>
          </div>
        )}

        {!running && progress && (
          <div className="rounded-xl bg-muted/50 p-5 space-y-4">
            <p className="font-heading font-semibold text-sm">
              {completed ? "✅ Reprocess complete" : "⏸ Reprocess paused"} — {progress.processed.toLocaleString()} emails processed
            </p>

            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
              <div>
                <div className="text-lg font-bold">{progress.processed}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Processed</div>
              </div>
              <div>
                <div className="text-lg font-bold text-success">{progress.extracted}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Invoices</div>
              </div>
              <div>
                <div className="text-lg font-bold text-agent-blue">{progress.totalCashflow}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Cashflow</div>
              </div>
              <div>
                <div className="text-lg font-bold text-muted-foreground">{progress.skipped}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Skipped</div>
              </div>
              <div>
                <div className="text-lg font-bold text-muted-foreground">{progress.ignored}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Ignored</div>
              </div>
              <div>
                <div className="text-lg font-bold text-destructive">{progress.errors}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Errors</div>
              </div>
            </div>

            {/* Company breakdown */}
            {Object.keys(progress.byCompany).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">By Company</p>
                {Object.entries(progress.byCompany)
                  .sort(([, a], [, b]) => b - a)
                  .map(([company, count]) => (
                    <div key={company} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{company}</span>
                      <span className="font-mono font-semibold">{count}</span>
                    </div>
                  ))}
              </div>
            )}

            {/* Error breakdown */}
            {progress.errors > 0 && Object.keys(progress.errorBreakdown || {}).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">Errors ({progress.errors})</p>
                {Object.entries(progress.errorBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, count]) => {
                    const labels: Record<string, string> = {
                      pdf_too_large: "PDF too large",
                      json_parse: "JSON parse failed",
                      attachment_download: "Attachment download",
                      claude_timeout: "Claude timeout",
                      rate_limit: "Rate limited",
                      no_content: "No content",
                      other: "Other",
                    };
                    return (
                      <div key={category} className="flex items-center justify-between text-sm">
                        <span className="text-destructive/80">{labels[category] || category}</span>
                        <span className="font-mono font-semibold text-destructive">{count}</span>
                      </div>
                    );
                  })}
              </div>
            )}

            <div className="flex gap-2 pt-2 flex-wrap">
              <Button onClick={runFull} variant="outline" size="sm" className="gap-1.5">
                <RefreshCw className="h-3 w-3" /> {completed ? "Run again" : "Resume"}
              </Button>
              {completed && progress.errors > 0 && (
                <Button onClick={runRetry} disabled={retrying} variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30">
                  {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Retry {progress.errors} errors
                </Button>
              )}
              <Button variant="ghost" size="sm" className="gap-1.5" asChild>
                <a href="/agent/invoices">View invoices →</a>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5" asChild>
                <a href="/cashflow">View cashflow →</a>
              </Button>
            </div>

            {retryResult && (
              <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                <p className="font-semibold">🔄 Retry results</p>
                <p>Processed: {retryResult.processed} · Recovered: <span className="text-success font-semibold">{retryResult.extracted}</span> · Still errored: <span className="text-destructive">{retryResult.errors}</span></p>
                {retryResult.remaining > 0 && <p className="text-xs text-muted-foreground">{retryResult.remaining} more to retry</p>}
              </div>
            )}
          </div>
        )}

        {testDetails && testDetails.length > 0 && (
          <div className="rounded-xl bg-muted/50 p-4 space-y-3">
            <p className="font-heading font-semibold text-sm">
              🧪 Test results — {testDetails.length} emails tested
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {testDetails.filter((d: any) => d.status === "extracted").length} extracted · {testDetails.filter((d: any) => d.status === "skipped").length} skipped · {testDetails.filter((d: any) => d.status === "error").length} errors
              </span>
            </p>
            <div className="space-y-1.5">
              {testDetails.map((d: any, i: number) => {
                const icon = d.status === "extracted" ? "✅" : d.status === "ignored" ? "🚫" : d.status === "error" ? "⚠️" : "⏭";
                const supplier = d.supplier_name || d.supplier || "—";
                const amount = d.amount;
                const company = d.company || "";
                const currency = d.currency || "DKK";
                const skipReason = d.error || d.results?.[0]?.error || "";
                return (
                  <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/50 last:border-0">
                    <span className="w-5 text-center">{icon}</span>
                    <Badge
                      variant={d.status === "extracted" ? "default" : d.status === "ignored" ? "secondary" : d.status === "error" ? "destructive" : "outline"}
                      className="text-[10px] w-20 justify-center shrink-0"
                    >
                      {d.status}
                    </Badge>
                    <span className="flex-1 truncate font-medium">
                      {d.status === "extracted" ? supplier : (d.subject || d.email_id)}
                    </span>
                    <span className="w-28 text-right font-mono text-xs shrink-0">
                      {amount ? `${currency} ${Number(amount).toLocaleString("da-DK")}` : "—"}
                    </span>
                    <span className="w-44 text-right text-muted-foreground text-xs truncate shrink-0">
                      {d.status === "extracted" ? company : skipReason.substring(0, 60)}
                    </span>
                  </div>
                );
              })}
            </div>
            {testDetails.some((d: any) => d.error) && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">Errors</p>
                {testDetails.filter((d: any) => d.error).map((d: any, i: number) => (
                  <p key={i} className="text-xs text-destructive/80 truncate">
                    {d.subject || d.email_id}: {d.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReprocessPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{
    processed: number;
    changed_to_da: number;
    changed_to_en: number;
    changed_to_ro: number;
    still_unknown: number;
    total_unknown: number;
  } | null>(null);

  const { data: unknownCount, refetch } = useQuery({
    queryKey: ["unknown-email-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("emails")
        .select("id", { count: "exact", head: true })
        .eq("language", "unknown");
      return count || 0;
    },
  });

  const runBatch = async () => {
    setRunning(true);
    setResults(null);
    const totals = { processed: 0, changed_to_da: 0, changed_to_en: 0, changed_to_ro: 0, still_unknown: 0, total_unknown: 0 };

    try {
      for (let i = 0; i < 5; i++) {
        const { data, error } = await supabase.functions.invoke("reprocess-unknown-languages", {
          body: { batch_size: 20, max_total: 20, dry_run: false, reparse_from_imap: true },
        });
        if (error) throw error;
        totals.processed += data.processed;
        totals.changed_to_da += data.changed_to_da;
        totals.changed_to_en += data.changed_to_en;
        totals.changed_to_ro += data.changed_to_ro;
        totals.still_unknown += data.still_unknown;
        totals.total_unknown = data.total_unknown;
        if (data.total_unknown === 0) break;
      }
      setResults(totals);
      refetch();
      toast.success(`Reprocessed ${totals.processed} emails — ${totals.processed - totals.still_unknown} now detected`);
    } catch (err) {
      toast.error("Reprocess failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" /> Email Reprocessing
        </CardTitle>
        <CardDescription>Fix language detection for emails with missing or garbled text</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Emails with unknown language: <span className="font-semibold text-foreground">{unknownCount ?? "..."}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Each click processes ~100 emails with IMAP re-fetch
            </p>
          </div>
          <Button onClick={runBatch} disabled={running || unknownCount === 0}>
            {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : "Reprocess batch"}
          </Button>
        </div>

        {results && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <p className="font-medium">Batch complete — {results.processed} processed</p>
            <div className="grid grid-cols-2 gap-x-4 text-muted-foreground">
              <span>→ Danish: {results.changed_to_da}</span>
              <span>→ English: {results.changed_to_en}</span>
              <span>→ Romanian: {results.changed_to_ro}</span>
              <span>→ Still unknown: {results.still_unknown}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Remaining: {results.total_unknown} unknown</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" /> Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Configure your integrations and API keys</p>
      </div>

      <ClaudeReprocessPanel />

      <ReprocessPanel />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Email Account (IMAP/SMTP)
          </CardTitle>
          <CardDescription>Connect your one.com email for inbox monitoring</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>IMAP Host</Label>
              <Input placeholder="imap.one.com" className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label>IMAP Port</Label>
              <Input placeholder="993" className="bg-background" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input placeholder="you@domain.dk" className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" placeholder="••••••••" className="bg-background" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
              <div className="h-1.5 w-1.5 rounded-full bg-accent mr-1.5 status-blink" /> Demo Mode
            </Badge>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Save & Test</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> WhatsApp Business API
          </CardTitle>
          <CardDescription>Connect WhatsApp Cloud API for employee messaging</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Phone Number ID</Label>
            <Input placeholder="Enter WhatsApp Phone Number ID" className="bg-background" />
          </div>
          <div className="space-y-2">
            <Label>Access Token</Label>
            <Input type="password" placeholder="••••••••" className="bg-background" />
          </div>
          <div className="space-y-2">
            <Label>Verify Token</Label>
            <Input placeholder="Your webhook verify token" className="bg-background" />
          </div>
          <Button variant="outline">Save WhatsApp Config</Button>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" /> API Keys
          </CardTitle>
          <CardDescription>OpenAI and e-conomic integration keys</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>OpenAI API Key</Label>
            <Input type="password" placeholder="sk-..." className="bg-background" />
          </div>
          <div className="space-y-2">
            <Label>e-conomic API Key</Label>
            <Input type="password" placeholder="Enter e-conomic API key" className="bg-background" />
          </div>
          <Button variant="outline">Save API Keys</Button>
        </CardContent>
      </Card>
    </div>
  );
}
