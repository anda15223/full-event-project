import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { loadBinderData, BINDER_SECTIONS, type BinderData, type SectionKey } from "@/lib/binder";
import { BinderDocument } from "./BinderDocument";

export default function FestivalBinderExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<BinderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadBinderData(slug).then((d) => { if (!alive) return; setData(d); setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  if (loading) return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading binder…</div>;
  if (!data) return <div className="p-6">Festival not found.</div>;

  const allSelected = {} as Record<SectionKey, boolean>;
  BINDER_SECTIONS.forEach((s) => { allSelected[s.key] = true; });

  return (
    <div className="p-6">
      <PDFDownloadLink
        document={<BinderDocument data={data} options={{ selected: allSelected, includeCovers: true }} />}
        fileName={`${data.festival.slug}_operations_binder.pdf`}
      >
        {({ loading: gen, url }) => {
          // Auto-trigger download when ready
          if (!gen && url && typeof window !== "undefined") {
            setTimeout(() => {
              const a = document.createElement("a");
              a.href = url;
              a.download = `${data.festival.slug}_operations_binder.pdf`;
              a.click();
            }, 100);
          }
          return (
            <span className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> {gen ? "Building binder…" : "Download starting…"}
            </span>
          );
        }}
      </PDFDownloadLink>
    </div>
  );
}
