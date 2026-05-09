import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";
import {
  AlertTriangle, Flame, Calendar as CalIcon, Ban, Search, Sparkles,
  CheckCircle2, Clock, User, Pencil, Trash2, Mail, FileText, Brain, Inbox, AlarmClock, ChevronDown,
} from "lucide-react";

type Status = "open" | "in_progress" | "done" | "blocked";
type Priority = "critical" | "high" | "medium" | "low";

const PRIORITY_DOT: Record<Priority, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-muted-foreground/40",
};
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_LABEL: Record<Status, string> = { open: "Open", in_progress: "In Progress", done: "Done", blocked: "Blocked" };
const STATUS_PILL: Record<Status, string> = {
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  blocked: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
};
const SOURCE_ICON: Record<string, any> = { email: Mail, manual: User, contract: FileText, intelligence: Brain, ingestion: Inbox };
const OWNERS = ["fif", "marius", "costel", "marko", "anca"];

interface Item {
  id: string; festival_id: string; concept_id: string | null; contract_id: string | null;
  title: string; description: string | null; due_date: string | null;
  status: Status; priority: Priority; owner: string | null;
  source: string | null; source_ref: string | null; snoozed_until: string | null;
  completed_at: string | null;
  festival: { id: string; slug: string; name: string; start_date: string; end_date: string } | null;
  concept: { slug: ConceptSlug; name: string } | null;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function dayDiff(iso: string) {
  const d = new Date(iso + "T00:00:00").getTime();
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((d - t.getTime()) / 86400000);
}
function dueChip(iso: string | null) {
  if (!iso) return { cls: "border-border bg-muted/40 text-muted-foreground", label: "No due" };
  const diff = dayDiff(iso);
  const label = format(new Date(iso + "T00:00:00"), "d MMM");
  if (diff < 0) return { cls: "border-destructive/40 bg-destructive/10 text-destructive", label: `${label} · ${Math.abs(diff)}d overdue` };
  if (diff === 0) return { cls: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300", label: `${label} · today` };
  if (diff <= 7) return { cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300", label: `${label} · in ${diff}d` };
  return { cls: "border-border bg-muted/40 text-muted-foreground", label };
}
function festivalUrgency(startDate: string): { cls: string; chip: string } {
  const d = dayDiff(startDate);
  if (d < 0) return { cls: "bg-muted/30 border-border", chip: `${Math.abs(d)}d ago` };
  if (d <= 7) return { cls: "bg-red-500/10 border-red-500/30", chip: `T${"\u2212"}${d}` };
  if (d <= 21) return { cls: "bg-orange-500/10 border-orange-500/30", chip: `T${"\u2212"}${d}` };
  if (d <= 60) return { cls: "bg-yellow-500/10 border-yellow-500/30", chip: `T${"\u2212"}${d}` };
  return { cls: "bg-muted/30 border-border", chip: `T${"\u2212"}${d}` };
}
function snoozeDate(opt: "1d" | "3d" | "1w" | "monday"): string {
  const d = new Date(); d.setHours(0,0,0,0);
  if (opt === "1d") d.setDate(d.getDate() + 1);
  else if (opt === "3d") d.setDate(d.getDate() + 3);
  else if (opt === "1w") d.setDate(d.getDate() + 7);
  else { const day = d.getDay(); const offset = ((1 - day + 7) % 7) || 7; d.setDate(d.getDate() + offset); }
  return d.toISOString().slice(0,10);
}

export default function GlobalActions() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  // URL params
  const urlFestival = params.get("festival");
  const urlOwner = params.get("owner");
  const urlPriority = params.get("priority") as Priority | null;
  const urlView = params.get("view");
  const urlItem = params.get("item");

  const { data: festivals = [] } = useQuery({
    queryKey: ["all-festivals"],
    queryFn: async () => {
      const { data } = await supabase.from("festivals").select("id, slug, name, start_date, end_date").order("start_date");
      return (data ?? []) as Array<{ id: string; slug: string; name: string; start_date: string; end_date: string }>;
    },
  });

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["global-actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_action_items")
        .select(`id, festival_id, concept_id, contract_id, title, description, due_date, status, priority, owner, source, source_ref, snoozed_until, completed_at,
                 festival:festivals(id, slug, name, start_date, end_date),
                 concept:concepts(slug, name)`)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Item[];
    },
  });

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("global-actions")
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_action_items" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  // Filters state, initialized from URL
  const [selectedFests, setSelectedFests] = useState<Set<string>>(new Set(urlFestival ? [urlFestival] : []));
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set(urlOwner ? [urlOwner] : []));
  const [selectedPriorities, setSelectedPriorities] = useState<Set<Priority>>(new Set(urlPriority ? [urlPriority] : []));
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set(["open", "in_progress"]));
  const [dateRange, setDateRange] = useState<"today" | "week" | "twoweeks" | "all">(urlView === "today" ? "today" : "all");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"festival" | "owner" | "priority" | "week">("festival");
  const [tileFilter, setTileFilter] = useState<null | "overdue" | "critical" | "thisweek" | "blocked">(null);

  const today = todayStr();

  // Tile counts (from raw items)
  const tiles = useMemo(() => {
    let overdue = 0, critical = 0, week = 0, blocked = 0;
    items.forEach((i) => {
      const isActive = i.status === "open" || i.status === "in_progress";
      if (i.status === "blocked") blocked++;
      if (isActive && i.priority === "critical") critical++;
      if (isActive && i.due_date) {
        const d = dayDiff(i.due_date);
        if (d < 0) overdue++;
        else if (d <= 7) week++;
      }
    });
    return { overdue, critical, week, blocked };
  }, [items]);

  // Filter items
  const filtered = useMemo(() => {
    return items.filter((i) => {
      const snoozed = i.snoozed_until && i.snoozed_until > today;
      if (snoozed && tileFilter !== null) return false;
      if (snoozed && dateRange !== "all") return false;

      if (selectedFests.size > 0 && i.festival && !selectedFests.has(i.festival.slug)) return false;
      if (selectedOwners.size > 0) {
        const o = i.owner ?? "__unassigned";
        if (!selectedOwners.has(o)) return false;
      }
      if (selectedPriorities.size > 0 && !selectedPriorities.has(i.priority)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(i.status)) return false;

      if (dateRange === "today") {
        if (!i.due_date || dayDiff(i.due_date) > 0) return false;
        if (i.status === "done") return false;
      } else if (dateRange === "week") {
        if (!i.due_date) return false;
        const d = dayDiff(i.due_date); if (d > 7) return false;
      } else if (dateRange === "twoweeks") {
        if (!i.due_date) return false;
        const d = dayDiff(i.due_date); if (d > 14) return false;
      }

      if (tileFilter === "overdue") {
        if (!i.due_date || dayDiff(i.due_date) >= 0) return false;
        if (i.status === "done") return false;
      } else if (tileFilter === "critical") {
        if (i.priority !== "critical") return false;
        if (i.status === "done") return false;
      } else if (tileFilter === "thisweek") {
        if (!i.due_date) return false;
        const d = dayDiff(i.due_date); if (d < 0 || d > 7) return false;
      } else if (tileFilter === "blocked") {
        if (i.status !== "blocked") return false;
      }

      if (search) {
        const s = search.toLowerCase();
        if (!`${i.title} ${i.description ?? ""}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [items, selectedFests, selectedOwners, selectedPriorities, statusFilter, dateRange, search, tileFilter, today]);

  // Group
  const groups = useMemo(() => {
    type G = { key: string; label: string; sortKey: number; festival?: Item["festival"]; items: Item[] };
    const map = new Map<string, G>();
    const add = (key: string, label: string, sortKey: number, fest: Item["festival"] | undefined, it: Item) => {
      if (!map.has(key)) map.set(key, { key, label, sortKey, festival: fest, items: [] });
      map.get(key)!.items.push(it);
    };
    filtered.forEach((i) => {
      if (groupBy === "festival") {
        const k = i.festival?.slug ?? "__none";
        const sort = i.festival ? Math.max(0, dayDiff(i.festival.start_date)) : 99999;
        add(k, i.festival?.name ?? "No festival", sort, i.festival, i);
      } else if (groupBy === "owner") {
        const k = i.owner ?? "__unassigned";
        add(k, k === "__unassigned" ? "Unassigned" : k, 0, undefined, i);
      } else if (groupBy === "priority") {
        add(i.priority, i.priority, PRIORITY_RANK[i.priority], undefined, i);
      } else if (groupBy === "week") {
        if (!i.due_date) add("none", "No date", 99, undefined, i);
        else {
          const d = dayDiff(i.due_date);
          if (d <= 7) add("w1", "This week", 0, undefined, i);
          else if (d <= 14) add("w2", "Next week", 1, undefined, i);
          else if (d <= 21) add("w3", "Week 3", 2, undefined, i);
          else add("later", "Later", 3, undefined, i);
        }
      }
    });
    const arr = Array.from(map.values());
    arr.sort((a, b) => a.sortKey - b.sortKey);
    arr.forEach((g) => g.items.sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr) return pr;
      return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    }));
    return arr;
  }, [filtered, groupBy]);

  // Mutations
  const updateItem = useMutation({
    mutationFn: async (patch: Partial<Item> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("festival_action_items").update(rest as any).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["global-actions"] });
      const prev = qc.getQueryData<Item[]>(["global-actions"]);
      qc.setQueryData<Item[]>(["global-actions"], (old) =>
        (old ?? []).map((it) => it.id === patch.id ? { ...it, ...patch } as Item : it),
      );
      return { prev };
    },
    onError: (e: any, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["global-actions"], ctx.prev); toast.error(e.message); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["global-actions"] }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_action_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["global-actions"] }); },
  });

  // Scroll to deep-linked item
  useEffect(() => {
    if (!urlItem || items.length === 0) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`item-${urlItem}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2400);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [urlItem, items]);

  function toggle<T>(set: Set<T>, val: T, setter: (s: Set<T>) => void) {
    const n = new Set(set);
    if (n.has(val)) n.delete(val); else n.add(val);
    setter(n);
  }

  function todayQuickFilter() {
    setTileFilter(null);
    setDateRange("today");
    setStatusFilter(new Set(["open", "in_progress"]));
    setSelectedPriorities(new Set());
    const p = new URLSearchParams(params);
    p.set("view", "today");
    setParams(p, { replace: true });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            🎯 Action Items
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} total across {festivals.length} festivals</p>
        </div>
        <Button size="sm" variant={dateRange === "today" ? "default" : "outline"} onClick={todayQuickFilter}>
          <Sparkles className="h-4 w-4 mr-1" /> Today
        </Button>
      </header>

      {/* Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile icon={AlertTriangle} label="Overdue" count={tiles.overdue} color="destructive"
          active={tileFilter === "overdue"} onClick={() => setTileFilter(tileFilter === "overdue" ? null : "overdue")} />
        <Tile icon={Flame} label="Critical" count={tiles.critical} color="orange"
          active={tileFilter === "critical"} onClick={() => setTileFilter(tileFilter === "critical" ? null : "critical")} />
        <Tile icon={CalIcon} label="This week" count={tiles.week} color="yellow"
          active={tileFilter === "thisweek"} onClick={() => setTileFilter(tileFilter === "thisweek" ? null : "thisweek")} />
        <Tile icon={Ban} label="Blocked" count={tiles.blocked} color="amber"
          active={tileFilter === "blocked"} onClick={() => setTileFilter(tileFilter === "blocked" ? null : "blocked")} />
      </div>

      {/* Filters */}
      <div className="rounded-lg border bg-card p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mr-1">Festivals:</span>
          {festivals.map((f) => {
            const active = selectedFests.has(f.slug);
            const u = festivalUrgency(f.start_date);
            return (
              <button key={f.id}
                onClick={() => toggle(selectedFests, f.slug, setSelectedFests)}
                className={cn("text-[11px] px-2 py-0.5 rounded-full border transition-all",
                  active ? "bg-primary text-primary-foreground border-primary" : `${u.cls} hover:opacity-80`)}>
                {f.name}
              </button>
            );
          })}
          {selectedFests.size > 0 && <button onClick={() => setSelectedFests(new Set())} className="text-[11px] text-muted-foreground underline ml-1">clear</button>}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Owner:</span>
          {[...OWNERS, "__unassigned"].map((o) => {
            const active = selectedOwners.has(o);
            return (
              <button key={o} onClick={() => toggle(selectedOwners, o, setSelectedOwners)}
                className={cn("text-[11px] px-2 py-0.5 rounded-full border capitalize",
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted")}>
                {o === "__unassigned" ? "Unassigned" : o}
              </button>
            );
          })}
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground ml-2">Priority:</span>
          {(["critical", "high", "medium", "low"] as Priority[]).map((p) => {
            const active = selectedPriorities.has(p);
            return (
              <button key={p} onClick={() => toggle(selectedPriorities, p, setSelectedPriorities)}
                className={cn("text-[11px] px-2 py-0.5 rounded-full border capitalize",
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted")}>
                <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1", PRIORITY_DOT[p])} />{p}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status:</span>
          {(["open", "in_progress", "blocked", "done"] as Status[]).map((s) => {
            const active = statusFilter.has(s);
            return (
              <button key={s} onClick={() => toggle(statusFilter, s, setStatusFilter)}
                className={cn("text-[11px] px-2 py-0.5 rounded-full border",
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted")}>
                {STATUS_LABEL[s]}
              </button>
            );
          })}
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground ml-2">Date:</span>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="twoweeks">Next 2 weeks</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Group:</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
              <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="festival">Festival</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="week">Week</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-7 pl-7 w-44 text-xs" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Groups */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          No action items match your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g, idx) => {
            const defaultOpen = groupBy !== "festival" || idx === 0 || g.items.length > 0;
            return (
              <GroupSection key={g.key} group={g} defaultOpen={defaultOpen} groupBy={groupBy}
                onUpdate={(p) => updateItem.mutate(p)} onDelete={(id) => deleteItem.mutate(id)} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, count, color, active, onClick }: any) {
  const colorMap: Record<string, string> = {
    destructive: "border-destructive/40 bg-destructive/5 text-destructive",
    orange: "border-orange-500/40 bg-orange-500/5 text-orange-700 dark:text-orange-300",
    yellow: "border-yellow-500/40 bg-yellow-500/5 text-yellow-700 dark:text-yellow-300",
    amber: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300",
  };
  return (
    <button onClick={onClick}
      className={cn("rounded-lg border p-4 text-left transition-all hover:shadow-md",
        colorMap[color], active && "ring-2 ring-offset-1 ring-primary")}>
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4" />
        <span className="text-2xl font-bold tabular-nums">{count}</span>
      </div>
      <div className="text-xs font-medium mt-1">{label}</div>
    </button>
  );
}

function GroupSection({ group, defaultOpen, groupBy, onUpdate, onDelete }: {
  group: { key: string; label: string; festival?: Item["festival"]; items: Item[] };
  defaultOpen: boolean;
  groupBy: string;
  onUpdate: (p: Partial<Item> & { id: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen && group.items.length > 0);
  const headerCls = group.festival
    ? festivalUrgency(group.festival.start_date).cls
    : "bg-muted/30 border-border";
  const chip = group.festival ? festivalUrgency(group.festival.start_date).chip : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className={cn("sticky top-0 z-10 backdrop-blur rounded-lg border px-3 py-2 cursor-pointer flex items-center gap-3", headerCls)}>
          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
          <h2 className="font-heading font-semibold text-sm flex-1">
            {group.label}
            {chip && <span className="ml-2 text-xs font-normal opacity-80 tabular-nums">{chip}</span>}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">{group.items.length}</span>
          {group.festival && (
            <Link to={`/festivals/${group.festival.slug}/actions`} onClick={(e) => e.stopPropagation()}
              className="text-[11px] underline text-muted-foreground hover:text-foreground">open page</Link>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-1.5">
        {group.items.map((it) => (
          <ActionRow key={it.id} item={it} showFestival={groupBy !== "festival"}
            onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ActionRow({ item, showFestival, onUpdate, onDelete }: {
  item: Item; showFestival: boolean;
  onUpdate: (p: Partial<Item> & { id: string }) => void;
  onDelete: (id: string) => void;
}) {
  const due = dueChip(item.due_date);
  const isOverdue = item.due_date && item.status !== "done" && dayDiff(item.due_date) < 0;
  const isSnoozed = item.snoozed_until && item.snoozed_until > todayStr();
  const SourceIcon = SOURCE_ICON[item.source ?? "manual"] || User;

  return (
    <div id={`item-${item.id}`}
      className={cn("group rounded-lg border bg-card p-3 hover:shadow-sm transition-all flex gap-3 items-start",
        item.status === "done" && "opacity-60")}>
      <div className={cn("h-2.5 w-2.5 rounded-full mt-1.5 shrink-0", PRIORITY_DOT[item.priority])} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {showFestival && item.festival && (
                <Link to={`/festivals/${item.festival.slug}/actions?item=${item.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80">
                  {item.festival.name}
                  <span className="ml-1 opacity-60">{festivalUrgency(item.festival.start_date).chip}</span>
                </Link>
              )}
              <span className="font-medium text-sm">{item.title}</span>
              {isOverdue && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">🚨 OVERDUE</Badge>}
              {isSnoozed && <Badge variant="outline" className="text-[10px] px-1.5 py-0"><AlarmClock className="h-2.5 w-2.5 mr-0.5" />Snoozed</Badge>}
            </div>
            {item.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <span className={cn("text-[10px] px-2 py-0.5 rounded border tabular-nums", due.cls)}>{due.label}</span>
            {item.owner && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize"><User className="inline h-2.5 w-2.5 mr-0.5" />{item.owner}</span>}
            {item.concept && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                {CONCEPT_EMOJI[item.concept.slug] ?? ""} {item.concept.name}
              </span>
            )}
            <span className={cn("text-[10px] px-2 py-0.5 rounded border", STATUS_PILL[item.status])}>{STATUS_LABEL[item.status]}</span>
            <SourceIcon className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {item.status !== "done" && (
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Mark done"
            onClick={() => onUpdate({ id: item.id, status: "done", completed_at: new Date().toISOString() } as any)}>
            <CheckCircle2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Snooze"><Clock className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onUpdate({ id: item.id, snoozed_until: snoozeDate("1d") } as any)}>Tomorrow</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUpdate({ id: item.id, snoozed_until: snoozeDate("3d") } as any)}>3 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUpdate({ id: item.id, snoozed_until: snoozeDate("1w") } as any)}>1 week</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUpdate({ id: item.id, snoozed_until: snoozeDate("monday") } as any)}>Next Monday</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Reassign"><User className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Assign to</DropdownMenuLabel>
            {OWNERS.map((o) => (
              <DropdownMenuItem key={o} onClick={() => onUpdate({ id: item.id, owner: o } as any)} className="capitalize">{o}</DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onUpdate({ id: item.id, owner: null } as any)}>Unassign</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {item.festival && (
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit on festival page" asChild>
            <Link to={`/festivals/${item.festival.slug}/actions?item=${item.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete"
          onClick={() => { if (confirm("Delete this action item?")) onDelete(item.id); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
