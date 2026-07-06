import { useEffect, useState } from "react";
import "@/lib/pdfFonts";
import { Link, useParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFViewer, PDFDownloadLink, Image, Link as PdfLink,
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
  driving_url: string | null;
};

type Contact = {
  id: string; full_name: string; role: string | null;
  email: string | null; phone: string | null; organization: string | null;
  role_category: string | null;
};

type HoursRow = {
  id: string; day_date: string;
  festival_open: string | null; festival_close: string | null;
  concept_label: string | null;
  notes: string | null;
};

type LocationDoc = {
  id: string; file_name: string; description: string | null;
  file_size_bytes: number | null; file_path: string; mime_type: string | null;
  signed_url?: string | null;
};

type LineupRow = {
  id: string;
  title: string;
  role: string | null;
  manager_name: string | null;
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

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function InfoDoc({
  festival, contacts, hours, docs, summary, lineup, mapDataUrl,
}: {
  festival: Festival;
  contacts: Contact[];
  hours: HoursRow[];
  docs: LocationDoc[];
  summary: Summary | null;
  lineup: LineupRow[];
  mapDataUrl: string | null;
}) {
  const dates = formatDateRange(festival.start_date, festival.end_date);
  const hasCoords = festival.lat != null && festival.lng != null;

  const grouped: Record<string, Contact[]> = { festival: [], setup: [], concept: [] };
  for (const c of contacts) {
    const k = c.role_category ?? "festival";
    if (grouped[k]) grouped[k].push(c);
  }

  const sortedHours = [...hours].sort((a, b) => (a.day_date + (a.concept_label ?? "")).localeCompare(b.day_date + (b.concept_label ?? "")));

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
              {festival.driving_url ? (
                <View style={s.row}>
                  <Text style={s.label}>Driving</Text>
                  <Text style={s.value}>{festival.driving_url}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={[reportStyles.small, { marginTop: 4 }]}>Coordinates not set.</Text>
          )}
        </View>
        {hasCoords && mapDataUrl ? (
          <View style={s.mapBox}>
            <Image src={mapDataUrl} style={s.mapImg} />
          </View>
        ) : (
          <View style={s.mapPlaceholder}>
            <Text>{hasCoords ? "Map unavailable" : "No map available"}</Text>
          </View>
        )}
      </View>

      {/* Service hours */}
      <Text style={reportStyles.h2}>Service hours</Text>
      {sortedHours.length === 0 ? (
        <Text style={reportStyles.small}>No hours set.</Text>
      ) : (
        <View style={s.hoursTable}>
          <View style={s.th}>
            <Text style={[s.thCell, s.cDate]}>Date</Text>
            <Text style={[s.thCell, { flex: 1 }]}>Concept</Text>
            <Text style={[s.thCell, s.cTime]}>Open</Text>
            <Text style={[s.thCell, s.cTime]}>Close</Text>
            <Text style={[s.thCell, s.cNotes]}>Notes</Text>
          </View>
          {sortedHours.map(h => (
            <View key={h.id} style={s.tr}>
              <Text style={[s.tCell, s.cDate]}>{formatDayLabel(h.day_date)}</Text>
              <Text style={[s.tCell, { flex: 1 }]}>{N(h.concept_label ?? "All concepts")}</Text>
              <Text style={[s.tCell, s.cTime]}>{fmtTime(h.festival_open)}</Text>
              <Text style={[s.tCell, s.cTime]}>{fmtTime(h.festival_close)}</Text>
              <Text style={[s.tCell, s.cNotes]}>{N(h.notes ?? "")}</Text>
            </View>
          ))}
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
              <Text style={s.docName}>
                {d.signed_url ? (
                  <PdfLink src={d.signed_url} style={{ color: "#2563eb", textDecoration: "underline" }}>
                    {N(d.file_name)}
                  </PdfLink>
                ) : N(d.file_name)}
              </Text>
              <Text style={s.docDesc}>{N(d.description ?? "—")}</Text>
              <Text style={[s.tCell, { width: 60, textAlign: "right" }]}>{fmtBytes(d.file_size_bytes)}</Text>
            </View>
          ))}
          <Text style={[reportStyles.small, { marginTop: 4, color: "#6b7280" }]}>
            Tip: click a file name above to open the original document. Image documents are also embedded on the following pages.
          </Text>
        </>
      )}

      {/* Embedded image documents */}
      {docs.filter(d => (d.mime_type ?? "").startsWith("image/") && d.signed_url).map(d => (
        <View key={`img-${d.id}`} break style={{ marginTop: 8 }}>
          <Text style={reportStyles.h2}>{N(d.file_name)}</Text>
          {d.description ? <Text style={[reportStyles.small, { marginBottom: 6 }]}>{N(d.description)}</Text> : null}
          <Image src={d.signed_url!} style={{ width: "100%", maxHeight: 640, objectFit: "contain" }} />
        </View>
      ))}

      {/* Concept lineup */}
      {lineup.length > 0 && (
        <>
          <Text style={reportStyles.h2}>Concept lineup</Text>
          <View style={s.th}>
            <Text style={[s.thCell, { flex: 2 }]}>Concept</Text>
            <Text style={[s.thCell, { flex: 2 }]}>Manager</Text>
            <Text style={[s.thCell, { width: 90 }]}>Role</Text>
          </View>
          {lineup.map(row => (
            <View key={row.id} style={s.tr}>
              <Text style={[s.tCell, { flex: 2 }]}>{N(row.title)}</Text>
              <Text style={[s.tCell, { flex: 2 }]}>{N(row.manager_name ?? "—")}</Text>
              <Text style={[s.tCell, { width: 90 }]}>{N(row.role ?? "—")}</Text>
            </View>
          ))}
        </>
      )}

      {/* AI festival info summary */}
      {summary && SUMMARY_CATEGORIES.some(c => (summary[c.key] ?? []).length > 0) && (
        <>
          <Text style={reportStyles.h2}>Festival info</Text>
          <View style={s.sumGrid}>
            {SUMMARY_CATEGORIES.map(({ key, label }) => {
              const items = summary[key] ?? [];
              if (items.length === 0) return null;
              return (
                <View key={key} style={s.sumCard} wrap={false}>
                  <Text style={s.sumTitle}>{label}</Text>
                  {items.map((it, i) => (
                    <View key={i} style={s.sumBullet}>
                      <Text style={s.sumDot}>•</Text>
                      <Text style={s.sumText}>{N(it)}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
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
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lineup, setLineup] = useState<LineupRow[]>([]);
  const [mapDataUrl, setMapDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data: f } = await supabase
        .from("festivals")
        .select("id, name, slug, start_date, end_date, city, address, lat, lng, driving_url")
        .eq("slug", slug)
        .maybeSingle();
      if (!f) { setLoading(false); return; }
      setFestival(f as Festival);
      const fid = (f as any).id;

      const [{ data: c }, { data: h }, { data: d }, { data: si }] = await Promise.all([
        supabase
          .from("festival_contacts")
          .select("id, full_name, role, email, phone, organization, role_category")
          .eq("festival_id", fid)
          .eq("is_draft", false)
          .order("full_name", { ascending: true }),
        supabase
          .from("festival_service_hours" as any)
          .select("id, service_date, open_time, close_time, notes, concept:concepts(name, slug)")
          .eq("festival_id", fid)
          .order("service_date", { ascending: true }),
        supabase
          .from("festival_location_documents" as any)
          .select("id, file_name, description, file_size_bytes, file_path, mime_type")
          .eq("festival_id", fid)
          .order("uploaded_at", { ascending: false }),
        supabase
          .from("festival_info_summaries" as any)
          .select("summary")
          .eq("festival_id", fid)
          .maybeSingle(),
      ]);
      setContacts((c ?? []) as Contact[]);
      const hRaw = (h ?? []) as any[];
      setHours(hRaw.map(row => ({
        id: row.id,
        day_date: row.service_date,
        festival_open: row.open_time,
        festival_close: row.close_time,
        concept_label: row.concept?.name ?? null,
        notes: row.notes ?? null,
      })));
      const rawDocs = ((d ?? []) as unknown as LocationDoc[]);
      const withUrls = await Promise.all(rawDocs.map(async (doc) => {
        try {
          const { data: signed } = await supabase.storage
            .from("festival-location-docs")
            .createSignedUrl(doc.file_path, 60 * 60 * 24 * 7);
          let signedUrl = signed?.signedUrl ?? null;
          // For images, convert to data URL so react-pdf embed can't fail on CORS
          if (signedUrl && (doc.mime_type ?? "").startsWith("image/")) {
            const dataUrl = await fetchAsDataUrl(signedUrl);
            if (!dataUrl) signedUrl = null; else signedUrl = dataUrl;
          }
          return { ...doc, signed_url: signedUrl };
        } catch {
          return { ...doc, signed_url: null };
        }
      }));
      setDocs(withUrls);
      setSummary(((si as any)?.summary ?? null) as Summary | null);

      // Pre-fetch static map as data URL (any failure -> no map, doesn't break render)
      if ((f as any).lat != null && (f as any).lng != null) {
        const mUrl = mapImageUrl((f as any).lat, (f as any).lng);
        setMapDataUrl(await fetchAsDataUrl(mUrl));
      }

      // Concept lineup: contracts + per-contract manager assignment
      const { data: contracts } = await supabase
        .from("festival_contracts")
        .select("id, concept_alias, concept:concepts!concept_id(slug, name)")
        .eq("festival_id", fid)
        .eq("is_active", true);
      const contractIds = (contracts ?? []).map((r: any) => r.id);
      let assignmentsByContract = new Map<string, { role: string | null; manager_staff_id: string | null }>();
      let staffNameById = new Map<string, string>();
      if (contractIds.length > 0) {
        const { data: assigns } = await supabase
          .from("festival_concept_assignments")
          .select("festival_contract_id, role, manager_staff_id")
          .in("festival_contract_id", contractIds);
        for (const a of (assigns ?? []) as any[]) {
          if (a.festival_contract_id) {
            assignmentsByContract.set(a.festival_contract_id, { role: a.role, manager_staff_id: a.manager_staff_id });
          }
        }
        const staffIds = Array.from(new Set(Array.from(assignmentsByContract.values()).map(a => a.manager_staff_id).filter(Boolean) as string[]));
        if (staffIds.length > 0) {
          const { data: staff } = await supabase
            .from("festival_staff")
            .select("id, name")
            .in("id", staffIds);
          for (const s of (staff ?? []) as any[]) staffNameById.set(s.id, s.name);
        }
      }
      const CONCEPT_LABELS: Record<string, string> = {
        "fish-chips": "Fish & Chips", "gyros": "Gyropolis Gyros", "creperie": "La Creperie", "chicks": "Chicks 'n' Buns",
      };
      const rows: LineupRow[] = (contracts ?? []).map((c: any) => {
        const base = CONCEPT_LABELS[c.concept?.slug] ?? c.concept?.name ?? "Concept";
        const title = c.concept_alias?.trim() ? c.concept_alias : base;
        const a = assignmentsByContract.get(c.id);
        return {
          id: c.id,
          title,
          role: a?.role ?? null,
          manager_name: a?.manager_staff_id ? (staffNameById.get(a.manager_staff_id) ?? null) : null,
        };
      }).sort((a, b) => a.title.localeCompare(b.title));
      setLineup(rows);

      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return <div className="p-6 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  const doc = <InfoDoc festival={festival} contacts={contacts} hours={hours} docs={docs} summary={summary} lineup={lineup} mapDataUrl={mapDataUrl} />;

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
