import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Document, Page, Text, View, StyleSheet, PDFViewer } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { computeReadiness, READINESS_META, STATUS_LABEL } from "@/lib/safety";

const sb = supabase as any;

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 12, fontWeight: 700, marginTop: 14, marginBottom: 4, borderBottom: "1pt solid #ccc", paddingBottom: 2 },
  meta: { color: "#666", marginBottom: 12 },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 130, color: "#666" },
  value: { flex: 1 },
  badge: { padding: 4, borderRadius: 3, fontSize: 9, marginBottom: 6, alignSelf: "flex-start" },
  emergency: { border: "1pt solid #d33", padding: 8, marginTop: 6, backgroundColor: "#fef2f2" },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 8, color: "#999", textAlign: "center" },
});

export default function FestivalSafetyExport() {
  const { slug = "" } = useParams();
  const { data } = useQuery({
    queryKey: ["safety-export", slug],
    queryFn: async () => {
      const { data: f } = await supabase.from("festivals").select("*").eq("slug", slug).maybeSingle();
      if (!f) return null;
      const { data: row } = await sb.from("festival_safety").select("*").eq("festival_id", f.id).maybeSingle();
      return { f, row };
    },
  });
  if (!data?.f) return <div className="p-6">Loading…</div>;

  const { f, row } = data;
  const readiness = computeReadiness(row, f.start_date);
  const rmeta = READINESS_META[readiness];

  const sec = (title: string, fields: [string, any][]) => (
    <View>
      <Text style={s.h2}>{title}</Text>
      {fields.map(([l, v]) => (
        <View key={l} style={s.row}><Text style={s.label}>{l}</Text><Text style={s.value}>{v ?? "—"}</Text></View>
      ))}
    </View>
  );

  const cert = (p: string | null | undefined) => p ? "yes" : "no";

  return (
    <PDFViewer style={{ width: "100%", height: "100vh", border: 0 }}>
      <Document>
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>Safety Documentation — {f.name}</Text>
          <Text style={s.meta}>{formatDateRange(f.start_date, f.end_date)}</Text>
          <Text style={[s.badge, { backgroundColor: readiness === "green" ? "#d1fae5" : readiness === "yellow" ? "#fef3c7" : "#fee2e2" }]}>
            Overall: {rmeta.label.toUpperCase()}
          </Text>

          {sec("Gas Safety", [
            ["Required", row?.gas_safety_required ? "yes" : "no"],
            ["Status", STATUS_LABEL[row?.gas_safety_status ?? ""] ?? "—"],
            ["Date", `${row?.gas_safety_date ?? "—"} ${row?.gas_safety_time ?? ""}`],
            ["Inspector", row?.gas_safety_inspector],
            ["Notes", row?.gas_safety_notes],
            ["Certificate on file", cert(row?.gas_safety_certificate_path)],
          ])}

          {sec("Food Authority", [
            ["Lead", row?.food_authority_lead],
            ["Inspection", row?.food_authority_inspection_date],
            ["Status", STATUS_LABEL[row?.food_authority_status ?? ""] ?? "—"],
            ["Notes", row?.food_authority_notes],
            ["Certificate on file", cert(row?.food_authority_certificate_path)],
          ])}

          {sec("Electrical Certification", [
            ["Status", STATUS_LABEL[row?.electrical_certification_status ?? ""] ?? "—"],
            ["Certifier", row?.electrical_certifier],
            ["Date", row?.electrical_certification_date],
            ["Certificate on file", cert(row?.electrical_certification_path)],
          ])}

          {sec("Fire Safety", [
            ["Extinguishers", row?.fire_safety_extinguishers_count],
            ["Last inspection", row?.fire_safety_extinguishers_inspection_date],
            ["Fire blankets", row?.fire_safety_blanket_count],
            ["Evacuation plan", cert(row?.fire_safety_evacuation_plan_path)],
          ])}

          {sec("First Aid", [
            ["Kits", row?.first_aid_kit_count],
            ["Locations", row?.first_aid_kit_locations],
            ["Certified staff", row?.first_aid_certified_staff_count],
            ["Responsible", row?.first_aid_responsible],
          ])}

          {sec("Insurance", [
            ["Provider", row?.insurance_provider],
            ["Policy #", row?.insurance_policy_number],
            ["Coverage", row?.insurance_coverage_summary],
            ["Certificate on file", cert(row?.insurance_certificate_path)],
          ])}

          <View style={s.emergency}>
            <Text style={{ fontWeight: 700, marginBottom: 4 }}>Emergency Contacts</Text>
            <Text>{row?.emergency_contacts_text || "Not yet specified"}</Text>
          </View>

          {sec("Safety Briefing", [
            ["Completed", row?.safety_briefing_completed ? "yes" : "no"],
            ["Date", row?.safety_briefing_date],
            ["Attendees", (row?.safety_briefing_attendees ?? []).join(", ")],
          ])}

          {row?.additional_notes && sec("Additional Notes", [["Notes", row.additional_notes]])}

          <Text style={s.footer} fixed>Generated {new Date().toLocaleDateString("en-GB")} | {f.slug}</Text>
        </Page>
      </Document>
    </PDFViewer>
  );
}
