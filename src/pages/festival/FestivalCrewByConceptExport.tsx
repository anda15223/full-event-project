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

type Festival = { id: string; name: string; slug: string; start_date: string; end_date: string };
type Concept = { id: string; name: string };
type Staff = {
  id: string; name: string | null; email: string | null;
  home_location: string | null; confirmed: boolean | null;
  concept_id: string | null; contract_id: string | null;
  role: string; station: string | null; notes: string | null; staff_source: string;
};
type Position = { id: string; concept_id: string; station_id: string | null; position_number: number | null; display_name: string | null };
type StationRow = { id: string; concept_id: string | null; code: string; label: string };
type Contract = { id: string; concept_id: string; stall_alias: string | null };

const STATION_LABEL: Record<string, string> = {
  cash_register: "Cash register", assembly: "Assembly", fryer: "Fryer",
  oven: "Oven", pita_wrapper: "Pita wrapper", pita_griddle: "Pita griddle",
  burger: "Burger", burger_bun_grill: "Burger bun grill", crepes: "Crepes",
};
const SOURCE_LABEL: Record<string, string> = {
  soborg: "Copenhagen", aarhus: "Aarhus", local: "Local", fidibus: "Fidibus", unknown: "",
};

const normalizeLabel = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
const staffStationLabel = (code: string | null) =>
  code ? normalizeLabel(STATION_LABEL[code] ?? code) : "";
const stationMatchesStaff = (stationLabel: string, staffCode: string | null) =>
  !!staffCode && normalizeLabel(stationLabel) === staffStationLabel(staffCode);

async function renderPdfBlobToImages(blob: Blob): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.js?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const buffer = await blob.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdfDoc = await loadingTask.promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdfDoc.numPages; n++) {
    const page = await pdfDoc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.6, 1500 / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext("2d"); if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
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
  conceptBlock: { marginTop: 14, borderTop: "0.5pt solid #999", paddingTop: 8 },
  conceptTitle: { fontSize: 13, fontWeight: 700 },
  conceptMeta: { fontSize: 9, color: "#555", marginBottom: 6 },
  rowHead: { flexDirection: "row", borderBottom: "0.5pt solid #555", paddingVertical: 3, fontWeight: 700, backgroundColor: "#f4f4f5" },
  row: { flexDirection: "row", borderBottom: "0.25pt solid #ddd", paddingVertical: 3 },
  cellNum: { width: 22, textAlign: "center", paddingHorizontal: 3 },
  cellStn: { flex: 1.4, paddingHorizontal: 3 },
  cellPos: { width: 40, paddingHorizontal: 3 },
  cellName: { flex: 2, paddingHorizontal: 3 },
  cellLoc: { flex: 1.2, paddingHorizontal: 3 },
  cellNotes: { flex: 1.6, paddingHorizontal: 3 },
  subTitle: { fontSize: 10, fontWeight: 700, marginTop: 8, marginBottom: 3 },
  bannerBox: { marginTop: 10, padding: 8, borderWidth: 1.5, borderColor: "#dc2626", backgroundColor: "#fee2e2" },
  bannerTitle: { fontSize: 11, fontWeight: 700, color: "#b91c1c", marginBottom: 4 },
  bannerLine: { fontSize: 9, color: "#991b1b", marginTop: 1 },
  footer: { position: "absolute", bottom: 18, left: 28, right: 28, fontSize: 8, color: "#888", flexDirection: "row", justifyContent: "space-between" },
});

function CrewDoc({
  festival, staff, concepts, positions, stations, contracts,
}: {
  festival: Festival; staff: Staff[]; concepts: Concept[];
  positions: Position[]; stations: StationRow[]; contracts: Contract[];
}) {
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const stationById = new Map(stations.map((s) => [s.id, s]));

  // Group positions per concept, sorted
  const posByConcept = new Map<string, Position[]>();
  for (const p of positions) {
    if (!p.station_id) continue;
    const arr = posByConcept.get(p.concept_id) ?? [];
    arr.push(p);
    posByConcept.set(p.concept_id, arr);
  }

  // Build concept groupings from contracts (dedupe by concept_id)
  const conceptOrder: string[] = [];
  const seen = new Set<string>();
  for (const c of contracts) {
    if (!seen.has(c.concept_id) && conceptById.has(c.concept_id)) {
      seen.add(c.concept_id);
      conceptOrder.push(c.concept_id);
    }
  }
  for (const cid of posByConcept.keys()) {
    if (!seen.has(cid) && conceptById.has(cid)) { seen.add(cid); conceptOrder.push(cid); }
  }

  // Uncovered summary
  const uncoveredByConcept = new Map<string, { label: string; missing: number }[]>();
  let totalUncovered = 0;
  for (const cid of conceptOrder) {
    const posList = (posByConcept.get(cid) ?? []).slice();
    const slotByStation = new Map<string, number>();
    for (const p of posList) slotByStation.set(p.station_id!, (slotByStation.get(p.station_id!) ?? 0) + 1);
    const list: { label: string; missing: number }[] = [];
    slotByStation.forEach((count, stationId) => {
      const st = stationById.get(stationId); if (!st) return;
      const filled = staff.filter(
        (s) => s.concept_id === cid && s.role !== "management" && stationMatchesStaff(st.label, s.station),
      ).length;
      const missing = count - Math.min(filled, count);
      if (missing > 0) list.push({ label: st.label, missing });
    });
    if (list.length) { uncoveredByConcept.set(cid, list); totalUncovered += list.reduce((a, x) => a + x.missing, 0); }
  }

  const unassigned = staff.filter((s) => !s.concept_id && s.role !== "management");

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View>
          <Text style={styles.h1}>{N(`Crew by concept — ${festival.name}`)}</Text>
          <Text style={styles.meta}>
            {N(`${formatDateRange(festival.start_date, festival.end_date)} · ${staff.length} people`)}
          </Text>
        </View>

        {totalUncovered > 0 && (
          <View style={styles.bannerBox} wrap={false}>
            <Text style={styles.bannerTitle}>{N(`⚠ Uncovered positions · ${totalUncovered}`)}</Text>
            {Array.from(uncoveredByConcept.entries()).map(([cid, list]) => (
              <Text key={cid} style={styles.bannerLine}>
                {N(`• ${conceptById.get(cid)?.name ?? "—"}: ${list.map((l) => `${l.label} ×${l.missing}`).join(", ")}`)}
              </Text>
            ))}
          </View>
        )}

        {conceptOrder.map((cid) => {
          const cName = conceptById.get(cid)!.name;
          const posList = (posByConcept.get(cid) ?? []).slice().sort((a, b) => {
            const sa = stationById.get(a.station_id!)?.label ?? "";
            const sb = stationById.get(b.station_id!)?.label ?? "";
            if (sa !== sb) return sa.localeCompare(sb);
            return (a.position_number ?? 0) - (b.position_number ?? 0);
          });

          // Assign staff to slots by station id
          const staffByStation = new Map<string, Staff[]>();
          const conceptStations = stations.filter((st) => st.concept_id === cid || st.concept_id === null);
          const assignedIds = new Set<string>();
          for (const s of staff) {
            if (s.concept_id !== cid || s.role === "management" || !s.station) continue;
            const st = conceptStations.find((x) => stationMatchesStaff(x.label, s.station));
            if (!st) continue;
            const arr = staffByStation.get(st.id) ?? [];
            arr.push(s);
            staffByStation.set(st.id, arr);
          }
          staffByStation.forEach((arr) => arr.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")));

          const cursor = new Map<string, number>();
          const rows = posList.map((p) => {
            const st = stationById.get(p.station_id!);
            const key = st?.id ?? "";
            const queue = staffByStation.get(key) ?? [];
            const idx = cursor.get(key) ?? 0;
            const assigned = queue[idx];
            cursor.set(key, idx + 1);
            if (assigned) assignedIds.add(assigned.id);
            return { p, st, assigned, uncovered: !assigned };
          });

          const conceptCrew = staff.filter((s) => s.concept_id === cid && s.role !== "management");
          const extraCrew = conceptCrew.filter((s) => !assignedIds.has(s.id));

          const missingCount = rows.filter((r) => r.uncovered).length;

          return (
            <View key={cid} style={styles.conceptBlock} wrap>
              <Text style={styles.conceptTitle}>{N(cName)}</Text>
              <Text style={styles.conceptMeta}>
                {N(`${conceptCrew.length} crew · ${rows.length - missingCount}/${rows.length} positions filled${missingCount ? ` · ${missingCount} missing` : ""}`)}
              </Text>

              <Text style={styles.subTitle}>Positions</Text>
              <View style={styles.rowHead}>
                <Text style={styles.cellNum}>#</Text>
                <Text style={styles.cellStn}>Station</Text>
                <Text style={styles.cellPos}>Pos</Text>
                <Text style={styles.cellName}>Assigned staff</Text>
                <Text style={styles.cellLoc}>Transport</Text>
              </View>
              {rows.map((r) => (
                <View
                  key={r.p.id}
                  style={[styles.row, r.uncovered ? { backgroundColor: "#fee2e2" } : {}]}
                  wrap={false}
                >
                  <Text style={styles.cellNum}>{r.p.position_number ?? "—"}</Text>
                  <Text style={[styles.cellStn, r.uncovered ? { color: "#b91c1c", fontWeight: 700 } : {}]}>
                    {N(r.st?.label ?? "—")}
                  </Text>
                  <Text style={styles.cellPos}>{N(r.p.display_name || `#${r.p.position_number ?? ""}`)}</Text>
                  <Text style={[styles.cellName, r.uncovered ? { color: "#b91c1c", fontWeight: 700 } : {}]}>
                    {N(r.assigned?.name || "⚠ UNCOVERED")}
                  </Text>
                  <Text style={styles.cellLoc}>
                    {N(r.assigned ? (SOURCE_LABEL[r.assigned.staff_source] || r.assigned.home_location || "—") : "—")}
                  </Text>
                </View>
              ))}

              {extraCrew.length > 0 && (
                <>
                  <Text style={styles.subTitle}>Extra crew (no matching position)</Text>
                  <View style={styles.rowHead}>
                    <Text style={styles.cellNum}>#</Text>
                    <Text style={styles.cellName}>Name</Text>
                    <Text style={styles.cellStn}>Station</Text>
                    <Text style={styles.cellLoc}>Transport</Text>
                    <Text style={styles.cellNotes}>Notes</Text>
                  </View>
                  {extraCrew.map((s, i) => (
                    <View key={s.id} style={styles.row} wrap={false}>
                      <Text style={styles.cellNum}>{i + 1}</Text>
                      <Text style={styles.cellName}>{N(s.name || "—")}</Text>
                      <Text style={styles.cellStn}>{N(s.station ? STATION_LABEL[s.station] ?? s.station : "—")}</Text>
                      <Text style={styles.cellLoc}>{N(SOURCE_LABEL[s.staff_source] || s.home_location || "—")}</Text>
                      <Text style={styles.cellNotes}>{N(s.notes || "—")}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          );
        })}

        {unassigned.length > 0 && (
          <View style={styles.conceptBlock} wrap>
            <Text style={[styles.conceptTitle, { color: "#b91c1c" }]}>
              {N(`⚠ Not assigned to any concept (${unassigned.length})`)}
            </Text>
            <View style={styles.rowHead}>
              <Text style={styles.cellNum}>#</Text>
              <Text style={styles.cellName}>Name</Text>
              <Text style={styles.cellLoc}>Transport</Text>
              <Text style={styles.cellStn}>Station</Text>
              <Text style={styles.cellNotes}>Notes</Text>
            </View>
            {unassigned.map((s, i) => (
              <View
                key={s.id}
                style={[styles.row, { backgroundColor: "#fee2e2" }]}
                wrap={false}
              >
                <Text style={styles.cellNum}>{i + 1}</Text>
                <Text style={[styles.cellName, { color: "#b91c1c", fontWeight: 700 }]}>{N(s.name || "—")}</Text>
                <Text style={styles.cellLoc}>{N(SOURCE_LABEL[s.staff_source] || s.home_location || "—")}</Text>
                <Text style={styles.cellStn}>{N(s.station ? STATION_LABEL[s.station] ?? s.station : "—")}</Text>
                <Text style={styles.cellNotes}>{N(s.notes || "—")}</Text>
              </View>
            ))}
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

export default function FestivalCrewByConceptExport() {
  const { slug } = useParams<{ slug: string }>();
  const [festival, setFestival] = useState<Festival | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [stations, setStations] = useState<StationRow[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data: f } = await supabase
        .from("festivals").select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (!f) { setLoading(false); return; }
      setFestival(f as Festival);

      const [staffRes, contractsRes, posRes, stationsRes] = await Promise.all([
        supabase.from("festival_staff")
          .select("id, name, email, home_location, confirmed, concept_id, contract_id, role, station, notes, staff_source")
          .eq("festival_id", (f as any).id)
          .order("name", { ascending: true }),
        supabase.from("festival_contracts")
          .select("id, concept_id, stall_alias, concepts:concept_id(id, name)")
          .eq("festival_id", (f as any).id).eq("is_active", true),
        supabase.from("festival_schedule_position")
          .select("id, concept_id, station_id, position_number, display_name")
          .eq("festival_id", (f as any).id),
        supabase.from("station").select("id, concept_id, code, label").eq("is_active", true),
      ]);

      setStaff((staffRes.data ?? []) as Staff[]);

      const conceptMap = new Map<string, Concept>();
      const contractList: Contract[] = [];
      for (const row of (contractsRes.data ?? []) as any[]) {
        const c = row.concepts as Concept | null;
        if (c && !conceptMap.has(c.id)) conceptMap.set(c.id, c);
        contractList.push({ id: row.id, concept_id: row.concept_id, stall_alias: row.stall_alias ?? null });
      }
      setConcepts(Array.from(conceptMap.values()));
      setContracts(contractList);
      setPositions((posRes.data ?? []) as Position[]);
      setStations((stationsRes.data ?? []) as StationRow[]);
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
        const blob = await pdf(
          <CrewDoc festival={festival} staff={staff} concepts={concepts} positions={positions} stations={stations} contracts={contracts} />,
        ).toBlob();
        const images = await renderPdfBlobToImages(blob);
        if (cancelled) return;
        if (images.length === 0) throw new Error("No preview pages generated");
        setPreviewPages(images);
      } catch (err) {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [festival, staff, concepts, positions, stations, contracts, loading]);

  if (loading) {
    return <div className="p-6 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b p-3 flex items-center justify-between">
        <Link to={`/festivals/${slug}/staff`} className="text-sm text-primary hover:underline">← Back</Link>
        <PDFDownloadLink
          document={<CrewDoc festival={festival} staff={staff} concepts={concepts} positions={positions} stations={stations} contracts={contracts} />}
          fileName={`${festival.slug}-crew-by-concept.pdf`}
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
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6">
            {previewPages.map((src, i) => (
              <img key={src} src={src} alt={`Page ${i + 1}`} className="w-full rounded-sm bg-background shadow-lg" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
