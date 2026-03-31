import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Mail, MessageCircle, Key, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

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
