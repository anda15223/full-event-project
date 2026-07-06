import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PDFViewer, Text, View } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles as r, Section, Table, LoadBadge } from "@/components/pdf/ReportTemplate";
import { CATEGORY_META, type EquipCategory, groupByCategory, type EquipmentRow } from "@/lib/equipmentStatus";

const sb = supabase as any;

export default function FestivalSoborgPickListExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (!f) return setData({ festival: null });

      const { data: contracts } = await supabase.from("festival_contracts")
        .select("id, concept_id, instance_label, concept_alias, concepts!concept_id(name)")
        .eq("festival_id", f.id).eq("is_active", true);
      const cList = (contracts ?? []) as any[];
      const nameFor = (c: any) => {
        const alias = (c.concept_alias ?? "").trim();
        return alias || (c.instance_label ? `${c.concepts?.name} ${c.instance_label}` : (c.concepts?.name ?? "Concept"));
      };

      const cIds = cList.map((c) => c.id);
      const { data: powers } = cIds.length
        ? await supabase.from("festival_power").select("id, festival_contract_id").in("festival_contract_id", cIds)
        : { data: [] as any[] };
      const powerToContract = new Map<string, string>();
      (powers ?? []).forEach((p: any) => powerToContract.set(p.id, p.festival_contract_id));
      const powerIds = (powers ?? []).map((p: any) => p.id);

      const { data: eq } = powerIds.length
        ? await sb.from("festival_power_equipment")
            .select("*").in("festival_power_id", powerIds).eq("loads_from_soborg", true)
        : { data: [] as any[] };

      // annotate each row with concept name
      const rows: (EquipmentRow & { concept_name: string })[] = (eq ?? []).map((e: any) => {
        const cid = powerToContract.get(e.festival_power_id);
        const c = cList.find((x) => x.id === cid);
        return { ...(e as EquipmentRow), concept_name: c ? nameFor(c) : "—" };
      });

      setData({ festival: f, rows });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const rows = data.rows as (EquipmentRow & { concept_name: string })[];
  const totalItems = rows.reduce((s, r0) => s + r0.quantity, 0);
  const grouped = groupByCategory(rows);

  const doc = (
    <ReportTemplate
      festivalName={data.festival.name}
      festivalDates={formatDateRange(data.festival.start_date, data.festival.end_date)}
      reportTitle="Søborg Pick List"
      reportSubtitle="Everything to pull from the warehouse for this festival, grouped by category."
      accentColor="blue"
      summary={<View><Text style={r.small}>{rows.length} line{rows.length === 1 ? "" : "s"} · {totalItems} items total</Text></View>}
    >
      {rows.length === 0 && <Text style={r.small}>Nothing tagged as Søborg for this festival.</Text>}
      {grouped.map(([cat, items], idx) => {
        const qty = items.reduce((s, i) => s + i.quantity, 0);
        const sorted = items.slice().sort((a: any, b: any) =>
          a.concept_name.localeCompare(b.concept_name) || a.equipment_name.localeCompare(b.equipment_name)
        );
        return (
          <Section
            key={cat}
            title={CATEGORY_META[cat as EquipCategory]?.label ?? cat}
            meta={`${items.length} types · ${qty} items`}
            breakBefore={idx > 0}
          >
            <Table
              columns={[
                { header: "Concept", flex: 2.6, cell: (it: any) => it.concept_name },
                { header: "Item name", flex: 4, cell: (it: any) => it.equipment_name },
                { header: "Qty", flex: 1, align: "right", mono: true, cell: (it: any) => String(it.quantity) },
                { header: "Power (kW)", flex: 1.6, align: "right", mono: true, cell: (it: any) => it.is_powered ? Number(it.power_kw ?? 0).toFixed(2) : "—" },
                { header: "Trolley", flex: 1.4, align: "center", cell: () => "—" },
                { header: "Source", flex: 1.6, align: "center", cell: () => <LoadBadge soborg={true} /> },
              ]}
              rows={sorted}
            />
          </Section>
        );
      })}
    </ReportTemplate>
  );

  return <PDFViewer style={{ width: "100vw", height: "100vh", border: "none" }}>{doc}</PDFViewer>;
}
