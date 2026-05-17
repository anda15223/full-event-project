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

const DRIVE_PRESETS = new Set<string>(["Drive to festival", "Driving home"]);
const SEQUENCE_PRESETS = new Set<string>([
  "Drive to festival", "Setup at festival", "Arriving cooling", "Arriving goods",
  "Place goods in freezers", "Wrap up", "Driving home",
]);
const isDrivePhase = (name: string | null) =>
  !name || DRIVE_PRESETS.has(name) || !SEQUENCE_PRESETS.has(name);

const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : "");
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type AttRender = { id: string; file_name: string; concept: string | null; setup_phase_id: string | null; signedUrl: string | null; isImage: boolean; isPdf: boolean; pageImages: string[]; ai_summary: string | null; extracted_text: string | null };

async function renderPdfToImages(url: string): Promise<string[]> {
  try {
    const pdfjs: any = await import("pdfjs-dist");
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.js?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`fetch ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
    const pdf = await loadingTask.promise;
    const out: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.35, 1800 / baseViewport.width, 2200 / baseViewport.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = await new Promise<string>((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) return resolve(canvas.toDataURL("image/jpeg", 0.72));
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.72);
      });
      out.push(dataUrl);
      page.cleanup?.();
    }
    await loadingTask.destroy?.();
    return out;
  } catch (e) {
    console.error("PDF render failed", e);
    return [];
  }
}

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
      const attRender: AttRender[] = [];
      for (const a of atts ?? []) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(a.file_path, 1800);
        const isImage = (a.mime_type ?? "").startsWith("image/")
          || /\.(png|jpe?g|webp)$/i.test(a.file_name);
        const isPdf = (a.mime_type ?? "").includes("pdf") || /\.pdf$/i.test(a.file_name);
        let pageImages: string[] = [];
        if (isPdf && signed?.signedUrl) {
          pageImages = await renderPdfToImages(signed.signedUrl);
        }
        attRender.push({ id: a.id, file_name: a.file_name, concept: a.concept, setup_phase_id: a.setup_phase_id ?? null, signedUrl: signed?.signedUrl ?? null, isImage, isPdf, pageImages, ai_summary: a.ai_summary ?? null, extracted_text: a.extracted_text ?? null });
      }

      // Power summary for setup phases
      const { data: contracts } = await sb.from("festival_contracts")
        .select("id, concept_alias, is_active, concept:concepts!concept_id(name)").eq("festival_id", f.id).eq("is_active", true);
      const cIds = (contracts ?? []).map((c: any) => c.id);
      let powerRows: any[] = [];
      if (cIds.length) {
        const { data: pw } = await sb.from("festival_power")
          .select("festival_contract_id, connections_16a_240v, connections_16a_400v, connections_32a, connections_63a, connections_125a, total_kw_estimate, tableau_required, tableau_count, status")
          .in("festival_contract_id", cIds);
        const byId = new Map((contracts ?? []).map((c: any) => [c.id, c.concept_alias || c.concept?.name]));
        powerRows = (pw ?? []).map((p: any) => ({ ...p, concept_name: byId.get(p.festival_contract_id) ?? "—" }));
      }

      setData({ festival: f, run, phases: phases ?? [], allocMap, attachments: attRender, powerRows });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;
  if (!data.run) return <div className="p-12">No setup run for this festival yet.</div>;

  const f = data.festival;
  const run = data.run;
  const phases: any[] = data.phases;
  const attachments: AttRender[] = data.attachments;
  const runAttachments = attachments.filter((a) => !a.setup_phase_id);
  const phaseAttachments = attachments.filter((a) => a.setup_phase_id);
  const allocMap: Map<string, { vehicle_name: string; driver_name: string | null }> = data.allocMap;
  const powerRows: any[] = data.powerRows ?? [];

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
  const allTagged = runAttachments.filter((a) => a.concept === "all");
  const attByConcept = (c: string) => runAttachments.filter((a) => a.concept === c);

  const renderPhase = (p: any) => {
    const alloc = p.transport_allocation_id ? allocMap.get(p.transport_allocation_id) : null;
    const driverDisplay = p.driver_name || alloc?.driver_name || null;
    const route = [p.from_location, p.to_location].filter(Boolean).join(" → ");
    const isDrive = isDrivePhase(p.phase_name);
    const showPower = p.phase_name === "Setup at festival";
    const myAtts = phaseAttachments.filter((a) => a.setup_phase_id === p.id);
    return (
      <View key={p.id} style={r.card}>
        <View style={r.cardHeader}>
          <Text style={r.cardTitle}>{p.phase_name}</Text>
          <Text style={r.small}>
            {p.planned_date ? fmtDate(p.planned_date) + " " : ""}{p.planned_time ? fmtTime(p.planned_time) : ""}
          </Text>
        </View>
        {isDrive && route && (
          <View style={r.row}>
            <Text style={r.label}>Route</Text>
            <Text style={r.value}>{route}</Text>
          </View>
        )}
        {isDrive && (alloc || driverDisplay) && (
          <View style={r.row}>
            <Text style={r.label}>Vehicle</Text>
            <Text style={r.value}>
              {alloc?.vehicle_name ?? "—"} · Driver: {driverDisplay ?? "🔴 UNALLOCATED"}
            </Text>
          </View>
        )}
        {showPower && powerRows.length > 0 && (
          <View style={{ marginTop: 4 }}>
            <Text style={[r.small, { fontWeight: 700, marginBottom: 2 }]}>⚡ Electricity</Text>
            {powerRows.map((pw: any) => {
              const bits = [
                pw.total_kw_estimate ? `${pw.total_kw_estimate} kW` : null,
                pw.connections_16a_240v ? `16A/240V ×${pw.connections_16a_240v}` : null,
                pw.connections_16a_400v ? `16A/400V ×${pw.connections_16a_400v}` : null,
                pw.connections_32a ? `32A ×${pw.connections_32a}` : null,
                pw.connections_63a ? `63A ×${pw.connections_63a}` : null,
                pw.connections_125a ? `125A ×${pw.connections_125a}` : null,
                pw.tableau_required ? `Tableau ×${pw.tableau_count || 1}` : null,
              ].filter(Boolean).join(" · ");
              return (
                <Text key={pw.festival_contract_id} style={r.small}>
                  • {String(pw.concept_name).toUpperCase()}: {bits || "—"} ({pw.status})
                </Text>
              );
            })}
          </View>
        )}
        {p.notes && <Text style={[r.small, { marginTop: 4 }]}>{p.notes}</Text>}
        {myAtts.length > 0 && (
          <View style={{ marginTop: 6 }}>
            <Text style={[r.small, { fontWeight: 700, marginBottom: 2 }]}>Plan files</Text>
            {myAtts.map((a) => (
              <View key={a.id} style={{ marginBottom: 8 }}>
                <Text style={r.small}>📎 {a.file_name}</Text>
                {a.isImage && a.signedUrl ? (
                  <Image src={a.signedUrl} style={{ width: "100%", maxHeight: 360, objectFit: "contain", marginTop: 2 }} />
                ) : null}
                {a.pageImages.map((src, i) => (
                  <Image key={i} src={src} style={{ width: "100%", maxHeight: 500, objectFit: "contain", marginTop: 4 }} />
                ))}
                {a.ai_summary && (
                  <Text style={[r.small, { marginTop: 3, color: "#444" }]}> 
                    AI summary: {a.ai_summary}
                  </Text>
                )}
                {a.extracted_text && (
                  <Text style={[r.small, { marginTop: 3, color: "#222" }]}>
                    {a.extracted_text}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderAttachment = (a: AttRender) => (
    <View key={a.id} style={r.card}>
      <Text style={[r.small, { fontWeight: 700, marginBottom: 4 }]}>
        Layout plan: {a.file_name} ({a.concept ?? "—"})
      </Text>
      {a.isImage && a.signedUrl ? (
        <Image src={a.signedUrl} style={{ width: "100%", maxHeight: 400, objectFit: "contain" }} />
      ) : null}
      {a.pageImages.map((src, i) => (
        <Image key={i} src={src} style={{ width: "100%", maxHeight: 520, objectFit: "contain", marginTop: 4 }} />
      ))}
      {a.ai_summary && (
        <Text style={[r.small, { marginTop: 4, color: "#444" }]}> 
          AI summary: {a.ai_summary}
        </Text>
      )}
      {a.extracted_text && (
        <Text style={[r.small, { marginTop: 4, color: "#222" }]}>
          {a.extracted_text}
        </Text>
      )}
      {!a.isImage && !a.ai_summary && !a.extracted_text && (
        <Text style={r.small}>(parsing pending — re-open report shortly)</Text>
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

      {/* Full setup sequence — every phase in order */}
      {phases.length > 0 && (
        <View>
          <Text style={r.h2}>Setup sequence</Text>
          {phases.map(renderPhase)}
        </View>
      )}

      {/* Concept-grouped layout attachments only */}
      {CONCEPT_ORDER.map((c) => {
        const atts = attByConcept(c);
        if (atts.length === 0) return null;
        return (
          <View key={c}>
            <Text style={[r.h2, { textTransform: "capitalize" }]}>{c} — layout</Text>
            {atts.map(renderAttachment)}
          </View>
        );
      })}

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
