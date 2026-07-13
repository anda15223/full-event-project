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
type StationRow = { id: string; concept_id: string | null; code: string; label: string; display_order: number | null };
type ContractGroup = { contractId: string; conceptId: string; name: string };

const STATION_CODE_TO_STAFF: Record<string, string> = {
  cash: "cash_register",
  pita_wrap: "pita_wrapper",
  bun_grill: "burger_bun_grill",
};
const staffCodeForStation = (code: string) => STATION_CODE_TO_STAFF[code] ?? code;

const STATION_LABEL: Record<string, string> = {
  cash_register: "Cash register", assembly: "Assembly", fryer: "Fryer",
  oven: "Oven", pita_wrapper: "Pita wrapper", pita_griddle: "Pita griddle",
  burger: "Burger", burger_bun_grill: "Burger bun grill", crepes: "Crepes",
};
const SOURCE_LABEL: Record<string, string> = {
  soborg: "Copenhagen", aarhus: "Aarhus", local: "Local", fidibus: "Fidibus", unknown: "",
};

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
  groupBlock: { marginTop: 14, borderTop: "0.5pt solid #999", paddingTop: 8 },
  groupTitle: { fontSize: 13, fontWeight: 700 },
  groupMeta: { fontSize: 9, color: "#555", marginBottom: 6 },
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

type PlanSlot = { stationId: string; stationCode: string; label: string; count: number };

function CrewDoc({
  festival, staff, groups, positions, stations,
}: {
  festival: Festival; staff: Staff[]; groups: ContractGroup[];
  positions: Position[]; stations: StationRow[];
}) {
  const stationById = new Map(stations.map((s) => [s.id, s]));

  // Build plan (slots) per concept
  const planByConcept = new Map<string, PlanSlot[]>();
  const grouped = new Map<string, Map<string, number>>();
  positions.forEach((p) => {
    if (!p.station_id) return;
    const inner = grouped.get(p.concept_id) ?? new Map<string, number>();
    inner.set(p.station_id, (inner.get(p.station_id) ?? 0) + 1);
    grouped.set(p.concept_id, inner);
  });
  grouped.forEach((inner, conceptId) => {
    const slots: PlanSlot[] = [];
    inner.forEach((count, stationId) => {
      const st = stationById.get(stationId);
      if (!st) return;
      slots.push({ stationId, stationCode: staffCodeForStation(st.code), label: st.label, count });
    });
    slots.sort((a, b) => (stationById.get(a.stationId)?.display_order ?? 0) - (stationById.get(b.stationId)?.display_order ?? 0));
    planByConcept.set(conceptId, slots);
  });

  // Uncovered per contract group
  type UncItem = { label: string; missing: number };
  const uncoveredByGroup = new Map<string, UncItem[]>();
  let totalUncovered = 0;
  groups.forEach((g) => {
    const slots = planByConcept.get(g.conceptId) ?? [];
    const groupPeople = staff.filter((s) => s.contract_id === g.contractId && s.role !== "management");
    const list: UncItem[] = [];
    slots.forEach((slot) => {
      const filled = groupPeople.filter((p) => p.station === slot.stationCode).length;
      const missing = slot.count - Math.min(filled, slot.count);
      if (missing > 0) list.push({ label: slot.label, missing });
    });
    if (list.length) { uncoveredByGroup.set(g.contractId, list); totalUncovered += list.reduce((a, x) => a + x.missing, 0); }
  });

  const unassigned = staff.filter((s) => !s.contract_id && s.role !== "management");
  const management = staff.filter((s) => s.role === "management");

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
            {groups.map((g) => {
              const list = uncoveredByGroup.get(g.contractId);
              if (!list) return null;
              return (
                <Text key={g.contractId} style={styles.bannerLine}>
                  {N(`• ${g.name}: ${list.map((l) => `${l.label} ×${l.missing}`).join(", ")}`)}
                </Text>
              );
            })}
          </View>
        )}

        {groups.map((g) => {
          const groupPeople = staff.filter((s) => s.contract_id === g.contractId && s.role !== "management");
          const slots = planByConcept.get(g.conceptId) ?? [];

          // Assign staff to slots (station-by-station, first-come)
          const usedIds = new Set<string>();
          const slotRows: { label: string; posNum: number; assigned: Staff | undefined; uncovered: boolean }[] = [];
          slots.forEach((slot) => {
            const occupants = groupPeople
              .filter((p) => p.station === slot.stationCode)
              .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
            for (let i = 0; i < slot.count; i++) {
              const assigned = occupants[i];
              if (assigned) usedIds.add(assigned.id);
              slotRows.push({ label: slot.label, posNum: i + 1, assigned, uncovered: !assigned });
            }
          });
          const extras = groupPeople.filter((p) => !usedIds.has(p.id));
          const totalSlots = slotRows.length;
          const filled = slotRows.filter((r) => !r.uncovered).length;
          const missing = totalSlots - filled;

          return (
            <View key={g.contractId} style={styles.groupBlock} wrap>
              <Text style={styles.groupTitle}>{N(g.name)}</Text>
              <Text style={styles.groupMeta}>
                {N(`${groupPeople.length} crew · ${filled}/${totalSlots} positions filled${missing ? ` · ${missing} missing` : ""}`)}
              </Text>

              {totalSlots > 0 ? (
                <>
                  <Text style={styles.subTitle}>Positions</Text>
                  <View style={styles.rowHead}>
                    <Text style={styles.cellNum}>#</Text>
                    <Text style={styles.cellStn}>Station</Text>
                    <Text style={styles.cellPos}>Pos</Text>
                    <Text style={styles.cellName}>Assigned staff</Text>
                    <Text style={styles.cellLoc}>Transport</Text>
                  </View>
                  {slotRows.map((r, i) => (
                    <View
                      key={i}
                      style={[styles.row, r.uncovered ? { backgroundColor: "#fee2e2" } : {}]}
                      wrap={false}
                    >
                      <Text style={styles.cellNum}>{r.posNum}</Text>
                      <Text style={[styles.cellStn, r.uncovered ? { color: "#b91c1c", fontWeight: 700 } : {}]}>
                        {N(r.label)}
                      </Text>
                      <Text style={styles.cellPos}>{`#${r.posNum}`}</Text>
                      <Text style={[styles.cellName, r.uncovered ? { color: "#b91c1c", fontWeight: 700 } : {}]}>
                        {N(r.assigned?.name || "⚠ UNCOVERED")}
                      </Text>
                      <Text style={styles.cellLoc}>
                        {N(r.assigned ? (SOURCE_LABEL[r.assigned.staff_source] || r.assigned.home_location || "—") : "—")}
                      </Text>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.groupMeta}>No station plan for this concept.</Text>
              )}

              {extras.length > 0 && (
                <>
                  <Text style={styles.subTitle}>Extra crew (no matching slot)</Text>
                  <View style={styles.rowHead}>
                    <Text style={styles.cellNum}>#</Text>
                    <Text style={styles.cellName}>Name</Text>
                    <Text style={styles.cellStn}>Station</Text>
                    <Text style={styles.cellLoc}>Transport</Text>
                    <Text style={styles.cellNotes}>Notes</Text>
                  </View>
                  {extras.map((s, i) => (
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

        {management.length > 0 && (
          <View style={styles.groupBlock} wrap>
            <Text style={styles.groupTitle}>{N(`Management (${management.length})`)}</Text>
            <View style={styles.rowHead}>
              <Text style={styles.cellNum}>#</Text>
              <Text style={styles.cellName}>Name</Text>
              <Text style={styles.cellLoc}>Transport</Text>
              <Text style={styles.cellNotes}>Notes</Text>
            </View>
            {management.map((s, i) => (
              <View key={s.id} style={styles.row} wrap={false}>
                <Text style={styles.cellNum}>{i + 1}</Text>
                <Text style={styles.cellName}>{N(s.name || "—")}</Text>
                <Text style={styles.cellLoc}>{N(SOURCE_LABEL[s.staff_source] || s.home_location || "—")}</Text>
                <Text style={styles.cellNotes}>{N(s.notes || "—")}</Text>
              </View>
            ))}
          </View>
        )}

        {unassigned.length > 0 && (
          <View style={styles.groupBlock} wrap>
            <Text style={[styles.groupTitle, { color: "#b91c1c" }]}>
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
  const [groups, setGroups] = useState<ContractGroup[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [stations, setStations] = useState<StationRow[]>([]);
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
          .select("id, concept_id, concept_alias, concepts:concept_id(id, name)")
          .eq("festival_id", (f as any).id).eq("is_active", true),
        supabase.from("festival_schedule_position")
          .select("id, concept_id, station_id, position_number, display_name")
          .eq("festival_id", (f as any).id),
        supabase.from("station").select("id, concept_id, code, label, display_order").eq("is_active", true),
      ]);

      setStaff((staffRes.data ?? []) as Staff[]);

      const rows = (contractsRes.data ?? []) as any[];
      const list: ContractGroup[] = rows
        .filter((r) => r.concepts)
        .map((r) => ({
          contractId: r.id,
          conceptId: r.concepts.id,
          name: (r.concept_alias?.trim() || r.concepts.name) as string,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setGroups(list);

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
          <CrewDoc festival={festival} staff={staff} groups={groups} positions={positions} stations={stations} />,
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
  }, [festival, staff, groups, positions, stations, loading]);

  if (loading) {
    return <div className="p-6 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b p-3 flex items-center justify-between">
        <Link to={`/festivals/${slug}/staff`} className="text-sm text-primary hover:underline">← Back</Link>
        <PDFDownloadLink
          document={<CrewDoc festival={festival} staff={staff} groups={groups} positions={positions} stations={stations} />}
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
