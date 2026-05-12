import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Tag } from "lucide-react";
import {
  PricesConceptCard, type PriceRow, type PriceItemRow,
} from "@/components/festival/cards/PricesConceptCard";
import type { ConceptSlug } from "@/components/concept/types";

const SLUG_ORDER: ConceptSlug[] = ["fish-chips", "gyros", "creperie", "chicks"];
const sb = supabase as any;

type Festival = { id: string; slug: string; name: string };

export default function FestivalPrices() {
  const { slug = "" } = useParams();

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals")
        .select("id,slug,name").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });

  const festival = festivalQ.data;
  const festivalId = festival?.id ?? "";

  const pageQ = useQuery({
    queryKey: ["prices-page", slug],
    enabled: !!festivalId,
    queryFn: async () => {
      // active concepts at this festival
      const { data: contracts, error: cErr } = await supabase
        .from("festival_contracts")
        .select("concept_id, is_active, concepts(id, slug, name, display_order)")
        .eq("festival_id", festivalId).eq("is_active", true);
      if (cErr) throw cErr;
      const concepts = (contracts ?? [])
        .map((c: any) => c.concepts).filter(Boolean) as { id: string; slug: string; name: string; display_order: number }[];

      // existing prices rows
      const { data: pricesRows, error: pErr } = await sb
        .from("festival_concept_prices").select("*").eq("festival_id", festivalId);
      if (pErr) throw pErr;
      const prices = (pricesRows ?? []) as PriceRow[];

      // items
      const ids = prices.map((p) => p.id);
      let items: PriceItemRow[] = [];
      if (ids.length > 0) {
        const { data, error } = await sb
          .from("festival_concept_price_item").select("*")
          .in("concept_prices_id", ids)
          .order("display_order", { ascending: true });
        if (error) throw error;
        items = (data ?? []) as PriceItemRow[];
      }
      return { concepts, prices, items };
    },
  });

  const concepts = pageQ.data?.concepts ?? [];
  const prices = pageQ.data?.prices ?? [];
  const items = pageQ.data?.items ?? [];

  const pricesByConcept = useMemo(() => {
    const m = new Map<string, PriceRow>();
    prices.forEach((p) => m.set(p.concept_id, p));
    return m;
  }, [prices]);

  const itemsByPriceId = useMemo(() => {
    const m = new Map<string, PriceItemRow[]>();
    items.forEach((it) => {
      const arr = m.get(it.concept_prices_id) ?? [];
      arr.push(it);
      m.set(it.concept_prices_id, arr);
    });
    return m;
  }, [items]);

  const orderedConcepts = useMemo(() => {
    return [...concepts].sort((a, b) => {
      const ai = SLUG_ORDER.indexOf(a.slug as ConceptSlug);
      const bi = SLUG_ORDER.indexOf(b.slug as ConceptSlug);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [concepts]);

  const summary = useMemo(() => {
    const totalItems = items.length;
    const vegConceptCount = orderedConcepts.filter((c) => {
      const p = pricesByConcept.get(c.id);
      if (!p) return false;
      return (itemsByPriceId.get(p.id) ?? []).some((it) => it.is_vegetarian || it.is_vegan);
    }).length;
    const currCount = new Map<string, number>();
    prices.forEach((p) => currCount.set(p.currency, (currCount.get(p.currency) ?? 0) + 1));
    const currency = [...currCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "DKK";
    return { concepts: orderedConcepts.length, totalItems, vegConceptCount, currency };
  }, [orderedConcepts, items, prices, pricesByConcept, itemsByPriceId]);

  if (festivalQ.isLoading) {
    return <div className="p-6 max-w-6xl mx-auto"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> {festival.name}
        </Link>
        <div className="flex items-center justify-between gap-3 mt-2">
          <div className="flex items-center gap-3">
            <Tag className="h-7 w-7 text-emerald-500" />
            <h1 className="text-3xl font-bold tracking-tight">Prices</h1>
          </div>
          <a href={`/festivals/${slug}/prices/export`} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-muted">
            Export PDF
          </a>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Per-concept POS price lists for this festival. Upload your menu Excel and AI extracts product names + prices automatically.
        </p>
      </div>

      {orderedConcepts.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill>{summary.concepts} concept{summary.concepts === 1 ? "" : "s"}</Pill>
          <Pill>{summary.totalItems} menu items</Pill>
          <Pill tone={summary.vegConceptCount === summary.concepts ? "emerald" : "amber"}>
            🥗 {summary.vegConceptCount} / {summary.concepts} with vegetarian
          </Pill>
          <Pill>Currency: {summary.currency}</Pill>
        </div>
      )}

      {pageQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-full" />)}
        </div>
      ) : orderedConcepts.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No active concepts at this festival.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {orderedConcepts.map((c) => {
            const p = pricesByConcept.get(c.id) ?? null;
            const its = p ? (itemsByPriceId.get(p.id) ?? []) : [];
            return (
              <PricesConceptCard
                key={c.id}
                festivalId={festivalId}
                festivalSlug={slug}
                conceptId={c.id}
                conceptSlug={c.slug}
                conceptName={c.name}
                prices={p}
                items={its}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "amber" | "emerald" }) {
  const cls =
    tone === "amber"   ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
    tone === "emerald" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" :
                         "bg-muted text-muted-foreground border";
  return <span className={`px-2.5 py-1 rounded-full border ${cls}`}>{children}</span>;
}
