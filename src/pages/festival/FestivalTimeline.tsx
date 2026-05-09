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
  PlayCircle, Flag, FileDown, ArrowLeft, AlarmClock, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  load_soborg: "Load Soborg", drive_to_festival: "Drive to festival",
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
  festival_open: Flag, festival_close: Flag, wrap_start: PlayCircle,
  wrap_complete: CheckCircle2, drive_return: Truck, pickup: Package,
  inspection: ShieldCheck, handover: Flag, other: Clock,
};

const PARTY_BORDER: Record<string, string> = {
  fish_project: "border-l-blue-500",
  fidibus: "border-l-emerald-500",
  festival: "border-l-purple-500",
  supplier: "border-l-orange-500",
  mixed: "border-l-cyan-500",
};
const PARTY_LABEL: Record<string, string> = {
  fish_project: "Fish Project", fidibus: "Fidibus", festival: "Festival",
  supplier: "Supplier", mixed: "Mixed",
};

const STATUS_BADGE: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  confirmed: "bg-blue-500/10 text-blue-700",
  in_progress: "bg-amber-500/10 text-amber-700",
  done: "bg-emerald-500/10 text-emerald-700",
  delayed: "bg-orange-500/10 text-orange-700",
  cancelled: "bg-destructive/10 text-destructive",
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

const EMPTY_FORM: Partial<Event> = {
  event_type: "other", title: "", event_date: "", event_time: "",
  end_date: "", end_time: "", location: "", responsible_party: "fish_project",
  status: "planned", notes: "", linked_supplier_name: "", supplier_contact_phone: "",
};

export default function FestivalTimeline() {
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
  const festivalId = festivalQ.data?.id;

  const eventsQ = useQuery({
    queryKey: ["timeline-events", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("festival_timeline_event")
        .select("*").eq("festival_id", festivalId)
        .order("event_date").order("event_time", { nullsFirst: false });
      return (data ?? []) as Event[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!festivalId) return;
    const ch = supabase.channel(`timeline-${festivalId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_timeline_event", filter: `festival_id=eq.${festivalId}` },
        () => qc.invalidateQueries({ queryKey: ["timeline-events", festivalId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [festivalId, qc]);

  const events = eventsQ.data ?? [];
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
    qc.invalidateQueries({ queryKey: ["timeline-events", festivalId] });
  }

  async function quickUpdate(id: string, patch: Partial<Event>) {
    const { error } = await (supabase as any).from("festival_timeline_event").update(patch).eq("id", id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["timeline-events", festivalId] });
  }

  async function deleteEvent(id: string) {
    if (!confirm("Delete this event?")) return;
    const { error } = await (supabase as any).from("festival_timeline_event").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Event deleted" });
    qc.invalidateQueries({ queryKey: ["timeline-events", festivalId] });
  }

  if (festivalQ.isLoading || !festivalQ.data) return <Skeleton className="h-96 w-full" />;
  const f = festivalQ.data;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link to={`/festivals/${slug}`} className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to festival
          </Link>
          <h1 className="text-2xl font-heading font-bold mt-1">Operations Timeline — {f.name}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateRange(f.start_date, f.end_date)} · {events.length} events · {confirmedCount} confirmed
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to={`/festivals/${slug}/timeline/export`}><FileDown className="h-4 w-4 mr-1" /> PDF</Link></Button>
          <Button size="sm" onClick={() => { setEditing({ ...EMPTY_FORM, event_date: f.start_date }); setDrawerOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add event
          </Button>
        </div>
      </div>

      {/* Phase swim-lanes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <PhaseLane label="🟦 Setup" range={phaseRanges.setup} color="bg-blue-500/10 border-blue-500/30 text-blue-700" />
        <PhaseLane label="🟩 Festival" range={phaseRanges.festival} color="bg-emerald-500/10 border-emerald-500/30 text-emerald-700" />
        <PhaseLane label="🟧 Wrap" range={phaseRanges.wrap} color="bg-orange-500/10 border-orange-500/30 text-orange-700" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {["all","setup","festival","wrap"].map(p => (
          <Button key={p} size="sm" variant={phaseFilter === p ? "default" : "outline"}
            onClick={() => { setPhaseFilter(p); setSearchParams(prev => { const sp = new URLSearchParams(prev); if (p === "all") sp.delete("phase"); else sp.set("phase", p); return sp; }); }}
            className="capitalize">{p}</Button>
        ))}
        <label className="ml-2 text-sm flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} /> Hide done
        </label>
      </div>

      {/* Vertical timeline */}
      {eventsQ.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No events yet. Add the first one to start building the timeline.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, list]) => {
            const isToday = date === today;
            const isPast = date < today;
            return (
              <div key={date} className="grid grid-cols-[140px_1fr] gap-4">
                <div className={cn(
                  "text-sm font-semibold sticky top-14 self-start py-1",
                  isToday ? "text-destructive" : isPast ? "text-muted-foreground" : "text-foreground",
                )}>
                  {fmtDateHeader(date)}
                  {isToday && <div className="text-[10px] uppercase tracking-wider text-destructive">Today</div>}
                </div>
                <div className="space-y-2">
                  {list.map(ev => {
                    const Icon = TYPE_ICON[ev.event_type] ?? Clock;
                    return (
                      <div key={ev.id}
                        className={cn(
                          "rounded-lg border bg-card p-3 border-l-4 transition-shadow hover:shadow-sm",
                          PARTY_BORDER[ev.responsible_party] ?? "border-l-muted",
                          ev.status === "done" && "opacity-60",
                        )}>
                        <div className="flex items-start gap-2">
                          <Icon className="h-4 w-4 mt-1 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{ev.title}</span>
                              <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[ev.event_type] ?? ev.event_type}</Badge>
                              <Badge className={cn("text-[10px]", STATUS_BADGE[ev.status])}>{ev.status}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{PARTY_LABEL[ev.responsible_party]}</Badge>
                              {ev.event_time && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" />{ev.event_time.slice(0,5)}</span>}
                            </div>
                            {ev.location && <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location}</div>}
                            {ev.linked_supplier_name && (
                              <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-2">
                                <Package className="h-3 w-3" /> {ev.linked_supplier_name}
                                {ev.supplier_contact_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{ev.supplier_contact_phone}</span>}
                              </div>
                            )}
                            {ev.notes && <p className="text-xs text-muted-foreground mt-1 italic">{ev.notes}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
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

function PhaseLane({ label, range, color }: { label: string; range: { from: string; to: string } | null; color: string }) {
  return (
    <div className={cn("rounded-md border px-3 py-2 text-xs font-medium", color)}>
      <div>{label}</div>
      <div className="text-[11px] opacity-80 mt-0.5">{range ? formatDateRange(range.from, range.to) : "—"}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
