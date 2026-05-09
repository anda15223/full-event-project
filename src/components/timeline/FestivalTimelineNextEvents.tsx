import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PARTY_BADGE: Record<string, string> = {
  fish_project: "bg-blue-500/10 text-blue-700",
  fidibus: "bg-emerald-500/10 text-emerald-700",
  festival: "bg-purple-500/10 text-purple-700",
  supplier: "bg-orange-500/10 text-orange-700",
  mixed: "bg-cyan-500/10 text-cyan-700",
};
const PARTY_LABEL: Record<string, string> = {
  fish_project: "Fish Project", fidibus: "Fidibus", festival: "Festival", supplier: "Supplier", mixed: "Mixed",
};

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function countdown(iso: string) {
  const t = new Date(); t.setHours(0,0,0,0);
  const d = new Date(iso + "T00:00:00");
  const diff = Math.round((d.getTime() - t.getTime())/86400000);
  if (diff === 0) return "Today";
  if (diff > 0) return `T-${diff}`;
  return `${diff}d`;
}

export function FestivalTimelineNextEvents({ festivalId, slug }: { festivalId: string; slug: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ["festival-timeline-next", festivalId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("festival_timeline_event")
        .select("id, title, event_date, event_time, responsible_party, status")
        .eq("festival_id", festivalId)
        .gte("event_date", today)
        .neq("status", "done")
        .order("event_date").order("event_time", { nullsFirst: false }).limit(5);
      return (data ?? []) as Array<{ id: string; title: string; event_date: string; event_time: string | null; responsible_party: string; status: string }>;
    },
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  const events = data ?? [];

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold inline-flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Operations next-up
        </h2>
        <Link to={`/festivals/${slug}/timeline`} className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
          View full timeline <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming timeline events.</p>
      ) : (
        <div className="space-y-1.5">
          {events.map(ev => (
            <Link key={ev.id} to={`/festivals/${slug}/timeline?event=${ev.id}`}
              className="flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50">
              <span className="text-xs text-muted-foreground tabular-nums w-24 shrink-0">{fmtDate(ev.event_date)}</span>
              <span className="font-mono text-[10px] text-muted-foreground w-12 shrink-0">{countdown(ev.event_date)}</span>
              <span className="flex-1 truncate">{ev.title}</span>
              <Badge className={cn("text-[10px]", PARTY_BADGE[ev.responsible_party])}>{PARTY_LABEL[ev.responsible_party]}</Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
