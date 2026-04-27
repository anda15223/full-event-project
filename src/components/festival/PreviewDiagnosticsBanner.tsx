import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

type Status = "idle" | "running" | "ok" | "fail";
type ProbeFile = { url?: string; path?: string; name?: string; mime_type?: string };

/**
 * Quick diagnostic for file previews on this page.
 * - Direct URL test: loads a 1px probe via <img> from the festival-photos bucket URL
 *   (catches ad-blockers / CORP / Chrome blocking *.supabase.co iframes & images).
 * - Blob fallback test: fetch()es the same URL and turns it into a blob (what the
 *   PDF preview falls back to so it can render same-origin in an <iframe>).
 *
 * Probes the most recently uploaded object in the `festival-photos` bucket so the
 * test reflects real data this page would render.
 */
export function PreviewDiagnosticsBanner({ files = [] }: { files?: ProbeFile[] }) {
  const [probeUrl, setProbeUrl] = useState<string | null>(null);
  const [directStatus, setDirectStatus] = useState<Status>("idle");
  const [directMsg, setDirectMsg] = useState<string>("");
  const [blobStatus, setBlobStatus] = useState<Status>("idle");
  const [blobMsg, setBlobMsg] = useState<string>("");

  const pickProbe = useCallback(async () => {
    const realFile = files.find((f) => f.url && f.path && (f.mime_type === "application/pdf" || /\.pdf$/i.test(f.name || f.path || "")))
      || files.find((f) => f.url && f.path)
      || files.find((f) => f.url);
    if (realFile?.url) return realFile;

    // List a few recent objects from festival-photos so we have a real URL to test.
    const { data, error } = await supabase.storage
      .from("festival-photos")
      .list("", { limit: 20, sortBy: { column: "updated_at", order: "desc" } });
    if (error || !data?.length) return null;
    // Skip folder placeholders (Supabase returns dirs without metadata)
    const file = data.find((d: any) => d.name && d.metadata) || data[0];
    const { data: pub } = supabase.storage.from("festival-photos").getPublicUrl(file.name);
    return pub?.publicUrl ? { url: pub.publicUrl, path: file.name, name: file.name, mime_type: file.metadata?.mimetype } : null;
  }, [files]);

  const runDirectTest = useCallback((url: string) => {
    return new Promise<void>((resolve) => {
      setDirectStatus("running");
      setDirectMsg("Loading direct URL…");
      const img = new Image();
      const t = setTimeout(() => {
        setDirectStatus("fail");
        setDirectMsg("Timed out (likely blocked by browser/extension)");
        resolve();
      }, 8000);
      img.onload = () => {
        clearTimeout(t);
        setDirectStatus("ok");
        setDirectMsg("Direct URL loads in this browser");
        resolve();
      };
      img.onerror = () => {
        clearTimeout(t);
        setDirectStatus("fail");
        setDirectMsg("Browser blocked the direct URL (ad-blocker, Chrome, or CORS)");
        resolve();
      };
      // cache-bust so a previously failed load isn't reused
      img.src = url + (url.includes("?") ? "&" : "?") + "diag=" + Date.now();
    });
  }, []);

  const runBlobTest = useCallback(async (file: ProbeFile) => {
    setBlobStatus("running");
    setBlobMsg(file.path ? "Fetching through in-app proxy…" : "Fetching direct URL as blob…");
    try {
      let blob: Blob;
      if (file.path) {
        const { data, error } = await supabase.functions.invoke("serve-attachment", {
          body: { bucket: "festival-photos", storagePath: file.path, filename: file.name, mimeType: file.mime_type },
        });
        if (error || !data?.base64) throw new Error(error?.message || data?.error || "Proxy failed");
        const binary = atob(data.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], { type: data.mimeType || file.mime_type || "application/octet-stream" });
      } else {
        const res = await fetch(file.url!, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        blob = await res.blob();
      }
      const obj = URL.createObjectURL(blob);
      URL.revokeObjectURL(obj);
      setBlobStatus("ok");
      setBlobMsg(`Blob fallback works (${Math.round(blob.size / 1024)} KB, ${blob.type || "unknown"})`);
    } catch (e: any) {
      setBlobStatus("fail");
      setBlobMsg(`Blob fetch failed: ${e?.message || "unknown error"}`);
    }
  }, []);

  const runAll = useCallback(async () => {
    setDirectStatus("running"); setBlobStatus("running");
    setDirectMsg(""); setBlobMsg("");
    const file = await pickProbe();
    if (!file?.url) {
      setDirectStatus("fail"); setBlobStatus("fail");
      setDirectMsg("No files in storage to probe");
      setBlobMsg("Upload a file first, then re-run");
      setProbeUrl(null);
      return;
    }
    setProbeUrl(file.url);
    // Run in parallel
    await Promise.all([runDirectTest(file.url), runBlobTest(file)]);
  }, [pickProbe, runDirectTest, runBlobTest]);

  useEffect(() => { runAll(); }, [runAll]);

  const Row = ({ label, status, msg }: { label: string; status: Status; msg: string }) => (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5">
        {status === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {status === "fail" && <XCircle className="h-4 w-4 text-destructive" />}
        {status === "running" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {status === "idle" && <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
      </span>
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-muted-foreground truncate">{msg || "—"}</div>
      </div>
    </div>
  );

  const anyFail = directStatus === "fail" || blobStatus === "fail";
  const allOk = directStatus === "ok" && blobStatus === "ok";

  return (
    <div className={`rounded-lg border p-3 ${
      allOk ? "border-emerald-200 bg-emerald-50/50"
        : anyFail ? "border-destructive/30 bg-destructive/5"
        : "border-border bg-muted/30"
    }`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-semibold">Preview diagnostics</div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={runAll}>
          <RefreshCw className="h-3 w-3 mr-1" /> Re-test
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Row label="Direct URL preview (images & iframes)" status={directStatus} msg={directMsg} />
        <Row label="PDF blob fallback (in-app proxy)" status={blobStatus} msg={blobMsg} />
      </div>
      {probeUrl && (
        <div className="mt-2 text-xs text-muted-foreground truncate">
          Probe: <span className="font-mono">{probeUrl}</span>
        </div>
      )}
      {anyFail && (
        <div className="mt-2 text-xs text-muted-foreground">
          If direct fails but blob works: PDFs still preview via the same-origin blob fallback.
          If both fail: a browser extension or network policy is blocking storage — try a different browser or disable ad-blockers.
        </div>
      )}
    </div>
  );
}
