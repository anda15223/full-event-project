import { useEffect, useState } from "react";
import "@/lib/pdfFonts";
import { useParams } from "react-router-dom";
import { Document, Page, Text, View, StyleSheet, PDFViewer, Font } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ContractStatus, STATUS_META, formatDKK } from "@/lib/contracts";
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
  page: { padding: 32, fontFamily: "Inter", fontSize: 9, color: "#111" },
  h1: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2, marginBottom: 10 },
  summary: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10, padding: 6, backgroundColor: "#f6f6f6", borderRadius: 3 },
  summaryItem: { width: "33%", padding: 3 },
  conceptCard: { border: "0.5pt solid #ddd", borderRadius: 3, padding: 8, marginBottom: 8 },
  conceptHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  conceptName: { fontSize: 11, fontWeight: 700 },
  badge: { fontSize: 8, padding: "2 6", borderRadius: 8, backgroundColor: "#eee" },
  row: { flexDirection: "row", marginTop: 2 },
  label: { width: 90, color: "#555", fontSize: 8 },
  value: { flex: 1, fontSize: 9 },
  bullets: { marginTop: 3, paddingLeft: 8 },
  obligation: { marginTop: 4, padding: 4, backgroundColor: "#fffbe6", borderRadius: 2, fontSize: 8 },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, fontSize: 7, color: "#888", flexDirection: "row", justifyContent: "space-between" },
});

export default function FestivalContractsExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (!f) { setData({ festival: null }); return; }
      const { data: contracts } = await supabase.from("festival_contracts").select("*").eq("festival_id", f.id).eq("is_active", true);
      const { data: concepts } = await supabase.from("concepts").select("id, name, color_hex");
      setData({ festival: f, contracts: contracts ?? [], concepts: concepts ?? [] });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const cById = new Map(data.concepts.map((c: any) => [c.id, c]));
  const counts: Record<string, number> = {};
  let total = 0;
  data.contracts.forEach((c: any) => {
    counts[c.contract_status] = (counts[c.contract_status] ?? 0) + 1;
    if (c.contract_status !== "cancelled") total += Number(c.contract_value_dkk) || 0;
  });

  return (
    <PDFViewer width="100%" height="100%" style={{ width: "100%", height: "100vh", border: 0 }}>
      <Document>
        <Page size="A4" style={styles.page} wrap>
          <Text style={styles.h1}>Contracts Overview — {data.festival.name}</Text>
          <Text style={styles.meta}>{formatDateRange(data.festival.start_date, data.festival.end_date)}</Text>

          <View style={styles.summary}>
            {(["signed","pending_signature","in_negotiation","not_started","stalled","cancelled"] as ContractStatus[]).map(s => (
              <View key={s} style={styles.summaryItem}>
                <Text style={{ fontSize: 8, color: "#555" }}>{STATUS_META[s].label}</Text>
                <Text style={{ fontSize: 12, fontWeight: 700 }}>{counts[s] ?? 0}</Text>
              </View>
            ))}
            <View style={styles.summaryItem}>
              <Text style={{ fontSize: 8, color: "#555" }}>Total value</Text>
              <Text style={{ fontSize: 12, fontWeight: 700 }}>{formatDKK(total)}</Text>
            </View>
          </View>

          {data.contracts.map((c: any) => {
            const con: any = cById.get(c.concept_id);
            return (
              <View key={c.id} style={styles.conceptCard} wrap={false}>
                <View style={styles.conceptHeader}>
                  <Text style={styles.conceptName}>{con?.name ?? "?"}{c.concept_alias ? ` · ${c.concept_alias}` : ""}</Text>
                  <Text style={styles.badge}>{STATUS_META[c.contract_status as ContractStatus]?.label ?? c.contract_status}</Text>
                </View>
                {c.contract_signed_date && (
                  <View style={styles.row}><Text style={styles.label}>Signed</Text><Text style={styles.value}>{c.contract_signed_date}{c.signing_platform ? ` · ${c.signing_platform}` : ""}{c.contract_signed_by ? ` · by ${c.contract_signed_by}` : ""}</Text></View>
                )}
                <View style={styles.row}><Text style={styles.label}>Stalls</Text><Text style={styles.value}>{c.stall_count ?? 1}</Text></View>
                {c.concept_variation_note && (
                  <View style={styles.row}><Text style={styles.label}>Variation</Text><Text style={[styles.value, { fontStyle: "italic" }]}>{c.concept_variation_note}</Text></View>
                )}
                {c.contract_terms_summary && (
                  <View style={styles.bullets}>
                    {c.contract_terms_summary.split(/\n+/).filter(Boolean).map((l: string, i: number) => (
                      <Text key={i} style={{ fontSize: 8 }}>• {l.replace(/^[-•]\s*/, "")}</Text>
                    ))}
                  </View>
                )}
                {c.key_obligations && (
                  <View style={styles.obligation}><Text>⚠ {c.key_obligations}</Text></View>
                )}
              </View>
            );
          })}

          <View style={styles.footer} fixed>
            <Text>{data.festival.slug}</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      </Document>
    </PDFViewer>
  );
}
