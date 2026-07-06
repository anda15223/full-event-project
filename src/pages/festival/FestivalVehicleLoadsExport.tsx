import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PDFViewer, Text, View } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles as r, Section, Table, LoadBadge, type TableRow } from "@/components/pdf/ReportTemplate";
import { CATEGORY_META, type EquipCategory, type EquipmentRow } from "@/lib/equipmentStatus";
import { normalizeForPdf } from "@/lib/textNormalize";

const sb = supabase as any;
const N = normalizeForPdf;

export default function FestivalVehicleLoadsExport() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (!f) return setData({ festival: null });

      const { data: contracts } = await supabase.from("festival_contracts")
        .select("id, concept_id, assigned_vehicle_id, instance_label, concept_alias, concepts!concept_id(name)")
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
        ? await sb.from("festival_power_equipment").select("*").in("festival_power_id", powerIds)
        : { data: [] as any[] };

      // Vehicles from festival_transport
      const { data: vehicles } = await sb.from("festival_transport")
        .select("id, vehicle_type, license_plate, season_rental:season_rentals(vehicle_type, license_plate)")
        .eq("festival_id", f.id);
      const vName = (v: any) => (v.season_rental?.vehicle_type ?? v.vehicle_type ?? "Vehicle");
      const vPlate = (v: any) => (v.season_rental?.license_plate ?? v.license_plate ?? null);

      // Group equipment by contract → vehicle
      const eqByContract = new Map<string, EquipmentRow[]>();
      (eq ?? []).forEach((e: any) => {
        const cid = powerToContract.get(e.festival_power_id); if (!cid) return;
        const arr = eqByContract.get(cid) ?? [];
        arr.push(e as EquipmentRow);
        eqByContract.set(cid, arr);
      });

      const byVehicle = new Map<string | null, { name: string; plate: string | null; concepts: { name: string; rows: EquipmentRow[] }[] }>();
      cList.forEach((c) => {
        const rows = eqByContract.get(c.id) ?? [];
        if (rows.length === 0 && !c.assigned_vehicle_id) return;
        const key = c.assigned_vehicle_id ?? null;
        const v = (vehicles ?? []).find((x: any) => x.id === c.assigned_vehicle_id);
        const entry = byVehicle.get(key) ?? {
          name: v ? vName(v) : "— Unassigned —",
          plate: v ? vPlate(v) : null,
          concepts: [],
        };
        entry.concepts.push({ name: nameFor(c), rows });
        byVehicle.set(key, entry);
      });

      setData({ festival: f, entries: Array.from(byVehicle.entries()) });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const entries = data.entries as [string | null, { name: string; plate: string | null; concepts: { name: string; rows: EquipmentRow[] }[] }][];

  const doc = (
    <ReportTemplate
      festivalName={data.festival.name}
      festivalDates={formatDateRange(data.festival.start_date, data.festival.end_date)}
      reportTitle="Vehicle Load Lists"
      reportSubtitle="Equipment grouped by the vehicle it's packed into."
      accentColor="slate"
      summary={<View><Text style={r.small}>{entries.length} vehicle group{entries.length === 1 ? "" : "s"}</Text></View>}
    >
      {entries.length === 0 && <Text style={r.small}>No vehicle assignments yet.</Text>}
      {entries.map(([key, e], idx) => {
        type ItRow = EquipmentRow & { concept: string; catLabel: string; cat: EquipCategory };
        const byCat = new Map<EquipCategory, ItRow[]>();
        e.concepts.forEach((cn) => {
          cn.rows.forEach((row) => {
            const cat = (row.category ?? "other") as EquipCategory;
            const arr = byCat.get(cat) ?? [];
            arr.push({ ...row, concept: cn.name, catLabel: CATEGORY_META[cat]?.label ?? cat, cat });
            byCat.set(cat, arr);
          });
        });
        const sortedCats = Array.from(byCat.keys()).sort((a, b) =>
          (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99)
        );
        const tableRows: TableRow<ItRow>[] = [];
        sortedCats.forEach((cat) => {
          const items = (byCat.get(cat) ?? []).slice().sort((a, b) =>
            a.concept.localeCompare(b.concept) || a.equipment_name.localeCompare(b.equipment_name)
          );
          const qty = items.reduce((s, x) => s + x.quantity, 0);
          tableRows.push({ __group: true, label: CATEGORY_META[cat]?.label ?? cat, meta: `${items.length} types · ${qty} items` });
          items.forEach((it) => tableRows.push(it as any));
        });
        const totalItems = Array.from(byCat.values()).reduce((s, arr) => s + arr.reduce((x, r0) => x + r0.quantity, 0), 0);
        return (
          <Section
            key={key ?? "none"}
            title={`${N(e.name)}${e.plate ? ` — ${N(e.plate)}` : ""}`}
            meta={`${e.concepts.length} concept${e.concepts.length === 1 ? "" : "s"} · ${totalItems} items`}
            breakBefore={idx > 0}
          >
            <Table<ItRow>
              columns={[
                { header: "Concept", flex: 2.4, cell: (it) => it.concept },
                { header: "Item name", flex: 4, cell: (it) => it.equipment_name },
                { header: "Qty", flex: 1, align: "right", mono: true, cell: (it) => String(it.quantity) },
                { header: "Power (kW)", flex: 1.6, align: "right", mono: true, cell: (it) => it.is_powered ? Number(it.power_kw ?? 0).toFixed(2) : "—" },
                { header: "Trolley", flex: 1.4, align: "center", cell: () => "—" },
                { header: "Source", flex: 1.6, align: "center", cell: (it) => <LoadBadge soborg={it.loads_from_soborg} /> },
              ]}
              rows={tableRows}
            />
          </Section>
        );
      })}
    </ReportTemplate>
  );

  return <PDFViewer style={{ width: "100vw", height: "100vh", border: "none" }}>{doc}</PDFViewer>;
}
