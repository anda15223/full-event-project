import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PDFViewer, Text, View } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles as r, fmtFilename } from "@/components/pdf/ReportTemplate";
import { inferPhaseType, PHASE_TYPE_LABEL } from "@/lib/setupStatus";

const sb = supabase as any;

const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";
const fmtTime = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

export default function FestivalSetupExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date, setup_date, breakdown_date").eq("slug", slug).maybeSingle();
      if (!f) return setData({ festival: null });

      const { data: phases } = await sb.from("festival_setup_phases")
        .select("*").eq("festival_id", f.id).order("scheduled_start", { ascending: true, nullsFirst: false });

      setData({ festival: f, phases: phases ?? [] });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const f = data.festival;
  const phases = data.phases as any[];
  const done = phases.filter((p) => p.status === "done").length;
  const planned = phases.length - done;

  const summary = (
    <View>
      <Text style={[r.body, { fontWeight: 700, marginBottom: 4 }]}>Setup summary</Text>
      <Text style={r.small}>
        {phases.length} phases · {done} done · {planned} planned
        {f.setup_date ? ` · setup ${fmtDate(f.setup_date)}` : ""}
        {f.breakdown_date ? ` · breakdown ${fmtDate(f.breakdown_date)}` : ""}
      </Text>
    </View>
  );

  const doc = (
    <ReportTemplate
      festivalName={f.name}
      festivalDates={formatDateRange(f.start_date, f.end_date)}
      reportTitle="Setup"
      reportSubtitle="Chronological setup-through-teardown phases with crew, vehicles, and tasks"
      accentColor="emerald"
      summary={summary}
    >
      {phases.length === 0 && <Text style={r.small}>No phases recorded.</Text>}
      {phases.map((p: any) => {
        const ptype = inferPhaseType(p.work_type, p.title);
        const ptLabel = PHASE_TYPE_LABEL[ptype];
        const tasks: any[] = Array.isArray(p.tasks) ? p.tasks : [];
        const crew: string[] = Array.isArray(p.crew_names) ? p.crew_names : [];
        const vehicles: string[] = Array.isArray(p.vehicle_labels) ? p.vehicle_labels : [];
        return (
          <View key={p.id} style={r.card} wrap={false}>
            <View style={r.cardHeader}>
              <Text style={r.cardTitle}>[ {ptLabel.toUpperCase()} ]  {p.title}</Text>
              <Text style={r.small}>{p.status ?? "planned"}</Text>
            </View>
            <Text style={r.small}>
              {p.scheduled_start ? `${fmtDate(p.scheduled_start)} ${fmtTime(p.scheduled_start)}` : "Unscheduled"}
              {p.location ? ` · ${p.location}` : ""}
            </Text>
            {crew.length > 0 && (
              <View style={r.row}>
                <Text style={r.label}>Crew</Text>
                <Text style={r.value}>{crew.join(", ")}</Text>
              </View>
            )}
            {vehicles.length > 0 && (
              <View style={r.row}>
                <Text style={r.label}>Vehicles</Text>
                <Text style={r.value}>{vehicles.join(", ")}</Text>
              </View>
            )}
            {tasks.length > 0 && (
              <View style={{ marginTop: 4 }}>
                <Text style={r.h3}>Tasks</Text>
                {tasks.map((t: any, i: number) => (
                  <Text key={i} style={r.bullet}>{t.done ? "✓" : "◯"} {t.text ?? t.title ?? String(t)}</Text>
                ))}
              </View>
            )}
            {p.notes && <Text style={[r.small, { marginTop: 4 }]}>{p.notes}</Text>}
          </View>
        );
      })}
    </ReportTemplate>
  );

  return (
    <PDFViewer style={{ width: "100vw", height: "100vh", border: "none" }}>{doc}</PDFViewer>
  );
}

export const setupExportFilename = (slug: string) => fmtFilename(slug, "setup");
