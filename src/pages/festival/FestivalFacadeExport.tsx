import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Document, Page, Text, View, StyleSheet, PDFViewer, Font } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { FACADE_STATUS_META, fmtDate, type FacadeRow } from "@/lib/facade";
import { Loader2 } from "lucide-react";

try {
  Font.register({
    family: "OpenSans",
    fonts: [
      { src: "https://fonts.gstatic.com/s/opensans/v17/mem8YaGs126MiZpBA-UFVZ0e.ttf", fontWeight: 400 },
      { src: "https://fonts.gstatic.com/s/opensans/v17/mem5YaGs126MiZpBA-UN7rgOUuhsKKSTjw.ttf", fontWeight: 700 },
    ],
  });
} catch {}

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "OpenSans", fontSize: 9, color: "#111" },
  h1: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2, marginBottom: 10 },
  summary: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10, padding: 6, backgroundColor: "#f6f6f6", borderRadius: 3 },
  summaryItem: { marginRight: 12, fontSize: 9 },
  card: { border: "0.5pt solid #ddd", borderRadius: 3, padding: 8, marginBottom: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  name: { fontSize: 11, fontWeight: 700 },
  badge: { fontSize: 8, padding: "2 6", borderRadius: 8, backgroundColor: "#eee" },
  row: { flexDirection: "row", marginTop: 2 },
  label: { width: 100, color: "#555", fontSize: 8 },
  value: { flex: 1, fontSize: 9 },
  note: { marginTop: 3, fontSize: 8, color: "#444", fontStyle: "italic" },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, fontSize: 7, color: "#888", flexDirection: "row", justifyContent: "space-between" },
});

export default function FestivalFacadeExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (!f) { setData({ festival: null }); return; }
      const { data: contracts } = await supabase.from("festival_contracts")
        .select("id, concept_alias, concept:concepts!concept_id(name, slug, display_order)")
        .eq("festival_id", f.id).eq("is_active", true);
      const ids = (contracts ?? []).map((c: any) => c.id);
      const { data: facades } = ids.length
        ? await supabase.from("festival_facade").select("*").in("festival_contract_id", ids)
        : { data: [] };
      setData({ festival: f, contracts: contracts ?? [], facades: facades ?? [] });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const fById = new Map<string, FacadeRow>();
  (data.facades as FacadeRow[]).forEach((f) => fById.set(f.festival_contract_id, f));

  const sorted = [...data.contracts].sort((a: any, b: any) => {
    const ao = a.concept?.display_order ?? 999;
    const bo = b.concept?.display_order ?? 999;
    return ao - bo;
  });

  const counts: Record<string, number> = {};
  (data.facades as FacadeRow[]).forEach((f) => { counts[f.design_status] = (counts[f.design_status] ?? 0) + 1; });

  return (
    <PDFViewer style={{ width: "100vw", height: "100vh", border: 0 }}>
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Facade Status — {data.festival.name}</Text>
          <Text style={styles.meta}>{formatDateRange(data.festival.start_date, data.festival.end_date)}</Text>

          <View style={styles.summary}>
            {Object.entries(counts).map(([k, v]) => (
              <Text key={k} style={styles.summaryItem}>{FACADE_STATUS_META[k as keyof typeof FACADE_STATUS_META]?.label ?? k}: {v}</Text>
            ))}
          </View>

          {sorted.map((c: any) => {
            const facade = fById.get(c.id);
            const meta = facade ? FACADE_STATUS_META[facade.design_status] : null;
            return (
              <View key={c.id} style={styles.card} wrap={false}>
                <View style={styles.header}>
                  <Text style={styles.name}>{c.concept?.name ?? "—"}{c.concept_alias ? ` — ${c.concept_alias}` : ""}</Text>
                  {meta && <Text style={styles.badge}>{meta.label}</Text>}
                </View>
                {!facade && <Text style={styles.note}>No facade record.</Text>}
                {facade && (
                  <>
                    <View style={styles.row}><Text style={styles.label}>Material</Text><Text style={styles.value}>{facade.material_type ?? "—"} · {facade.material_supplier ?? "—"}</Text></View>
                    <View style={styles.row}><Text style={styles.label}>Dimensions</Text><Text style={styles.value}>{facade.dimensions_text ?? (facade.dimensions_w_cm && facade.dimensions_h_cm ? `${facade.dimensions_w_cm}×${facade.dimensions_h_cm} cm` : "—")} · {facade.panel_count} panels</Text></View>
                    <View style={styles.row}><Text style={styles.label}>Material deadline</Text><Text style={styles.value}>{fmtDate(facade.material_deadline)}</Text></View>
                    <View style={styles.row}><Text style={styles.label}>Print deadline</Text><Text style={styles.value}>{fmtDate(facade.print_deadline)}</Text></View>
                    <View style={styles.row}><Text style={styles.label}>Approval</Text><Text style={styles.value}>{facade.festival_approval_required ? (facade.festival_approval_received_at ? `Approved ${fmtDate(facade.festival_approval_received_at.slice(0,10))}` : "Required — pending") : "Not required"}</Text></View>
                    {facade.reused_from && <View style={styles.row}><Text style={styles.label}>Reused from</Text><Text style={styles.value}>{facade.reused_from}</Text></View>}
                    {facade.design_concept_note && <Text style={styles.note}>{facade.design_concept_note}</Text>}
                    {facade.notes && <Text style={styles.note}>Note: {facade.notes}</Text>}
                  </>
                )}
              </View>
            );
          })}

          <View style={styles.footer} fixed>
            <Text>Facade — {data.festival.name}</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      </Document>
    </PDFViewer>
  );
}
