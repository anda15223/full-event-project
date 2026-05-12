import { useParams } from "react-router-dom";
import "@/lib/pdfFonts";
import { useQuery } from "@tanstack/react-query";
import { Document, Page, Text, View, StyleSheet, PDFViewer } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ACC_TYPE_LABEL, PAYMENT_LABEL, nightsBetween, type AccType, type PaymentStatus } from "@/lib/accommodation";

const sb = supabase as any;

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 11, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  meta: { color: "#666", marginBottom: 12 },
  summary: { flexDirection: "row", gap: 12, marginBottom: 12, padding: 8, backgroundColor: "#f5f5f5", borderRadius: 4 },
  card: { border: "1pt solid #ddd", borderRadius: 4, padding: 10, marginBottom: 8 },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 110, color: "#666" },
  value: { flex: 1 },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 8, color: "#999", textAlign: "center" },
  pageNum: { position: "absolute", bottom: 20, right: 32, fontSize: 8, color: "#999" },
});

export default function FestivalAccommodationExport() {
  const { slug = "" } = useParams();
  const { data } = useQuery({
    queryKey: ["acc-export", slug],
    queryFn: async () => {
      const { data: f } = await supabase.from("festivals").select("*").eq("slug", slug).maybeSingle();
      if (!f) return null;
      const { data: rows } = await sb.from("festival_accommodation").select("*").eq("festival_id", f.id).order("check_in_date");
      return { f, rows: rows ?? [] };
    },
  });
  if (!data?.f) return <div className="p-6">Loading…</div>;

  const { f, rows } = data;
  const cost = rows.reduce((acc: number, r: any) => acc + Number(r.cost_dkk ?? 0), 0);
  const unpaid = rows.filter((r: any) => r.payment_status === "not_paid").length;

  // Per-period bed breakdown (sweep-line over distinct date breakpoints)
  const dated = rows.filter((r: any) => r.check_in_date && r.check_out_date);
  const breakpoints = Array.from(
    new Set(dated.flatMap((r: any) => [r.check_in_date, r.check_out_date]))
  ).sort() as string[];
  const segments: { start: string; end: string; beds: number }[] = [];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const start = breakpoints[i];
    const end = breakpoints[i + 1];
    const beds = dated.reduce((acc: number, r: any) => {
      const overlaps = r.check_in_date <= start && r.check_out_date >= end;
      if (!overlaps) return acc;
      const rc = Math.max(1, Number(r.room_count ?? 1));
      const bpr = Math.max(1, Number(r.beds_per_room ?? 2));
      return acc + rc * bpr;
    }, 0);
    if (beds > 0) segments.push({ start, end, beds });
  }
  const peakBeds = segments.reduce((m, sg) => Math.max(m, sg.beds), 0);
  const fmtSeg = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <PDFViewer style={{ width: "100%", height: "100vh", border: 0 }}>
      <Document>
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>Accommodation — {f.name}</Text>
          <Text style={s.meta}>{formatDateRange(f.start_date, f.end_date)}</Text>

          <View style={s.summary}>
            <Text>Bookings: {rows.length}</Text>
            <Text>Peak beds: {peakBeds}</Text>
            <Text>Total cost: {cost.toLocaleString("da-DK")} DKK</Text>
            <Text>Unpaid: {unpaid}</Text>
          </View>

          {segments.length > 1 && (
            <View style={{ marginBottom: 12, padding: 8, border: "1pt solid #ddd", borderRadius: 4 }}>
              <Text style={{ fontSize: 9, color: "#666", marginBottom: 4 }}>
                Beds per period (concurrent occupancy — sequential periods are not added together)
              </Text>
              {segments.map((sg) => (
                <View key={sg.start + sg.end} style={s.row}>
                  <Text style={s.label}>{fmtSeg(sg.start)}–{fmtSeg(sg.end)}</Text>
                  <Text style={s.value}>
                    {sg.beds} bed{sg.beds === 1 ? "" : "s"}{sg.beds === peakBeds ? "  (peak)" : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {rows.map((r: any) => {
            const nights = nightsBetween(r.check_in_date, r.check_out_date);
            return (
              <View key={r.id} style={s.card} wrap={false}>
                <Text style={s.h2}>{r.provider_name || "—"} ({ACC_TYPE_LABEL[r.accommodation_type as AccType]})</Text>
                {r.address && <View style={s.row}><Text style={s.label}>Address</Text><Text style={s.value}>{r.address}</Text></View>}
                <View style={s.row}><Text style={s.label}>Dates</Text><Text style={s.value}>
                  {r.check_in_date && r.check_out_date ? `${formatDateRange(r.check_in_date, r.check_out_date)} · ${nights} nights` : "TBD"}
                </Text></View>
                <View style={s.row}><Text style={s.label}>Capacity</Text><Text style={s.value}>{r.capacity ?? "—"} (assigned {r.assigned_staff_count ?? r.assigned_staff?.length ?? 0})</Text></View>
                {r.assigned_staff?.length > 0 && <View style={s.row}><Text style={s.label}>Staff</Text><Text style={s.value}>{r.assigned_staff.join(", ")}</Text></View>}
                <View style={s.row}><Text style={s.label}>Cost</Text><Text style={s.value}>
                  {r.cost_dkk ? `${Number(r.cost_dkk).toLocaleString("da-DK")} DKK` : "—"} · {PAYMENT_LABEL[r.payment_status as PaymentStatus]}
                </Text></View>
                {r.confirmation_number && <View style={s.row}><Text style={s.label}>Confirmation</Text><Text style={s.value}>{r.confirmation_number}</Text></View>}
                {(r.contact_name || r.contact_phone || r.contact_email) && (
                  <View style={s.row}><Text style={s.label}>Contact</Text><Text style={s.value}>
                    {[r.contact_name, r.contact_phone, r.contact_email].filter(Boolean).join(" · ")}
                  </Text></View>
                )}
                {r.notes && <View style={s.row}><Text style={s.label}>Notes</Text><Text style={s.value}>{r.notes}</Text></View>}
              </View>
            );
          })}

          <Text style={s.footer} fixed>Generated {new Date().toLocaleDateString("en-GB")} | {f.slug}</Text>
          <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
        </Page>
      </Document>
    </PDFViewer>
  );
}
