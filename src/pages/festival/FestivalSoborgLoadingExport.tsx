import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFViewer, PDFDownloadLink, Font,
} from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import {
  getSoborgLoadingManifest, sortedCategories, categoryLabel, regroupForSoborgPDF,
  type SoborgLoadingManifest,
} from "@/lib/soborgLoading";
import { normalizeForPdf } from "@/lib/textNormalize";
import { formatDateRange } from "@/lib/dateFormat";

try {
  Font.register({
    family: "OpenSans",
    fonts: [
      { src: "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.28/files/open-sans-latin-ext-400-normal.woff", fontWeight: 400 },
      { src: "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.28/files/open-sans-latin-ext-700-normal.woff", fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
} catch {}

const N = normalizeForPdf;

const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 44, fontFamily: "OpenSans", fontSize: 9.5, color: "#111" },
  h1: { fontSize: 18, fontWeight: 700 },
  meta: { fontSize: 9, color: "#666", marginTop: 2 },
  vehicleHeader: { marginTop: 4, marginBottom: 8, padding: 6, backgroundColor: "#f1f1f1", borderLeft: "3pt solid #111" },
  vehicleTitle: { fontSize: 13, fontWeight: 700 },
  conceptHeader: { marginTop: 8, marginBottom: 4, fontSize: 11, fontWeight: 700 },
  catLabel: { marginTop: 4, marginBottom: 2, fontSize: 8.5, fontWeight: 700, color: "#444", textTransform: "uppercase" },
  item: { fontSize: 9.5, marginLeft: 12, marginBottom: 1 },
  warn: { color: "#c0392b" },
  amber: { color: "#d68910" },
  small: { fontSize: 8.5, color: "#666" },
  footer: {
    position: "absolute", bottom: 18, left: 32, right: 32,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: "#777", borderTop: "0.5pt solid #ddd", paddingTop: 4,
  },
  warnBox: { marginTop: 10, padding: 8, border: "1pt solid #d68910", backgroundColor: "#fff8e1" },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
});

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function SoborgLoadingDoc({ data }: { data: SoborgLoadingManifest }) {
  const ts = new Date().toLocaleString("en-GB");
  return (
    <Document title={`${data.festival.name} — Soborg Loading Manifest`} author="Full Event Project">
      {data.vehicles.map((veh, vi) => (
        <Page key={veh.vehicle_id} size="A4" style={s.page} wrap>
          {vi === 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={s.h1}>{N(`Soborg Loading Manifest — ${data.festival.name}`)}</Text>
              <Text style={s.meta}>
                {N(formatDateRange(data.festival.start_date, data.festival.end_date))} · {data.total_items} items · Generated {ts}
              </Text>
            </View>
          )}
          <View style={s.vehicleHeader}>
            <Text style={s.vehicleTitle}>
              {N(veh.vehicle_type)}
              {veh.license_plate
                ? <Text style={{ fontSize: 10, fontWeight: 400 }}>  ·  {N(veh.license_plate)}</Text>
                : <Text style={{ fontSize: 10, fontWeight: 400, color: "#c0392b" }}>  ·  (plate pending)</Text>}
              <Text style={{ fontSize: 11, fontWeight: 400 }}> — {veh.car_total_items} items</Text>
            </Text>
          </View>
          {veh.concepts.map((cg) => {
            const grouped = regroupForSoborgPDF(cg.items_by_category);
            return (
            <View key={cg.contract_id} wrap={false} style={{ marginBottom: 6 }}>
              <Text style={s.conceptHeader}>
                {N(cg.concept_name)}{cg.concept_alias ? ` — ${N(cg.concept_alias)}` : ""}
                <Text style={s.small}>  ({cg.total_items} items)</Text>
              </Text>
              {sortedCategories(grouped).map((cat) => (
                <View key={cat}>
                  <Text style={s.catLabel}>{categoryLabel(cat)}</Text>
                  {grouped[cat].map((it) => {
                    const tags: string[] = [];
                    if (it.power_type) tags.push(it.power_type);
                    if (it.power_kw) tags.push(`${Number(it.power_kw).toFixed(1)} kW`);
                    if (it.is_shared) tags.push("shared");
                    return (
                      <Text key={it.id} style={s.item}>
                        • {it.quantity}× {N(it.name)}
                        {tags.length > 0 ? `  (${tags.join(", ")})` : ""}
                        {it.notes ? `  — ${N(it.notes)}` : ""}
                      </Text>
                    );
                  })}
                </View>
              ))}
            </View>
          ))}
          <View style={s.footer} fixed>
            <Text>{N(data.festival.name)} / Soborg Loading</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      ))}

      {(data.unassigned.concepts.length > 0 || data.not_loaded_from_soborg.items.length > 0 || data.vehicles.length === 0) && (
        <Page size="A4" style={s.page} wrap>
          {data.vehicles.length === 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={s.h1}>{N(`Soborg Loading Manifest — ${data.festival.name}`)}</Text>
              <Text style={s.meta}>{N(formatDateRange(data.festival.start_date, data.festival.end_date))} · Generated {ts}</Text>
            </View>
          )}
          {data.unassigned.concepts.length > 0 && (
            <View style={s.warnBox} wrap={false}>
              <Text style={[s.sectionTitle, s.amber]}>Concepts without vehicle assignment</Text>
              {data.unassigned.concepts.map((c) => (
                <Text key={c.contract_id} style={s.item}>
                  • {N(c.concept_name)}{c.concept_alias ? ` — ${N(c.concept_alias)}` : ""}
                  {c.total_items > 0 ? `  (${c.total_items} items)` : ""}
                </Text>
              ))}
            </View>
          )}
          {data.not_loaded_from_soborg.items.length > 0 && (
            <View style={{ marginTop: 12 }} wrap={false}>
              <Text style={s.sectionTitle}>Delivered on-site (NOT loaded from Soborg)</Text>
              {data.not_loaded_from_soborg.items.map((u) => (
                <Text key={u.id} style={s.item}>
                  • {u.quantity}× {N(u.unit_label)}
                  {u.container_type ? ` — ${N(u.container_type)}` : ""}
                  {u.supplier ? `  (${N(u.supplier)})` : ""}
                  {(u.delivery_date || u.pickup_date) ? `  — delivered ${fmt(u.delivery_date)}, picked up ${fmt(u.pickup_date)}` : ""}
                </Text>
              ))}
            </View>
          )}
          <View style={s.footer} fixed>
            <Text>{N(data.festival.name)} / Soborg Loading</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  );
}

export default function FestivalSoborgLoadingExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<SoborgLoadingManifest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getSoborgLoadingManifest(slug).then((d) => { if (alive) { setData(d); setLoading(false); } });
    return () => { alive = false; };
  }, [slug]);

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!data) return <div className="p-6">Festival not found.</div>;

  const doc = <SoborgLoadingDoc data={data} />;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between p-3 border-b bg-card">
        <Link to={`/festivals/${slug}/soborg-loading`} className="text-sm text-muted-foreground hover:underline">
          ← Back to manifest
        </Link>
        <PDFDownloadLink document={doc} fileName={`soborg-loading-${slug}.pdf`}>
          {({ loading: dl }) => (
            <Button size="sm" disabled={dl}>
              <Download className="h-4 w-4" /> {dl ? "Preparing…" : "Download PDF"}
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1">
        <PDFViewer width="100%" height="100%" style={{ border: 0 }}>{doc}</PDFViewer>
      </div>
    </div>
  );
}
