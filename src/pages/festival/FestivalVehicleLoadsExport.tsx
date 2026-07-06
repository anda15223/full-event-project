import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PDFViewer, Text, View } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles as r } from "@/components/pdf/ReportTemplate";
import { CATEGORY_META, type EquipCategory, groupByCategory, type EquipmentRow } from "@/lib/equipmentStatus";
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
      {entries.map(([key, e]) => {
        const totalItems = e.concepts.reduce((s, c) => s + c.rows.reduce((x, r0) => x + r0.quantity, 0), 0);
        return (
          <View key={key ?? "none"} style={r.card}>
            <View style={r.cardHeader}>
              <Text style={r.cardTitle}>{N(e.name)}{e.plate ? ` - ${N(e.plate)}` : ""}</Text>
              <Text style={r.small}>{e.concepts.length} concept{e.concepts.length === 1 ? "" : "s"} - {totalItems} items</Text>
            </View>
            {e.concepts.map((cn, i) => {
              const grouped = groupByCategory(cn.rows);
              return (
                <View key={i} style={{ marginTop: 8 }}>
                  <Text style={r.h3}>{N(cn.name)}</Text>
                  {grouped.map(([cat, items]) => (
                    <View key={cat} style={{ marginTop: 3 }} wrap={false}>
                      <Text style={r.small}>{N(CATEGORY_META[cat as EquipCategory]?.label ?? cat)}</Text>
                      {items.map((it) => (
                        <Text key={it.id} style={r.bullet}>
                          - {N(it.equipment_name)} x {it.quantity}
                          {it.loads_from_soborg ? "  [SØBORG]" : "  [ON-SITE]"}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        );
      })}
    </ReportTemplate>
  );

  return <PDFViewer style={{ width: "100vw", height: "100vh", border: "none" }}>{doc}</PDFViewer>;
}
