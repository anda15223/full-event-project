import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Calendar as CalendarIcon, MapPin, Clock, Tent } from "lucide-react";
import { cn } from "@/lib/utils";

type Event = {
  id: string; festival_id: string; event_type: string; event_date: string;
  event_time: string | null; end_date: string | null; location: string | null;
  responsible_party: string; title: string; status: string; linked_supplier_name: string | null;
};
type Festival = { id: string; name: string; slug: string; start_date: string; end_date: string };

const PARTY_BORDER: Record<string, string> = {
  fish_project: "border-l-blue-500", fidibus: "border-l-emerald-500",
  festival: "border-l-purple-500", supplier: "border-l-orange-500", mixed: "border-l-cyan-500",
};
const STATUS_BADGE: Record<string, string> = {
  planned: "bg-muted text-muted-foreground", confirmed: "bg-blue-500/10 text-blue-700",
  in_progress: "bg-amber-500/10 text-amber-700", done: "bg-emerald-500/10 text-emerald-700",
  delayed: "bg-orange-500/10 text-orange-700", cancelled: "bg-destructive/10 text-destructive",
};
const TYPE_LABEL: Record<string, string> = {
  load_soborg: "Load Søborg", drive_to_festival: "Drive", arrival_on_site: "Arrival",
  supplier_delivery: "Delivery", setup_start: "Setup start", setup_complete: "Setup done",
  festival_open: "Open", festival_close: "Close", wrap_start: "Wrap start",
  wrap_complete: "Wrap done", drive_return: "Return drive", pickup: "Pickup",
  inspection: "Inspection", handover: "Handover", other: "Other",
};

function getPhase(t: string) {
  if (["festival_open","festival_close"].includes(t)) return "festival";
  if (["wrap_start","wrap_complete","drive_return","pickup"].includes(t)) return "wrap";
  return "setup";
}

function weekKey(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay(); const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function countdown(iso: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(iso + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff > 0) return `T-${diff}`;
  return `+${-diff}d`;
}

export default function GlobalTimeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const partyFilter = searchParams.get("party") ?? "all";
  const phaseFilter = searchParams.get("phase") ?? "all";

  const festivalsQ = useQuery({
    queryKey: ["timeline-festivals"],
    queryFn: async () => {
      const { data } = await supabase.from("festivals").select("id, name, slug, start_date, end_date").order("start_date");
      return (data ?? []) as Festival[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["timeline-events-global"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("festival_timeline_event")
        .select("*").order("event_date").order("event_time", { nullsFirst: false });
      return (data ?? []) as Event[];
    },
  });

  const fById = useMemo(() => new Map((festivalsQ.data ?? []).map(f => [f.id, f])), [festivalsQ.data]);
  const all = eventsQ.data ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const next7 = (() => { const d = new Date(); d.setDate(d.getDate()+7); return d.toISOString().slice(0,10); })();
  const next14 = (() => { const d = new Date(); d.setDate(d.getDate()+14); return d.toISOString().slice(0,10); })();
  const next30 = (() => { const d = new Date(); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10); })();

  const thisWeek = all.filter(e => e.status !== "done" && e.event_date >= today && e.event_date <= next7);
  const next30Count = all.filter(e => e.event_date >= today && e.event_date <= next30).length;
  const unconfirmed = all.filter(e => e.status === "planned" && e.event_date < next14 && e.event_date >= today);

  // Conflict detection: same responsible party with overlapping setup/wrap across festivals
  const conflicts = useMemo(() => {
    const setupWrap = all.filter(e => getPhase(e.event_type) !== "festival" && e.responsible_party !== "festival" && e.responsible_party !== "supplier");
    const out: string[] = [];
    for (let i = 0; i < setupWrap.length; i++) {
      for (let j = i+1; j < setupWrap.length; j++) {
        const a = setupWrap[i]; const b = setupWrap[j];
        if (a.festival_id === b.festival_id) continue;
        if (a.responsible_party !== b.responsible_party) continue;
        if (a.event_date === b.event_date) {
          const fa = fById.get(a.festival_id)?.name ?? "?";
          const fb = fById.get(b.festival_id)?.name ?? "?";
          out.push(`${fa} (${a.title}) overlaps ${fb} (${b.title}) on ${fmtDate(a.event_date)} — both ${a.responsible_party}`);
        }
      }
    }
    return Array.from(new Set(out)).slice(0, 5);
  }, [all, fById]);

  const filtered = all.filter(e => {
    if (e.status === "done") return false;
    if (e.event_date < today) return false;
    if (partyFilter !== "all" && e.responsible_party !== partyFilter) return false;
    if (phaseFilter !== "all" && getPhase(e.event_type) !== phaseFilter) return false;
    return true;
  });

  const grouped = useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const e of filtered) {
      const k = weekKey(e.event_date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const setParam = (k: string, v: string) => setSearchParams(prev => {
    const sp = new URLSearchParams(prev); if (v === "all") sp.delete(k); else sp.set(k, v); return sp;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-heading font-bold">Operations Timeline</h1>
        <p className="text-sm text-muted-foreground">All events across all festivals</p>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tile color="bg-red-500/10 text-red-700 border-red-500/30" label="🚨 This week (open)" value={thisWeek.length} />
        <Tile color="bg-blue-500/10 text-blue-700 border-blue-500/30" label="📅 Next 30 days" value={next30Count} />
        <Tile color="bg-orange-500/10 text-orange-700 border-orange-500/30" label="⚠️ Unconfirmed (next 14d)" value={unconfirmed.length} />
      </div>

      {conflicts.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800">
          <div className="font-semibold flex items-center gap-1 mb-1"><AlertTriangle className="h-4 w-4" /> Conflict warnings</div>
          <ul className="list-disc ml-5 space-y-0.5">
            {conflicts.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center text-sm">
        <span className="text-muted-foreground">Phase:</span>
        {["all","setup","festival","wrap"].map(p => (
          <Button key={p} size="sm" variant={phaseFilter === p ? "default" : "outline"} onClick={() => setParam("phase", p)} className="capitalize">{p}</Button>
        ))}
        <span className="ml-3 text-muted-foreground">Party:</span>
        {["all","fish_project","fidibus","festival","supplier","mixed"].map(p => (
          <Button key={p} size="sm" variant={partyFilter === p ? "default" : "outline"} onClick={() => setParam("party", p)}>
            {p === "all" ? "all" : p.replace("_"," ")}
          </Button>
        ))}
      </div>

      {(festivalsQ.isLoading || eventsQ.isLoading) ? <Skeleton className="h-96 w-full" /> : grouped.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No upcoming events match filters.</div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([week, list]) => (
            <div key={week}>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 sticky top-14 bg-background py-1">
                Week of {fmtDate(week)}
              </div>
              <div className="space-y-2">
                {list.map(ev => {
                  const f = fById.get(ev.festival_id);
                  return (
                    <Link key={ev.id} to={f ? `/festivals/${f.slug}/timeline?event=${ev.id}` : "/timeline"}
                      className={cn("block rounded-lg border bg-card p-3 border-l-4 hover:shadow-sm transition", PARTY_BORDER[ev.responsible_party])}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{ev.title}</span>
                        {f && <Badge variant="outline" className="text-[10px] inline-flex items-center gap-1"><Tent className="h-3 w-3" />{f.name}</Badge>}
                        <Badge variant="secondary" className="text-[10px]">{TYPE_LABEL[ev.event_type] ?? ev.event_type}</Badge>
                        <Badge className={cn("text-[10px]", STATUS_BADGE[ev.status])}>{ev.status}</Badge>
                        <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" /> {fmtDate(ev.event_date)}
                          {ev.event_time && <><Clock className="h-3 w-3 ml-1" />{ev.event_time.slice(0,5)}</>}
                          <span className="ml-2 font-mono">{countdown(ev.event_date)}</span>
                        </span>
                      </div>
                      {ev.location && <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location}</div>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className={cn("rounded-lg border p-4", color)}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
