import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PDFViewer, PDFDownloadLink, Text, View } from "@react-pdf/renderer";
import { Loader2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
      const conceptIds = (contracts ?? []).map((k: any) => k.concept_id);

      const { data: priceLists } = await sb.from("festival_concept_prices")
        .select("id, concept_id, currency").eq("festival_id", f.id);
      const priceListIds = (priceLists ?? []).map((p: any) => p.id);

      const { data: items } = priceListIds.length
        ? await sb.from("festival_concept_price_item").select("*")
            .in("concept_prices_id", priceListIds)
            .order("display_order", { ascending: true })
        : { data: [] as any[] };

      const { data: concepts } = conceptIds.length
        ? await supabase.from("concepts").select("id, name, slug, color_hex").in("id", conceptIds)
        : { data: [] as any[] };

      const itemsByConcept = new Map<string, any[]>();
      const currencyByConcept = new Map<string, string>();
      (priceLists ?? []).forEach((p: any) => currencyByConcept.set(p.concept_id, p.currency ?? "DKK"));
      const listToConcept = new Map<string, string>();
      (priceLists ?? []).forEach((p: any) => listToConcept.set(p.id, p.concept_id));
      (items ?? []).forEach((it: any) => {
        const cId = listToConcept.get(it.concept_prices_id);
        if (!cId) return;
        const arr = itemsByConcept.get(cId) ?? [];
        arr.push(it); itemsByConcept.set(cId, arr);
      });

      setData({ festival: f, concepts: concepts ?? [], itemsByConcept, currencyByConcept });
    })();
  }, [slug]);

  if (!data) return <div className="p-12 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</div>;
  if (!data.festival) return <div className="p-12">Festival not found.</div>;

  const concepts = data.concepts as any[];
  let totalItems = 0; let vegConcepts = 0;
  const conceptBlocks = concepts.map((cn: any) => {
    const items = data.itemsByConcept.get(cn.id) ?? [];
    totalItems += items.length;
    const hasVeg = items.some((it: any) => it.is_vegetarian || it.is_vegan);
    if (hasVeg) vegConcepts += 1;
    return { concept: cn, currency: data.currencyByConcept.get(cn.id) ?? "DKK", items, hasVeg };
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
        <View key={concept.id} style={r.card}>
          <View style={r.cardHeader}>
            <Text style={r.cardTitle}>{concept.name}</Text>
            <Text style={r.small}>{items.length} items · {currency}{hasVeg ? " · vegetarian present" : " · no vegetarian option"}</Text>
          </View>
          {items.length === 0 && <Text style={r.small}>No menu items recorded.</Text>}
          {items.length > 0 && (
            <>
              <View style={r.th}>
                <Text style={{ flex: 1 }}>Item</Text>
                <Text style={{ width: 70, textAlign: "right", paddingRight: 12 }}>Price</Text>
                <Text style={{ width: 130 }}>Diet</Text>
              </View>
              {items.map((it: any) => {
                const flags: string[] = [];
                if (it.is_vegetarian) flags.push("veg");
                if (it.is_vegan) flags.push("vegan");
                if (it.is_gluten_free) flags.push("GF");
                return (
                  <View key={it.id} style={r.tr} wrap={false}>
                    <Text style={{ flex: 1, paddingRight: 6 }}>{it.product_name}</Text>
                    <Text style={{ width: 70, textAlign: "right", paddingRight: 12 }}>{Number(it.price ?? 0).toFixed(2)} {currency}</Text>
                    <Text style={{ width: 130 }}>{flags.join(" · ") || "—"}</Text>
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
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between p-3 border-b bg-card">
        <Link to={`/festivals/${slug}/prices`} className="text-sm text-muted-foreground hover:underline">
          ← Back to prices
        </Link>
        <PDFDownloadLink document={doc} fileName={fmtFilename(slug, "prices")}>
          {({ loading: dlLoading }) => (
            <Button size="sm" disabled={dlLoading}>
              <Download className="h-4 w-4" />
              {dlLoading ? "Preparing…" : "Download PDF"}
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1 min-h-0">
        <PDFViewer style={{ width: "100%", height: "100%", border: 0 }}>{doc}</PDFViewer>
      </div>
    </div>
  );
}

export const pricesExportFilename = (slug: string) => fmtFilename(slug, "prices");
