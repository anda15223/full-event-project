import { useEffect, useState } from "react";
import "@/lib/pdfFonts";
import { Link, useParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFViewer, PDFDownloadLink, Image,
} from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles, fmtFilename } from "@/components/pdf/ReportTemplate";
import { normalizeForPdf } from "@/lib/textNormalize";

const N = normalizeForPdf;

type Festival = {
  id: string; name: string; slug: string;
  start_date: string; end_date: string;
  city: string | null; address: string | null;
  lat: number | null; lng: number | null;
};

type Contact = {
  id: string; full_name: string; role: string | null;
  email: string | null; phone: string | null; organization: string | null;
  role_category: string | null;
};

type HoursRow = {
  id: string; day_date: string;
  festival_open: string | null; festival_close: string | null;
  prep_open: string | null; prep_close: string | null;
  notes: string | null;
};

type LocationDoc = {
  id: string; file_name: string; description: string | null;
  file_size_bytes: number | null;
};

const COL_LABEL: Record<string, string> = {
  festival: "Festival",
  setup: "Setup team",
  concept: "Concept team",
};

type Summary = Record<string, string[]>;

const SUMMARY_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "arriving", label: "Arriving" },
  { key: "leaving", label: "Leaving" },
  { key: "rules", label: "Rules" },
  { key: "schedule", label: "Schedule" },
  { key: "access_credentials", label: "Access & credentials" },
  { key: "parking_vehicles", label: "Parking & vehicles" },
  { key: "accommodation_camping", label: "Accommodation & camping" },
  { key: "food_drink", label: "Food & drink" },
  { key: "safety_emergency", label: "Safety & emergency" },
  { key: "contacts", label: "Contacts" },
  { key: "other", label: "Other" },
];

const s = StyleSheet.create({
  twoCol: { flexDirection: "row", gap: 12, marginBottom: 12 },
  infoBox: { flex: 1, borderWidth: 0.5, borderColor: "#e5e7eb", borderRadius: 6, padding: 10 },
  mapBox: { width: 260, height: 160, borderWidth: 0.5, borderColor: "#e5e7eb", borderRadius: 6, overflow: "hidden" },
  mapImg: { width: "100%", height: "100%" },
  mapPlaceholder: { width: 260, height: 160, borderWidth: 0.5, borderColor: "#e5e7eb", borderRadius: 6, alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 9 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 70, fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 },
  value: { flex: 1, fontSize: 10 },
  hoursTable: { marginTop: 4 },
  th: { flexDirection: "row", borderBottom: "0.5pt solid #111827", paddingBottom: 4, marginBottom: 4 },
  thCell: { fontSize: 9, fontWeight: 700, color: "#111827" },
  tr: { flexDirection: "row", borderBottom: "0.25pt solid #e5e7eb", paddingVertical: 3 },
  tCell: { fontSize: 9.5 },
  cDate: { width: 90 },
  cTime: { width: 70 },
  cNotes: { flex: 1 },
  contactCols: { flexDirection: "row", gap: 8 },
  contactCol: { flex: 1 },
  contactColTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4 },
  contactCard: { borderWidth: 0.5, borderColor: "#e5e7eb", borderRadius: 4, padding: 6, marginBottom: 4 },
  cName: { fontSize: 10, fontWeight: 700 },
  cRole: { fontSize: 8.5, color: "#6b7280", fontStyle: "italic" },
  cLine: { fontSize: 8.5, marginTop: 1 },
  docRow: { flexDirection: "row", paddingVertical: 2.5, borderBottom: "0.25pt solid #e5e7eb", fontSize: 9.5 },
  docName: { flex: 1 },
  docDesc: { flex: 1, color: "#6b7280" },
  sumGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sumCard: { width: "48.5%", borderWidth: 0.5, borderColor: "#e5e7eb", borderRadius: 6, padding: 8, marginBottom: 8, backgroundColor: "#fafafa" },
  sumTitle: { fontSize: 9, fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  sumBullet: { flexDirection: "row", marginBottom: 2 },
  sumDot: { width: 8, fontSize: 9.5 },
  sumText: { flex: 1, fontSize: 9.5, lineHeight: 1.35 },
});

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const sd = new Date(start + "T00:00:00");
  const ed = new Date(end + "T00:00:00");
  for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

function fmtTime(t: string | null): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

function fmtBytes(n: number | null): string {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function mapImageUrl(lat: number, lng: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=520x320&maptype=mapnik&markers=${lat},${lng},red-pushpin`;
}

function InfoDoc({
  festival, contacts, hours, docs, summary,
}: {
  festival: Festival;
  contacts: Contact[];
  hours: HoursRow[];
  docs: LocationDoc[];
  summary: Summary | null;
}) {
  const dates = formatDateRange(festival.start_date, festival.end_date);
  const hasCoords = festival.lat != null && festival.lng != null;

  const grouped: Record<string, Contact[]> = { festival: [], setup: [], concept: [] };
  for (const c of contacts) {
    const k = c.role_category ?? "festival";
    if (grouped[k]) grouped[k].push(c);
  }

  const expectedDays = eachDay(festival.start_date, festival.end_date);
  const hoursByDay = new Map(hours.map(h => [h.day_date, h]));
  const allDays = expectedDays.length > 0 ? expectedDays : hours.map(h => h.day_date);

  return (
    <ReportTemplate
      festivalName={festival.name}
      festivalDates={dates}
      reportTitle="Info"
      reportSubtitle="Location, hours, contacts, and documents"
      accentColor="blue"
    >
      {/* Location + Map */}
      <View style={s.twoCol}>
        <View style={s.infoBox}>
          <Text style={[reportStyles.h3, { marginTop: 0 }]}>Location</Text>
          {festival.address ? (
            <View style={s.row}>
              <Text style={s.label}>Address</Text>
              <Text style={s.value}>{N(festival.address)}</Text>
            </View>
          ) : null}
          {festival.city ? (
            <View style={s.row}>
              <Text style={s.label}>City</Text>
              <Text style={s.value}>{N(festival.city)}</Text>
            </View>
          ) : null}
          <View style={s.row}>
            <Text style={s.label}>Dates</Text>
            <Text style={s.value}>{dates}</Text>
          </View>
          {hasCoords ? (
            <>
              <View style={s.row}>
                <Text style={s.label}>Coords</Text>
                <Text style={s.value}>{festival.lat!.toFixed(5)}, {festival.lng!.toFixed(5)}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Map link</Text>
                <Text style={s.value}>https://maps.google.com/?q={festival.lat},{festival.lng}</Text>
              </View>
            </>
          ) : (
            <Text style={[reportStyles.small, { marginTop: 4 }]}>Coordinates not set.</Text>
          )}
        </View>
        {hasCoords ? (
          <View style={s.mapBox}>
            <Image src={mapImageUrl(festival.lat!, festival.lng!)} style={s.mapImg} />
          </View>
        ) : (
          <View style={s.mapPlaceholder}>
            <Text>No map available</Text>
          </View>
        )}
      </View>

      {/* Hours */}
      <Text style={reportStyles.h2}>Hours</Text>
      {allDays.length === 0 ? (
        <Text style={reportStyles.small}>No hours set.</Text>
      ) : (
        <View style={s.hoursTable}>
          <View style={s.th}>
            <Text style={[s.thCell, s.cDate]}>Date</Text>
            <Text style={[s.thCell, s.cTime]}>Open</Text>
            <Text style={[s.thCell, s.cTime]}>Close</Text>
            <Text style={[s.thCell, s.cTime]}>Prep open</Text>
            <Text style={[s.thCell, s.cTime]}>Prep close</Text>
            <Text style={[s.thCell, s.cNotes]}>Notes</Text>
          </View>
          {allDays.map(day => {
            const h = hoursByDay.get(day);
            return (
              <View key={day} style={s.tr}>
                <Text style={[s.tCell, s.cDate]}>{formatDayLabel(day)}</Text>
                <Text style={[s.tCell, s.cTime]}>{fmtTime(h?.festival_open ?? null)}</Text>
                <Text style={[s.tCell, s.cTime]}>{fmtTime(h?.festival_close ?? null)}</Text>
                <Text style={[s.tCell, s.cTime]}>{fmtTime(h?.prep_open ?? null)}</Text>
                <Text style={[s.tCell, s.cTime]}>{fmtTime(h?.prep_close ?? null)}</Text>
                <Text style={[s.tCell, s.cNotes]}>{N(h?.notes ?? "")}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Contacts */}
      <Text style={reportStyles.h2}>Contacts</Text>
      <View style={s.contactCols}>
        {(["festival", "setup", "concept"] as const).map(k => (
          <View key={k} style={s.contactCol}>
            <Text style={s.contactColTitle}>{COL_LABEL[k]} ({grouped[k].length})</Text>
            {grouped[k].length === 0 ? (
              <Text style={reportStyles.small}>—</Text>
            ) : (
              grouped[k].map(c => (
                <View key={c.id} style={s.contactCard} wrap={false}>
                  <Text style={s.cName}>{N(c.full_name)}</Text>
                  {c.role ? <Text style={s.cRole}>{N(c.role)}</Text> : null}
                  {c.organization ? <Text style={s.cLine}>{N(c.organization)}</Text> : null}
                  {c.phone ? <Text style={s.cLine}>{N(c.phone)}</Text> : null}
                  {c.email ? <Text style={s.cLine}>{N(c.email)}</Text> : null}
                </View>
              ))
            )}
          </View>
        ))}
      </View>

      {/* Location documents */}
      {docs.length > 0 && (
        <>
          <Text style={reportStyles.h2}>Location documents</Text>
          <View style={s.th}>
            <Text style={[s.thCell, s.docName]}>File</Text>
            <Text style={[s.thCell, s.docDesc]}>Description</Text>
            <Text style={[s.thCell, { width: 60, textAlign: "right" }]}>Size</Text>
          </View>
          {docs.map(d => (
            <View key={d.id} style={s.docRow}>
              <Text style={s.docName}>{N(d.file_name)}</Text>
              <Text style={s.docDesc}>{N(d.description ?? "—")}</Text>
              <Text style={[s.tCell, { width: 60, textAlign: "right" }]}>{fmtBytes(d.file_size_bytes)}</Text>
            </View>
          ))}
        </>
      )}
    </ReportTemplate>
  );
}

export default function FestivalInfoExport() {
  const { slug } = useParams<{ slug: string }>();
  const [festival, setFestival] = useState<Festival | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [hours, setHours] = useState<HoursRow[]>([]);
  const [docs, setDocs] = useState<LocationDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data: f } = await supabase
        .from("festivals")
        .select("id, name, slug, start_date, end_date, city, address, lat, lng")
        .eq("slug", slug)
        .maybeSingle();
      if (!f) { setLoading(false); return; }
      setFestival(f as Festival);
      const fid = (f as any).id;

      const [{ data: c }, { data: h }, { data: d }] = await Promise.all([
        supabase
          .from("festival_contacts")
          .select("id, full_name, role, email, phone, organization, role_category")
          .eq("festival_id", fid)
          .order("full_name", { ascending: true }),
        supabase
          .from("festival_hours" as any)
          .select("id, day_date, festival_open, festival_close, prep_open, prep_close, notes")
          .eq("festival_id", fid)
          .order("day_date", { ascending: true }),
        supabase
          .from("festival_location_documents" as any)
          .select("id, file_name, description, file_size_bytes")
          .eq("festival_id", fid)
          .order("uploaded_at", { ascending: false }),
      ]);
      setContacts((c ?? []) as Contact[]);
      setHours((h ?? []) as unknown as HoursRow[]);
      setDocs((d ?? []) as unknown as LocationDoc[]);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return <div className="p-6 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  const doc = <InfoDoc festival={festival} contacts={contacts} hours={hours} docs={docs} />;

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b p-3 flex items-center justify-between">
        <Link to={`/festivals/${slug}`} className="text-sm text-primary hover:underline">← Back</Link>
        <PDFDownloadLink document={doc} fileName={fmtFilename(festival.slug, "info")}>
          {({ loading }) => (
            <Button size="sm" disabled={loading}>
              <Download className="h-4 w-4 mr-1" /> {loading ? "Preparing…" : "Download PDF"}
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1">
        <PDFViewer width="100%" height="100%" showToolbar>{doc}</PDFViewer>
      </div>
    </div>
  );
}
