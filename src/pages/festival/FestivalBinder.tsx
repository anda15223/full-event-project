import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, Download, FileCheck2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { PDFDownloadLink, PDFViewer, pdf } from "@react-pdf/renderer";
import { loadBinderData, BINDER_SECTIONS, type BinderData, type SectionKey } from "@/lib/binder";
import { BinderDocument, type BinderOptions } from "./BinderDocument";

type QualityResult = { level: "ok" | "warn" | "fail"; label: string; detail?: string };

export default function FestivalBinder() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<BinderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeCovers, setIncludeCovers] = useState(true);
  const [selected, setSelected] = useState<Record<SectionKey, boolean>>(() => {
    const s = {} as Record<SectionKey, boolean>;
    BINDER_SECTIONS.forEach((sec) => { s[sec.key] = true; });
    return s;
  });
  const [quality, setQuality] = useState<QualityResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadBinderData(slug).then((d) => { if (!alive) return; setData(d); setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  const options: BinderOptions = useMemo(() => ({ selected, includeCovers }), [selected, includeCovers]);

  async function runQuality() {
    if (!data) return;
    setRunning(true);
    setQuality(null);
    try {
      const blob = await pdf(<BinderDocument data={data} options={options} />).toBlob();
      const sizeMb = blob.size / (1024 * 1024);
      const sectionCount = Object.values(selected).filter(Boolean).length;
      const results: QualityResult[] = [];
      results.push({ level: sectionCount >= 1 ? "ok" : "fail", label: `${sectionCount} sections selected` });
      results.push({
        level: sizeMb < 25 ? "ok" : "fail",
        label: `File size ${sizeMb.toFixed(2)} MB`,
        detail: sizeMb >= 25 ? "Exceeds 25 MB cap" : undefined,
      });
      results.push({ level: includeCovers ? "ok" : "warn", label: includeCovers ? "Cover + back cover present" : "Covers omitted" });
      // Empty section warnings
      if (selected.actions && data.actionItems.filter((a) => a.status === "open" || a.status === "in_progress").length === 0)
        results.push({ level: "warn", label: "Action Items: no open items" });
      if (selected.contacts && data.contacts.length === 0)
        results.push({ level: "warn", label: "Contacts: empty" });
      if (selected.timeline && data.timelineEvents.length === 0)
        results.push({ level: "warn", label: "Timeline: no events" });
      if (selected.contracts && data.contracts.length === 0)
        results.push({ level: "warn", label: "Contracts: empty" });
      if (selected.safety && !data.safety)
        results.push({ level: "warn", label: "Safety: no record" });
      if (selected.accommodation && data.accommodation.length === 0)
        results.push({ level: "warn", label: "Accommodation: empty" });
      results.push({ level: "ok", label: `Generated at ${new Date().toLocaleTimeString()}` });
      setQuality(results);
    } catch (e: any) {
      setQuality([{ level: "fail", label: "PDF render failed", detail: String(e?.message ?? e) }]);
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (!data) return <div className="p-6">Festival not found.</div>;

  const filename = `${data.festival.slug}_operations_binder.pdf`;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <Link to={`/festivals/${slug}`} className="text-xs text-muted-foreground hover:underline">← Back to festival</Link>
          <h1 className="text-3xl font-heading font-bold tracking-tight mt-1">{data.festival.name} Operations Binder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Single printable PDF combining every key card. {Object.values(selected).filter(Boolean).length} of {BINDER_SECTIONS.length} sections selected{includeCovers ? " · cover + back cover" : ""}.
          </p>
        </div>
        <PDFDownloadLink
          document={<BinderDocument data={data} options={options} />}
          fileName={filename}
        >
          {({ loading: gen }) => (
            <Button size="lg" disabled={gen}>
              {gen ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {gen ? "Building…" : "Download binder PDF"}
            </Button>
          )}
        </PDFDownloadLink>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Sections to include</div>
          <div className="space-y-2">
            {BINDER_SECTIONS.map((sec) => (
              <label key={sec.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={selected[sec.key]}
                  onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [sec.key]: !!v }))}
                />
                <span>{sec.label}</span>
              </label>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Print options</div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={includeCovers} onCheckedChange={(v) => setIncludeCovers(!!v)} />
              <span>Include cover + back cover</span>
            </label>
            <p className="text-xs text-muted-foreground mt-3">A4 portrait, color. Page numbers and section names in footer.</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Quality check</div>
              <Button size="sm" variant="outline" onClick={runQuality} disabled={running}>
                {running ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <FileCheck2 className="h-3 w-3 mr-2" />}
                Run check
              </Button>
            </div>
            {!quality && <p className="text-xs text-muted-foreground">Click to render and verify the binder.</p>}
            {quality && (
              <ul className="space-y-1.5 text-sm">
                {quality.map((q, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {q.level === "ok" && <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />}
                    {q.level === "warn" && <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />}
                    {q.level === "fail" && <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />}
                    <span>
                      {q.label}
                      {q.detail && <span className="text-muted-foreground"> — {q.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Live preview</div>
          <Button size="sm" variant="outline" onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? "Hide preview" : "Show preview"}
          </Button>
        </div>
        {showPreview && (
          <div className="h-[600px] border rounded">
            <PDFViewer style={{ width: "100%", height: "100%", border: 0 }}>
              <BinderDocument data={data} options={options} />
            </PDFViewer>
          </div>
        )}
      </Card>
    </div>
  );
}
