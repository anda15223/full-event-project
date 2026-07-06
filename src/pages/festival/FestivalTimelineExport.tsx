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
type Event = {
  id: string; event_type: string; event_date: string; event_time: string | null;
  end_date: string | null; location: string | null; responsible_party: string;
  title: string; notes: string | null; linked_supplier_name: string | null;
  supplier_contact_phone: string | null; status: string;
};

const TYPE_LABEL: Record<string, string> = {
  load_soborg: "Load Søborg", drive_to_festival: "Drive to festival",
  arrival_on_site: "Arrival", supplier_delivery: "Supplier delivery",
  setup_start: "Setup start", setup_complete: "Setup complete",
  festival_open: "Festival open", festival_close: "Festival close",
  wrap_start: "Wrap start", wrap_complete: "Wrap complete",
  drive_return: "Drive return", pickup: "Pickup",
  inspection: "Inspection", handover: "Handover", other: "Other",
};

const PARTY_LABEL: Record<string, string> = {
  fish_project: "Fish Project", fidibus: "Fidibus", festival: "Festival",
  supplier: "Supplier", mixed: "Mixed",
};

const PARTY_COLOR: Record<string, string> = {
  fish_project: "#3b82f6", fidibus: "#10b981", festival: "#8b5cf6",
  supplier: "#f97316", mixed: "#06b6d4",
};

function getPhase(t: string): "setup" | "festival" | "wrap" {
  if (["festival_open","festival_close"].includes(t)) return "festival";
  if (["wrap_start","wrap_complete","drive_return","pickup"].includes(t)) return "wrap";
  return "setup";
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Inter", fontSize: 10, color: "#111" },
  h1: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2 },
  phaseRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  phaseBox: { flex: 1, padding: 6, borderRadius: 3 },
  phaseLabel: { fontSize: 9, fontWeight: 700 },
  phaseRange: { fontSize: 8, marginTop: 1 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, paddingBottom: 4, borderBottom: "1pt solid #999", marginBottom: 6 },
  row: { flexDirection: "row", gap: 8, paddingVertical: 4, borderBottom: "0.5pt solid #eee" },
  dateCol: { width: 80, fontSize: 9 },
  bodyCol: { flex: 1 },
  title: { fontSize: 10, fontWeight: 700 },
  meta2: { fontSize: 8, color: "#555", marginTop: 1 },
  partyDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, fontSize: 8, color: "#888", flexDirection: "row", justifyContent: "space-between" },
});

function TimelineDoc({ festival, events }: { festival: Festival; events: Event[] }) {
  const setup = events.filter(e => getPhase(e.event_type) === "setup");
  const fest = events.filter(e => getPhase(e.event_type) === "festival");
  const wrap = events.filter(e => getPhase(e.event_type) === "wrap");
  const range = (arr: Event[]) => arr.length ? `${fmtDate(arr[0].event_date)} – ${fmtDate(arr[arr.length-1].end_date ?? arr[arr.length-1].event_date)}` : "—";
  const generated = new Date().toLocaleString("en-GB", { dateStyle: "long" });

  const renderSection = (title: string, list: Event[], color: string) => list.length === 0 ? null : (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color }]}>{title} ({list.length})</Text>
      {list.map(ev => (
        <View key={ev.id} style={styles.row} wrap={false}>
          <Text style={styles.dateCol}>{fmtDate(ev.event_date)}{ev.event_time ? ` ${ev.event_time.slice(0,5)}` : ""}</Text>
          <View style={[styles.partyDot, { backgroundColor: PARTY_COLOR[ev.responsible_party] || "#999" }]} />
          <View style={styles.bodyCol}>
            <Text style={styles.title}>{ev.title}</Text>
            <Text style={styles.meta2}>
              {TYPE_LABEL[ev.event_type] ?? ev.event_type} · {PARTY_LABEL[ev.responsible_party]} · {ev.status}
              {ev.location ? ` · ${ev.location}` : ""}
            </Text>
            {ev.linked_supplier_name && (
              <Text style={styles.meta2}>Supplier: {ev.linked_supplier_name}{ev.supplier_contact_phone ? ` · ${ev.supplier_contact_phone}` : ""}</Text>
            )}
            {ev.notes && <Text style={styles.meta2}>{ev.notes}</Text>}
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Operations Timeline — {festival.name}</Text>
        <Text style={styles.meta}>{formatDateRange(festival.start_date, festival.end_date)}</Text>
        <Text style={styles.meta}>Generated {generated} · {events.length} events</Text>

        <View style={styles.phaseRow}>
          <View style={[styles.phaseBox, { backgroundColor: "#dbeafe" }]}>
            <Text style={styles.phaseLabel}>SETUP</Text>
            <Text style={styles.phaseRange}>{range(setup)}</Text>
          </View>
          <View style={[styles.phaseBox, { backgroundColor: "#d1fae5" }]}>
            <Text style={styles.phaseLabel}>FESTIVAL</Text>
            <Text style={styles.phaseRange}>{range(fest)}</Text>
          </View>
          <View style={[styles.phaseBox, { backgroundColor: "#fed7aa" }]}>
            <Text style={styles.phaseLabel}>WRAP</Text>
            <Text style={styles.phaseRange}>{range(wrap)}</Text>
          </View>
        </View>

        {renderSection("SETUP", setup, "#1d4ed8")}
        {renderSection("FESTIVAL", fest, "#047857")}
        {renderSection("WRAP", wrap, "#c2410c")}

        <View style={styles.footer} fixed>
          <Text>Generated {generated} · {festival.slug}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export default function FestivalTimelineExport() {
  const { slug = "" } = useParams();
  const [festival, setFestival] = useState<Festival | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals").select("id, name, slug, start_date, end_date").eq("slug", slug).single();
      if (!f) { setLoading(false); return; }
      setFestival(f as Festival);
      const { data: evs } = await (supabase as any).from("festival_timeline_event")
        .select("*").eq("festival_id", f.id).order("event_date").order("event_time", { nullsFirst: false });
      setEvents((evs ?? []) as Event[]);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="p-10 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;
  if (!festival) return <div className="p-10">Festival not found.</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <Link to={`/festivals/${slug}/timeline`} className="text-sm text-muted-foreground hover:underline">← Back</Link>
        <PDFDownloadLink document={<TimelineDoc festival={festival} events={events} />} fileName={`${festival.slug}-timeline.pdf`}>
          {({ loading: l }) => (
            <Button size="sm" disabled={l}>
              {l ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} Download PDF
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1">
        <PDFViewer width="100%" height="100%" showToolbar={false}>
          <TimelineDoc festival={festival} events={events} />
        </PDFViewer>
      </div>
    </div>
  );
}
