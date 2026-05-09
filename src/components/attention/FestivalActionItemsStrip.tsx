import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ListChecks, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-muted-foreground/40",
};

export function FestivalActionItemsStrip({ festivalId, slug }: { festivalId: string; slug: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["festival-actions-strip", festivalId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("festival_action_items")
        .select("id, title, due_date, status, priority, snoozed_until")
        .eq("festival_id", festivalId)
        .in("status", ["open", "in_progress", "blocked"])
        .or(`snoozed_until.is.null,snoozed_until.lte.${today}`);
      return (data ?? []) as Array<{ id: string; title: string; due_date: string | null; status: string; priority: string; snoozed_until: string | null }>;
    },
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  const items = data ?? [];
  const openCount = items.length;

  if (openCount === 0) {
    return (
      <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4" /> No open action items for this festival.
        <Link to={`/festivals/${slug}/actions`} className="ml-auto text-xs underline">Open actions page</Link>
      </section>
    );
  }

  // Sort: critical first, then by due date
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...items].sort((a, b) => {
    const r = (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
    if (r) return r;
    return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  });
  const top = sorted.slice(0, 3);
  const critical = items.filter((i) => i.priority === "critical").length;

  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-sm font-semibold flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Action Items
          <span className="text-xs font-normal text-muted-foreground">{openCount} open</span>
          {critical > 0 && (
            <span className="text-xs font-medium text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {critical} critical
            </span>
          )}
        </h2>
        <Link to={`/festivals/${slug}/actions`} className="text-xs text-primary hover:underline flex items-center gap-1">
          View all ({openCount}) <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <div className="space-y-1.5">
        {top.map((it) => {
          const overdue = it.due_date && new Date(it.due_date + "T00:00:00") < new Date(new Date().setHours(0,0,0,0));
          return (
            <Link key={it.id} to={`/festivals/${slug}/actions?item=${it.id}`}
              className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
              <span className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[it.priority] ?? "bg-muted")} />
              <span className="flex-1 truncate">{it.title}</span>
              {it.due_date && (
                <span className={cn("text-[11px] tabular-nums shrink-0",
                  overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {format(new Date(it.due_date + "T00:00:00"), "d MMM")}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
