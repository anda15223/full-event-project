import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardOverview, useActivityFeed, type DashboardItem, type FestivalGridItem } from "@/hooks/useDashboardOverview";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateRange } from "@/lib/dateFormat";
import {
  AlertOctagon, CalendarClock, Flame, CheckCircle2, ArrowRight, Tent,
  Plus, HelpCircle, Contact as ContactIcon, Inbox, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

function priorityDot(p?: string) {
  const cls =
    p === "critical" ? "bg-destructive" :
    p === "high" ? "bg-orange-500" :
    p === "medium" ? "bg-amber-500" :
    p === "low" ? "bg-muted-foreground/40" :
    "bg-muted-foreground/40";
  return <span className={`h-2 w-2 rounded-full shrink-0 ${cls}`} />;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function countdownChip(days: number) {
  if (days < 0) return { label: "Past", cls: "bg-muted text-muted-foreground line-through" };
  if (days <= 7) return { label: `T-${days}d`, cls: "bg-destructive/10 text-destructive font-semibold" };
  if (days <= 21) return { label: `T-${days}d`, cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300 font-semibold" };
  if (days <= 60) return { label: `T-${days}d`, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
  return { label: `T-${days}d`, cls: "bg-secondary text-foreground/70" };
}

function ItemRow({ item, festivalSlug, withDaysOverdue }: { item: DashboardItem; festivalSlug?: string; withDaysOverdue?: boolean }) {
  const navigate = useNavigate();
  const href = item.type === "question"
    ? festivalSlug ? `/festivals/${festivalSlug}/questions` : "/questions"
    : item.type === "timeline_event"
    ? festivalSlug ? `/festivals/${festivalSlug}/timeline` : "/timeline"
    : festivalSlug ? `/festivals/${festivalSlug}/actions` : "/actions";
  return (
    <button
      onClick={() => navigate(href)}
      className="w-full flex items-center gap-2 text-left p-2 rounded-lg hover:bg-muted/50 transition-colors text-[13px]"
    >
      {priorityDot(item.priority)}
      <span className="truncate flex-1">{item.title}</span>
      {festivalSlug && <Badge variant="outline" className="text-[10px] shrink-0">{festivalSlug.split("-")[0]}</Badge>}
      {withDaysOverdue && item.days_overdue !== undefined && (
        <span className="text-[11px] font-semibold text-destructive shrink-0">{item.days_overdue}d</span>
      )}
    </button>
  );
}

function StripCard({
  title, icon: Icon, items, festivalSlugs, tone, withDaysOverdue, emptyHint,
}: {
  title: string; icon: any; items: DashboardItem[]; festivalSlugs: Record<string, string>;
  tone: "red" | "amber" | "orange"; withDaysOverdue?: boolean; emptyHint?: string;
}) {
  const toneCls =
    tone === "red" ? "border-destructive/30" :
    tone === "amber" ? "border-amber-500/30" :
    "border-orange-500/30";
  const headCls =
    tone === "red" ? "text-destructive" :
    tone === "amber" ? "text-amber-600" :
    "text-orange-600";
  const visible = items.slice(0, 5);
  return (
    <Card className={`p-4 ${toneCls}`}>
      <div className={`flex items-center gap-2 mb-3 text-sm font-semibold ${headCls}`}>
        <Icon className="h-4 w-4" />
        <span className="flex-1">{title}</span>
        <span className="text-xs tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{emptyHint ?? "Nothing here."}</p>
      ) : (
        <div className="space-y-0.5">
          {visible.map((it) => (
            <ItemRow key={`${it.type}-${it.id}`} item={it} festivalSlug={it.festival_id ? festivalSlugs[it.festival_id] : undefined} withDaysOverdue={withDaysOverdue} />
          ))}
          {items.length > 5 && (
            <div className="text-[11px] text-muted-foreground px-2 pt-1">+ {items.length - 5} more</div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function DashboardHome() {
  const { data, isLoading } = useDashboardOverview();
  const { data: activity = [] } = useActivityFeed(10);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Realtime invalidation
  useEffect(() => {
    const ch = supabase
      .channel("dashboard-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_action_items" }, () => queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_open_questions" }, () => queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_timeline_event" }, () => queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_contracts" }, () => queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const festivalSlugs = useMemo(() => {
    const m: Record<string, string> = {};
    (data?.festival_grid ?? []).forEach((f) => { m[f.id] = f.slug; });
    return m;
  }, [data]);

  const overdue = [...(data?.overdue_actions ?? []), ...(data?.overdue_questions ?? [])].sort(
    (a, b) => (b.days_overdue ?? 0) - (a.days_overdue ?? 0)
  );
  const dueToday = [...(data?.due_today_actions ?? []), ...(data?.due_today_questions ?? []), ...(data?.due_today_events ?? [])];
  const critical = [...(data?.critical_actions ?? []), ...(data?.critical_questions ?? [])];

  const allClear = overdue.length === 0 && dueToday.length === 0 && critical.length === 0;

  // Spotlight: closest upcoming festival
  const spotlight = (data?.festival_grid ?? []).find((f) => f.countdown_days >= 0);

  const today = new Date();
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekRange = formatDateRange(today, weekEnd);

  // Group this-week actions by festival
  const weekByFestival = useMemo(() => {
    const m: Record<string, DashboardItem[]> = {};
    (data?.this_week_actions ?? []).forEach((a) => {
      const slug = a.festival_id ? festivalSlugs[a.festival_id] : "unassigned";
      (m[slug] ??= []).push(a);
    });
    return m;
  }, [data, festivalSlugs]);

  const upcoming = (data?.festival_grid ?? []).filter((f) => f.countdown_days >= 0);
  const past = (data?.festival_grid ?? []).filter((f) => f.countdown_days < 0);

  const markActionDone = async (id: string) => {
    const { error } = await supabase.from("festival_action_items")
      .update({ status: "closed", completed_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Marked done"); queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] }); }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Today</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
      </div>

      {/* STRIP 1 — TODAY */}
      {allClear ? (
        <Card className="p-4 border-success/30 bg-success/5">
          <div className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" />
            Nothing on fire — nice work.
          </div>
        </Card>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 p-3 rounded-xl ${overdue.length || critical.length ? "bg-destructive/5" : ""}`}>
          <StripCard title="Overdue" icon={AlertOctagon} items={overdue} festivalSlugs={festivalSlugs} tone="red" withDaysOverdue emptyHint="Nothing overdue 🎉" />
          <StripCard title="Due today" icon={CalendarClock} items={dueToday} festivalSlugs={festivalSlugs} tone="amber" emptyHint="Nothing due today" />
          <StripCard title="Critical (no deadline)" icon={Flame} items={critical} festivalSlugs={festivalSlugs} tone="orange" emptyHint="No floating criticals" />
        </div>
      )}

      {/* STRIP 2 — Spotlight */}
      {spotlight && (
        <Card className="p-5 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
          <Link to={`/festivals/${spotlight.slug}`} className="flex items-center justify-between gap-4 group">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary font-semibold mb-1">
                <Sparkles className="h-3.5 w-3.5" /> Closest festival
              </div>
              <h2 className="text-xl font-heading font-bold group-hover:text-primary transition-colors">
                🎯 {spotlight.name} — T-{spotlight.countdown_days} days
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{formatDateRange(spotlight.start_date, spotlight.end_date)}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Link to={`/festivals/${spotlight.slug}/power`} className="text-xs p-2.5 rounded-lg bg-white/60 hover:bg-white transition-colors">⚡ Power</Link>
            <Link to={`/festivals/${spotlight.slug}/cooling`} className="text-xs p-2.5 rounded-lg bg-white/60 hover:bg-white transition-colors">❄️ Cooling</Link>
            <Link to={`/festivals/${spotlight.slug}/facade`} className="text-xs p-2.5 rounded-lg bg-white/60 hover:bg-white transition-colors">🎨 Façade</Link>
            <Link to={`/festivals/${spotlight.slug}/safety`} className="text-xs p-2.5 rounded-lg bg-white/60 hover:bg-white transition-colors">🛡️ Safety</Link>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{spotlight.open_actions} open action items · {spotlight.critical_count} critical</span>
            <Link to={`/festivals/${spotlight.slug}/actions`} className="text-primary font-medium hover:underline">View all →</Link>
          </div>
        </Card>
      )}

      {/* STRIP 3 — This week */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">📅 This week — {weekRange}</h2>
          <Link to="/timeline" className="text-xs text-primary hover:underline">Timeline →</Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Action items</h3>
            {Object.keys(weekByFestival).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing due this week.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(weekByFestival).map(([slug, items]) => (
                  <div key={slug}>
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">{slug}</div>
                    {items.slice(0, 4).map((it) => (
                      <ItemRow key={it.id} item={it} festivalSlug={slug} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Timeline events</h3>
            {(data?.this_week_events ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
            ) : (
              <div className="space-y-1">
                {(data?.this_week_events ?? []).map((e: any) => (
                  <button
                    key={e.id}
                    onClick={() => navigate(`/festivals/${festivalSlugs[e.festival_id]}/timeline`)}
                    className="w-full text-left p-2 rounded-lg hover:bg-muted/50 text-[13px] flex items-center gap-2"
                  >
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">{e.event_date.slice(5)}</span>
                    <span className="flex-1 truncate">{e.title}</span>
                    <Badge variant="outline" className="text-[10px]">{e.responsible_party}</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Question deadlines</h3>
            {(data?.this_week_questions ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No question deadlines.</p>
            ) : (
              <div className="space-y-1">
                {(data?.this_week_questions ?? []).map((q: any) => (
                  <ItemRow key={q.id} item={{ ...q, type: "question" }} festivalSlug={festivalSlugs[q.festival_id]} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* STRIP 4 — Festival grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">🏔️ All festivals — 2026 season</h2>
          <Link to="/festivals" className="text-xs text-primary hover:underline">All →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {upcoming.map((f) => (
            <FestivalCard key={f.id} f={f} />
          ))}
        </div>
        {past.length > 0 && (
          <details className="mt-4">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Past festivals ({past.length})</summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
              {past.map((f) => <FestivalCard key={f.id} f={f} />)}
            </div>
          </details>
        )}
      </section>

      {/* STRIP 5 — Intelligence */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-3">Recent activity</h3>
          {activity.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent changes.</p>
          ) : (
            <div className="space-y-1">
              {activity.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px] py-1.5 border-b border-border/30 last:border-0">
                  <Badge variant="outline" className="text-[10px] shrink-0">{a.kind}</Badge>
                  <span className="flex-1 truncate">{a.label}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(a.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Quick stats</h3>
          {data && (
            <div className="space-y-2 text-[13px]">
              <StatRow label="📋 Open action items" value={`${data.stats.open_actions_total} (${data.stats.open_actions_week} this week, ${data.stats.critical_actions} critical)`} />
              <StatRow label="❓ Open questions" value={`${data.stats.open_questions_total} (${data.stats.critical_questions} critical)`} />
              <StatRow label="📑 Contracts signed" value={`${data.stats.contracts_signed} / ${data.stats.contracts_total}`} />
              <StatRow label="📜 Active rules" value={data.stats.active_rules} />
              <StatRow label="📇 Total contacts" value={data.stats.total_contacts} />
              <StatRow label="🚨 Stalled contracts" value={data.stats.stalled_contracts} highlight={data.stats.stalled_contracts > 0} />
            </div>
          )}
        </Card>
      </section>

      {/* Quick actions sticky */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-wrap gap-2 bg-card border border-border shadow-lg rounded-full px-2 py-1.5">
        <Button size="sm" variant="ghost" className="rounded-full h-8" onClick={() => navigate("/actions")}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Action
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full h-8" onClick={() => navigate("/questions")}>
          <HelpCircle className="h-3.5 w-3.5 mr-1" /> Question
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full h-8" onClick={() => navigate("/contacts")}>
          <ContactIcon className="h-3.5 w-3.5 mr-1" /> Contact
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full h-8 opacity-50 cursor-not-allowed" disabled title="Coming next">
          <Inbox className="h-3.5 w-3.5 mr-1" /> Ingest
        </Button>
      </div>
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between p-2 rounded ${highlight ? "bg-destructive/5" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${highlight ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

function FestivalCard({ f }: { f: FestivalGridItem }) {
  const cd = countdownChip(f.countdown_days);
  const tl =
    f.overdue_count > 0 || f.stalled_count > 0 ? "bg-destructive" :
    f.critical_count > 0 ? "bg-amber-500" :
    "bg-success";
  const entities = (f.operating_entities ?? []).filter(Boolean).slice(0, 3);
  return (
    <Link to={`/festivals/${f.slug}`} className="block">
      <Card className="p-3.5 hover:shadow-md hover:border-primary/30 transition-all">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${tl}`} />
              {f.name}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{formatDateRange(f.start_date, f.end_date)}</div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${cd.cls}`}>{cd.label}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{f.open_actions} open · {f.concepts_count} concept{f.concepts_count === 1 ? "" : "s"}</span>
          {f.overdue_count > 0 && <span className="text-destructive font-semibold">{f.overdue_count} overdue</span>}
        </div>
        {entities.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {entities.map((e) => (
              <span key={e} className="text-[10px] px-1.5 py-0.5 bg-secondary rounded">{e.split(" ")[0]}</span>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}
