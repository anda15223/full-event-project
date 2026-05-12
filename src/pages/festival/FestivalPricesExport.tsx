import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PDFViewer, Text, View } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateRange } from "@/lib/dateFormat";
import { ReportTemplate, reportStyles as r, fmtFilename } from "@/components/pdf/ReportTemplate";

const sb = supabase as any;

export default function FestivalPricesExport() {
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

      const { data: priceLists } = contractIds.length
        ? await sb.from("festival_prices").select("id, festival_contract_id, currency").in("festival_contract_id", contractIds)
        : { data: [] as any[] };
      const priceListIds = (priceLists ?? []).map((p: any) => p.id);

      const { data: items } = priceListIds.length
        ? await sb.from("festival_price_items").select("*").in("festival_prices_id", priceListIds)
        : { data: [] as any[] };

      const { data: concepts } = conceptIds.length
        ? await supabase.from("concepts").select("id, name, slug, color_hex").in("id", conceptIds)
        : { data: [] as any[] };

      const itemsByList = new Map<string, any[]>();
      (items ?? []).forEach((it: any) => {
        const arr = itemsByList.get(it.festival_prices_id) ?? [];
        arr.push(it); itemsByList.set(it.festival_prices_id, arr);
      });

      setData({ festival: f, concepts: concepts ?? [], contracts: contracts ?? [], priceLists: priceLists ?? [], itemsByList });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const concepts = data.concepts as any[];
  let totalItems = 0; let vegConcepts = 0;
  const conceptBlocks = concepts.map((cn: any) => {
    const k = data.contracts.find((x: any) => x.concept_id === cn.id);
    const list = data.priceLists.find((p: any) => p.festival_contract_id === k?.id);
    const items = list ? (data.itemsByList.get(list.id) ?? []) : [];
    totalItems += items.length;
    const hasVeg = items.some((it: any) => it.is_vegetarian || it.is_vegan);
    if (hasVeg) vegConcepts += 1;
    return { concept: cn, currency: list?.currency ?? "DKK", items, hasVeg };
  });

  const summary = (
    <View>
      <Text style={[r.body, { fontWeight: 700, marginBottom: 4 }]}>Menu summary</Text>
      <Text style={r.small}>
        {concepts.length} concepts · {totalItems} items · {vegConcepts} with vegetarian option
      </Text>
    </View>
  );

  const doc = (
    <ReportTemplate
      festivalName={data.festival.name}
      festivalDates={formatDateRange(data.festival.start_date, data.festival.end_date)}
      reportTitle="Prices"
      reportSubtitle="Menu and POS pricing per concept"
      accentColor="emerald"
      summary={summary}
    >
      {conceptBlocks.length === 0 && <Text style={r.small}>No active concepts.</Text>}
      {conceptBlocks.map(({ concept, items, currency, hasVeg }) => (
        <View key={concept.id} style={r.card} wrap={false}>
          <View style={r.cardHeader}>
            <Text style={r.cardTitle}>{concept.name}</Text>
            <Text style={r.small}>{items.length} items · {currency}{hasVeg ? " · vegetarian present" : " · no vegetarian option"}</Text>
          </View>
          {items.length === 0 && <Text style={r.small}>No menu items recorded.</Text>}
          {items.length > 0 && (
            <>
              <View style={r.th}>
                <Text style={{ flex: 1 }}>Item</Text>
                <Text style={{ width: 60, textAlign: "right" }}>Price</Text>
                <Text style={{ width: 90 }}>Diet</Text>
              </View>
              {items.map((it: any) => {
                const flags: string[] = [];
                if (it.is_vegetarian) flags.push("veg");
                if (it.is_vegan) flags.push("vegan");
                if (it.is_gluten_free) flags.push("GF");
                return (
                  <View key={it.id} style={r.tr} wrap={false}>
                    <Text style={{ flex: 1 }}>{it.product_name}</Text>
                    <Text style={{ width: 60, textAlign: "right" }}>{Number(it.price ?? 0).toFixed(2)} {currency}</Text>
                    <Text style={{ width: 90 }}>{flags.join(" · ") || "—"}</Text>
                  </View>
                );
              })}
            </>
          )}
        </View>
      ))}
    </ReportTemplate>
  );

  return (
    <PDFViewer style={{ width: "100vw", height: "100vh", border: "none" }}>{doc}</PDFViewer>
  );
}

export const pricesExportFilename = (slug: string) => fmtFilename(slug, "prices");
