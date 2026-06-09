import { useParams } from "react-router-dom";
import "@/lib/pdfFonts";
import { useQuery } from "@tanstack/react-query";
import { Document, Page, Text, View, StyleSheet, PDFViewer } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import {
  ACC_TYPE_LABEL,
  PAYMENT_LABEL,
  AMENITY_LABEL,
  nightsBetween,
  type AccType,
  type PaymentStatus,
} from "@/lib/accommodation";

const sb = supabase as any;

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", lineHeight: 1.4 },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 12, fontWeight: 700, marginTop: 2, marginBottom: 6 },
  h3: { fontSize: 10, fontWeight: 700, marginTop: 8, marginBottom: 4, color: "#374151" },
  meta: { color: "#666", marginBottom: 12 },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12, padding: 8, backgroundColor: "#f5f5f5", borderRadius: 4 },
  card: { border: "1pt solid #ddd", borderRadius: 4, padding: 10, marginBottom: 10 },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 110, color: "#666" },
  value: { flex: 1 },
  sectionBox: { marginTop: 6, paddingTop: 6, borderTop: "0.5pt solid #e5e7eb" },
  roomRow: { flexDirection: "row", marginBottom: 2, paddingLeft: 8 },
  roomLabel: { width: 90, fontWeight: 700 },
  pill: { fontSize: 9, color: "#374151" },
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
      const { data: rows } = await sb
        .from("festival_accommodation")
        .select("*")
        .eq("festival_id", f.id)
        .eq("is_draft", false)
        .order("check_in_date");
      const ids = (rows ?? []).map((r: any) => r.id);
      let rooms: any[] = [];
      if (ids.length > 0) {
        const { data: rs } = await sb
          .from("festival_accommodation_room")
          .select("*")
          .in("accommodation_id", ids)
          .order("position", { ascending: true });
        rooms = rs ?? [];
      }
      return { f, rows: rows ?? [], rooms };
    },
  });
  if (!data?.f) return <div className="p-6">Loading…</div>;

  const { f, rows, rooms } = data;
  const cost = rows.reduce((acc: number, r: any) => acc + Number(r.cost_dkk ?? 0), 0);
  const unpaid = rows.filter((r: any) => r.payment_status === "not_paid").length;

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
  const fmtDate = (d?: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—";
  const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : null);

  const roomsByBooking = new Map<string, any[]>();
  for (const rm of rooms) {
    const arr = roomsByBooking.get(rm.accommodation_id) ?? [];
    arr.push(rm);
    roomsByBooking.set(rm.accommodation_id, arr);
  }

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
            const bookingRooms = roomsByBooking.get(r.id) ?? [];
            const amenities: string[] = Array.isArray(r.amenities) ? r.amenities : [];
            const hasParking = amenities.includes("parking");
            const hasBreakfast = amenities.includes("breakfast");
            const checkInLine = r.check_in_date
              ? `${fmtDate(r.check_in_date)}${fmtTime(r.check_in_time) ? " · " + fmtTime(r.check_in_time) : ""}`
              : "TBD";
            const checkOutLine = r.check_out_date
              ? `${fmtDate(r.check_out_date)}${fmtTime(r.check_out_time) ? " · " + fmtTime(r.check_out_time) : ""}`
              : "TBD";
            const currency = r.currency || "DKK";

            return (
              <View key={r.id} style={s.card} wrap={false}>
                <Text style={s.h2}>
                  {r.provider_name || "—"} ({ACC_TYPE_LABEL[r.accommodation_type as AccType]})
                </Text>

                {r.address && (
                  <View style={s.row}><Text style={s.label}>Address</Text><Text style={s.value}>{r.address}</Text></View>
                )}
                <View style={s.row}><Text style={s.label}>Check-in</Text><Text style={s.value}>{checkInLine}</Text></View>
                <View style={s.row}><Text style={s.label}>Check-out</Text><Text style={s.value}>{checkOutLine}</Text></View>
                <View style={s.row}><Text style={s.label}>Nights</Text><Text style={s.value}>{nights}</Text></View>

                <View style={s.row}>
                  <Text style={s.label}>Rooms</Text>
                  <Text style={s.value}>
                    {(r.room_count ?? 0)} room{(r.room_count ?? 0) === 1 ? "" : "s"} · {r.beds_per_room ?? 2} bed
                    {(r.beds_per_room ?? 2) === 1 ? "" : "s"}/room · capacity {r.capacity ?? "—"} · assigned{" "}
                    {r.assigned_staff_count ?? r.assigned_staff?.length ?? 0}
                  </Text>
                </View>

                <View style={s.row}>
                  <Text style={s.label}>Cost</Text>
                  <Text style={s.value}>
                    {r.cost_dkk ? `${Number(r.cost_dkk).toLocaleString("da-DK")} ${currency}` : "—"} ·{" "}
                    {PAYMENT_LABEL[r.payment_status as PaymentStatus]}
                  </Text>
                </View>

                <View style={s.row}>
                  <Text style={s.label}>Parking</Text>
                  <Text style={s.value}>{hasParking ? "✓ Included" : "—"}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Breakfast</Text>
                  <Text style={s.value}>{hasBreakfast ? "✓ Included" : "—"}</Text>
                </View>

                {amenities.length > 0 && (
                  <View style={s.row}>
                    <Text style={s.label}>Amenities</Text>
                    <Text style={s.value}>
                      {amenities.map((a) => AMENITY_LABEL[a] ?? a).join(" · ")}
                    </Text>
                  </View>
                )}

                {r.confirmation_number && (
                  <View style={s.row}><Text style={s.label}>Confirmation</Text><Text style={s.value}>{r.confirmation_number}</Text></View>
                )}
                {(r.contact_name || r.contact_phone || r.contact_email) && (
                  <View style={s.row}>
                    <Text style={s.label}>Contact</Text>
                    <Text style={s.value}>
                      {[r.contact_name, r.contact_phone, r.contact_email].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                )}
                {r.booking_made_by && (
                  <View style={s.row}><Text style={s.label}>Booked by</Text><Text style={s.value}>{r.booking_made_by}</Text></View>
                )}
                {r.notes && (
                  <View style={s.row}><Text style={s.label}>Notes</Text><Text style={s.value}>{r.notes}</Text></View>
                )}

                {bookingRooms.length > 0 && (
                  <View style={s.sectionBox}>
                    <Text style={s.h3}>Room allocation</Text>
                    {bookingRooms.map((rm) => {
                      const beds = [rm.bed_1_assignee, rm.bed_2_assignee, rm.bed_3_assignee, rm.bed_4_assignee]
                        .slice(0, rm.bed_count ?? 2)
                        .map((b, i) => `Bed ${i + 1}: ${b || "—"}`)
                        .join(" · ");
                      return (
                        <View key={rm.id} style={s.roomRow}>
                          <Text style={s.roomLabel}>{rm.room_label}</Text>
                          <Text style={[s.value, s.pill]}>
                            {beds}
                            {rm.notes ? ` — ${rm.notes}` : ""}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {r.assigned_staff?.length > 0 && bookingRooms.length === 0 && (
                  <View style={s.row}>
                    <Text style={s.label}>Staff</Text>
                    <Text style={s.value}>{r.assigned_staff.join(", ")}</Text>
                  </View>
                )}
              </View>
            );
          })}

          <Text style={s.footer} fixed>
            Generated {new Date().toLocaleDateString("en-GB")} | {f.slug}
          </Text>
          <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
        </Page>
      </Document>
    </PDFViewer>
  );
}
