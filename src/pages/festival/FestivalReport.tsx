import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, FileDown } from "lucide-react";
import { PDFDownloadLink, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import {
  useFestival, useSections, useAllQuestions, useAnswers,
  useConcepts, useStaff, useShifts, useActionItems, useVehicles, useAccommodation
} from "@/hooks/useFestival";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#222" },
  cover: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 12, color: "#555", textAlign: "center" },
  h1: { fontSize: 16, fontWeight: "bold", marginTop: 18, marginBottom: 8, borderBottom: "1pt solid #ccc", paddingBottom: 4 },
  h2: { fontSize: 12, fontWeight: "bold", marginTop: 12, marginBottom: 6 },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #eee", paddingVertical: 3 },
  label: { width: 180, color: "#666" },
  value: { flex: 1 },
  th: { backgroundColor: "#eee", padding: 4, fontWeight: "bold", fontSize: 9 },
  td: { padding: 4, fontSize: 9, borderBottom: "0.5pt solid #eee" },
  small: { fontSize: 9, color: "#666" },
});

function ReportDoc({ data }: { data: any }) {
  const { festival, sections, questions, answers, concepts, staff, shifts, actionItems, vehicles, accom } = data;
  const ans = (key: string) => {
    const q = questions.find((x: any) => x.key === key);
    if (!q) return "—";
    const a = answers.find((x: any) => x.question_id === q.id);
    if (!a) return "—";
    if (Array.isArray(a.value)) return a.value.join(", ");
    return String(a.value);
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.title}>{festival.name}</Text>
          <Text style={styles.subtitle}>{festival.year} · Operations Plan</Text>
          <Text style={[styles.subtitle, { marginTop: 12 }]}>
            {new Date(festival.start_date).toLocaleDateString()} – {new Date(festival.end_date).toLocaleDateString()}
          </Text>
          {festival.location && <Text style={styles.subtitle}>{festival.location}</Text>}
          {festival.organiser_name && (
            <Text style={[styles.small, { marginTop: 24 }]}>
              Organiser: {festival.organiser_name} {festival.organiser_phone || ""}
            </Text>
          )}
        </View>
      </Page>

      {sections.map((sec: any) => {
        const qs = questions.filter((q: any) => q.section_id === sec.id);
        const sectionItems = actionItems.filter((a: any) => a.section_key === sec.key);
        return (
          <Page key={sec.id} size="A4" style={styles.page} wrap>
            <Text style={styles.h1}>{sec.order_index}. {sec.title}</Text>
            {sec.description && <Text style={styles.small}>{sec.description}</Text>}

            {sec.key === "concepts" && (
              <View>
                {concepts.map((c: any) => (
                  <View key={c.id} style={{ marginTop: 8, padding: 6, border: "0.5pt solid #ccc" }}>
                    <Text style={styles.h2}>{c.name} ({c.zone})</Text>
                    <Text style={styles.small}>{c.tent_size}</Text>
                    {c.products_sold && <Text style={[styles.small, { marginTop: 3 }]}>{c.products_sold}</Text>}
                    <Text style={[styles.small, { marginTop: 3 }]}>
                      Hours — Thu {c.sales_hours_thu} · Fri {c.sales_hours_fri} · Sat {c.sales_hours_sat} · Sun {c.sales_hours_sun}
                    </Text>
                    <Text style={styles.small}>
                      Power: {c.power_baseline} · Gas: {c.gas_required ? "Yes" : "No"} · Wristbands: {c.wristband_max}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {sec.key === "staffing" && (
              <View>
                <Text style={styles.h2}>Headcount</Text>
                <Text style={styles.small}>Total {staff.length} · {shifts.length} shifts</Text>
                {concepts.map((c: any) => {
                  const cs = shifts.filter((s: any) => s.concept_id === c.id);
                  return (
                    <View key={c.id} style={{ marginTop: 8 }}>
                      <Text style={styles.h2}>{c.name}</Text>
                      <View style={{ flexDirection: "row" }}>
                        <Text style={[styles.th, { flex: 2 }]}>Day</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Shift</Text>
                        <Text style={[styles.th, { flex: 2 }]}>Time</Text>
                        <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>People</Text>
                      </View>
                      {cs.map((s: any) => (
                        <View key={s.id} style={{ flexDirection: "row" }}>
                          <Text style={[styles.td, { flex: 2 }]}>{new Date(s.day).toLocaleDateString()}</Text>
                          <Text style={[styles.td, { flex: 1 }]}>{s.shift_name}</Text>
                          <Text style={[styles.td, { flex: 2 }]}>{s.start_time}–{s.end_time}</Text>
                          <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{s.people_count}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}

            {sec.key === "transportation" && (
              <View>
                <Text style={styles.h2}>Vehicles</Text>
                {vehicles.map((v: any) => (
                  <Text key={v.id} style={styles.small}>• {v.label} ({v.vehicle_type}) — {v.driver || "no driver"} · {v.status}</Text>
                ))}
                <Text style={[styles.h2, { marginTop: 8 }]}>Accommodation</Text>
                {accom.map((a: any) => (
                  <Text key={a.id} style={styles.small}>• {a.label} · {a.people_count} ppl · {a.room_config} · {a.status}</Text>
                ))}
              </View>
            )}

            {qs.length > 0 && (
              <View style={{ marginTop: 8 }}>
                {qs.map((q: any) => (
                  <View key={q.id} style={styles.row}>
                    <Text style={styles.label}>{q.prompt}</Text>
                    <Text style={styles.value}>{ans(q.key)}</Text>
                  </View>
                ))}
              </View>
            )}

            {sectionItems.length > 0 && (
              <View style={{ marginTop: 12, padding: 6, border: "0.5pt solid #ccc", backgroundColor: "#fafafa" }}>
                <Text style={styles.h2}>Action items — {sec.title}</Text>
                {sectionItems.map((i: any) => (
                  <Text key={i.id} style={styles.small}>
                    [{i.priority}] {i.deadline ? new Date(i.deadline).toLocaleDateString() : "no deadline"} — {i.title} ({i.status})
                  </Text>
                ))}
              </View>
            )}
          </Page>
        );
      })}
    </Document>
  );
}

export default function FestivalReport() {
  const { slug } = useParams<{ slug: string }>();
  const { data: festival } = useFestival(slug);
  const { data: sections = [] } = useSections();
  const { data: questions = [] } = useAllQuestions();
  const { data: answers = [] } = useAnswers(festival?.id);
  const { data: concepts = [] } = useConcepts(festival?.id);
  const { data: staff = [] } = useStaff(festival?.id);
  const { data: shifts = [] } = useShifts(festival?.id);
  const { data: actionItems = [] } = useActionItems(festival?.id);
  const { data: vehicles = [] } = useVehicles(festival?.id);
  const { data: accom = [] } = useAccommodation(festival?.id);

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const ready = sections.length > 0 && questions.length > 0;
  const data = { festival, sections, questions, answers, concepts, staff, shifts, actionItems, vehicles, accom };

  return (
    <div className="space-y-6 max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operations Plan Report</h1>
        <p className="text-sm text-muted-foreground mt-1">Generate a downloadable PDF for {festival.name}</p>
      </div>

      <Card className="p-6 flex items-center justify-between">
        <div>
          <p className="font-medium text-[13px]">PDF Report</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Cover · {sections.length} sections · {actionItems.length} action items · {concepts.length} concepts · {shifts.length} shifts
          </p>
        </div>
        {ready && (
          <PDFDownloadLink
            document={<ReportDoc data={data} />}
            fileName={`${festival.slug}-operations-plan.pdf`}
          >
            {({ loading }) => (
              <Button size="sm" disabled={loading}>
                <FileDown className="h-4 w-4 mr-1.5" />
                {loading ? "Preparing…" : "Download PDF"}
              </Button>
            )}
          </PDFDownloadLink>
        )}
      </Card>
    </div>
  );
}
