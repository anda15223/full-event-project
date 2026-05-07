import { useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AttentionItem, BUCKET_EMOJI, BUCKET_LABEL, BUCKET_ORDER, Bucket, bucketSectionClasses, sortItems } from "@/lib/attention";
import { AttentionSummaryWidget } from "@/components/attention/AttentionSummaryWidget";
import { AttentionItemCard } from "@/components/attention/AttentionItemCard";
import { cn } from "@/lib/utils";

export default function FestivalAttention() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const bucketParam = params.get("bucket") as Bucket | null;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["attention-items", slug, bucketParam],
    queryFn: async () => {
      let q = (supabase as any).from("v_attention_items").select("*").eq("festival_slug", slug);
      if (bucketParam) q = q.eq("urgency_bucket", bucketParam);
      const { data, error } = await q;
      if (error) throw error;
      return sortItems((data ?? []) as AttentionItem[]);
    },
    refetchOnWindowFocus: true,
  });

  const grouped = useMemo(() => {
    const g: Record<Bucket, AttentionItem[]> = { overdue: [], today: [], "this-week": [], later: [] };
    items.forEach((i) => g[i.urgency_bucket]?.push(i));
    return g;
  }, [items]);

  const festivalName = items[0]?.festival_name ?? slug;
  const bucketsToShow = bucketParam ? [bucketParam] : BUCKET_ORDER;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to={`/festivals/${slug}`} className="text-xs text-muted-foreground hover:underline">← {festivalName}</Link>
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Attention — {festivalName}</h1>
        {bucketParam && (
          <p className="text-sm text-muted-foreground mt-1">
            Filtered: {BUCKET_EMOJI[bucketParam]} {BUCKET_LABEL[bucketParam]} ·{" "}
            <Link to={`/festivals/${slug}/attention`} className="underline">show all</Link>
          </p>
        )}
      </div>

      <AttentionSummaryWidget festivalSlug={slug} />

      {isLoading ? (
        <div className="h-40 rounded-xl border bg-muted/30 animate-pulse" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-8 text-center text-emerald-700 dark:text-emerald-300">
          🎉 All clear for {festivalName}.
        </div>
      ) : (
        <div className="space-y-6">
          {bucketsToShow.map((b) => {
            const list = grouped[b];
            return (
              <section key={b} className={cn("rounded-xl border p-4", bucketSectionClasses(b))}>
                <header className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-heading font-semibold uppercase tracking-wide">
                    {BUCKET_EMOJI[b]} {BUCKET_LABEL[b]}
                  </h2>
                  <span className="text-xs text-muted-foreground tabular-nums">{list.length} item{list.length === 1 ? "" : "s"}</span>
                </header>
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No items in this bucket — nothing to do here.</p>
                ) : (
                  <div className="grid gap-2">
                    {list.map((item) => (
                      <AttentionItemCard key={`${item.source_table}-${item.source_id}`} item={item} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
