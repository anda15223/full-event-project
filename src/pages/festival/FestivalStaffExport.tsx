import { useEffect, useState } from "react";
import "@/lib/pdfFonts";
import { Link, useParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFDownloadLink, pdf,
} from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { formatDateRange } from "@/lib/dateFormat";
import { normalizeForPdf as N } from "@/lib/textNormalize";
import { formatHoursMinutes } from "@/lib/scheduling";

type Festival = { id: string; name: string; slug: string; start_date: string; end_date: string };
type Concept = { id: string; name: string };
type Staff = {
  id: string;
  name: string | null;
  email: string | null;
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
  work_dates: string[] | null;
  accom_dates: string[] | null;
  staff_source: string;
  role: string;
  station: string | null;
  notes: string | null;
};
type ScheduleShift = {
  festival_staff_id: string | null;
  schedule_position_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  computed_hours: number | null;
};
type SchedulePosition = {
  id: string;
  concept_id: string;
  station_id: string | null;
  position_number: number | null;
  display_name: string | null;
};
type StationRow = { id: string; concept_id: string | null; code: string; label: string };


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
  soborg: "Copenhagen",
  aarhus: "Aarhus",
  local: "Local",
  fidibus: "Fidibus",
  unknown: "",
};

const SCHEDULE_DAYS = [
  { date: "2026-05-21", label: "Thu 21" },
  { date: "2026-05-22", label: "Fri 22" },
  { date: "2026-05-23", label: "Sat 23" },
  { date: "2026-05-24", label: "Sun 24" },
] as const;

const fmt = (t?: string | null) => (t ? t.slice(0, 5) : "—");
const round1 = (n: number) => Math.round(n * 10) / 10;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEGACY_WORK: Record<string, keyof Staff> = {
  thursday: "works_thursday", friday: "works_friday", saturday: "works_saturday", sunday: "works_sunday",
};
const LEGACY_ACCOM: Record<string, keyof Staff> = {
  thursday: "accom_thursday", friday: "accom_friday", saturday: "accom_saturday", sunday: "accom_sunday",
};

function isoDatesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
function dayLabel(iso: string): { wd: string; dm: string } {
  const d = new Date(iso + "T00:00:00Z");
  const wd = WEEKDAY_SHORT[d.getUTCDay()];
  const dm = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  return { wd, dm };
}
function staffWorkDateSet(p: Staff, festivalDays: string[]): Set<string> {
  const set = new Set<string>(p.work_dates ?? []);
  // Map legacy weekday booleans onto festival dates that fall on those weekdays.
  if (!p.work_dates || p.work_dates.length === 0) {
    for (const iso of festivalDays) {
      const wd = new Date(iso + "T00:00:00Z").getUTCDay();
      const key = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][wd];
      const flag = LEGACY_WORK[key];
      if (flag && (p as any)[flag]) set.add(iso);
    }
  }
  return set;
}
function staffAccomDateSet(p: Staff, festivalDays: string[]): Set<string> {
  const set = new Set<string>(p.accom_dates ?? []);
  if (!p.accom_dates || p.accom_dates.length === 0) {
    for (const iso of festivalDays) {
      const wd = new Date(iso + "T00:00:00Z").getUTCDay();
      const key = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][wd];
      const flag = LEGACY_ACCOM[key];
      if (flag && (p as any)[flag]) set.add(iso);
    }
  }
  return set;
}

async function renderPdfBlobToImages(blob: Blob): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.js?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await blob.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdfDoc = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.6, 1500 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push(canvas.toDataURL("image/jpeg", 0.9));
    page.cleanup?.();
  }

  await loadingTask.destroy?.();
  return pages;
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
  cellHrs: { width: 32, textAlign: "right", paddingHorizontal: 3, fontWeight: 700 },
  cellNum: { width: 20, textAlign: "center", paddingHorizontal: 3 },
  cellName: { flex: 1.8, paddingHorizontal: 3 },
  cellEmail: { flex: 1.8, paddingHorizontal: 3 },
  cellLoc: { flex: 1.4, paddingHorizontal: 3 },
  cellStn: { flex: 1.2, paddingHorizontal: 3 },
  cellNotes: { flex: 1.6, paddingHorizontal: 3 },
  cellDay: { width: 26, textAlign: "center" },
  cellAcc: { width: 26, textAlign: "center" },
  cellConf: { width: 28, textAlign: "center" },
  dayHeader: { width: 26, textAlign: "center", fontSize: 7.5, lineHeight: 1.1 },
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
  positions,
  stations,
}: {
  festival: Festival;
  staff: Staff[];
  concepts: Concept[];
  shifts: ScheduleShift[];
  positions: SchedulePosition[];
  stations: StationRow[];
}) {
  // hours per staff (total across festival)
  const hoursByStaff = new Map<string, number>();
  for (const s of shifts) {
    if (!s.festival_staff_id) continue;
    hoursByStaff.set(s.festival_staff_id, (hoursByStaff.get(s.festival_staff_id) ?? 0) + (Number(s.computed_hours) || 0));
  }

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

  // schedule: map position -> concept; group shifts by concept then by staff
  const posById = new Map(positions.map((p) => [p.id, p]));
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const staffById = new Map(staff.map((s) => [s.id, s]));

  type PerStaffSchedule = { staffId: string; name: string; perDay: Map<string, ScheduleShift[]>; total: number };
  const conceptSchedules = new Map<string, Map<string, PerStaffSchedule>>();
  for (const s of shifts) {
    if (!s.festival_staff_id) continue;
    const pos = posById.get(s.schedule_position_id);
    if (!pos) continue;
    let m = conceptSchedules.get(pos.concept_id);
    if (!m) { m = new Map(); conceptSchedules.set(pos.concept_id, m); }
    let row = m.get(s.festival_staff_id);
    if (!row) {
      row = { staffId: s.festival_staff_id, name: staffById.get(s.festival_staff_id)?.name ?? "—", perDay: new Map(), total: 0 };
      m.set(s.festival_staff_id, row);
    }
    const list = row.perDay.get(s.shift_date) ?? [];
    list.push(s);
    row.perDay.set(s.shift_date, list);
    row.total += Number(s.computed_hours) || 0;
  }

  const scheduleConceptIds = Array.from(conceptSchedules.keys()).filter((id) => conceptById.has(id));

  // Build the dynamic day window: festival start..end ∪ all custom dates
  // that appear in any staff member's work_dates / accom_dates.
  const festivalDays = isoDatesBetween(festival.start_date, festival.end_date);
  const extraSet = new Set<string>();
  for (const p of staff) {
    for (const d of p.work_dates ?? []) extraSet.add(d);
    for (const d of p.accom_dates ?? []) extraSet.add(d);
  }
  for (const d of festivalDays) extraSet.delete(d);
  const dayList = [...festivalDays, ...Array.from(extraSet)].sort((a, b) => a.localeCompare(b));

  // Uncovered positions per concept (station slots that have no matching staff)
  const stationById = new Map(stations.map((s) => [s.id, s]));
  // Map station.code -> the "staff-code" used on festival_staff.station.
  // The page uses `staffCodeForStation()`; for the export we assume they match
  // (they do for the current catalog — burger, fryer, etc.).
  const uncoveredByConcept = new Map<string, { label: string; missing: number }[]>();
  const slotCountByConceptStation = new Map<string, Map<string, number>>();
  for (const p of positions) {
    if (!p.station_id) continue;
    const inner = slotCountByConceptStation.get(p.concept_id) ?? new Map<string, number>();
    inner.set(p.station_id, (inner.get(p.station_id) ?? 0) + 1);
    slotCountByConceptStation.set(p.concept_id, inner);
  }
  slotCountByConceptStation.forEach((inner, conceptId) => {
    const list: { label: string; missing: number }[] = [];
    inner.forEach((count, stationId) => {
      const st = stationById.get(stationId);
      if (!st) return;
      const filled = staff.filter(
        (s) => s.concept_id === conceptId && s.role !== "management" && s.station === st.code,
      ).length;
      const missing = count - Math.min(filled, count);
      if (missing > 0) list.push({ label: st.label, missing });
    });
    if (list.length) uncoveredByConcept.set(conceptId, list);
  });
  const totalUncovered = Array.from(uncoveredByConcept.values()).reduce(
    (acc, arr) => acc + arr.reduce((a, s) => a + s.missing, 0),
    0,
  );

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View>
          <Text style={styles.h1}>{N(`Staff — ${festival.name}`)}</Text>
          <Text style={styles.meta}>
            {N(`${formatDateRange(festival.start_date, festival.end_date)} · ${staff.length} people · ${confirmedCount} confirmed · ${needAccom} need accom.`)}
          </Text>
        </View>

        {totalUncovered > 0 && (
          <View
            style={{
              marginTop: 10,
              padding: 8,
              borderWidth: 1.5,
              borderColor: "#dc2626",
              backgroundColor: "#fee2e2",
            }}
            wrap={false}
          >
            <Text style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>
              {N(`⚠ Uncovered positions · ${totalUncovered}`)}
            </Text>
            {Array.from(uncoveredByConcept.entries()).map(([cid, list]) => {
              const cName = concepts.find((c) => c.id === cid)?.name ?? "—";
              return (
                <Text key={cid} style={{ fontSize: 9, color: "#991b1b", marginTop: 1 }}>
                  {N(
                    `• ${cName}: ` +
                      list.map((l) => `${l.label} ×${l.missing}`).join(", "),
                  )}
                </Text>
              );
            })}
          </View>
        )}

        {groups.map((group) => (
          <View key={group.id} style={styles.section} wrap>
            <Text style={styles.sectionTitle}>{N(`${group.name} (${group.people.length})`)}</Text>
            <View style={styles.rowHead}>
              <Text style={styles.cellNum}>#</Text>
              <Text style={styles.cellName}>Name</Text>
              <Text style={styles.cellEmail}>Email</Text>
              <Text style={styles.cellLoc}>Transport Place</Text>
              <Text style={styles.cellStn}>Station</Text>
              <Text style={styles.cellNotes}>Notes</Text>
            </View>
            {group.people.map((p, i) => (
              <View key={p.id} style={styles.row} wrap={false}>
                <Text style={styles.cellNum}>{i + 1}</Text>
                <Text style={styles.cellName}>{N(p.name || "—")}</Text>
                <Text style={styles.cellEmail}>{N(p.email || "—")}</Text>
                <Text style={styles.cellLoc}>{N(SOURCE_LABEL[p.staff_source] || p.home_location || "—")}</Text>
                <Text style={styles.cellStn}>{N(p.station ? STATION_LABEL[p.station] ?? p.station : "—")}</Text>
                <Text style={styles.cellNotes}>{N(p.notes || "—")}</Text>
              </View>
            ))}
          </View>
        ))}

        {scheduleConceptIds.length > 0 && (
          <View style={styles.section} wrap>
            <Text style={styles.sectionTitle}>Shift schedule · Thu–Sun</Text>
            {scheduleConceptIds.map((cid) => {
              const c = conceptById.get(cid)!;
              const rows = Array.from(conceptSchedules.get(cid)!.values()).sort((a, b) => a.name.localeCompare(b.name));
              const conceptTotal = rows.reduce((acc, r) => acc + r.total, 0);
              return (
                <View key={cid} wrap>
                  <Text style={styles.subTitle}>{N(c.name)}</Text>
                  <View style={styles.shiftHead}>
                    <Text style={styles.shiftName}>Name</Text>
                    {SCHEDULE_DAYS.map((d) => (
                      <Text key={d.date} style={styles.shiftDay}>{d.label}</Text>
                    ))}
                    <Text style={styles.shiftTotal}>Total</Text>
                  </View>
                  {rows.length === 0 ? (
                    <Text style={[styles.small, { padding: 4 }]}>No shifts.</Text>
                  ) : (
                    rows.map((r) => (
                      <View key={r.staffId} style={styles.shiftRow} wrap={false}>
                        <Text style={styles.shiftName}>{N(r.name)}</Text>
                        {SCHEDULE_DAYS.map((d) => {
                          const list = (r.perDay.get(d.date) ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
                          if (list.length === 0) return <Text key={d.date} style={styles.shiftDay}>—</Text>;
                          const dayH = list.reduce((acc, s) => acc + (Number(s.computed_hours) || 0), 0);
                          const label = list.map((s) => `${fmt(s.start_time)}-${fmt(s.end_time)}`).join(", ");
                          return (
                            <Text key={d.date} style={styles.shiftDay}>
                              {label}{dayH ? ` (${formatHoursMinutes(dayH)})` : ""}
                            </Text>
                          );
                        })}
                        <Text style={styles.shiftTotal}>{formatHoursMinutes(r.total)}</Text>
                      </View>
                    ))
                  )}
                  {rows.length > 0 && (
                    <View style={[styles.shiftRow, { backgroundColor: "#f4f4f5" }]} wrap={false}>
                      <Text style={[styles.shiftName, { fontWeight: 700 }]}>
                        {N(`${c.name} total`)}
                      </Text>
                      {SCHEDULE_DAYS.map((d) => (
                        <Text key={d.date} style={styles.shiftDay}></Text>
                      ))}
                      <Text style={styles.shiftTotal}>{formatHoursMinutes(conceptTotal)}</Text>
                    </View>
                  )}
                </View>
              );
            })}
            <Text style={[styles.small, { marginTop: 6 }]}>
              Legend: Hrs = total scheduled hours · Th/Fr/Sa/Su = works that day · aT/aF/aS/aU = needs accommodation that night · OK = confirmed.
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
  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [positions, setPositions] = useState<SchedulePosition[]>([]);
  const [stations, setStations] = useState<StationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

      const [staffRes, contractsRes, posRes, stationsRes] = await Promise.all([
        supabase
          .from("festival_staff")
          .select("id, name, email, home_location, confirmed, needs_accommodation, concept_id, works_thursday, works_friday, works_saturday, works_sunday, accom_thursday, accom_friday, accom_saturday, accom_sunday, work_dates, accom_dates, staff_source, role, station, notes")
          .eq("festival_id", (f as any).id)
          .order("name", { ascending: true }),
        supabase
          .from("festival_contracts")
          .select("concept_id, concepts:concept_id(id, name)")
          .eq("festival_id", (f as any).id)
          .eq("is_active", true),
        supabase
          .from("festival_schedule_position")
          .select("id, concept_id, station_id, position_number, display_name")
          .eq("festival_id", (f as any).id),
        supabase
          .from("station")
          .select("id, concept_id, code, label")
          .eq("is_active", true),
      ]);

      const positionList = (posRes.data ?? []) as SchedulePosition[];
      const posIds = positionList.map((p) => p.id);
      let shiftList: ScheduleShift[] = [];
      if (posIds.length > 0) {
        const { data: sData } = await supabase
          .from("festival_schedule_shift")
          .select("festival_staff_id, schedule_position_id, shift_date, start_time, end_time, computed_hours")
          .in("schedule_position_id", posIds);
        shiftList = (sData ?? []) as ScheduleShift[];
      }

      setStaff((staffRes.data ?? []) as Staff[]);
      setConcepts(((contractsRes.data ?? []) as any[]).map((c) => c.concepts).filter(Boolean) as Concept[]);
      setPositions(positionList);
      setStations((stationsRes.data ?? []) as StationRow[]);
      setShifts(shiftList);
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    if (!festival || loading) return;

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewPages([]);

    (async () => {
      try {
        const blob = await pdf(<StaffDoc festival={festival} staff={staff} concepts={concepts} shifts={shifts} positions={positions} stations={stations} />).toBlob();
        const images = await renderPdfBlobToImages(blob);
        if (cancelled) return;
        if (images.length === 0) throw new Error("No preview pages generated");
        setPreviewPages(images);
      } catch (error) {
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [festival, staff, concepts, shifts, positions, loading]);

  if (loading) {
    return <div className="p-6 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b p-3 flex items-center justify-between">
        <Link to={`/festivals/${slug}/staff`} className="text-sm text-primary hover:underline">← Back</Link>
        <PDFDownloadLink
          document={<StaffDoc festival={festival} staff={staff} concepts={concepts} shifts={shifts} positions={positions} stations={stations} />}
          fileName={`${festival.slug}-staff.pdf`}
        >
          {({ loading }) => (
            <Button size="sm" disabled={loading}>
              <Download className="h-4 w-4 mr-1" /> {loading ? "Preparing…" : "Download PDF"}
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1 min-h-0 overflow-auto bg-muted p-6">
        {previewLoading && (
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Rendering preview…
          </div>
        )}
        {previewError && <div className="text-sm text-destructive">Failed to render preview: {previewError}</div>}
        {!previewLoading && !previewError && previewPages.length > 0 && (
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-6">
            {previewPages.map((src, index) => (
              <img
                key={src}
                src={src}
                alt={`Staff report page ${index + 1}`}
                className="w-full max-w-6xl rounded-sm bg-background shadow-lg"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
