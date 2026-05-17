import { useEffect, useState } from "react";
import "@/lib/pdfFonts";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFViewer, PDFDownloadLink, Font,
} from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";
import { formatDateRange } from "@/lib/dateFormat";
import { normalizeForPdf as N } from "@/lib/textNormalize";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { computeDemandKw, computePowerStatus } from "@/lib/powerStatus";

type EquipmentRow = {
  id: string;
  festival_power_id: string;
  equipment_name: string;
  quantity: number | null;
  power_kw: number | null;
  is_powered: boolean | null;
  category: string | null;
  position: number | null;
};

// TODO Sprint 7: Open Sans v17 drops fi/fl ligatures ("confrmed" / "fxed").
// Plan to swap to a font with full ligature support (Inter, IBM Plex Sans).
// Defer to post-Jelling — font swap is global to all PDFs.
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

type Festival = { id: string; name: string; start_date: string; end_date: string };
type Contract = {
  id: string; concept_alias: string | null;
  concept: { slug: ConceptSlug; name: string; display_order: number | null } | null;
};
type PowerRow = {
  id: string;
  festival_contract_id: string;
  connections_16a_240v: number | null;
  connections_16a_400v: number | null;
  connections_32a: number | null;
  connections_63a: number | null;
  connections_125a: number | null;
  tableau_required: boolean | null;
  tableau_count: number | null;
  total_kw_estimate: number | null;
  total_amp_estimate: number | null;
  allocated_kw: number | null;
  equipment_breakdown: string | null;
  status: string;
  power_drawing_file_path: string | null;
  ordered_date: string | null;
  cost_dkk: number | null;
  notes: string | null;
};

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Inter", fontSize: 10, color: "#111" },
  h1: { fontSize: 16, fontWeight: 700 },
  h2: { fontSize: 14, fontWeight: 700, marginBottom: 10 },
  meta: { fontSize: 9, color: "#555", marginTop: 2 },
  title: { fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 8 },
  unit: { marginTop: 12, paddingTop: 8, borderTop: "1pt solid #ccc" },
  unitTitle: { fontSize: 12, fontWeight: 700 },
  pillRow: { flexDirection: "row", gap: 6, marginTop: 4, marginBottom: 6 },
  pill: { borderWidth: 0.5, borderColor: "#666", padding: "1pt 4pt", fontSize: 8, borderRadius: 2 },
  row: { fontSize: 9, marginBottom: 2 },
  notes: { marginTop: 6, fontSize: 9, color: "#333" },
  sumBox: { marginTop: 16, padding: 8, borderWidth: 1, borderColor: "#333", backgroundColor: "#f3f3f3" },
  sumTitle: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  footer: {
    position: "absolute", bottom: 18, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: "#777",
  },
});

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function contractText(c: Contract) {
  // Emoji intentionally omitted for PDF — Open Sans v17 cannot render them.
  // CONCEPT_EMOJI is still imported for type/contract parity with the on-screen view.
  void CONCEPT_EMOJI;
  const base = c.concept?.name ?? "—";
  return c.concept_alias ? `${base} — ${c.concept_alias}` : base;
}

function trunc(s: string | null, n: number) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function PowerDoc({
  festival, rows, contractsById, equipmentByPower, filterLabel, canSeeFinance,
}: {
  festival: Festival;
  rows: PowerRow[];
  contractsById: Map<string, Contract>;
  equipmentByPower: Map<string, EquipmentRow[]>;
  filterLabel: string | null;
  canSeeFinance: boolean;
}) {
  const ts = new Date().toLocaleString("en-GB");
  const dateRange = formatDateRange(festival.start_date, festival.end_date);

  const totals = rows.reduce(
    (t, p) => {
      t.c16_240 += p.connections_16a_240v ?? 0;
      t.c16_400 += p.connections_16a_400v ?? 0;
      t.c32 += p.connections_32a ?? 0;
      t.c63 += p.connections_63a ?? 0;
      t.c125 += p.connections_125a ?? 0;
      t.allocated += Number(p.allocated_kw ?? 0);
      t.demand += computeDemandKw(equipmentByPower.get(p.id) ?? []);
      t.cost += Number(p.cost_dkk ?? 0);
      return t;
    },
    { c16_240: 0, c16_400: 0, c32: 0, c63: 0, c125: 0, allocated: 0, demand: 0, cost: 0 },
  );

  const Footer = () => (
    <View style={styles.footer} fixed>
      <Text>{N(festival.name)}</Text>
      <Text>{ts}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );

  return (
    <Document>
      {rows.length === 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>{N(`Power Plan — ${festival.name}`)}</Text>
          <Text style={styles.meta}>{N(`${dateRange}  ·  Generated ${ts}`)}</Text>
          {filterLabel && <Text style={styles.title}>{N(`Power Plan — ${filterLabel}`)}</Text>}
          <Text style={styles.meta}>No power records.</Text>
          <Footer />
        </Page>
      )}

      {rows.map((p) => {
        const c = contractsById.get(p.festival_contract_id);
        const conceptTitle = c ? contractText(c) : "—";
        const eq = equipmentByPower.get(p.id) ?? [];
        const demandKw = computeDemandKw(eq);
        const allocatedKw = Number(p.allocated_kw ?? 0);
        const liveStatus = computePowerStatus({
          status: p.status, allocated_kw: p.allocated_kw, demand_kw: demandKw,
        });

        const lines: string[] = [];
        if ((p.connections_16a_240v ?? 0) > 0) lines.push(`16A 240V: ${p.connections_16a_240v}`);
        if ((p.connections_16a_400v ?? 0) > 0) lines.push(`16A 400V: ${p.connections_16a_400v}`);
        if ((p.connections_32a ?? 0) > 0) lines.push(`32A: ${p.connections_32a}`);
        if ((p.connections_63a ?? 0) > 0) lines.push(`63A: ${p.connections_63a}`);
        if ((p.connections_125a ?? 0) > 0) lines.push(`125A: ${p.connections_125a}`);
        if (p.tableau_required) lines.push(`Strømtavle: ${p.tableau_count ?? 0}`);

        const poweredEq = eq
          .filter((e) => e.is_powered && (e.power_kw ?? 0) > 0)
          .sort((a, b) => (b.power_kw ?? 0) * (b.quantity ?? 1) - (a.power_kw ?? 0) * (a.quantity ?? 1));

        return (
          <Page key={p.id} size="A4" style={styles.page}>
            <Text style={styles.h1}>{N(`Power Plan — ${festival.name}`)}</Text>
            <Text style={styles.meta}>{N(`${dateRange}  ·  Generated ${ts}`)}</Text>

            <View style={styles.unit}>
              <Text style={styles.unitTitle}>{N(conceptTitle)}</Text>
              <View style={styles.pillRow}>
                <Text style={styles.pill}>{N(`status: ${liveStatus.label}`)}</Text>
                <Text style={styles.pill}>
                  {N(`drawing: ${p.power_drawing_file_path ? "uploaded" : "missing"}`)}
                </Text>
              </View>

              {lines.length === 0
                ? <Text style={styles.row}>Connections: —</Text>
                : lines.map((l, i) => <Text key={i} style={styles.row}>{N(l)}</Text>)}

              <Text style={styles.row}>
                {N(`Allocated: ${allocatedKw.toFixed(1)} kW   ·   Demand (live): ${demandKw.toFixed(1)} kW`)}
              </Text>
              {p.total_amp_estimate != null && (
                <Text style={styles.row}>{N(`Total Amp: ${p.total_amp_estimate}`)}</Text>
              )}

              <Text style={[styles.row, { marginTop: 6, fontWeight: 700 }]}>
                {N(`Equipment (${poweredEq.length} powered items)`)}
              </Text>
              {poweredEq.length === 0
                ? <Text style={styles.row}>—</Text>
                : poweredEq.map((e) => (
                    <Text key={e.id} style={styles.row}>
                      {N(`• ${e.equipment_name} × ${e.quantity ?? 1} — ${(Number(e.power_kw ?? 0)).toFixed(2)} kW`)}
                    </Text>
                  ))}

              {canSeeFinance ? (
                <Text style={[styles.row, { marginTop: 6 }]}>
                  {N(
                    `Ordered: ${fmtDate(p.ordered_date)}   ·   Cost: ${
                      p.cost_dkk != null ? Number(p.cost_dkk).toLocaleString("da-DK") + " DKK" : "—"
                    }`,
                  )}
                </Text>
              ) : (
                <Text style={[styles.row, { marginTop: 6 }]}>{N(`Ordered: ${fmtDate(p.ordered_date)}`)}</Text>
              )}
              {p.notes && <Text style={styles.notes}>{N(`Notes: ${trunc(p.notes, 600)}`)}</Text>}
            </View>

            <Footer />
          </Page>
        );
      })}

      {rows.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>{N(`Power Plan — ${festival.name}`)}</Text>
          <Text style={styles.meta}>{N(`${dateRange}  ·  Generated ${ts}`)}</Text>
          <Text style={styles.title}>Festival summary</Text>

          <View style={styles.sumBox}>
            <Text style={styles.sumTitle}>Festival summary</Text>
            <Text style={styles.row}>{N(`16A 240V: ${totals.c16_240}   ·   16A 400V: ${totals.c16_400}`)}</Text>
            <Text style={styles.row}>{N(`32A: ${totals.c32}   ·   63A: ${totals.c63}   ·   125A: ${totals.c125}`)}</Text>
            <Text style={styles.row}>
              {N(`Allocated: ${totals.allocated.toFixed(1)} kW   ·   Demand (live): ${totals.demand.toFixed(1)} kW`)}
            </Text>
            {canSeeFinance && (
              <Text style={styles.row}>{N(`Total cost: ${totals.cost.toLocaleString("da-DK")} DKK`)}</Text>
            )}
          </View>

          <Footer />
        </Page>
      )}
    </Document>
  );
}

export default function FestivalPowerExport() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const filterContract = params.get("contract");
  const filterConcept = params.get("concept");
  const canSeeFinance = useFinanceAccess();

  const [festival, setFestival] = useState<Festival | null>(null);
  const [rows, setRows] = useState<PowerRow[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const f = await supabase.from("festivals")
        .select("id,name,start_date,end_date").eq("slug", slug).maybeSingle();
      if (!alive || !f.data) { setLoading(false); return; }
      const fid = (f.data as any).id as string;

      const cRes = await supabase.from("festival_contracts")
        .select("id, concept_alias, concept:concepts!concept_id(slug, name, display_order)")
        .eq("festival_id", fid)
        .eq("is_active", true);
      const cs = (cRes.data ?? []) as unknown as Contract[];

      const pRes = cs.length > 0
        ? await supabase.from("festival_power").select("*").in("festival_contract_id", cs.map((c) => c.id))
        : { data: [] as any[] };

      const powerRows = (pRes.data ?? []) as PowerRow[];
      const eqRes = powerRows.length > 0
        ? await supabase.from("festival_power_equipment").select("*").in("festival_power_id", powerRows.map((p) => p.id))
        : { data: [] as any[] };

      if (!alive) return;
      setFestival(f.data as Festival);
      setContracts(cs);
      setRows(powerRows);
      setEquipment((eqRes.data ?? []) as EquipmentRow[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }
  if (!festival) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Festival not found.</div>;
  }

  const contractsById = new Map(contracts.map((c) => [c.id, c]));

  let filteredRows = rows;
  let filterLabel: string | null = null;
  if (filterContract) {
    filteredRows = rows.filter((p) => p.festival_contract_id === filterContract);
    const c = contracts.find((c) => c.id === filterContract);
    filterLabel = c ? contractText(c) : "selected contract";
  } else if (filterConcept) {
    const matchingIds = new Set(contracts.filter((c) => c.concept?.slug === filterConcept).map((c) => c.id));
    filteredRows = rows.filter((p) => matchingIds.has(p.festival_contract_id));
    filterLabel = filterConcept;
  }

  const sortedRows = filteredRows.slice().sort((a, b) => {
    const ca = contractsById.get(a.festival_contract_id);
    const cb = contractsById.get(b.festival_contract_id);
    return (ca?.concept?.display_order ?? 999) - (cb?.concept?.display_order ?? 999);
  });

  const equipmentByPower = new Map<string, EquipmentRow[]>();
  equipment.forEach((e) => {
    const arr = equipmentByPower.get(e.festival_power_id) ?? [];
    arr.push(e);
    equipmentByPower.set(e.festival_power_id, arr);
  });

  const doc = (
    <PowerDoc
      festival={festival}
      rows={sortedRows}
      contractsById={contractsById}
      equipmentByPower={equipmentByPower}
      filterLabel={filterLabel}
      canSeeFinance={canSeeFinance}
    />
  );

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between p-3 border-b bg-card">
        <Link to={`/festivals/${slug}/power`} className="text-sm text-muted-foreground hover:underline">
          ← Back to power
        </Link>
        <PDFDownloadLink
          document={doc}
          fileName={`power-${slug}${filterLabel ? "-" + filterLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : ""}.pdf`}
        >
          {({ loading: dlLoading }) => (
            <Button size="sm" disabled={dlLoading}>
              <Download className="h-4 w-4" />
              {dlLoading ? "Preparing…" : "Download PDF"}
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1">
        <PDFViewer width="100%" height="100%" style={{ border: 0 }}>
          {doc}
        </PDFViewer>
      </div>
    </div>
  );
}
