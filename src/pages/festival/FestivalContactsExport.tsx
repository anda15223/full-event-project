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

  const doc = useMemo(
    () => (festival ? <ContactsDoc festival={festival} contacts={contacts} /> : null),
    [festival, contacts],
  );

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let currentUrl: string | null = null;
    setRendering(true);
    setRenderError(null);
    (async () => {
      try {
        const instance = pdf();
        instance.updateContainer(doc);
        const blob = await instance.toBlob();
        if (cancelled) return;
        currentUrl = URL.createObjectURL(blob);
        setBlobUrl(currentUrl);
      } catch (e: any) {
        if (!cancelled) setRenderError(e?.message ?? "Failed to render PDF");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [doc]);

  const download = () => {
    if (!blobUrl || !festival) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${festival.slug}-contacts.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="h-screen flex flex-col bg-muted/30">
      <div className="border-b bg-background p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={`/festivals/${slug}/contacts`}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <div className="hidden sm:block h-4 w-px bg-border" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{festival.name} — Contacts preview</div>
            <div className="text-[11px] text-muted-foreground">
              {contacts.length} contacts · review before downloading
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rendering && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering preview…
            </span>
          )}
          <Button size="sm" onClick={download} disabled={!blobUrl || rendering}>
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
        </div>
      </div>
      <div className="flex-1 relative">
        {renderError ? (
          <div className="absolute inset-0 flex items-center justify-center text-center p-6">
            <div className="space-y-2">
              <p className="text-sm text-destructive">Could not render preview: {renderError}</p>
              <Button size="sm" variant="outline" onClick={() => setBlobUrl(null)}>
                <RefreshCw className="h-4 w-4 mr-1" /> Retry
              </Button>
            </div>
          </div>
        ) : !blobUrl ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Building preview…
          </div>
        ) : (
          <iframe
            key={blobUrl}
            src={blobUrl}
            title="Contacts PDF preview"
            className="w-full h-full bg-white"
          />
        )}
      </div>
    </div>
  );
}
