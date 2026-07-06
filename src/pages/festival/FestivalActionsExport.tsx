import { useEffect, useState } from "react";
import "@/lib/pdfFonts";
import { Link, useParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFViewer, PDFDownloadLink, Font,
} from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { formatDateRange } from "@/lib/dateFormat";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";

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
type Item = {
  id: string; title: string; description: string | null;
  due_date: string | null; status: string; priority: string;
  owner: string | null; concept_id: string | null;
};
type ConceptInfo = { id: string; slug: ConceptSlug; name: string };

const PRIORITY_COLOR: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#9ca3af",
};
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER = ["open", "in_progress", "blocked", "done"];
const STATUS_LABEL: Record<string, string> = {
  open: "Open", in_progress: "In Progress", blocked: "Blocked", done: "Done",
};

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Inter", fontSize: 10, color: "#111" },
  h1: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, paddingBottom: 4, borderBottom: "1pt solid #999", marginBottom: 6 },
  row: { flexDirection: "row", gap: 8, paddingVertical: 5, borderBottom: "0.5pt solid #ddd" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  itemBody: { flex: 1 },
  title: { fontSize: 10, fontWeight: 700 },
  desc: { fontSize: 9, color: "#444", marginTop: 1 },
  metaLine: { flexDirection: "row", gap: 8, marginTop: 2, fontSize: 8, color: "#666" },
  metaPill: { fontSize: 8, color: "#444" },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, fontSize: 8, color: "#888", flexDirection: "row", justifyContent: "space-between" },
});

function fmtDue(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}

function ActionsDoc({ festival, items, concepts }: { festival: Festival; items: Item[]; concepts: Map<string, ConceptInfo> }) {
  const grouped: Record<string, Item[]> = { open: [], in_progress: [], blocked: [], done: [] };
  items.forEach((i) => { (grouped[i.status] ?? grouped.open).push(i); });
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
    if (pr) return pr;
    const da = a.due_date ?? "9999"; const db = b.due_date ?? "9999";
    return da.localeCompare(db);
  }));
  const generated = new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Action Items — {festival.name}</Text>
        <Text style={styles.meta}>{formatDateRange(festival.start_date, festival.end_date)}</Text>
        <Text style={styles.meta}>Generated {generated} · {items.length} items total</Text>

        {STATUS_ORDER.map((status) => {
          const list = grouped[status];
          if (!list?.length) return null;
          return (
            <View key={status} style={styles.section}>
              <Text style={styles.sectionTitle}>{STATUS_LABEL[status]} ({list.length})</Text>
              {list.map((it) => {
                const concept = it.concept_id ? concepts.get(it.concept_id) : null;
                return (
                  <View key={it.id} style={styles.row} wrap={false}>
                    <View style={[styles.dot, { backgroundColor: PRIORITY_COLOR[it.priority] || "#999" }]} />
                    <View style={styles.itemBody}>
                      <Text style={styles.title}>{it.title}</Text>
                      {it.description && <Text style={styles.desc}>{truncate(it.description, 220)}</Text>}
                      <View style={styles.metaLine}>
                        {it.due_date && <Text style={styles.metaPill}>📅 {fmtDue(it.due_date)}</Text>}
                        {it.owner && <Text style={styles.metaPill}>👤 {it.owner}</Text>}
                        {concept && <Text style={styles.metaPill}>{CONCEPT_EMOJI[concept.slug] ?? ""} {concept.name}</Text>}
                        <Text style={styles.metaPill}>· {it.priority}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
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

export default function FestivalActionsExport() {
  const { slug = "" } = useParams();
  const [festival, setFestival] = useState<Festival | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [concepts, setConcepts] = useState<Map<string, ConceptInfo>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals").select("id, name, slug, start_date, end_date").eq("slug", slug).single();
      if (!f) { setLoading(false); return; }
      setFestival(f as Festival);
      const [{ data: its }, { data: cs }] = await Promise.all([
        supabase.from("festival_action_items").select("id, title, description, due_date, status, priority, owner, concept_id").eq("festival_id", f.id),
        supabase.from("concepts").select("id, slug, name"),
      ]);
      setItems((its ?? []) as Item[]);
      const m = new Map<string, ConceptInfo>();
      (cs ?? []).forEach((c: any) => m.set(c.id, c));
      setConcepts(m);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="p-10 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>;
  if (!festival) return <div className="p-10">Festival not found.</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <Link to={`/festivals/${slug}/actions`} className="text-sm text-muted-foreground hover:underline">← Back</Link>
        <PDFDownloadLink document={<ActionsDoc festival={festival} items={items} concepts={concepts} />}
          fileName={`${festival.slug}-action-items.pdf`}>
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
          <ActionsDoc festival={festival} items={items} concepts={concepts} />
        </PDFViewer>
      </div>
    </div>
  );
}
