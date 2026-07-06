import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PDFViewer, Text, View } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles as r, fmtFilename, Section, Table, LoadBadge } from "@/components/pdf/ReportTemplate";
import { CATEGORY_META, type EquipCategory, type EquipmentRow, ALL_CATEGORIES } from "@/lib/equipmentStatus";

const sb = supabase as any;

type Row = EquipmentRow & { conceptName: string; conceptColor?: string; trolley_numbers: number[] };

export default function FestivalEquipmentByCategoryExport() {
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
      const equipmentIds = (equipment ?? []).map((e: any) => e.id);

      const { data: splits } = equipmentIds.length
        ? await sb.from("festival_equipment_trolley_split")
            .select("equipment_id, trolley_number").in("equipment_id", equipmentIds)
        : { data: [] as any[] };
      const trolleyByEq = new Map<string, number[]>();
      (splits ?? []).forEach((s: any) => {
        const arr = trolleyByEq.get(s.equipment_id) ?? [];
        arr.push(s.trolley_number);
        trolleyByEq.set(s.equipment_id, arr);
      });

      const { data: concepts } = conceptIds.length
        ? await supabase.from("concepts").select("id, name, slug, color_hex").in("id", conceptIds)
        : { data: [] as any[] };

      const powerToConcept = new Map<string, string>();
      (power ?? []).forEach((p: any) => {
        const k = (contracts ?? []).find((x: any) => x.id === p.festival_contract_id);
        if (k) powerToConcept.set(p.id, k.concept_id);
      });
      const conceptMap = new Map<string, any>();
      (concepts ?? []).forEach((cn: any) => conceptMap.set(cn.id, cn));

      const rowsByCat = new Map<EquipCategory, Row[]>();
      (equipment ?? []).forEach((e: any) => {
        const cid = powerToConcept.get(e.festival_power_id);
        if (!cid) return;
        const cn = conceptMap.get(cid);
        const cat = (e.category ?? "other") as EquipCategory;
        const arr = rowsByCat.get(cat) ?? [];
        arr.push({
          ...e,
          conceptName: cn?.name ?? "—",
          conceptColor: cn?.color_hex,
          trolley_numbers: (trolleyByEq.get(e.id) ?? []).sort((a, b) => a - b),
        });
        rowsByCat.set(cat, arr);
      });

      setData({ festival: f, rowsByCat });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const rowsByCat: Map<EquipCategory, Row[]> = data.rowsByCat;
  const categories = ALL_CATEGORIES.filter((c) => (rowsByCat.get(c)?.length ?? 0) > 0);

  let totalItems = 0, totalKw = 0;
  categories.forEach((cat) => {
    (rowsByCat.get(cat) ?? []).forEach((e) => {
      totalItems += e.quantity;
      if (e.is_powered) totalKw += Number(e.power_kw ?? 0) * e.quantity;
    });
  });

  const summary = (
    <View>
      <Text style={[r.body, { fontWeight: 700, marginBottom: 4 }]}>Festival summary</Text>
      <Text style={r.small}>
        {categories.length} categories · {totalItems} items · {totalKw.toFixed(1)} kW total
      </Text>
    </View>
  );

  const doc = (
    <ReportTemplate
      festivalName={data.festival.name}
      festivalDates={formatDateRange(data.festival.start_date, data.festival.end_date)}
      reportTitle="Equipment by Category"
      reportSubtitle="Category-first view: every item grouped by category, concept as a column."
      accentColor="violet"
      summary={summary}
    >
      {categories.length === 0 && <Text style={r.small}>No equipment recorded.</Text>}
      {categories.map((cat, idx) => {
        const items = (rowsByCat.get(cat) ?? []).slice().sort((a, b) =>
          a.conceptName.localeCompare(b.conceptName) || a.equipment_name.localeCompare(b.equipment_name)
        );
        const catItems = items.reduce((s, e) => s + e.quantity, 0);
        const catKw = items.reduce((s, e) => s + (e.is_powered ? Number(e.power_kw ?? 0) * e.quantity : 0), 0);
        const meta = CATEGORY_META[cat];
        return (
          <Section
            key={cat}
            title={meta?.label ?? cat}
            stats={[
              { label: "types", value: items.length },
              { label: "items", value: catItems },
              { label: "kW", value: catKw.toFixed(1) },
            ]}
            breakBefore={idx > 0}
          >

            <Table<Row>
              columns={[
                { header: "Concept", flex: 2.6, cell: (e) => e.conceptName },
                { header: "Item name", flex: 4, cell: (e) => e.equipment_name },
                { header: "Qty", flex: 1, align: "right", mono: true, cell: (e) => String(e.quantity) },
                { header: "Power (kW)", flex: 1.6, align: "right", mono: true, cell: (e) => e.is_powered ? Number(e.power_kw ?? 0).toFixed(2) : "—" },
                { header: "Trolley", flex: 1.6, align: "center", cell: (e) => e.trolley_numbers.length ? e.trolley_numbers.map((n) => `#${n}`).join(", ") : "—" },
                { header: "Source", flex: 1.6, align: "center", cell: (e) => e.loads_from_soborg ? "SØBORG" : "ON-SITE" },
              ]}
              rows={items.slice(0, 2)}
            />
          </Section>
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

export const equipmentByCategoryExportFilename = (slug: string) => fmtFilename(slug, "equipment-by-category");
