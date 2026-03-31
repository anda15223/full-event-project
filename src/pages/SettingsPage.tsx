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

function ClaudeReprocessPanel() {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState<{
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
  } | null>(null);
  const [testDetails, setTestDetails] = useState<any[] | null>(null);
  const [completed, setCompleted] = useState(false);

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["claude-reprocess-stats"],
    queryFn: async () => {
      const { count: totalEmails } = await supabase
        .from("emails")
        .select("id", { count: "exact", head: true })
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
      setTestDetails(data.details || []);
      toast.success(`Test complete: ${data.extracted} invoices extracted from ${data.processed} emails`);
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
    };
    const batchSize = 10;
    const maxBatches = Math.ceil((stats?.totalEmails || 2069) / batchSize);
    totals.totalBatches = maxBatches;

    try {
      for (let i = 0; i < maxBatches; i++) {
        if (pauseRef.current) break;

        totals.batch = i + 1;
        setProgress({ ...totals });

        const { data, error } = await supabase.functions.invoke("reprocess-with-claude", {
          body: { test_mode: false, batch_size: batchSize },
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

        setProgress({ ...totals });

        if ((data.processed || 0) === 0) break;
      }
      setCompleted(true);
      refetchStats();
      toast.success(`Reprocess complete: ${totals.extracted} invoices from ${totals.processed} emails`);
    } catch (err) {
      toast.error("Reprocess failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setRunning(false);
    }
  };

  const handleStop = () => {
    pauseRef.current = true;
    setPaused(true);
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
        {!running && !progress && (
          <div className="flex gap-2">
            <Button onClick={runTest} variant="outline" className="gap-2">
              <FlaskConical className="h-4 w-4" /> Test on 5 emails
            </Button>
            <Button onClick={runFull} className="gap-2">
              <Zap className="h-4 w-4" /> Reprocess all with Claude
            </Button>
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

            <div className="flex gap-2 pt-2">
              <Button onClick={runFull} variant="outline" size="sm" className="gap-1.5">
                <RefreshCw className="h-3 w-3" /> {completed ? "Run again" : "Resume"}
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5" asChild>
                <a href="/agent/invoices">View invoices →</a>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5" asChild>
                <a href="/cashflow">View cashflow →</a>
              </Button>
            </div>
          </div>
        )}

        {testDetails && (
          <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1 max-h-48 overflow-auto">
            <p className="font-medium">🧪 Test results:</p>
            {testDetails.map((d: any, i: number) => (
              <div key={i} className="flex gap-2 items-center">
                <Badge variant={d.status === "extracted" ? "default" : d.status === "ignored" ? "secondary" : "outline"} className="text-[10px]">
                  {d.status}
                </Badge>
                <span className="truncate flex-1">{d.subject || d.email_id}</span>
              </div>
            ))}
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
