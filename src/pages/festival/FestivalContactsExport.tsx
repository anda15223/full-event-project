import { useEffect, useMemo, useState } from "react";
import "@/lib/pdfFonts";
import { Link, useParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, pdf, Font,
} from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2, ArrowLeft, RefreshCw } from "lucide-react";
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
type Contact = {
  id: string; full_name: string; role: string;
  email: string | null; phone: string | null; organization: string | null;
  is_primary: boolean; contact_type: string; notes: string | null;
};

const TYPE_ORDER = ["festival_organizer", "operator", "internal", "supplier"];
const TYPE_LABEL: Record<string, string> = {
  festival_organizer: "Festival Organizers",
  operator: "Operators / Production",
  internal: "Internal Team",
  supplier: "Suppliers",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Inter", fontSize: 9, color: "#111" },
  h1: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2 },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 11, fontWeight: 700, paddingBottom: 3, borderBottom: "1pt solid #999", marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: { width: "50%", paddingRight: 8, paddingBottom: 8 },
  cardInner: { border: "0.5pt solid #ddd", borderRadius: 3, padding: 6 },
  name: { fontSize: 10, fontWeight: 700 },
  role: { fontSize: 8, color: "#555" },
  line: { fontSize: 8, marginTop: 1 },
  notes: { fontSize: 7.5, color: "#444", marginTop: 3, fontStyle: "italic" },
  primary: { backgroundColor: "#fefce8", borderColor: "#eab308" },
  star: { color: "#eab308", fontSize: 9 },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, fontSize: 8, color: "#888", flexDirection: "row", justifyContent: "space-between" },
});

function ContactsDoc({ festival, contacts }: { festival: Festival; contacts: Contact[] }) {
  const sorted = [...contacts].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.full_name.localeCompare(b.full_name);
  });

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View>
          <Text style={styles.h1}>Festival Contacts — {festival.name}</Text>
          <Text style={styles.meta}>{formatDateRange(festival.start_date, festival.end_date)} · {contacts.length} contacts</Text>
        </View>

        {TYPE_ORDER.map(type => {
          const items = sorted.filter(c => c.contact_type === type);
          if (items.length === 0) return null;
          return (
            <View key={type} style={styles.section} wrap={false}>
              <Text style={styles.sectionTitle}>{TYPE_LABEL[type]} ({items.length})</Text>
              <View style={styles.grid}>
                {items.map(c => (
                  <View key={c.id} style={styles.card}>
                    <View style={[styles.cardInner, c.is_primary && styles.primary]}>
                      <Text style={styles.name}>
                        {c.is_primary ? "★ " : ""}{c.full_name}
                      </Text>
                      {c.role ? <Text style={styles.role}>{c.role}</Text> : null}
                      {c.organization ? <Text style={styles.line}>{c.organization}</Text> : null}
                      {c.email ? <Text style={styles.line}>✉ {c.email}</Text> : null}
                      {c.phone ? <Text style={styles.line}>☎ {c.phone}</Text> : null}
                      {c.notes ? <Text style={styles.notes}>{c.notes}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
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

export default function FestivalContactsExport() {
  const { slug } = useParams<{ slug: string }>();
  const [festival, setFestival] = useState<Festival | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data: f } = await supabase
        .from("festivals").select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (!f) { setLoading(false); return; }
      setFestival(f as Festival);
      const { data: c } = await supabase
        .from("festival_contacts")
        .select("id, full_name, role, email, phone, organization, is_primary, contact_type, notes")
        .eq("festival_id", (f as any).id);
      setContacts((c ?? []) as Contact[]);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return <div className="p-6 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b p-3 flex items-center justify-between">
        <Link to={`/festivals/${slug}/contacts`} className="text-sm text-primary hover:underline">← Back</Link>
        <PDFDownloadLink
          document={<ContactsDoc festival={festival} contacts={contacts} />}
          fileName={`${festival.slug}-contacts.pdf`}
        >
          {({ loading }) => (
            <Button size="sm" disabled={loading}>
              <Download className="h-4 w-4 mr-1" /> {loading ? "Preparing…" : "Download PDF"}
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1">
        <PDFViewer width="100%" height="100%" showToolbar>
          <ContactsDoc festival={festival} contacts={contacts} />
        </PDFViewer>
      </div>
    </div>
  );
}
