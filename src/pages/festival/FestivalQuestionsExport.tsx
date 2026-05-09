import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFViewer, PDFDownloadLink, Font,
} from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { formatDateRange } from "@/lib/dateFormat";

try {
  Font.register({
    family: "OpenSans",
    fonts: [
      { src: "https://fonts.gstatic.com/s/opensans/v17/mem8YaGs126MiZpBA-UFVZ0e.ttf", fontWeight: 400 },
      { src: "https://fonts.gstatic.com/s/opensans/v17/mem5YaGs126MiZpBA-UN7rgOUuhsKKSTjw.ttf", fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
} catch {}

type Festival = { id: string; name: string; slug: string; start_date: string; end_date: string };
type Q = {
  id: string; question: string; context: string | null;
  status: string; priority: string; question_type: string | null;
  decision_owner: string | null; deadline: string | null;
  blocking_what: string | null; resolution: string | null; resolved_at: string | null;
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#9ca3af",
};
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER = ["open", "deferred", "resolved"];
const STATUS_LABEL: Record<string, string> = { open: "Open", deferred: "Deferred", resolved: "Resolved" };

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "OpenSans", fontSize: 10, color: "#111" },
  h1: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, paddingBottom: 4, borderBottom: "1pt solid #999", marginBottom: 6 },
  row: { flexDirection: "row", gap: 8, paddingVertical: 6, borderBottom: "0.5pt solid #ddd" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  body: { flex: 1 },
  q: { fontSize: 10, fontWeight: 700 },
  ctx: { fontSize: 9, color: "#444", marginTop: 1 },
  resolution: { fontSize: 9, color: "#065f46", marginTop: 3, padding: 3, backgroundColor: "#d1fae5" },
  metaLine: { flexDirection: "row", gap: 8, marginTop: 3, fontSize: 8, color: "#666" },
  blocking: { fontSize: 8, color: "#c2410c", marginTop: 2 },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, fontSize: 8, color: "#888", flexDirection: "row", justifyContent: "space-between" },
});

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Doc({ festival, items }: { festival: Festival; items: Q[] }) {
  const grouped: Record<string, Q[]> = { open: [], deferred: [], resolved: [] };
  items.forEach((q) => { (grouped[q.status] ?? grouped.open).push(q); });
  // Resolved limited to last 5
  grouped.resolved = grouped.resolved
    .sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? "")).slice(0, 5);
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr) return pr;
    return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
  }));
  const generated = new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Open Questions — {festival.name}</Text>
        <Text style={styles.meta}>{formatDateRange(festival.start_date, festival.end_date)}</Text>
        <Text style={styles.meta}>Generated {generated} · {items.length} total · {grouped.open.length} open</Text>

        {STATUS_ORDER.map((status) => {
          const list = grouped[status];
          if (!list?.length) return null;
          return (
            <View key={status} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {STATUS_LABEL[status]} ({list.length}{status === "resolved" ? " · last 5" : ""})
              </Text>
              {list.map((q) => (
                <View key={q.id} style={styles.row} wrap={false}>
                  <View style={[styles.dot, { backgroundColor: PRIORITY_COLOR[q.priority] || "#999" }]} />
                  <View style={styles.body}>
                    <Text style={styles.q}>{q.question}</Text>
                    {q.context && <Text style={styles.ctx}>{q.context}</Text>}
                    {q.blocking_what && <Text style={styles.blocking}>Blocks: {q.blocking_what}</Text>}
                    {q.resolution && <Text style={styles.resolution}>✓ {q.resolution}</Text>}
                    <View style={styles.metaLine}>
                      {q.question_type && <Text>• {q.question_type.replace(/_/g, " ")}</Text>}
                      {q.decision_owner && <Text>• {q.decision_owner}</Text>}
                      {q.deadline && <Text>• Deadline {fmtDate(q.deadline)}</Text>}
                      <Text>• {q.priority}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          );
        })}

        <View style={styles.footer} fixed>
          <Text>{festival.slug}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export default function FestivalQuestionsExport() {
  const { slug = "" } = useParams();
  const [festival, setFestival] = useState<Festival | null>(null);
  const [items, setItems] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals").select("id, name, slug, start_date, end_date").eq("slug", slug).single();
      if (!f) { setLoading(false); return; }
      setFestival(f as Festival);
      const { data } = await (supabase as any).from("festival_open_questions")
        .select("id, question, context, status, priority, question_type, decision_owner, deadline, blocking_what, resolution, resolved_at")
        .eq("festival_id", f.id);
      setItems((data ?? []) as Q[]);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="p-10 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>;
  if (!festival) return <div className="p-10">Festival not found.</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <Link to={`/festivals/${slug}/questions`} className="text-sm text-muted-foreground hover:underline">← Back</Link>
        <PDFDownloadLink document={<Doc festival={festival} items={items} />}
          fileName={`${festival.slug}-open-questions.pdf`}>
          {({ loading: l }) => (
            <Button size="sm" disabled={l}>
              {l ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              Download PDF
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1">
        <PDFViewer width="100%" height="100%" showToolbar={false}>
          <Doc festival={festival} items={items} />
        </PDFViewer>
      </div>
    </div>
  );
}
