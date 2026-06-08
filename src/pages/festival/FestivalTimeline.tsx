import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { formatDateRange } from "@/lib/dateFormat";
import {
  Plus, MapPin, Phone, CheckCircle2, Pencil, Trash2, Clock, Truck, Package,
  PlayCircle, Flag, FileDown, ArrowLeft, AlarmClock, ShieldCheck, Calendar, Hammer,
  Star, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ImportFromPreviousCard, CARD_TABLES } from "@/components/festival/ImportFromPreviousCard";
import { useDraftMode } from "@/hooks/useDraftMode";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";

type Event = {
  id: string;
  festival_id: string;
  event_type: string;
  event_date: string;
  event_time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  responsible_party: string;
  title: string;
  notes: string | null;
  linked_supplier_name: string | null;
  supplier_contact_phone: string | null;
  status: string;
  concepts_involved: string[] | null;
  confirmed_at: string | null;
  completed_at: string | null;
};

const EVENT_TYPES = [
  "load_soborg","drive_to_festival","arrival_on_site","supplier_delivery",
  "setup_start","setup_complete","festival_open","festival_close",
  "wrap_start","wrap_complete","drive_return","pickup","inspection","handover","other",
] as const;

const TYPE_LABEL: Record<string, string> = {
  load_soborg: "Load Søborg", drive_to_festival: "Drive to festival",
  arrival_on_site: "Arrival on site", supplier_delivery: "Supplier delivery",
  setup_start: "Setup start", setup_complete: "Setup complete",
  festival_open: "Festival open", festival_close: "Festival close",
  wrap_start: "Wrap start", wrap_complete: "Wrap complete",
  drive_return: "Drive return", pickup: "Pickup",
  inspection: "Inspection", handover: "Handover", other: "Other",
};

const TYPE_ICON: Record<string, any> = {
  load_soborg: Package, drive_to_festival: Truck, arrival_on_site: Flag,
  supplier_delivery: Package, setup_start: PlayCircle, setup_complete: CheckCircle2,
  festival_open: Star, festival_close: Star, wrap_start: Hammer,
  wrap_complete: CheckCircle2, drive_return: Truck, pickup: Package,
  inspection: ShieldCheck, handover: Flag, other: Clock,
};

const TYPE_ACCENT: Record<string, { bg: string; text: string }> = {
  load_soborg:       { bg: "bg-emerald-100", text: "text-emerald-700" },
  drive_to_festival: { bg: "bg-blue-100",    text: "text-blue-700" },
  arrival_on_site:   { bg: "bg-emerald-100", text: "text-emerald-700" },
  supplier_delivery: { bg: "bg-amber-100",   text: "text-amber-700" },
  setup_start:       { bg: "bg-emerald-100", text: "text-emerald-700" },
  setup_complete:    { bg: "bg-emerald-100", text: "text-emerald-700" },
  festival_open:     { bg: "bg-amber-100",   text: "text-amber-700" },
  festival_close:    { bg: "bg-amber-100",   text: "text-amber-700" },
  wrap_start:        { bg: "bg-rose-100",    text: "text-rose-700" },
  wrap_complete:     { bg: "bg-rose-100",    text: "text-rose-700" },
  drive_return:      { bg: "bg-blue-100",    text: "text-blue-700" },
  pickup:            { bg: "bg-slate-100",  text: "text-slate-700" },
  inspection:        { bg: "bg-violet-100",  text: "text-violet-700" },
  handover:          { bg: "bg-slate-100",  text: "text-slate-700" },
  other:             { bg: "bg-slate-100",  text: "text-slate-700" },
};

const PARTY_LABEL: Record<string, string> = {
  fish_project: "Fish Project", fidibus: "Fidibus", festival: "Festival",
  supplier: "Supplier", mixed: "Mixed",
};

const STATUS_BADGE: Record<string, string> = {
  planned: "bg-muted text-muted-foreground border",
  confirmed: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  in_progress: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  done: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  delayed: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

function getPhase(t: string): "setup" | "festival" | "wrap" | "other" {
  if (["load_soborg","drive_to_festival","arrival_on_site","supplier_delivery","setup_start","setup_complete"].includes(t)) return "setup";
  if (["festival_open","festival_close"].includes(t)) return "festival";
  if (["wrap_start","wrap_complete","drive_return","pickup"].includes(t)) return "wrap";
  return "other";
}

function fmtDateHeader(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function fmtTime(isoTime: string | null) {
  if (!isoTime) return "";
  return isoTime.slice(0, 5);
}

function computeEventStatus(eventDate: string, today: string): "upcoming" | "today" | "past" {
  if (eventDate === today) return "today";
  if (eventDate < today) return "past";
  return "upcoming";
}

const EMPTY_FORM: Partial<Event> = {
  event_type: "other", title: "", event_date: "", event_time: "",
  end_date: "", end_time: "", location: "", responsible_party: "fish_project",
  status: "planned", notes: "", linked_supplier_name: "", supplier_contact_phone: "",
};

export default function FestivalTimeline() {
  const { draftMode } = useDraftMode();
  const { slug = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const [phaseFilter, setPhaseFilter] = useState<string>(searchParams.get("phase") ?? "all");
  const [hideDone, setHideDone] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Event> | null>(null);

  const festivalQ = useQuery({
    queryKey: ["festival", slug],
    queryFn: async () => {
      const { data } = await supabase.from("festivals").select("id, name, slug, start_date, end_date").eq("slug", slug).single();
      return data;
    },
  });
  const festivalId = festivalQ.data?.id as string | undefined;

  const eventsQ = useQuery({
    queryKey: ["timeline-events", festivalId, draftMode],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("festival_timeline_event")
        .select("*").eq("festival_id", festivalId).eq("is_draft", draftMode)
        .order("event_date").order("event_time", { nullsFirst: false });
      return (data ?? []) as Event[];
    },
  });

  // Fetch contracts to know which concepts are active (for is_active filter)
  const contractsQ = useQuery({
    queryKey: ["festival-contracts-active", festivalId, draftMode],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select("id, is_active, concepts!concept_id(slug, name)")
        .eq("festival_id", festivalId!);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const map = new Map<string, { isActive: boolean; slug: string; name: string }>();
      rows.forEach((r) => {
        const c = r.concepts;
        if (c?.slug) {
          map.set(c.slug, { isActive: r.is_active !== false, slug: c.slug, name: c.name });
        }
      });
      return map;
    },
  });

  // Realtime
  useEffect(() => {
    if (!festivalId) return;
    const ch = supabase.channel(`timeline-${festivalId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_timeline_event", filter: `festival_id=eq.${festivalId}` },
        () => qc.invalidateQueries({ queryKey: ["timeline-events", festivalId, draftMode] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [festivalId, qc]);

  const events = eventsQ.data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const summary = useMemo(() => {
    const upcoming = events.filter((e) => computeEventStatus(e.event_date, today) === "upcoming").length;
    const past = events.filter((e) => computeEventStatus(e.event_date, today) === "past").length;
    const todayCount = events.filter((e) => computeEventStatus(e.event_date, today) === "today").length;
    return { total: events.length, upcoming, past, today: todayCount };
  }, [events, today]);

  const filtered = useMemo(() => events.filter(e => {
    if (hideDone && e.status === "done") return false;
    if (phaseFilter !== "all" && getPhase(e.event_type) !== phaseFilter) return false;
    return true;
  }), [events, phaseFilter, hideDone]);

  const grouped = useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const e of filtered) {
      if (!m.has(e.event_date)) m.set(e.event_date, []);
      m.get(e.event_date)!.push(e);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const phaseRanges = useMemo(() => {
    const groupBy = (p: string) => events.filter(e => getPhase(e.event_type) === p);
    const range = (arr: Event[]) => arr.length ? { from: arr[0].event_date, to: arr[arr.length-1].end_date ?? arr[arr.length-1].event_date } : null;
    return {
      setup: range(groupBy("setup")),
      festival: range(groupBy("festival")),
      wrap: range(groupBy("wrap")),
    };
  }, [events]);

  const confirmedCount = events.filter(e => e.status === "confirmed" || e.status === "done").length;

  async function saveEvent(form: Partial<Event>) {
    const payload: any = {
      festival_id: festivalId,
      event_type: form.event_type,
      title: form.title,
      event_date: form.event_date,
      event_time: form.event_time || null,
      end_date: form.end_date || null,
      end_time: form.end_time || null,
      location: form.location || null,
      responsible_party: form.responsible_party,
      status: form.status,
      notes: form.notes || null,
      linked_supplier_name: form.linked_supplier_name || null,
      supplier_contact_phone: form.supplier_contact_phone || null,
    };
    if (!payload.title || !payload.event_date) {
      toast({ title: "Title and date are required", variant: "destructive" }); return;
    }
    if (form.id) {
      const { error } = await (supabase as any).from("festival_timeline_event").update(payload).eq("id", form.id);
      if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await (supabase as any).from("festival_timeline_event").insert(payload);
      if (error) { toast({ title: "Create failed", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: form.id ? "Event updated" : "Event created" });
    setDrawerOpen(false); setEditing(null);
    qc.invalidateQueries({ queryKey: ["timeline-events", festivalId, draftMode] });
  }

  async function quickUpdate(id: string, patch: Partial<Event>) {
    const { error } = await (supabase as any).from("festival_timeline_event").update(patch).eq("id", id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["timeline-events", festivalId, draftMode] });
  }

  async function deleteEvent(id: string) {
    if (!confirm("Delete this event?")) return;
    const { error } = await (supabase as any).from("festival_timeline_event").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Event deleted" });
    qc.invalidateQueries({ queryKey: ["timeline-events", festivalId, draftMode] });
  }

  if (festivalQ.isLoading || !festivalQ.data) return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <Skeleton className="h-32 w-full" />
    </div>
  );
  const f = festivalQ.data;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">

      <ImportFromPreviousCard
        cardLabel="timeline"
        tables={CARD_TABLES.timeline}
        currentFestivalId={festivalId ?? ""}
        onCommitted={() => window.location.reload()}
      />
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
          <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> {f.name}
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/festivals/${slug}/timeline/export`}>
                <FileDown className="h-4 w-4 mr-1" /> PDF
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Calendar className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Timeline</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Chronological timeline of festival events. Setup phases live on the Setup page; this view shows everything in one stream.
        </p>
      </div>

      {/* Summary pills */}
      {summary.total > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
            {summary.total} event{summary.total === 1 ? "" : "s"}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30">
            {summary.upcoming} upcoming
          </span>
          <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
            {summary.past} past
          </span>
          {summary.today > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">
              {summary.today} today
            </span>
          )}
          {confirmedCount > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              {confirmedCount} confirmed
            </span>
          )}
        </div>
      )}

      {/* Phase swim-lanes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PhaseLane label="Setup" range={phaseRanges.setup} icon={Wrench} accent="emerald" />
        <PhaseLane label="Festival" range={phaseRanges.festival} icon={Star} accent="amber" />
        <PhaseLane label="Wrap" range={phaseRanges.wrap} icon={Hammer} accent="rose" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {["all","setup","festival","wrap"].map(p => (
          <button
            key={p}
            onClick={() => { setPhaseFilter(p); setSearchParams(prev => { const sp = new URLSearchParams(prev); if (p === "all") sp.delete("phase"); else sp.set("phase", p); return sp; }); }}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              phaseFilter === p
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-input hover:bg-accent"
            )}
          >
            {p === "all" ? "All" : p}
          </button>
        ))}
        <label className="ml-2 text-sm flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={e => setHideDone(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-muted-foreground accent-primary"
          />
          <span className="text-muted-foreground">Hide done</span>
        </label>
      </div>

      {/* Vertical timeline */}
      {eventsQ.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground space-y-4">
          <div className="flex items-center justify-center">
            <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
              <Calendar className="h-6 w-6" />
            </div>
          </div>
          <p>No events yet. Add the first one to start building the timeline.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([date, list]) => {
            const isToday = date === today;
            const isPast = date < today;
            return (
              <div key={date}>
                <div className={cn(
                  "flex items-center gap-3 mb-3",
                  isToday ? "text-destructive" : isPast ? "text-muted-foreground" : "text-foreground"
                )}>
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border",
                    isToday
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
                      : isPast
                        ? "bg-muted border text-muted-foreground"
                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                  )}>
                    {new Date(date + "T00:00:00").getDate()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{fmtDateHeader(date)}</div>
                    {isToday && <div className="text-[10px] uppercase tracking-wider text-rose-600 font-semibold">Today</div>}
                  </div>
                </div>
                <div className="space-y-3">
                  {list.map(ev => {
                    const Icon = TYPE_ICON[ev.event_type] ?? Clock;
                    const accent = TYPE_ACCENT[ev.event_type] ?? TYPE_ACCENT.other;
                    const compStatus = computeEventStatus(ev.event_date, today);
                    const contractMap = contractsQ.data;
                    const linkedConcepts = (ev.concepts_involved ?? []).map((slug: string) => contractMap?.get(slug));
                    const hasDisabledConcept = linkedConcepts.some((c: any) => c && !c.isActive);
                    const allInactive = linkedConcepts.length > 0 && linkedConcepts.every((c: any) => c && !c.isActive);
                    const muted = ev.status === "done" || allInactive;

                    return (
                      <div key={ev.id}
                        className={cn(
                          "rounded-2xl border bg-card p-6 transition-shadow hover:shadow-sm",
                          muted && "opacity-60",
                        )}>
                        <div className="flex items-start gap-4">
                          <div className={cn(
                            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                            accent.bg, accent.text
                          )}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{ev.title}</span>
                              <span className={cn("text-[10px] uppercase font-semibold px-2 py-0.5 rounded border", STATUS_BADGE[ev.status] ?? STATUS_BADGE.planned)}>
                                {ev.status}
                              </span>
                              {compStatus === "today" && (
                                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">Today</span>
                              )}
                              {compStatus === "upcoming" && (
                                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30">Upcoming</span>
                              )}
                              {compStatus === "past" && (
                                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">Past</span>
                              )}
                              {hasDisabledConcept && (
                                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">Disabled concept</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap mt-1.5 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                <Clock className="h-3 w-3" />
                                {fmtTime(ev.event_time) || "All day"}
                                {ev.end_time && ` – ${fmtTime(ev.end_time)}`}
                              </span>
                              <span className="text-muted-foreground/60">·</span>
                              <Badge variant="outline" className="text-[10px] font-normal">{TYPE_LABEL[ev.event_type] ?? ev.event_type}</Badge>
                              <Badge variant="secondary" className="text-[10px] font-normal">{PARTY_LABEL[ev.responsible_party]}</Badge>
                              {ev.location && (
                                <>
                                  <span className="text-muted-foreground/60">·</span>
                                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location}</span>
                                </>
                              )}
                            </div>
                            {ev.linked_supplier_name && (
                              <div className="text-xs text-muted-foreground mt-1.5 inline-flex items-center gap-2">
                                <Package className="h-3 w-3" /> {ev.linked_supplier_name}
                                {ev.supplier_contact_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{ev.supplier_contact_phone}</span>}
                              </div>
                            )}
                            {ev.notes && <p className="text-xs text-muted-foreground mt-1.5 italic">{ev.notes}</p>}
                            {linkedConcepts.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {linkedConcepts.map((c: any, i: number) => (
                                  c && (
                                    <span key={i} className={cn(
                                      "text-[10px] px-2 py-0.5 rounded-full border",
                                      c.isActive
                                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700 line-through"
                                    )}>
                                      {c.name}
                                    </span>
                                  )
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0 print:hidden">
                            {ev.status !== "done" && (
                              <Button size="sm" variant="ghost" title="Mark done"
                                onClick={() => quickUpdate(ev.id, { status: "done", completed_at: new Date().toISOString() } as any)}>
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              </Button>
                            )}
                            {ev.status === "planned" && (
                              <Button size="sm" variant="ghost" title="Confirm"
                                onClick={() => quickUpdate(ev.id, { status: "confirmed", confirmed_at: new Date().toISOString() } as any)}>
                                <ShieldCheck className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" title="Delay"
                              onClick={() => {
                                const nd = prompt("New date (YYYY-MM-DD):", ev.event_date);
                                if (!nd) return;
                                const reason = prompt("Reason (optional):") || "";
                                quickUpdate(ev.id, { event_date: nd, status: "delayed", notes: [ev.notes, reason && `Delayed: ${reason}`].filter(Boolean).join(" · ") } as any);
                              }}>
                              <AlarmClock className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Edit" onClick={() => { setEditing(ev); setDrawerOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Delete" onClick={() => deleteEvent(ev.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add event */}
      <button
        onClick={() => { setEditing({ ...EMPTY_FORM, event_date: f.start_date }); setDrawerOpen(true); }}
        className="w-full rounded-2xl border-2 border-dashed border-border py-4 text-sm text-muted-foreground hover:bg-muted/30 transition flex items-center justify-center gap-2 print:hidden"
      >
        <Plus className="h-4 w-4" /> Add event
      </button>

      {/* Add/Edit drawer */}
      <Sheet open={drawerOpen} onOpenChange={(o) => { setDrawerOpen(o); if (!o) setEditing(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing?.id ? "Edit event" : "New event"}</SheetTitle>
          </SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <Field label="Type">
                <Select value={editing.event_type} onValueChange={v => setEditing({ ...editing, event_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Title"><Input value={editing.title ?? ""} onChange={e => setEditing({ ...editing, title: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date"><Input type="date" value={editing.event_date ?? ""} onChange={e => setEditing({ ...editing, event_date: e.target.value })} /></Field>
                <Field label="Time"><Input type="time" value={editing.event_time ?? ""} onChange={e => setEditing({ ...editing, event_time: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="End date"><Input type="date" value={editing.end_date ?? ""} onChange={e => setEditing({ ...editing, end_date: e.target.value })} /></Field>
                <Field label="End time"><Input type="time" value={editing.end_time ?? ""} onChange={e => setEditing({ ...editing, end_time: e.target.value })} /></Field>
              </div>
              <Field label="Location"><Input value={editing.location ?? ""} onChange={e => setEditing({ ...editing, location: e.target.value })} /></Field>
              <Field label="Responsible">
                <Select value={editing.responsible_party} onValueChange={v => setEditing({ ...editing, responsible_party: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PARTY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Supplier name"><Input value={editing.linked_supplier_name ?? ""} onChange={e => setEditing({ ...editing, linked_supplier_name: e.target.value })} /></Field>
                <Field label="Supplier phone"><Input value={editing.supplier_contact_phone ?? ""} onChange={e => setEditing({ ...editing, supplier_contact_phone: e.target.value })} /></Field>
              </div>
              <Field label="Status">
                <Select value={editing.status} onValueChange={v => setEditing({ ...editing, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["planned","confirmed","in_progress","done","delayed","cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Notes"><Textarea value={editing.notes ?? ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={3} /></Field>
            </div>
          )}
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => { setDrawerOpen(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={() => editing && saveEvent(editing)}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PhaseLane({ label, range, icon: Icon, accent }: { label: string; range: { from: string; to: string } | null; icon: any; accent: "emerald" | "amber" | "rose" | "blue" | "slate" }) {
  const accentCls: Record<string, string> = {
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
    amber:   "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300",
    rose:    "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300",
    blue:    "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300",
    slate:   "bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <div className={cn("rounded-2xl border p-4 text-sm", accentCls[accent])}>
      <div className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-[11px] opacity-80 mt-1">{range ? formatDateRange(range.from, range.to) : "—"}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <FestivalBackBar />
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
