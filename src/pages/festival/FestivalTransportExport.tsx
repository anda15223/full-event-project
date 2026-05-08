import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFViewer, PDFDownloadLink, Font,
} from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

// Register a Unicode-capable font so arrows (→ ↔), en/em dashes (– —),
// and middle dots (·) render correctly. Built-in Helvetica only covers
// WinAnsi and renders these as garbage glyphs.
Font.register({
  family: "NotoSans",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSans/NotoSans-Bold.ttf",
      fontWeight: 700,
    },
  ],
});
// Disable hyphenation (default breaks at hyphens, undesired in this report)
Font.registerHyphenationCallback((word) => [word]);

type Festival = { id: string; slug: string; name: string; start_date: string; end_date: string };
type SeasonRental = { id: string; reservation_number: string | null; season_label: string | null };
type Vehicle = {
  id: string; festival_id: string; vehicle_type: string; capacity: number | null;
  status: string | null; season_rental_id: string | null; notes: string | null;
  season_rental?: SeasonRental | null;
};
type Leg = {
  id: string; transport_id: string; leg_label: string; leg_phase: string;
  leg_date: string; leg_start_time: string | null; origin: string | null;
  destination: string | null; effective_capacity: number | null;
  cargo_description: string | null; notes: string | null; status: string;
};
type Assignment = {
  id: string; leg_id: string; staff_id: string | null; role: string;
  seat_position: string | null; pickup_point: string | null; notes: string | null;
};
type Staff = { id: string; name: string | null; role: string };

const PHASE_LABEL: Record<string, string> = {
  setup_outbound: "Setup outbound",
  crew_outbound: "Crew outbound",
  festival_shuttle: "Festival shuttle",
  tour_city_move: "Tour city move",
  pre_build: "Pre-build",
  return_home: "Return home",
  support: "Support",
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function fmtDateLong(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ---------------- PDF styles ----------------
const styles = StyleSheet.create({
  page: { padding: 42, fontSize: 9, fontFamily: "NotoSans", color: "#000" },
  h1: { fontSize: 18, fontFamily: "NotoSans", fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 12, fontFamily: "NotoSans", fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#444", marginBottom: 14 },
  statRow: { flexDirection: "row", gap: 10, marginVertical: 12 },
  statTile: { flex: 1, borderWidth: 1, borderColor: "#000", padding: 8 },
  statValue: { fontSize: 16, fontFamily: "NotoSans", fontWeight: 700 },
  statLabel: { fontSize: 7, textTransform: "uppercase", color: "#444", marginTop: 2 },
  phaseGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  phaseTile: { width: "48.5%", borderWidth: 1, borderColor: "#000", padding: 6 },
  phaseLabel: { fontSize: 7, textTransform: "uppercase", color: "#444" },
  vehicleBlock: { borderWidth: 1, borderColor: "#000", marginBottom: 10 },
  vehicleHeader: { padding: 6, borderBottomWidth: 1, borderBottomColor: "#000", flexDirection: "row", justifyContent: "space-between" },
  vehicleTitle: { fontSize: 11, fontFamily: "NotoSans", fontWeight: 700 },
  vehicleMeta: { fontSize: 8, color: "#333", marginTop: 2 },
  table: { width: "100%" },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#000", backgroundColor: "#eee" },
  th: { padding: 4, fontSize: 7, fontFamily: "NotoSans", fontWeight: 700, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#999" },
  td: { padding: 4, fontSize: 8 },
  cDate: { width: "12%" },
  cPhase: { width: "13%" },
  cLabel: { width: "16%" },
  cRoute: { width: "20%" },
  cDriver: { width: "17%" },
  cPax: { width: "22%" },
  driverLine: { fontFamily: "NotoSans", fontWeight: 700 },
  tbdLine: { fontFamily: "NotoSans", fontWeight: 700 },
  paxItem: { fontSize: 7, color: "#222" },
  cancelled: { color: "#777" },
  footer: {
    position: "absolute", bottom: 18, left: 42, right: 42,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 7, color: "#555", borderTopWidth: 0.5, borderTopColor: "#999", paddingTop: 4,
  },
});

// ---------------- PDF Document ----------------
function TransportPdf({
  festival, vehicles, legs, assignments, staff,
}: {
  festival: Festival; vehicles: Vehicle[]; legs: Leg[];
  assignments: Assignment[]; staff: Staff[];
}) {
  const staffById = Object.fromEntries(staff.map((s) => [s.id, s]));
  const totalSeats = vehicles.reduce((a, v) => a + (v.capacity ?? 0), 0);
  const totalAssignments = assignments.filter((a) => a.staff_id).length;
  const generated = new Date().toLocaleString("en-GB", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  });

  // Phase summary
  const phaseMap = new Map<string, Leg[]>();
  legs.forEach((l) => {
    const k = `${l.leg_phase}|${l.leg_date}`;
    if (!phaseMap.has(k)) phaseMap.set(k, []);
    phaseMap.get(k)!.push(l);
  });
  const phaseSummary = Array.from(phaseMap.entries())
    .map(([k, gLegs]) => {
      const [phase, date] = k.split("|");
      const seats = gLegs.reduce((a, l) => a + (l.effective_capacity ?? 0), 0);
      const legAss = assignments.filter((a) => gLegs.some((l) => l.id === a.leg_id));
      const assigned = legAss.filter((a) => a.staff_id).length;
      const tbd = gLegs.filter((l) => {
        const d = legAss.find((a) => a.leg_id === l.id && a.role === "driver");
        return !d || !d.staff_id;
      }).length;
      return { phase, date, count: gLegs.length, seats, assigned, tbd };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const Footer = () => (
    <View style={styles.footer} fixed>
      <Text>{festival.name}</Text>
      <Text>Generated {generated}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );

  return (
    <Document title={`${festival.name} — Transport Plan`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>{festival.name} — Transport Plan</Text>
        <Text style={styles.subtitle}>
          {fmtDateLong(festival.start_date)} – {fmtDateLong(festival.end_date)}
          {"  ·  "}Generated {generated}
        </Text>

        <View style={styles.statRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{vehicles.length}</Text>
            <Text style={styles.statLabel}>Vehicles</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{totalSeats}</Text>
            <Text style={styles.statLabel}>Total seats</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{legs.length}</Text>
            <Text style={styles.statLabel}>Legs</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{totalAssignments}</Text>
            <Text style={styles.statLabel}>Assignments</Text>
          </View>
        </View>

        <Text style={styles.h2}>Phase summary</Text>
        <View style={styles.phaseGrid}>
          {phaseSummary.map((p, i) => (
            <View key={i} style={styles.phaseTile}>
              <Text style={styles.phaseLabel}>{PHASE_LABEL[p.phase] ?? p.phase}</Text>
              <Text style={{ fontSize: 9, fontFamily: "NotoSans", fontWeight: 700 }}>{fmtDate(p.date)}</Text>
              <Text style={{ fontSize: 8, marginTop: 2 }}>
                {p.count} {p.count === 1 ? "vehicle" : "vehicles"} · {p.seats} seats · {p.assigned} assigned
              </Text>
              {p.tbd > 0 && (
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 2 }}>
                  {p.tbd} driver{p.tbd === 1 ? "" : "s"} TBD
                </Text>
              )}
            </View>
          ))}
        </View>

        <Footer />
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.h2}>Vehicles &amp; legs</Text>
        {vehicles.map((v) => {
          const vLegs = legs.filter((l) => l.transport_id === v.id);
          const cancelled = v.status === "cancelled";
          return (
            <View key={v.id} style={styles.vehicleBlock} wrap={false}>
              <View style={styles.vehicleHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.vehicleTitle, cancelled && styles.cancelled]}>
                    {v.vehicle_type}
                    {cancelled ? "  (CANCELLED)" : ""}
                  </Text>
                  <Text style={styles.vehicleMeta}>
                    {(v.capacity ?? "?")} seats · Status: {v.status ?? "planned"}
                    {v.season_rental?.reservation_number
                      ? `  ·  Res ${v.season_rental.reservation_number}`
                      : ""}
                  </Text>
                  {v.notes ? <Text style={styles.vehicleMeta}>{v.notes}</Text> : null}
                </View>
              </View>

              {vLegs.length === 0 ? (
                <Text style={{ padding: 6, fontSize: 8, color: "#666" }}>No legs scheduled.</Text>
              ) : (
                <View style={styles.table}>
                  <View style={styles.thead}>
                    <Text style={[styles.th, styles.cDate]}>Date</Text>
                    <Text style={[styles.th, styles.cPhase]}>Phase</Text>
                    <Text style={[styles.th, styles.cLabel]}>Label</Text>
                    <Text style={[styles.th, styles.cRoute]}>From → To</Text>
                    <Text style={[styles.th, styles.cDriver]}>Driver</Text>
                    <Text style={[styles.th, styles.cPax]}>Passengers</Text>
                  </View>
                  {vLegs.map((leg) => {
                    const legAss = assignments.filter((a) => a.leg_id === leg.id);
                    const driverA = legAss.find((a) => a.role === "driver");
                    const driverName = driverA?.staff_id ? staffById[driverA.staff_id]?.name : null;
                    const pax = legAss.filter((a) => a.role !== "driver" && a.staff_id);
                    const cap = leg.effective_capacity ?? 0;
                    return (
                      <View key={leg.id} style={styles.tr} wrap={false}>
                        <Text style={[styles.td, styles.cDate]}>
                          {fmtDate(leg.leg_date)}
                          {leg.leg_start_time ? `\n${leg.leg_start_time.slice(0, 5)}` : ""}
                        </Text>
                        <Text style={[styles.td, styles.cPhase]}>
                          {PHASE_LABEL[leg.leg_phase] ?? leg.leg_phase}
                        </Text>
                        <Text style={[styles.td, styles.cLabel]}>{leg.leg_label}</Text>
                        <Text style={[styles.td, styles.cRoute]}>
                          {(leg.origin ?? "—")} → {(leg.destination ?? "—")}
                        </Text>
                        <View style={[styles.td, styles.cDriver]}>
                          {driverName ? (
                            <Text style={styles.driverLine}>{driverName}</Text>
                          ) : (
                            <Text style={styles.tbdLine}>DRIVER: ______________</Text>
                          )}
                        </View>
                        <View style={[styles.td, styles.cPax]}>
                          <Text>{pax.length} / {cap}</Text>
                          {pax.map((a) => (
                            <Text key={a.id} style={styles.paxItem}>
                              · {a.staff_id ? staffById[a.staff_id]?.name ?? "?" : "?"}
                            </Text>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
        <Footer />
      </Page>
    </Document>
  );
}

// ---------------- Page wrapper ----------------
type Bundle = {
  festival: Festival; vehicles: Vehicle[]; legs: Leg[];
  assignments: Assignment[]; staff: Staff[];
};

export default function FestivalTransportExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: festival, error: fe } = await supabase
          .from("festivals")
          .select("id,slug,name,start_date,end_date")
          .eq("slug", slug).maybeSingle();
        if (fe) throw fe;
        if (!festival) throw new Error("Festival not found");

        const { data: vehicles, error: ve } = await supabase
          .from("festival_transport")
          .select("id,festival_id,vehicle_type,capacity,status,season_rental_id,notes, season_rental:season_rentals(id,reservation_number,season_label)")
          .eq("festival_id", festival.id)
          .order("created_at");
        if (ve) throw ve;

        const vehicleIds = (vehicles ?? []).map((v: any) => v.id);
        const [legsRes, staffRes] = await Promise.all([
          vehicleIds.length
            ? supabase.from("transport_legs").select("*").in("transport_id", vehicleIds).order("leg_date").order("leg_start_time")
            : Promise.resolve({ data: [], error: null }),
          supabase.from("festival_staff").select("id,name,role").eq("festival_id", festival.id).order("name"),
        ]);
        if (legsRes.error) throw legsRes.error;
        if (staffRes.error) throw staffRes.error;

        const legIds = (legsRes.data ?? []).map((l: any) => l.id);
        const assRes = legIds.length
          ? await supabase.from("transport_leg_assignments").select("*").in("leg_id", legIds)
          : { data: [], error: null };
        if (assRes.error) throw assRes.error;

        if (!alive) return;
        setData({
          festival: festival as Festival,
          vehicles: (vehicles ?? []) as any,
          legs: (legsRes.data ?? []) as any,
          assignments: (assRes.data ?? []) as any,
          staff: (staffRes.data ?? []) as any,
        });
      } catch (e: any) {
        if (alive) setError(e.message ?? String(e));
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  if (error) {
    return (
      <div className="p-8 text-sm text-destructive">
        Failed to load: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading transport data…
      </div>
    );
  }

  const fileName = `${data.festival.slug}-transport-plan.pdf`;
  const doc = (
    <TransportPdf
      festival={data.festival}
      vehicles={data.vehicles}
      legs={data.legs}
      assignments={data.assignments}
      staff={data.staff}
    />
  );

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-background">
        <Link to={`/festivals/${slug}/transport`} className="text-xs text-muted-foreground hover:underline">
          ← Back to transport
        </Link>
        <div className="text-sm font-medium truncate">
          {data.festival.name} — Transport Plan ({data.vehicles.length} vehicles · {data.legs.length} legs)
        </div>
        <PDFDownloadLink document={doc} fileName={fileName}>
          {({ loading }) => (
            <Button size="sm" disabled={loading}>
              <Download className="h-4 w-4" />
              {loading ? "Preparing…" : "Download PDF"}
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1 bg-muted">
        <PDFViewer width="100%" height="100%" showToolbar style={{ border: 0 }}>
          {doc}
        </PDFViewer>
      </div>
    </div>
  );
}
