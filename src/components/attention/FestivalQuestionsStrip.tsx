import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpCircle, AlertTriangle, ArrowRight } from "lucide-react";

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-muted-foreground/40",
};

export function FestivalQuestionsStrip({ festivalId, slug }: { festivalId: string; slug: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["festival-questions-strip", festivalId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("festival_open_questions")
        .select("id, question, deadline, priority, show_on_overview, escalated_at")
        .eq("festival_id", festivalId)
        .eq("status", "open")
        .eq("visibility", "public");
      return (data ?? []) as Array<{ id: string; question: string; deadline: string | null; priority: string; show_on_overview: boolean; escalated_at: string | null }>;
    },
  });

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  const items = data ?? [];
  if (items.length === 0) return null;

  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...items].sort((a, b) => {
    const r = (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
    if (r) return r;
    return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
  });
  // Prefer flagged for overview, then top critical
  const surface = sorted.filter(q => q.show_on_overview || q.priority === "critical").slice(0, 2);
  const top = surface.length ? surface : sorted.slice(0, 2);
  const critical = items.filter((i) => i.priority === "critical").length;

  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-sm font-semibold flex items-center gap-2">
          <HelpCircle className="h-4 w-4" /> Open Questions
          <span className="text-xs font-normal text-muted-foreground">{items.length} open</span>
          {critical > 0 && (
            <span className="text-xs font-medium text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {critical} critical
            </span>
          )}
        </h2>
        <Link to={`/festivals/${slug}/questions`} className="text-xs text-primary hover:underline flex items-center gap-1">
          View all questions ({items.length}) <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <div className="space-y-1.5">
        {top.map((q) => {
          const overdue = q.deadline && new Date(q.deadline + "T00:00:00") < new Date(new Date().setHours(0,0,0,0));
          return (
            <Link key={q.id} to={`/festivals/${slug}/questions?q=${q.id}`}
              className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
              <span className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[q.priority] ?? "bg-muted")} />
              <span className="flex-1 truncate">{q.question}</span>
              {q.deadline && (
                <span className={cn("text-[11px] tabular-nums shrink-0",
                  overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {format(new Date(q.deadline + "T00:00:00"), "d MMM")}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
