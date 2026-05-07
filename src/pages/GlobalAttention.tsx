import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AttentionItem, AttentionSummary, BUCKET_EMOJI, BUCKET_LABEL, BUCKET_ORDER, Bucket, bucketBadgeClasses, sortItems } from "@/lib/attention";
import { AttentionItemCard } from "@/components/attention/AttentionItemCard";
import { cn } from "@/lib/utils";

const worstRank = (b: AttentionSummary["worst_bucket"]) =>
  b === "overdue" ? 1 : b === "today" ? 2 : b === "this-week" ? 3 : b === "later" ? 4 : 5;

export default function GlobalAttention() {
  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ["attention-global", "summaries"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_attention_summary")
        .select("*")
        .gt("total_count", 0);
      if (error) throw error;
      const arr = (data ?? []) as AttentionSummary[];
      return arr.sort((a, b) => {
        const w = worstRank(a.worst_bucket) - worstRank(b.worst_bucket);
        if (w) return w;
        return (a.festival_start_date ?? "").localeCompare(b.festival_start_date ?? "");
      });
    },
    refetchOnWindowFocus: true,
  });

  const { data: allItems = [] } = useQuery({
    queryKey: ["attention-global", "items"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_attention_items").select("*");
      if (error) throw error;
      return sortItems((data ?? []) as AttentionItem[]);
    },
    refetchOnWindowFocus: true,
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Attention — All Festivals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Everything that needs eyes, grouped by festival. Sorted by urgency.
        </p>
      </div>

      {isLoading ? (
        <div className="h-40 rounded-xl border bg-muted/30 animate-pulse" />
      ) : summaries.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-8 text-center text-emerald-700 dark:text-emerald-300">
          🎉 All clear across every festival.
        </div>
      ) : (
        <div className="space-y-8">
          {summaries.map((s) => {
            const top5 = allItems.filter((i) => i.festival_slug === s.festival_slug).slice(0, 5);
            const counts: Record<Bucket, number> = {
              overdue: s.overdue_count,
              today: s.today_count,
              "this-week": s.this_week_count,
              later: s.later_count,
            };
            return (
              <section key={s.festival_id} className="rounded-xl border bg-card p-5 shadow-sm">
                <header className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <Link to={`/festivals/${s.festival_slug}/attention`} className="text-lg font-heading font-semibold text-foreground hover:underline">
                    {s.festival_name}
                  </Link>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {s.total_count} item{s.total_count === 1 ? "" : "s"}
                  </span>
                </header>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {BUCKET_ORDER.map((b) => (
                    <Link
                      key={b}
                      to={`/festivals/${s.festival_slug}/attention?bucket=${b}`}
                      className={cn(
                        "rounded-lg border px-3 py-2 transition hover:shadow-sm",
                        bucketBadgeClasses(b, counts[b]),
                      )}
                    >
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-bold tabular-nums">{counts[b]}</span>
                        <span className="text-[10px]">{BUCKET_EMOJI[b]}</span>
                      </div>
                      <div className="text-[10px] uppercase tracking-wide font-medium">{BUCKET_LABEL[b]}</div>
                    </Link>
                  ))}
                </div>

                <div className="grid gap-2">
                  {top5.map((item) => (
                    <AttentionItemCard key={`${item.source_table}-${item.source_id}`} item={item} />
                  ))}
                </div>

                {s.total_count > 5 && (
                  <Link
                    to={`/festivals/${s.festival_slug}/attention`}
                    className="inline-block mt-3 text-xs font-medium text-primary hover:underline"
                  >
                    View all {s.total_count} items →
                  </Link>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
