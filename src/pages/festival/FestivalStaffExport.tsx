import { useEffect, useState } from "react";
import "@/lib/pdfFonts";
import { Link, useParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFViewer, PDFDownloadLink,
} from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { formatDateRange } from "@/lib/dateFormat";
import { normalizeForPdf as N } from "@/lib/textNormalize";

type Festival = { id: string; name: string; slug: string; start_date: string; end_date: string };
type Concept = { id: string; name: string };
type Staff = {
  id: string;
  name: string | null;
  home_location: string | null;
  confirmed: boolean | null;
  needs_accommodation: boolean | null;
  concept_id: string | null;
  works_thursday: boolean | null;
  works_friday: boolean | null;
  works_saturday: boolean | null;
  works_sunday: boolean | null;
  accom_thursday: boolean | null;
  accom_friday: boolean | null;
  accom_saturday: boolean | null;
  accom_sunday: boolean | null;
  staff_source: string;
  role: string;
  station: string | null;
  notes: string | null;
};
type Shift = {
  concept_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean | null;
  notes: string | null;
};

const STATION_LABEL: Record<string, string> = {
  cash_register: "Cash register",
  assembly: "Assembly",
  fryer: "Fryer",
  oven: "Oven",
  pita_wrapper: "Pita wrapper",
  pita_griddle: "Pita griddle",
  burger: "Burger",
  burger_bun_grill: "Burger bun grill",
  crepes: "Crepes",
};

const SOURCE_LABEL: Record<string, string> = {
  soborg: "Søborg",
  local: "Local",
  fidibus: "Fidibus",
  unknown: "Unknown",
};

const SCHEDULE_DAYS = [
  { date: "2026-05-21", label: "Thu 21" },
  { date: "2026-05-22", label: "Fri 22" },
  { date: "2026-05-23", label: "Sat 23" },
  { date: "2026-05-24", label: "Sun 24" },
] as const;

const fmt = (t?: string | null) => (t ? t.slice(0, 5) : "—");
function hoursBetween(start: string, end: string, crosses: boolean) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0 || crosses) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Inter", fontSize: 9, color: "#111" },
  h1: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, paddingBottom: 3, borderBottom: "1pt solid #999", marginBottom: 6 },
  subTitle: { fontSize: 10, fontWeight: 700, marginTop: 8, marginBottom: 4 },
  row: { flexDirection: "row", borderBottom: "0.25pt solid #ddd", paddingVertical: 3 },
  rowHead: { flexDirection: "row", borderBottom: "0.5pt solid #555", paddingVertical: 3, fontWeight: 700, backgroundColor: "#f4f4f5" },
  cellName: { flex: 2, paddingHorizontal: 3 },
  cellLoc: { flex: 1.4, paddingHorizontal: 3 },
  cellStn: { flex: 1.4, paddingHorizontal: 3 },
  cellSrc: { flex: 1, paddingHorizontal: 3 },
  cellDay: { width: 22, textAlign: "center" },
  cellAcc: { width: 22, textAlign: "center" },
  cellConf: { width: 28, textAlign: "center" },
  shiftRow: { flexDirection: "row", borderBottom: "0.25pt solid #ddd", paddingVertical: 3 },
  shiftHead: { flexDirection: "row", borderBottom: "0.5pt solid #555", paddingVertical: 3, fontWeight: 700, backgroundColor: "#f4f4f5" },
  shiftName: { flex: 2, paddingHorizontal: 3 },
  shiftDay: { flex: 1.2, textAlign: "center", paddingHorizontal: 2 },
  shiftTotal: { flex: 0.8, textAlign: "center", paddingHorizontal: 3, fontWeight: 700 },
  small: { fontSize: 7.5, color: "#666" },
  footer: { position: "absolute", bottom: 18, left: 28, right: 28, fontSize: 8, color: "#888", flexDirection: "row", justifyContent: "space-between" },
});

function StaffDoc({
  festival,
  staff,
  concepts,
  shifts,
}: {
  festival: Festival;
  staff: Staff[];
  concepts: Concept[];
  shifts: Shift[];
}) {
  const conceptName = (id: string | null) =>
    !id ? "—" : concepts.find((c) => c.id === id)?.name ?? "—";

  const groups = [
    { id: "__mgmt__", name: "Management", people: staff.filter((s) => s.role === "management") },
    ...concepts.map((c) => ({
      id: c.id,
      name: c.name,
      people: staff.filter((s) => s.concept_id === c.id && s.role !== "management"),
    })),
    {
      id: "__none__",
      name: "Not assigned",
      people: staff.filter((s) => !s.concept_id && s.role !== "management"),
    },
  ].filter((g) => g.people.length > 0);

  const confirmedCount = staff.filter((s) => s.confirmed).length;
  const needAccom = staff.filter((s) => s.needs_accommodation).length;

  const scheduleConcepts = concepts.filter((c) => /fish|gyros/i.test(c.name));

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View>
          <Text style={styles.h1}>{N(`Staff — ${festival.name}`)}</Text>
          <Text style={styles.meta}>
            {N(`${formatDateRange(festival.start_date, festival.end_date)} · ${staff.length} people · ${confirmedCount} confirmed · ${needAccom} need accom.`)}
          </Text>
        </View>

        {groups.map((group) => (
          <View key={group.id} style={styles.section} wrap>
            <Text style={styles.sectionTitle}>{N(`${group.name} (${group.people.length})`)}</Text>
            <View style={styles.rowHead}>
              <Text style={styles.cellName}>Name</Text>
              <Text style={styles.cellLoc}>Location</Text>
              <Text style={styles.cellStn}>Station</Text>
              <Text style={styles.cellSrc}>Source</Text>
              <Text style={styles.cellDay}>Th</Text>
              <Text style={styles.cellDay}>Fr</Text>
              <Text style={styles.cellDay}>Sa</Text>
              <Text style={styles.cellDay}>Su</Text>
              <Text style={styles.cellAcc}>aT</Text>
              <Text style={styles.cellAcc}>aF</Text>
              <Text style={styles.cellAcc}>aS</Text>
              <Text style={styles.cellAcc}>aU</Text>
              <Text style={styles.cellConf}>OK</Text>
            </View>
            {group.people.map((p) => (
              <View key={p.id} style={styles.row} wrap={false}>
                <Text style={styles.cellName}>{N(p.name || "—")}</Text>
                <Text style={styles.cellLoc}>{N(p.home_location || "—")}</Text>
                <Text style={styles.cellStn}>{N(p.station ? STATION_LABEL[p.station] ?? p.station : "—")}</Text>
                <Text style={styles.cellSrc}>{N(SOURCE_LABEL[p.staff_source] ?? p.staff_source)}</Text>
                <Text style={styles.cellDay}>{p.works_thursday ? "✓" : "·"}</Text>
                <Text style={styles.cellDay}>{p.works_friday ? "✓" : "·"}</Text>
                <Text style={styles.cellDay}>{p.works_saturday ? "✓" : "·"}</Text>
                <Text style={styles.cellDay}>{p.works_sunday ? "✓" : "·"}</Text>
                <Text style={styles.cellAcc}>{p.accom_thursday ? "✓" : "·"}</Text>
                <Text style={styles.cellAcc}>{p.accom_friday ? "✓" : "·"}</Text>
                <Text style={styles.cellAcc}>{p.accom_saturday ? "✓" : "·"}</Text>
                <Text style={styles.cellAcc}>{p.accom_sunday ? "✓" : "·"}</Text>
                <Text style={styles.cellConf}>{p.confirmed ? "✓" : "·"}</Text>
              </View>
            ))}
          </View>
        ))}

        {scheduleConcepts.length > 0 && (
          <View style={styles.section} wrap>
            <Text style={styles.sectionTitle}>Shift schedule · Thu–Sun</Text>
            {scheduleConcepts.map((c) => {
              const conceptRows = shifts.filter(
                (r) => r.concept_id === c.id && (r.notes ?? "").trim()
              );
              const byName = new Map<string, Shift[]>();
              conceptRows.forEach((r) => {
                const n = (r.notes ?? "").trim();
                if (!byName.has(n)) byName.set(n, []);
                byName.get(n)!.push(r);
              });
              const names = Array.from(byName.keys()).sort((a, b) => {
                const aLate = (byName.get(a)!.find((r) => r.shift_date === "2026-05-21")?.end_time ?? "").startsWith("02");
                const bLate = (byName.get(b)!.find((r) => r.shift_date === "2026-05-21")?.end_time ?? "").startsWith("02");
                if (aLate !== bLate) return aLate ? -1 : 1;
                return a.localeCompare(b);
              });
              let conceptTotal = 0;
              return (
                <View key={c.id} wrap>
                  <Text style={styles.subTitle}>{N(c.name)}</Text>
                  <View style={styles.shiftHead}>
                    <Text style={styles.shiftName}>Name</Text>
                    {SCHEDULE_DAYS.map((d) => (
                      <Text key={d.date} style={styles.shiftDay}>{d.label}</Text>
                    ))}
                    <Text style={styles.shiftTotal}>Total</Text>
                  </View>
                  {names.length === 0 ? (
                    <Text style={[styles.small, { padding: 4 }]}>No shifts.</Text>
                  ) : (
                    names.map((name) => {
                      const personRows = byName.get(name)!;
                      let personTotal = 0;
                      const cells = SCHEDULE_DAYS.map((d) => {
                        const r = personRows.find((x) => x.shift_date === d.date);
                        if (!r) return { key: d.date, label: "—", h: 0 };
                        const h = hoursBetween(r.start_time, r.end_time, !!r.crosses_midnight);
                        personTotal += h;
                        return { key: d.date, label: `${fmt(r.start_time)}-${fmt(r.end_time)}`, h };
                      });
                      conceptTotal += personTotal;
                      return (
                        <View key={name} style={styles.shiftRow} wrap={false}>
                          <Text style={styles.shiftName}>{N(name)}</Text>
                          {cells.map((cell) => (
                            <Text key={cell.key} style={styles.shiftDay}>
                              {cell.label}{cell.h ? ` (${cell.h}h)` : ""}
                            </Text>
                          ))}
                          <Text style={styles.shiftTotal}>{Math.round(personTotal * 10) / 10}h</Text>
                        </View>
                      );
                    })
                  )}
                  {names.length > 0 && (
                    <View style={[styles.shiftRow, { backgroundColor: "#f4f4f5" }]} wrap={false}>
                      <Text style={[styles.shiftName, { fontWeight: 700 }]}>
                        {N(`${c.name} total`)}
                      </Text>
                      {SCHEDULE_DAYS.map((d) => (
                        <Text key={d.date} style={styles.shiftDay}></Text>
                      ))}
                      <Text style={styles.shiftTotal}>{Math.round(conceptTotal * 10) / 10}h</Text>
                    </View>
                  )}
                </View>
              );
            })}
            <Text style={[styles.small, { marginTop: 6 }]}>
              Legend: Th/Fr/Sa/Su = works that day · aT/aF/aS/aU = needs accommodation that night · OK = confirmed.
            </Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{N(festival.slug)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export default function FestivalStaffExport() {
  const { slug } = useParams<{ slug: string }>();
  const [festival, setFestival] = useState<Festival | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data: f } = await supabase
        .from("festivals")
        .select("id, name, slug, start_date, end_date")
        .eq("slug", slug)
        .maybeSingle();
      if (!f) { setLoading(false); return; }
      setFestival(f as Festival);

      const [staffRes, contractsRes, shiftsRes] = await Promise.all([
        supabase
          .from("festival_staff")
          .select("id, name, home_location, confirmed, needs_accommodation, concept_id, works_thursday, works_friday, works_saturday, works_sunday, accom_thursday, accom_friday, accom_saturday, accom_sunday, staff_source, role, station, notes")
          .eq("festival_id", (f as any).id)
          .order("name", { ascending: true }),
        supabase
          .from("festival_contracts")
          .select("concept_id, concepts:concept_id(id, name)")
          .eq("festival_id", (f as any).id)
          .eq("is_active", true),
        supabase
          .from("festival_shifts")
          .select("concept_id, shift_date, start_time, end_time, crosses_midnight, notes")
          .eq("festival_id", (f as any).id)
          .in("shift_date", SCHEDULE_DAYS.map((d) => d.date))
          .not("notes", "is", null),
      ]);

      setStaff((staffRes.data ?? []) as Staff[]);
      setConcepts(((contractsRes.data ?? []) as any[]).map((c) => c.concepts).filter(Boolean) as Concept[]);
      setShifts((shiftsRes.data ?? []) as Shift[]);
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
        <Link to={`/festivals/${slug}/staff`} className="text-sm text-primary hover:underline">← Back</Link>
        <PDFDownloadLink
          document={<StaffDoc festival={festival} staff={staff} concepts={concepts} shifts={shifts} />}
          fileName={`${festival.slug}-staff.pdf`}
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
          <StaffDoc festival={festival} staff={staff} concepts={concepts} shifts={shifts} />
        </PDFViewer>
      </div>
    </div>
  );
}
