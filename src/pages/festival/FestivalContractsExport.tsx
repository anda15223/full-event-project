import { useEffect, useState } from "react";
import "@/lib/pdfFonts";
import { useParams } from "react-router-dom";
import { Document, Page, Text, View, StyleSheet, PDFViewer, Font } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ContractStatus, PaymentStatus, STATUS_META, PAYMENT_META, formatDKK } from "@/lib/contracts";
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
  page: { padding: 32, paddingBottom: 40, fontFamily: "Inter", fontSize: 9, color: "#111", lineHeight: 1.4 },
  h1: { fontSize: 16, fontWeight: 700, lineHeight: 1.3 },
  meta: { fontSize: 9, color: "#555", marginTop: 2, marginBottom: 10, lineHeight: 1.3 },
  summary: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10, padding: 6, backgroundColor: "#f6f6f6", borderRadius: 3 },
  summaryItem: { width: "33%", padding: 3 },
  conceptCard: { border: "0.5pt solid #ddd", borderRadius: 3, padding: 8, marginBottom: 8 },
  conceptHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  conceptName: { fontSize: 11, fontWeight: 700, lineHeight: 1.3 },
  badge: { fontSize: 8, padding: "2 6", borderRadius: 8, backgroundColor: "#eee", lineHeight: 1.2 },
  badgePay: { fontSize: 8, padding: "2 6", borderRadius: 8, backgroundColor: "#eef6ff", marginLeft: 4, lineHeight: 1.2 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  metaCell: { width: "50%", paddingVertical: 3, paddingRight: 6 },
  metaLabel: { fontSize: 7, color: "#666", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 1, lineHeight: 1.2 },
  metaValue: { fontSize: 9, lineHeight: 1.3 },
  bullets: { marginTop: 4, paddingLeft: 8 },
  bulletLine: { fontSize: 8, lineHeight: 1.4, marginBottom: 1 },
  obligation: { marginTop: 4, padding: 4, backgroundColor: "#fffbe6", borderRadius: 2, fontSize: 8, lineHeight: 1.4 },
  section: { marginTop: 6, paddingTop: 4, borderTop: "0.5pt solid #eee" },
  sectionTitle: { fontSize: 9, fontWeight: 700, marginBottom: 3, color: "#333", lineHeight: 1.3 },
  tableHeader: { flexDirection: "row", borderBottom: "0.5pt solid #999", paddingBottom: 3, marginTop: 2 },
  tableRow: { flexDirection: "row", borderBottom: "0.25pt solid #eee", paddingVertical: 2.5 },
  th: { fontSize: 7, fontWeight: 700, color: "#555", lineHeight: 1.3 },
  td: { fontSize: 8, lineHeight: 1.4 },
  italic: { color: "#555", fontSize: 8, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, fontSize: 7, color: "#888", flexDirection: "row", justifyContent: "space-between" },
});

const N = (v: any) => (v == null || v === "" ? "—" : String(v));

function Bullets({ text }: { text: string | null }) {
  if (!text) return null;
  const lines = text.split(/\n+/).map(l => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
  if (!lines.length) return null;
  return (
    <View style={styles.bullets}>
      {lines.map((l, i) => <Text key={i} style={styles.bulletLine}>• {l}</Text>)}
    </View>
  );
}

export default function FestivalContractsExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (!f) { setData({ festival: null }); return; }
      const [{ data: contracts }, { data: concepts }] = await Promise.all([
        supabase.from("festival_contracts").select("*").eq("festival_id", f.id).eq("is_active", true),
        supabase.from("concepts").select("id, name, color_hex"),
      ]);
      const ids = (contracts ?? []).map((c: any) => c.id);
      let finByContract = new Map<string, any>();
      if (ids.length) {
        const { data: fin } = await (supabase as any).from("festival_contracts_finance")
          .select("*").in("contract_id", ids);
        finByContract = new Map((fin ?? []).map((r: any) => [r.contract_id, r]));
      }
      setData({ festival: f, contracts: contracts ?? [], concepts: concepts ?? [], finance: finByContract });
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
            const fin = data.finance.get(c.id) ?? {};
            const summary = c.summary as any;
            return (
              <View key={c.id} style={styles.conceptCard} wrap>
                <View style={styles.conceptHeader}>
                  <Text style={styles.conceptName}>
                    {con?.name ?? "?"}{c.concept_alias ? ` · ${c.concept_alias}` : ""}
                  </Text>
                  <View style={{ flexDirection: "row" }}>
                    <Text style={styles.badge}>{STATUS_META[c.contract_status as ContractStatus]?.label ?? c.contract_status}</Text>
                    {fin.payment_status && (
                      <Text style={styles.badgePay}>{PAYMENT_META[fin.payment_status as PaymentStatus]?.label ?? fin.payment_status}</Text>
                    )}
                  </View>
                </View>

                {/* Top-level fields shown on the card */}
                <View style={styles.metaGrid}>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Operating entity</Text>
                    <Text style={styles.metaValue}>
                      {N(fin.operating_entity)}{c.operating_entity_cvr ? ` · CVR ${c.operating_entity_cvr}` : ""}
                    </Text>
                  </View>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Counterparty</Text>
                    <Text style={styles.metaValue}>
                      {N(c.counterparty_name ?? fin.counterparty)}
                      {(c.counterparty_cvr || fin.cvr) ? ` · CVR ${c.counterparty_cvr ?? fin.cvr}` : ""}
                    </Text>
                  </View>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Signed</Text>
                    <Text style={styles.metaValue}>
                      {N(c.contract_signed_date)}
                      {c.signing_platform ? ` · ${c.signing_platform}` : ""}
                      {c.contract_signed_by ? ` · by ${c.contract_signed_by}` : ""}
                    </Text>
                  </View>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Expires</Text>
                    <Text style={styles.metaValue}>{N(c.contract_expires_at)}</Text>
                  </View>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Stalls</Text>
                    <Text style={styles.metaValue}>{c.stall_count ?? 1}</Text>
                  </View>
                  {c.bracelet_count != null && (
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Bracelets</Text>
                      <Text style={styles.metaValue}>{c.bracelet_count}</Text>
                    </View>
                  )}
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Value</Text>
                    <Text style={styles.metaValue}>{formatDKK(c.contract_value_dkk)}</Text>
                  </View>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Payment terms</Text>
                    <Text style={styles.metaValue}>{N(fin.payment_terms)}</Text>
                  </View>
                  {c.sent_to_counterparty_at && (
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Sent</Text>
                      <Text style={styles.metaValue}>{c.sent_to_counterparty_at}</Text>
                    </View>
                  )}
                  {c.expected_signing_by && (
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Expected signing</Text>
                      <Text style={styles.metaValue}>{c.expected_signing_by}</Text>
                    </View>
                  )}
                  {c.stalled_since && (
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Stalled since</Text>
                      <Text style={styles.metaValue}>{c.stalled_since}</Text>
                    </View>
                  )}
                  {c.contract_file_path && (
                    <View style={[styles.metaCell, { width: "100%" }]}>
                      <Text style={styles.metaLabel}>Contract file</Text>
                      <Text style={styles.metaValue}>{c.contract_file_path.split("/").pop()}</Text>
                    </View>
                  )}
                </View>

                {c.concept_variation_note && (
                  <Text style={[styles.italic, { marginTop: 4 }]}>{c.concept_variation_note}</Text>
                )}
                {c.stalled_reason && (
                  <Text style={[styles.italic, { marginTop: 4, color: "#c33" }]}>Stalled: {c.stalled_reason}</Text>
                )}
                {c.cancelled_reason && (
                  <Text style={[styles.italic, { marginTop: 4, color: "#c33" }]}>Cancelled: {c.cancelled_reason}</Text>
                )}

                {c.contract_terms_summary && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Terms summary</Text>
                    <Bullets text={c.contract_terms_summary} />
                  </View>
                )}

                {c.key_obligations && (
                  <View style={styles.obligation}><Text>⚠ {c.key_obligations}</Text></View>
                )}

                {c.parse_summary && (
                  <Text style={[styles.italic, { marginTop: 4 }]}>AI: {c.parse_summary}</Text>
                )}

                {/* Rich parsed summary */}
                {summary && (
                  <>
                    {summary.festival && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Festival & Parties</Text>
                        <Text style={styles.td}>• Festival: {N(summary.festival.name)}</Text>
                        <Text style={styles.td}>• Festival entity: {N(summary.festival.festival_entity)}</Text>
                        <Text style={styles.td}>• Stadeholder: {N(summary.festival.stadeholder_entity)}</Text>
                      </View>
                    )}
                    {summary.dates && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Dates</Text>
                        <Text style={styles.td}>• Festival days: {(summary.dates.festival_days ?? []).join(", ") || "TBD"}</Text>
                        <Text style={styles.td}>• Opening hours: {(summary.dates.opening_hours ?? []).join(", ") || "TBD"}</Text>
                        <Text style={styles.td}>• Setup access: {N(summary.dates.setup_access)}</Text>
                        <Text style={styles.td}>• Camping: {N(summary.dates.camping)}</Text>
                      </View>
                    )}
                    {summary.location && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Location</Text>
                        <Text style={styles.td}>• Venue: {N(summary.location.venue)}</Text>
                        <Text style={styles.td}>• Kommune: {N(summary.location.kommune)}</Text>
                        <Text style={styles.td}>• Stand placement: {N(summary.location.stand_placement_status)}</Text>
                      </View>
                    )}
                    {summary.contacts?.length > 0 && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Contacts</Text>
                        {summary.contacts.map((ct: any, i: number) => (
                          <Text key={i} style={styles.td}>• {ct.role}: {ct.name}{ct.email ? ` · ${ct.email}` : ""}{ct.phone ? ` · ${ct.phone}` : ""}</Text>
                        ))}
                      </View>
                    )}
                    {summary.cost && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Cost</Text>
                        <Text style={styles.td}>• Commission: {N(summary.cost.commission_pct)}</Text>
                        <Text style={styles.td}>• Deposit: {N(summary.cost.deposit)}</Text>
                        <Text style={styles.td}>• Penalty per breach: {N(summary.cost.penalty_per_breach)}</Text>
                        <Text style={styles.td}>• IP / breach penalty: {N(summary.cost.ip_breach_penalty)}</Text>
                        <Text style={styles.td}>• Late order fee: {N(summary.cost.late_order_fee)}</Text>
                        <Text style={styles.td}>• Meal ticket: {N(summary.cost.meal_ticket_price)}</Text>
                        <Text style={styles.td}>• Settlement: {N(summary.cost.settlement_terms)}</Text>
                      </View>
                    )}
                    {summary.menu?.length > 0 && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Menu</Text>
                        <View style={styles.tableHeader}>
                          <Text style={[styles.th, { flex: 2 }]}>Item</Text>
                          <Text style={[styles.th, { flex: 1.5 }]}>Concept</Text>
                          <Text style={[styles.th, { width: 24 }]}>LF</Text>
                          <Text style={[styles.th, { width: 24 }]}>GF</Text>
                          <Text style={[styles.th, { width: 28 }]}>Veg</Text>
                          <Text style={[styles.th, { width: 34 }]}>Vegan</Text>
                          <Text style={[styles.th, { width: 30 }]}>Local</Text>
                        </View>
                        {summary.menu.map((m: any, i: number) => (
                          <View key={i} style={styles.tableRow}>
                            <Text style={[styles.td, { flex: 2 }]}>{N(m.item)}</Text>
                            <Text style={[styles.td, { flex: 1.5 }]}>{N(m.concept)}</Text>
                            <Text style={[styles.td, { width: 24 }]}>{N(m.lactose_free)}</Text>
                            <Text style={[styles.td, { width: 24 }]}>{N(m.gluten_free)}</Text>
                            <Text style={[styles.td, { width: 28 }]}>{N(m.vegetarian)}</Text>
                            <Text style={[styles.td, { width: 34 }]}>{N(m.vegan)}</Text>
                            <Text style={[styles.td, { width: 30 }]}>{N(m.local)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {summary.deadlines?.length > 0 && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Deadlines</Text>
                        <View style={styles.tableHeader}>
                          <Text style={[styles.th, { width: 60 }]}>Date</Text>
                          <Text style={[styles.th, { flex: 1 }]}>What</Text>
                          <Text style={[styles.th, { width: 60 }]}>Ref</Text>
                        </View>
                        {summary.deadlines.map((d: any, i: number) => (
                          <View key={i} style={styles.tableRow}>
                            <Text style={[styles.td, { width: 60 }]}>{N(d.date)}</Text>
                            <Text style={[styles.td, { flex: 1 }]}>{N(d.item)}</Text>
                            <Text style={[styles.td, { width: 60, color: "#666" }]}>{N(d.clause_ref)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {summary.obligations?.length > 0 && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Obligations</Text>
                        {summary.obligations.map((o: string, i: number) => (
                          <Text key={i} style={styles.td}>• {o}</Text>
                        ))}
                      </View>
                    )}
                  </>
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
