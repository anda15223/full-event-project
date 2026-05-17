import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PDFViewer, Text, View, Image } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles as r, fmtFilename } from "@/components/pdf/ReportTemplate";

const sb = supabase as any;
const BUCKET = "festival-setup-docs";

const CONCEPT_ORDER = ["fish", "gyros", "creperie", "chicks"] as const;

const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : "");
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type AttRender = { id: string; file_name: string; concept: string | null; signedUrl: string | null; isImage: boolean };

export default function FestivalSetupExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date")
        .eq("slug", slug).maybeSingle();
      if (!f) return setData({ festival: null });

      const { data: run } = await sb.from("setup_runs")
        .select("*").eq("festival_id", f.id).maybeSingle();
      if (!run) return setData({ festival: f, run: null });

      const { data: phases } = await sb.from("setup_phases")
        .select("*").eq("setup_run_id", run.id).order("sort_order");

      // Build allocation lookup from BOTH staff vehicles and the Transport card
      const allocMap = new Map<string, { vehicle_name: string; driver_name: string | null }>();

      const { data: vehicles } = await sb.from("festival_staff_vehicles")
        .select("id, vehicle_name, driver_staff_id").eq("festival_id", f.id);
      const driverIds = (vehicles ?? []).map((v: any) => v.driver_staff_id).filter(Boolean);
      const { data: staff } = driverIds.length
        ? await sb.from("festival_staff").select("id, name").in("id", driverIds)
        : { data: [] };
      const staffMap = new Map<string, string>();
      (staff ?? []).forEach((s: any) => staffMap.set(s.id, s.name ?? "Unnamed"));
      (vehicles ?? []).forEach((v: any) => allocMap.set(v.id, {
        vehicle_name: v.vehicle_name,
        driver_name: v.driver_staff_id ? (staffMap.get(v.driver_staff_id) ?? null) : null,
      }));

      const { data: transport } = await sb.from("festival_transport")
        .select("id, vehicle_type, license_plate, notes").eq("festival_id", f.id);
      (transport ?? []).forEach((t: any) => {
        const driverMatch = (t.notes ?? "").match(/Driver[^:]*:\s*([^.\n\[]+)/i);
        allocMap.set(t.id, {
          vehicle_name: `${t.vehicle_type ?? "Vehicle"}${t.license_plate ? ` · ${t.license_plate}` : ""}`,
          driver_name: driverMatch ? driverMatch[1].trim() : null,
        });
      });

      const { data: atts } = await sb.from("setup_attachments")
        .select("*").eq("setup_run_id", run.id).order("created_at");
      const attRender: AttRender[] = await Promise.all((atts ?? []).map(async (a: any) => {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(a.file_path, 1800);
        const isImage = (a.mime_type ?? "").startsWith("image/")
          || /\.(png|jpe?g|webp)$/i.test(a.file_name);
        return { id: a.id, file_name: a.file_name, concept: a.concept, signedUrl: signed?.signedUrl ?? null, isImage };
      }));

      setData({ festival: f, run, phases: phases ?? [], allocMap, attachments: attRender });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;
  if (!data.run) return <div className="p-12">No setup run for this festival yet.</div>;

  const f = data.festival;
  const run = data.run;
  const phases: any[] = data.phases;
  const attachments: AttRender[] = data.attachments;
  const allocMap: Map<string, { vehicle_name: string; driver_name: string | null }> = data.allocMap;

  const header = (
    <View>
      <Text style={[r.body, { fontWeight: 700, marginBottom: 4 }]}>Setup run</Text>
      <Text style={r.small}>
        Date: {fmtDate(run.setup_date)} · Søborg meet: {fmtTime(run.soborg_meet_time) || "—"} · Arrival Jelling: {fmtTime(run.arrival_time) || "—"}
      </Text>
      <Text style={r.small}>Destination: {run.destination_address ?? "—"}</Text>
    </View>
  );

  const phasesByConcept = (c: string) => phases.filter((p) => p.concept === c);
  const allTagged = attachments.filter((a) => a.concept === "all");
  const attByConcept = (c: string) => attachments.filter((a) => a.concept === c);

  const renderPhase = (p: any) => {
    const alloc = p.transport_allocation_id ? allocMap.get(p.transport_allocation_id) : null;
    return (
      <View key={p.id} style={r.card} wrap={false}>
        <View style={r.cardHeader}>
          <Text style={r.cardTitle}>{p.phase_name}</Text>
          <Text style={r.small}>{p.planned_time ? fmtTime(p.planned_time) : ""}</Text>
        </View>
        {alloc && (
          <View style={r.row}>
            <Text style={r.label}>Vehicle</Text>
            <Text style={r.value}>
              {alloc.vehicle_name} · Driver: {alloc.driver_name ?? "🔴 UNALLOCATED"}
            </Text>
          </View>
        )}
        {p.notes && <Text style={[r.small, { marginTop: 4 }]}>{p.notes}</Text>}
      </View>
    );
  };

  const renderAttachment = (a: AttRender) => (
    <View key={a.id} style={r.card} wrap={false}>
      <Text style={[r.small, { fontWeight: 700, marginBottom: 4 }]}>
        Layout plan: {a.file_name} ({a.concept ?? "—"})
      </Text>
      {a.isImage && a.signedUrl ? (
        <Image src={a.signedUrl} style={{ width: "100%", maxHeight: 400, objectFit: "contain" }} />
      ) : (
        <Text style={r.small}>{a.signedUrl ?? "(no preview)"}</Text>
      )}
    </View>
  );

  // Allocation summary
  const usedAllocIds = Array.from(new Set(phases.map((p) => p.transport_allocation_id).filter(Boolean))) as string[];

  const doc = (
    <ReportTemplate
      festivalName={f.name}
      festivalDates={formatDateRange(f.start_date, f.end_date)}
      reportTitle="Setup"
      reportSubtitle="Søborg → Jelling sequence with vehicle allocations and layout plans"
      accentColor="emerald"
      summary={header}
    >
      {/* Site overview (all-tagged) */}
      {allTagged.length > 0 && (
        <View>
          <Text style={r.h2}>Site overview</Text>
          {allTagged.map(renderAttachment)}
        </View>
      )}

      {/* Concept-grouped phases + layout */}
      {CONCEPT_ORDER.map((c) => {
        const ps = phasesByConcept(c);
        const atts = attByConcept(c);
        if (ps.length === 0 && atts.length === 0) return null;
        return (
          <View key={c}>
            <Text style={[r.h2, { textTransform: "capitalize" }]}>{c}</Text>
            {ps.map(renderPhase)}
            {atts.map(renderAttachment)}
          </View>
        );
      })}

      {/* Unconcept'd / null phases */}
      {phases.filter((p) => !p.concept).length > 0 && (
        <View>
          <Text style={r.h2}>Other phases</Text>
          {phases.filter((p) => !p.concept).map(renderPhase)}
        </View>
      )}

      {/* Allocation summary */}
      <View>
        <Text style={r.h2}>Allocation summary</Text>
        {usedAllocIds.length === 0 ? (
          <Text style={r.small}>No vehicles allocated.</Text>
        ) : (
          usedAllocIds.map((id) => {
            const a = allocMap.get(id);
            if (!a) return null;
            const missing = !a.driver_name;
            return (
              <Text key={id} style={[r.small, missing && { color: "#b91c1c", fontWeight: 700 }]}>
                • {a.vehicle_name} — {a.driver_name ?? "UNALLOCATED"}
              </Text>
            );
          })
        )}
      </View>
    </ReportTemplate>
  );

  return <PDFViewer style={{ width: "100vw", height: "100vh", border: "none" }}>{doc}</PDFViewer>;
}

export const setupExportFilename = (slug: string) => fmtFilename(slug, "setup");
