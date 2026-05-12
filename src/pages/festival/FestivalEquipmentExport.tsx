import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PDFViewer } from "@react-pdf/renderer";
import { Text, View } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles as r, reportColors as c, fmtFilename } from "@/components/pdf/ReportTemplate";
import { CATEGORY_META, type EquipCategory, type EquipmentRow, summarizeConceptEquipment, groupByCategory } from "@/lib/equipmentStatus";

const sb = supabase as any;

export default function FestivalEquipmentExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (!f) return setData({ festival: null });

      const { data: contracts } = await supabase.from("festival_contracts")
        .select("id, concept_id").eq("festival_id", f.id).eq("is_active", true);
      const contractIds = (contracts ?? []).map((k: any) => k.id);
      const conceptIds = (contracts ?? []).map((k: any) => k.concept_id);

      const { data: power } = contractIds.length
        ? await supabase.from("festival_power").select("id, festival_contract_id").in("festival_contract_id", contractIds)
        : { data: [] as any[] };
      const powerIds = (power ?? []).map((p: any) => p.id);

      const { data: equipment } = powerIds.length
        ? await sb.from("festival_power_equipment").select("*").in("festival_power_id", powerIds)
        : { data: [] as any[] };

      const { data: concepts } = conceptIds.length
        ? await supabase.from("concepts").select("id, name, slug, color_hex").in("id", conceptIds)
        : { data: [] as any[] };

      // Group equipment per concept via power.festival_contract_id → contract.concept_id
      const powerToConcept = new Map<string, string>();
      (power ?? []).forEach((p: any) => {
        const k = (contracts ?? []).find((x: any) => x.id === p.festival_contract_id);
        if (k) powerToConcept.set(p.id, k.concept_id);
      });
      const eqByConcept = new Map<string, EquipmentRow[]>();
      (equipment ?? []).forEach((e: any) => {
        const cid = powerToConcept.get(e.festival_power_id);
        if (!cid) return;
        const arr = eqByConcept.get(cid) ?? [];
        arr.push(e);
        eqByConcept.set(cid, arr);
      });

      setData({ festival: f, concepts: concepts ?? [], eqByConcept });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const concepts = data.concepts as any[];
  let totalItems = 0, totalPowered = 0, totalKw = 0;
  concepts.forEach((cn: any) => {
    const sum = summarizeConceptEquipment(data.eqByConcept.get(cn.id) ?? []);
    totalItems += sum.items; totalPowered += sum.powered; totalKw += sum.kw;
  });

  const summary = (
    <View>
      <Text style={[r.body, { fontWeight: 700, marginBottom: 4 }]}>Festival summary</Text>
      <Text style={r.small}>
        {concepts.length} concepts · {totalItems} items · {totalPowered} powered · {totalKw.toFixed(1)} kW total
      </Text>
    </View>
  );

  const doc = (
    <ReportTemplate
      festivalName={data.festival.name}
      festivalDates={formatDateRange(data.festival.start_date, data.festival.end_date)}
      reportTitle="Equipment"
      reportSubtitle="Per-concept equipment, grouped by category. Søborg load tagged."
      accentColor="slate"
      summary={summary}
    >
      {concepts.length === 0 && <Text style={r.small}>No active concepts.</Text>}
      {concepts.map((cn: any) => {
        const rows = data.eqByConcept.get(cn.id) ?? [];
        const grouped = groupByCategory(rows);
        const sum = summarizeConceptEquipment(rows);
        return (
          <View key={cn.id} style={r.card} wrap={false}>
            <View style={r.cardHeader}>
              <Text style={r.cardTitle}>{cn.name}</Text>
              <Text style={r.small}>{sum.items} items · {sum.powered} powered · {sum.kw.toFixed(1)} kW</Text>
            </View>
            {rows.length === 0 && <Text style={r.small}>No equipment recorded.</Text>}
            {grouped.map(([cat, items]) => (
              <View key={cat} style={{ marginTop: 6 }}>
                <Text style={r.h3}>{CATEGORY_META[cat as EquipCategory]?.label ?? cat}</Text>
                {items.map((e) => (
                  <Text key={e.id} style={r.bullet}>
                    • {e.equipment_name} × {e.quantity}
                    {e.is_powered ? ` — ${Number(e.power_kw ?? 0).toFixed(2)} kW` : ""}
                    {e.loads_from_soborg ? "  [ SØBORG ]" : "  [ ON-SITE ]"}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </ReportTemplate>
  );

  return (
    <PDFViewer style={{ width: "100vw", height: "100vh", border: "none" }}>
      {doc}
    </PDFViewer>
  );
}

// Filename helper exposed for download links
export const equipmentExportFilename = (slug: string) => fmtFilename(slug, "equipment");
// referencing c to avoid unused import warning during tree-shake debugging
void c;
