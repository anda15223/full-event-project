import { useEffect, useState } from "react";
import "@/lib/pdfFonts";
import { useParams } from "react-router-dom";
import { Document, Page, Text, View, Image, StyleSheet, PDFViewer, Font } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { FACADE_STATUS_META } from "@/lib/facade";
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
  h1: { fontSize: 18, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2, marginBottom: 12 },
  summary: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, padding: 6, backgroundColor: "#f6f6f6", borderRadius: 3 },
  summaryItem: { marginRight: 12, fontSize: 9 },
  card: { border: "0.5pt solid #ddd", borderRadius: 4, padding: 10, marginBottom: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  name: { fontSize: 13, fontWeight: 700 },
  badge: { fontSize: 8, padding: "2 6", borderRadius: 8, backgroundColor: "#eee" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginBottom: 4 },
  field: { width: "50%", paddingRight: 6, marginBottom: 4 },
  label: { color: "#777", fontSize: 7, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 1 },
  value: { fontSize: 9 },
  sectionTitle: { fontSize: 9, fontWeight: 700, marginTop: 6, marginBottom: 3, color: "#333" },
  notes: { fontSize: 9, color: "#333", lineHeight: 1.35 },
  photosRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  photo: { width: 140, height: 105, marginRight: 6, marginBottom: 6, objectFit: "cover", border: "0.5pt solid #ccc", borderRadius: 2 },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, fontSize: 7, color: "#888", flexDirection: "row", justifyContent: "space-between" },
});

type Photo = { id: string; festival_facade_id: string; file_path: string; file_name: string; signedUrl?: string };

export default function FestivalFacadeExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (!f) { setData({ festival: null }); return; }
      const { data: contracts } = await supabase.from("festival_contracts")
        .select("id, concept_alias, concept:concepts!concept_id(name, slug, display_order)")
        .eq("festival_id", f.id).eq("is_active", true);
      const ids = (contracts ?? []).map((c: any) => c.id);
      const { data: facades } = ids.length
        ? await supabase.from("festival_facade").select("*").in("festival_contract_id", ids)
        : { data: [] };
      const facadeIds = (facades ?? []).map((x: any) => x.id);
      const { data: photos } = facadeIds.length
        ? await supabase.from("festival_facade_photos").select("*").in("festival_facade_id", facadeIds).order("display_order", { ascending: true })
        : { data: [] };

      // Sign photo URLs
      const signed: Photo[] = [];
      for (const p of (photos ?? []) as Photo[]) {
        const { data: s } = await supabase.storage.from("facade-designs").createSignedUrl(p.file_path, 3600);
        signed.push({ ...p, signedUrl: s?.signedUrl });
      }

      setData({ festival: f, contracts: contracts ?? [], facades: facades ?? [], photos: signed });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const fById = new Map<string, any>();
  (data.facades as any[]).forEach((f) => fById.set(f.festival_contract_id, f));

  const photosByFacade = new Map<string, Photo[]>();
  (data.photos as Photo[]).forEach((p) => {
    const arr = photosByFacade.get(p.festival_facade_id) ?? [];
    arr.push(p);
    photosByFacade.set(p.festival_facade_id, arr);
  });

  const sorted = [...data.contracts].sort((a: any, b: any) => {
    const ao = a.concept?.display_order ?? 999;
    const bo = b.concept?.display_order ?? 999;
    return ao - bo;
  });

  const counts: Record<string, number> = {};
  (data.facades as any[]).forEach((f) => { if (f.design_status) counts[f.design_status] = (counts[f.design_status] ?? 0) + 1; });

  const dim = (v: any) => (v == null || v === "" ? "—" : String(v));

  return (
    <PDFViewer style={{ width: "100vw", height: "100vh", border: 0 }}>
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Facade Report — {data.festival.name}</Text>
          <Text style={styles.meta}>{formatDateRange(data.festival.start_date, data.festival.end_date)}</Text>

          {Object.keys(counts).length > 0 && (
            <View style={styles.summary}>
              {Object.entries(counts).map(([k, v]) => (
                <Text key={k} style={styles.summaryItem}>
                  {FACADE_STATUS_META[k as keyof typeof FACADE_STATUS_META]?.label ?? k}: {v}
                </Text>
              ))}
            </View>
          )}

          {sorted.map((c: any) => {
            const facade = fById.get(c.id);
            const meta = facade?.design_status ? FACADE_STATUS_META[facade.design_status as keyof typeof FACADE_STATUS_META] : null;
            const photos = facade ? photosByFacade.get(facade.id) ?? [] : [];
            return (
              <View key={c.id} style={styles.card} wrap={false}>
                <View style={styles.header}>
                  <Text style={styles.name}>
                    {c.concept?.name ?? "—"}{c.concept_alias ? ` — ${c.concept_alias}` : ""}
                  </Text>
                  {meta && <Text style={styles.badge}>{meta.label}</Text>}
                </View>

                {!facade && <Text style={styles.notes}>No facade record.</Text>}
                {facade && (
                  <>
                    <View style={styles.grid}>
                      <View style={styles.field}>
                        <Text style={styles.label}>Tent (W × D × H)</Text>
                        <Text style={styles.value}>
                          {dim(facade.tent_width_m)} × {dim(facade.tent_depth_m)} × {dim(facade.tent_height_m)} m
                        </Text>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>Facade (W × H)</Text>
                        <Text style={styles.value}>
                          {dim(facade.facade_width_m)} × {dim(facade.facade_height_m)} m
                        </Text>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>Material</Text>
                        <Text style={styles.value}>{dim(facade.material_type)}</Text>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>Print deadline</Text>
                        <Text style={styles.value}>{dim(facade.print_deadline)}</Text>
                      </View>
                    </View>

                    {facade.setup_notes && (
                      <>
                        <Text style={styles.sectionTitle}>Setup notes</Text>
                        <Text style={styles.notes}>{facade.setup_notes}</Text>
                      </>
                    )}

                    {facade.parse_summary && (
                      <>
                        <Text style={styles.sectionTitle}>AI summary</Text>
                        <Text style={styles.notes}>{facade.parse_summary}</Text>
                      </>
                    )}

                    {photos.length > 0 && (
                      <>
                        <Text style={styles.sectionTitle}>Photos ({photos.length})</Text>
                        <View style={styles.photosRow}>
                          {photos.map((p) =>
                            p.signedUrl ? (
                              <Image key={p.id} src={p.signedUrl} style={styles.photo} />
                            ) : null
                          )}
                        </View>
                      </>
                    )}
                  </>
                )}
              </View>
            );
          })}

          <View style={styles.footer} fixed>
            <Text>Facade — {data.festival.name}</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      </Document>
    </PDFViewer>
  );
}
