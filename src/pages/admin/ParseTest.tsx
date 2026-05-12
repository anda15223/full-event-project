import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const DOC_TYPES = [
  "contract", "electricity", "cooling", "facade",
  "prices", "accommodation", "setup", "generic",
] as const;

type ParseResult =
  | { ok: true; documentType: string; parsed: unknown; rawTextExcerpt: string;
      format: string; model: string; latencyMs: number;
      tokensInput: number; tokensOutput: number }
  | { ok: false; error: string; message: string; rawTextExcerpt: string | null };

export default function ParseTest() {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<string>("generic");
  const [festivalSlug, setFestivalSlug] = useState("jelling-2026");
  const [conceptSlug, setConceptSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const run = async () => {
    if (!file) { setErrorMsg("Pick a file first"); return; }
    setLoading(true); setResult(null); setErrorMsg(null);
    try {
      const path = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const up = await supabase.storage.from("parse-test-uploads").upload(path, file, { upsert: true });
      if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

      const signed = await supabase.storage.from("parse-test-uploads").createSignedUrl(path, 300);
      if (signed.error || !signed.data?.signedUrl) {
        throw new Error(`Signed URL failed: ${signed.error?.message ?? "unknown"}`);
      }

      const { data: festival } = await supabase
        .from("festivals").select("id").eq("slug", festivalSlug).maybeSingle();

      const { data, error } = await supabase.functions.invoke("parse-document", {
        body: {
          fileUrl: signed.data.signedUrl,
          documentType: docType,
          festivalId: festival?.id ?? null,
          conceptSlug: conceptSlug || null,
        },
      });
      if (error) throw new Error(error.message);
      setResult(data as ParseResult);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Document parse test</h1>
        <p className="text-sm text-muted-foreground">
          Upload a document, pick a type, and parse via Claude.
        </p>
      </header>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="space-y-1">
          <Label>File</Label>
          <Input type="file" accept="*/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Document type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Festival slug</Label>
            <Input value={festivalSlug} onChange={(e) => setFestivalSlug(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Concept slug (optional)</Label>
            <Input value={conceptSlug} onChange={(e) => setConceptSlug(e.target.value)}
                   placeholder="e.g. fish-chips" />
          </div>
        </div>

        <Button onClick={run} disabled={loading || !file}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Upload & Parse
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          {errorMsg}
        </div>
      )}

      {result && (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          {result.ok ? (
            <>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>format: <b>{result.format}</b></span>
                <span>type: <b>{result.documentType}</b></span>
                <span>latency: <b>{result.latencyMs}ms</b></span>
                <span>in: <b>{result.tokensInput}</b></span>
                <span>out: <b>{result.tokensOutput}</b></span>
                <span>model: <b>{result.model}</b></span>
              </div>
              <details open>
                <summary className="text-sm font-medium cursor-pointer">Parsed JSON</summary>
                <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto max-h-96">
                  {JSON.stringify(result.parsed, null, 2)}
                </pre>
              </details>
              <details>
                <summary className="text-sm font-medium cursor-pointer">Raw text excerpt</summary>
                <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap">
                  {result.rawTextExcerpt || "(none — image input)"}
                </pre>
              </details>
            </>
          ) : (() => {
            const err = result as Extract<ParseResult, { ok: false }>;
            return (
              <>
                <div className="text-sm">
                  <div className="font-mono text-destructive">{err.error}</div>
                  <div className="text-muted-foreground mt-1">{err.message}</div>
                </div>
                {err.rawTextExcerpt && (
                  <details>
                    <summary className="text-sm font-medium cursor-pointer">Raw text</summary>
                    <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap">
                      {err.rawTextExcerpt}
                    </pre>
                  </details>
                )}
              </>
            );
          })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
