import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AttentionSummary, BUCKET_EMOJI, BUCKET_LABEL, BUCKET_ORDER, Bucket, bucketBadgeClasses } from "@/lib/attention";
import { cn } from "@/lib/utils";

export function AttentionSummaryWidget({ festivalSlug, className }: { festivalSlug: string; className?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["attention-summary", festivalSlug],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_attention_summary")
        .select("*")
        .eq("festival_slug", festivalSlug)
        .maybeSingle();
      if (error) throw error;
      return data as AttentionSummary | null;
    },
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return <div className={cn("h-20 rounded-xl border bg-muted/30 animate-pulse", className)} />;
  }

  const total = data?.total_count ?? 0;
  if (total === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-emerald-700 dark:text-emerald-300",
          className,
        )}
      >
        <span className="text-sm font-medium">🎉 All clear — nothing needs attention.</span>
      </div>
    );
  }

  const counts: Record<Bucket, number> = {
    overdue: data?.overdue_count ?? 0,
    today: data?.today_count ?? 0,
    "this-week": data?.this_week_count ?? 0,
    later: data?.later_count ?? 0,
  };

  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-4 gap-3", className)}>
      {BUCKET_ORDER.map((b) => (
        <Link
          key={b}
          to={`/festivals/${festivalSlug}/attention?bucket=${b}`}
          className={cn(
            "rounded-xl border px-4 py-3 transition hover:shadow-sm hover:-translate-y-0.5",
            bucketBadgeClasses(b, counts[b]),
          )}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">{counts[b]}</span>
            <span className="text-xs">{BUCKET_EMOJI[b]}</span>
          </div>
          <div className="text-[11px] uppercase tracking-wide font-medium mt-1">{BUCKET_LABEL[b]}</div>
        </Link>
      ))}
    </div>
  );
}
