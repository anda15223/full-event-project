import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PDFViewer } from "@react-pdf/renderer";
import { Text, View } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles as r, reportColors as c, fmtFilename, Section, Table, LoadBadge, type TableRow } from "@/components/pdf/ReportTemplate";
import { CATEGORY_META, type EquipCategory, type EquipmentRow, summarizeConceptEquipment, groupByCategory } from "@/lib/equipmentStatus";

type EqWithTrolleys = EquipmentRow & { trolley_numbers: number[] };

const sb = supabase as any;

export default function FestivalEquipmentExport() {
  const { slug = "" } = useParams();
  const [sp] = useSearchParams();
  const conceptFilter = sp.get("concept") ?? "";
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (!f) return setData({ festival: null });

      const { data: contracts } = await supabase.from("festival_contracts")
        .select("id, concept_id, instance_label, concept_alias, concepts!concept_id(name, slug, color_hex)")
        .eq("festival_id", f.id).eq("is_active", true);
      const cList = (contracts ?? []) as any[];
      const nameFor = (c: any) => {
        const alias = (c.concept_alias ?? "").trim();
        return alias || (c.instance_label ? `${c.concepts?.name} ${c.instance_label}` : (c.concepts?.name ?? "Concept"));
      };

      const contractIds = cList.map((k) => k.id);
      const { data: power } = contractIds.length
        ? await supabase.from("festival_power").select("id, festival_contract_id").in("festival_contract_id", contractIds)
        : { data: [] as any[] };
      const powerIds = (power ?? []).map((p: any) => p.id);

      const { data: equipment } = powerIds.length
        ? await sb.from("festival_power_equipment").select("*").in("festival_power_id", powerIds)
        : { data: [] as any[] };
      const equipmentIds = (equipment ?? []).map((e: any) => e.id);

      // Trolley splits per equipment row
      const { data: splits } = equipmentIds.length
        ? await sb.from("festival_equipment_trolley_split")
            .select("equipment_id, trolley_number")
            .in("equipment_id", equipmentIds)
        : { data: [] as any[] };
      const trolleyByEq = new Map<string, number[]>();
      (splits ?? []).forEach((s: any) => {
        const arr = trolleyByEq.get(s.equipment_id) ?? [];
        arr.push(s.trolley_number);
        trolleyByEq.set(s.equipment_id, arr);
      });

      // Group equipment per contract (not concept) so multiple instances stay separate
      const powerToContract = new Map<string, string>();
      (power ?? []).forEach((p: any) => powerToContract.set(p.id, p.festival_contract_id));
      const eqByContract = new Map<string, EqWithTrolleys[]>();
      (equipment ?? []).forEach((e: any) => {
        const cid = powerToContract.get(e.festival_power_id);
        if (!cid) return;
        const arr = eqByContract.get(cid) ?? [];
        arr.push({ ...(e as EquipmentRow), trolley_numbers: (trolleyByEq.get(e.id) ?? []).sort((a, b) => a - b) });
        eqByContract.set(cid, arr);
      });

      const entries = cList
        .map((c) => ({
          id: c.id,
          name: nameFor(c),
          slug: c.concepts?.slug ?? "",
          rows: eqByContract.get(c.id) ?? [],
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setData({ festival: f, entries });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const allEntries = data.entries as { id: string; name: string; slug: string; rows: EquipmentRow[] }[];
  const entries = conceptFilter
    ? allEntries.filter((e) => e.slug === conceptFilter)
    : allEntries;
  let totalItems = 0, totalPowered = 0, totalKw = 0;
  entries.forEach((e) => {
    const sum = summarizeConceptEquipment(e.rows);
    totalItems += sum.items; totalPowered += sum.powered; totalKw += sum.kw;
  });

  const summary = (
    <View>
      <Text style={[r.body, { fontWeight: 700, marginBottom: 4 }]}>Festival summary</Text>
      <Text style={r.small}>
        {entries.length} concepts · {totalItems} items · {totalPowered} powered · {totalKw.toFixed(1)} kW total
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
      {entries.length === 0 && <Text style={r.small}>No active concepts.</Text>}
      {entries.map((entry, idx) => {
        const rows = entry.rows;
        const grouped = groupByCategory(rows as any) as [EquipCategory, EqWithTrolleys[]][];
        const sum = summarizeConceptEquipment(rows);
        const tableRows: TableRow<EqWithTrolleys>[] = [];
        grouped.forEach(([cat, items]) => {
          const qty = items.reduce((s, e) => s + e.quantity, 0);
          tableRows.push({ __group: true, label: CATEGORY_META[cat]?.label ?? cat, meta: `${items.length} types · ${qty} items` });
          items.forEach((it) => tableRows.push(it as any));
        });
        return (
          <Section
            key={entry.id}
            title={entry.name}
            stats={[
              { label: "Items", value: sum.items },
              { label: "Powered", value: sum.powered },
              { label: "Total", value: `${sum.kw.toFixed(1)} kW` },
            ]}
            breakBefore={idx > 0}
          >
            {rows.length === 0 ? (
              <Text style={r.small}>No equipment recorded.</Text>
            ) : (
              <Table<EqWithTrolleys>
                columns={[
                  { header: "Item name", flex: 5, cell: (e) => e.equipment_name },
                  { header: "Qty", flex: 1, align: "right", mono: true, cell: (e) => String(e.quantity) },
                  { header: "Power (kW)", flex: 1.6, align: "right", mono: true, cell: (e) => e.is_powered ? Number(e.power_kw ?? 0).toFixed(2) : "—" },
                  { header: "Trolley", flex: 1.6, align: "center", cell: (e) => e.trolley_numbers.length ? e.trolley_numbers.map((n) => `#${n}`).join(", ") : "—" },
                  { header: "Source", flex: 1.6, align: "center", cell: (e) => <LoadBadge soborg={e.loads_from_soborg} /> },
                ]}
                rows={tableRows}
              />
            )}
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

// Filename helper exposed for download links
export const equipmentExportFilename = (slug: string) => fmtFilename(slug, "equipment");
// referencing c to avoid unused import warning during tree-shake debugging
void c;
