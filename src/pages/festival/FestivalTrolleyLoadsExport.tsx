import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PDFViewer, Text, View } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles as r } from "@/components/pdf/ReportTemplate";

const sb = supabase as any;

type Item = {
  trolley_number: number;
  quantity: number;
  equipment_name: string;
  base_qty: number;
  power_kw: number | null;
  is_powered: boolean;
  loads_from_soborg: boolean;
  concept_name: string;
};

export default function FestivalTrolleyLoadsExport() {
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
      const contractName = new Map<string, string>();
      cList.forEach((c) => {
        const alias = (c.concept_alias ?? "").trim();
        contractName.set(c.id, alias || (c.instance_label ? `${c.concepts?.name} ${c.instance_label}` : (c.concepts?.name ?? "Concept")));
      });

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
      const eqById = new Map<string, any>();
      (eq ?? []).forEach((e: any) => eqById.set(e.id, e));

      const { data: splits } = await sb.from("festival_equipment_trolley_split")
        .select("equipment_id, trolley_number, quantity")
        .eq("festival_id", f.id).order("trolley_number");

      const byTrolley = new Map<number, Item[]>();
      (splits ?? []).forEach((s: any) => {
        const e = eqById.get(s.equipment_id); if (!e) return;
        const cid = powerToContract.get(e.festival_power_id); if (!cid) return;
        const item: Item = {
          trolley_number: s.trolley_number, quantity: s.quantity,
          equipment_name: e.equipment_name, base_qty: e.quantity,
          power_kw: e.power_kw, is_powered: e.is_powered,
          loads_from_soborg: e.loads_from_soborg,
          concept_name: contractName.get(cid) ?? "Concept",
        };
        const arr = byTrolley.get(s.trolley_number) ?? [];
        arr.push(item);
        byTrolley.set(s.trolley_number, arr);
      });

      setData({ festival: f, byTrolley: Array.from(byTrolley.entries()).sort((a, b) => a[0] - b[0]) });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const trolleys = data.byTrolley as [number, Item[]][];
  const totalItems = trolleys.reduce((s, [, arr]) => s + arr.reduce((x, i) => x + i.quantity, 0), 0);

  const doc = (
    <ReportTemplate
      festivalName={data.festival.name}
      festivalDates={formatDateRange(data.festival.start_date, data.festival.end_date)}
      reportTitle="Trolley Load Lists"
      reportSubtitle="What's packed in each trolley, grouped by concept."
      accentColor="violet"
      summary={<View><Text style={r.small}>{trolleys.length} trolleys · {totalItems} items assigned</Text></View>}
    >
      {trolleys.length === 0 && <Text style={r.small}>No trolley assignments yet.</Text>}
      {trolleys.map(([num, items]) => {
        const byConcept = new Map<string, Item[]>();
        items.forEach((it) => {
          const arr = byConcept.get(it.concept_name) ?? [];
          arr.push(it);
          byConcept.set(it.concept_name, arr);
        });
        const totalQty = items.reduce((s, i) => s + i.quantity, 0);
        return (
          <View key={num} style={r.card} wrap={false}>
            <View style={r.cardHeader}>
              <Text style={r.cardTitle}>🛒 Trolley {num}</Text>
              <Text style={r.small}>{items.length} lines · {totalQty} items</Text>
            </View>
            {Array.from(byConcept.entries()).map(([cn, list]) => (
              <View key={cn} style={{ marginTop: 4 }}>
                <Text style={r.h3}>{cn}</Text>
                {list.map((it, idx) => (
                  <Text key={idx} style={r.bullet}>
                    • {it.equipment_name} × {it.quantity}
                    {it.is_powered && it.power_kw ? `  (${it.power_kw} kW)` : ""}
                    {it.loads_from_soborg ? "  [SØBORG]" : ""}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </ReportTemplate>
  );

  return <PDFViewer style={{ width: "100vw", height: "100vh", border: "none" }}>{doc}</PDFViewer>;
}
