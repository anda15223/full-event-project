import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateRange } from "@/lib/dateFormat";
import { CONCEPT_EMOJI, CONCEPT_LABELS, type ConceptSlug } from "@/components/concept/types";
import {
  Plus, CheckCircle2, Clock, User, Pencil, Trash2, Mail, FileText, Brain,
  Inbox, AlarmClock, Search, Calendar as CalendarIcon, FileDown, AlertTriangle,
} from "lucide-react";
import { ImportFromPreviousCard, CARD_TABLES } from "@/components/festival/ImportFromPreviousCard";
import { AIActionPlanButton } from "@/components/festival/AIActionPlanButton";
import { useDraftMode } from "@/hooks/useDraftMode";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";

type Status = "open" | "in_progress" | "done" | "blocked";
type Priority = "critical" | "high" | "medium" | "low";
type Source = "email" | "manual" | "contract" | "intelligence" | "ingestion";

const STATUSES: Status[] = ["open", "in_progress", "done", "blocked"];
const PRIORITIES: Priority[] = ["critical", "high", "medium", "low"];
const SOURCES: Source[] = ["manual", "email", "contract", "intelligence", "ingestion"];
const FALLBACK_OWNERS = ["Alexandra Artimon", "Marius", "Costel", "Marko", "Anca"];
const FIXED_TEAMS = ["Fidibus team"];

function useOwnerOptions() {
  const { data } = useQuery({
    queryKey: ["owner-options-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("display_name, full_name")
        .eq("is_active", true)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((s: any) => s.display_name || s.full_name).filter(Boolean) as string[];
    },
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => {
    const merged = new Set<string>();
    FALLBACK_OWNERS.forEach((o) => merged.add(o));
    (data ?? []).forEach((o) => merged.add(o));
    const list = Array.from(merged).sort((a, b) => a.localeCompare(b));
    return [...FIXED_TEAMS, ...list];
  }, [data]);
}

const PRIORITY_DOT: Record<Priority, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-muted-foreground/40",
};
const PRIORITY_BORDER: Record<Priority, string> = {
  critical: "border-l-4 border-l-red-500",
  high: "border-l-4 border-l-orange-400",
  medium: "border-l-4 border-l-gray-200 dark:border-l-gray-700",
  low: "border-l-4 border-l-gray-200 dark:border-l-gray-700",
};
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_LABEL: Record<Status, string> = {
  open: "Open", in_progress: "In Progress", done: "Done", blocked: "Blocked",
};
const STATUS_PILL: Record<Status, string> = {
  open: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/40",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40",
  done: "bg-green-50 text-green-700 border-green-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40",
  blocked: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40",
};
const SOURCE_ICON: Record<string, any> = {
  email: Mail, manual: User, contract: FileText, intelligence: Brain, ingestion: Inbox,
};

interface ActionItem {
  id: string;
  festival_id: string;
  concept_id: string | null;
  contract_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: Status;
  priority: Priority;
  owner: string | null;
  source: Source | null;
  source_ref: string | null;
  snoozed_until: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function dayDiff(iso: string) {
  const d = new Date(iso + "T00:00:00").getTime();
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((d - t.getTime()) / 86400000);
}
function dueChip(iso: string | null) {
  if (!iso) return { cls: "border-gray-200 bg-gray-50 text-gray-500 dark:border-border dark:bg-muted/40 dark:text-muted-foreground", label: "No due date" };
  const diff = dayDiff(iso);
  const label = format(new Date(iso + "T00:00:00"), "d MMM");
  if (diff < 0) return { cls: "border-red-200 bg-red-100 text-red-700 dark:border-destructive/40 dark:bg-destructive/15 dark:text-destructive", label: `${label} · ${Math.abs(diff)}d overdue` };
  if (diff === 0) return { cls: "border-red-200 bg-red-100 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300", label: `${label} · today` };
  if (diff <= 3) return { cls: "border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300", label: `${label} · in ${diff}d` };
  if (diff <= 7) return { cls: "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300", label: `${label} · in ${diff}d` };
  return { cls: "border-gray-200 bg-gray-100 text-gray-600 dark:border-border dark:bg-muted/40 dark:text-muted-foreground", label };
}

function snoozeDate(option: "1d" | "3d" | "1w" | "monday"): string {
  const d = new Date(); d.setHours(0,0,0,0);
  if (option === "1d") d.setDate(d.getDate() + 1);
  else if (option === "3d") d.setDate(d.getDate() + 3);
  else if (option === "1w") d.setDate(d.getDate() + 7);
  else { const day = d.getDay(); const offset = ((1 - day + 7) % 7) || 7; d.setDate(d.getDate() + offset); }
  return d.toISOString().slice(0, 10);
}

export default function FestivalActions() {
  const { draftMode } = useDraftMode();
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("item");

  const { data: festival } = useQuery({
    queryKey: ["festival", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals").select("id, name, start_date, end_date, slug").eq("slug", slug).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: concepts = [] } = useQuery({
    queryKey: ["concepts-all"],
    queryFn: async () => {
      const { data } = await supabase.from("concepts").select("id, slug, name").eq("is_active", true);
      return (data ?? []) as Array<{ id: string; slug: ConceptSlug; name: string }>;
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["festival-contracts", festival?.id, draftMode],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data } = await supabase.from("festival_contracts")
        .select("id, concept_id, concept_alias, is_active, concept:concepts!concept_id(slug, name)")
        .eq("festival_id", festival!.id);
      return (data ?? []) as any[];
    },
  });

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["festival-actions", festival?.id, draftMode],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("festival_action_items")
        .select("*").eq("festival_id", festival!.id).eq("is_draft", draftMode).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ActionItem[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!festival?.id) return;
    const ch = supabase.channel(`actions-${festival.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "festival_action_items", filter: `festival_id=eq.${festival.id}` },
        () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [festival?.id, refetch]);

  // Scroll to highlighted item from deep link
  useEffect(() => {
    if (!highlightId || items.length === 0) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`fa-item-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2400);
      }
    }, 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, items.length]);

  // Filters
  const [tab, setTab] = useState<"all" | Status>(highlightId ? "all" : "open");
  const [pill, setPill] = useState<null | "critical" | "week" | "overdue" | "alexandra" | "marius" | "costel">(null);
  const [groupBy, setGroupBy] = useState<"status" | "priority" | "due" | "concept" | "owner">("status");
  const [search, setSearch] = useState("");

  // Drawer state
  const [editing, setEditing] = useState<ActionItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Filtering
  const today = todayStr();
  const inactiveContractIds = useMemo(
    () => new Set(contracts.filter((c: any) => c.is_active === false).map((c: any) => c.id)),
    [contracts],
  );
  const filtered = useMemo(() => {
    return items.filter((i) => {
      // Hide items linked to a disabled concept contract
      if (i.contract_id && inactiveContractIds.has(i.contract_id)) return false;
      // Snoozed: hide unless tab=all or already past snooze
      if (tab !== "all" && i.snoozed_until && i.snoozed_until > today) return false;
      if (tab !== "all" && i.status !== tab) return false;
      if (pill === "critical" && i.priority !== "critical") return false;
      if (pill === "week") {
        if (!i.due_date) return false;
        const d = dayDiff(i.due_date); if (d < 0 || d > 7) return false;
      }
      if (pill === "overdue") {
        if (!i.due_date || i.status === "done") return false;
        if (dayDiff(i.due_date) >= 0) return false;
      }
      if (pill === "alexandra" && i.owner !== "Alexandra Artimon") return false;
      if (pill === "marius" && i.owner !== "Marius") return false;
      if (pill === "costel" && i.owner !== "Costel") return false;
      if (search) {
        const s = search.toLowerCase();
        const t = `${i.title} ${i.description ?? ""}`.toLowerCase();
        if (!t.includes(s)) return false;
      }
      return true;
    });
  }, [items, tab, pill, search, today]);

  const counts = useMemo(() => {
    const c = { all: items.length, open: 0, in_progress: 0, done: 0, blocked: 0, critical: 0 };
    items.forEach((i) => {
      if (i.status === "open") c.open++;
      if (i.status === "in_progress") c.in_progress++;
      if (i.status === "done") c.done++;
      if (i.status === "blocked") c.blocked++;
      if (i.priority === "critical" && i.status !== "done") c.critical++;
    });
    return c;
  }, [items]);

  // Group
  const grouped = useMemo(() => {
    const g = new Map<string, ActionItem[]>();
    const conceptMap = new Map(contracts.map((c: any) => [c.concept_id, c.concept_alias || c.concept?.name]));
    const conceptSlug = new Map(contracts.map((c: any) => [c.concept_id, c.concept?.slug]));
    filtered.forEach((i) => {
      let key = "—";
      if (groupBy === "status") key = STATUS_LABEL[i.status];
      else if (groupBy === "priority") key = i.priority;
      else if (groupBy === "owner") key = i.owner || "Unassigned";
      else if (groupBy === "concept") key = i.concept_id ? (conceptMap.get(i.concept_id) || "Concept") : "Festival-wide";
      else if (groupBy === "due") {
        if (!i.due_date) key = "No due date";
        else {
          const d = dayDiff(i.due_date);
          if (d < 0) key = "Overdue";
          else if (d === 0) key = "Today";
          else if (d <= 7) key = "This week";
          else if (d <= 30) key = "This month";
          else key = "Later";
        }
      }
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(i);
    });
    // sort within each
    g.forEach((arr) => arr.sort((a, b) => {
      const cp = (a.priority === "critical" ? 0 : 1) - (b.priority === "critical" ? 0 : 1);
      if (cp) return cp;
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr) return pr;
      const da = a.due_date ?? "9999"; const db = b.due_date ?? "9999";
      return da.localeCompare(db);
    }));
    return Array.from(g.entries());
  }, [filtered, groupBy, contracts]);

  const conceptById = useMemo(() => {
    const m = new Map<string, { slug?: ConceptSlug; name: string; alias?: string }>();
    contracts.forEach((c: any) => {
      if (c.concept_id) m.set(c.concept_id, { slug: c.concept?.slug, name: c.concept?.name, alias: c.concept_alias });
    });
    concepts.forEach((c) => { if (!m.has(c.id)) m.set(c.id, { slug: c.slug, name: c.name }); });
    return m;
  }, [contracts, concepts]);

  // Mutations
  const updateItem = useMutation({
    mutationFn: async (patch: Partial<ActionItem> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("festival_action_items").update(rest as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival-actions", festival?.id, draftMode] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_action_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["festival-actions", festival?.id, draftMode] }); },
  });

  const upsertItem = useMutation({
    mutationFn: async (payload: Partial<ActionItem>) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase.from("festival_action_items").update(rest as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("festival_action_items").insert({ ...payload, festival_id: festival!.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setDrawerOpen(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["festival-actions", festival?.id, draftMode] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openNew() {
    setEditing({
      id: "", festival_id: festival?.id ?? "", concept_id: null, contract_id: null,
      title: "", description: "", due_date: null, status: "open", priority: "medium",
      owner: null, source: "manual", source_ref: null, snoozed_until: null,
      completed_at: null, created_at: "", updated_at: "",
    } as ActionItem);
    setDrawerOpen(true);
  }
  function openEdit(it: ActionItem) { setEditing(it); setDrawerOpen(true); }

  if (!festival) {
    return <div className="max-w-7xl mx-auto p-6"><Skeleton className="h-40 w-full" /></div>;
  }

  const daysToFestival = dayDiff(festival.start_date);

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      <ImportFromPreviousCard
        cardLabel="actions"
        tables={CARD_TABLES.actions}
        currentFestivalId={festival?.id ?? ""}
        onCommitted={() => window.location.reload()}
      />
      <Link to={`/festivals/${slug}`} className="text-xs text-muted-foreground hover:underline">← {festival.name}</Link>

      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Action Items — {festival.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDateRange(festival.start_date, festival.end_date)} ·{" "}
            <span className="tabular-nums">{daysToFestival >= 0 ? `T${"\u2212"}${daysToFestival} days` : `${Math.abs(daysToFestival)}d ago`}</span>
            {" · "}
            <span className="text-foreground font-medium">{counts.open + counts.in_progress + counts.blocked} open</span>
            {counts.critical > 0 && <span className="text-destructive ml-2">· {counts.critical} critical</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/festivals/${slug}/actions/export`}><FileDown className="h-4 w-4 mr-1" />Export PDF</Link>
          </Button>
          <AIActionPlanButton festivalId={festival.id} onCreated={() => refetch()} />
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add action item</Button>
        </div>
      </header>

      {/* Filters */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
              <TabsTrigger value="in_progress">In Progress ({counts.in_progress})</TabsTrigger>
              <TabsTrigger value="done">Done ({counts.done})</TabsTrigger>
              <TabsTrigger value="blocked">Blocked ({counts.blocked})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="ml-auto relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="h-9 pl-7 w-56" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { v: "critical", label: "🔴 Critical" },
            { v: "week", label: "📅 This week" },
            { v: "overdue", label: "🚨 Overdue" },
            { v: "alexandra", label: "Alexandra Artimon" },
            { v: "marius", label: "Marius" },
            { v: "costel", label: "Costel" },
          ].map((p) => (
            <button key={p.v}
              onClick={() => setPill(pill === p.v ? null : (p.v as any))}
              className={cn("text-xs px-2.5 py-1 rounded-full border transition-colors",
                pill === p.v ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border hover:bg-muted")}>
              {p.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Group by</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="due">Due date</SelectItem>
                <SelectItem value="concept">Concept</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center space-y-3">
          <p className="text-muted-foreground">No action items match your filters.</p>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add action item</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([key, list]) => (
            <section key={key}>
              <h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {key} <span className="text-foreground/60">· {list.length}</span>
              </h2>
              <div className="space-y-2">
                {list.map((it) => (
                  <ActionRow
                    key={it.id} item={it}
                    conceptInfo={it.concept_id ? conceptById.get(it.concept_id) : undefined}
                    onMarkDone={() => updateItem.mutate({ id: it.id, status: "done", completed_at: new Date().toISOString() })}
                    onSnooze={(opt) => updateItem.mutate({ id: it.id, snoozed_until: snoozeDate(opt) })}
                    onReassign={(owner) => updateItem.mutate({ id: it.id, owner })}
                    onEdit={() => openEdit(it)}
                    onDelete={() => setDeleteId(it.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Add/Edit Drawer */}
      <Sheet open={drawerOpen} onOpenChange={(o) => { setDrawerOpen(o); if (!o) setEditing(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing?.id ? "Edit action item" : "Add action item"}</SheetTitle>
            <SheetDescription>{festival.name}</SheetDescription>
          </SheetHeader>
          {editing && (
            <ActionForm
              item={editing}
              concepts={concepts}
              contracts={contracts}
              onChange={setEditing}
              onSave={() => {
                if (!editing.title.trim()) { toast.error("Title required"); return; }
                const payload: any = { ...editing };
                if (!payload.id) delete payload.id;
                delete payload.created_at; delete payload.updated_at;
                upsertItem.mutate(payload);
              }}
              onCancel={() => { setDrawerOpen(false); setEditing(null); }}
              saving={upsertItem.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete action item?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteItem.mutate(deleteId); setDeleteId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------- Row ----------------
function ActionRow({
  item, conceptInfo, onMarkDone, onSnooze, onReassign, onEdit, onDelete,
}: {
  item: ActionItem;
  conceptInfo?: { slug?: ConceptSlug; name: string; alias?: string };
  onMarkDone: () => void;
  onSnooze: (opt: "1d" | "3d" | "1w" | "monday") => void;
  onReassign: (owner: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const owners = useOwnerOptions();
  const due = dueChip(item.due_date);
  const isOverdue = item.due_date && item.status !== "done" && dayDiff(item.due_date) < 0;
  const SourceIcon = SOURCE_ICON[item.source ?? "manual"] || User;
  const isSnoozed = item.snoozed_until && item.snoozed_until > todayStr();

  return (
    <div id={`fa-item-${item.id}`}
      className={cn(
        "group rounded-lg border border-gray-200 dark:border-border bg-card shadow-sm p-3 pl-3.5 hover:shadow-md hover:border-gray-300 dark:hover:border-border/80 transition-all flex gap-3 items-start",
        PRIORITY_BORDER[item.priority],
        item.priority === "critical" && "bg-red-50/40 dark:bg-red-500/5",
        item.status === "done" && "opacity-60",
      )}>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-sm", item.priority === "critical" ? "font-semibold text-foreground" : "font-medium")}>{item.title}</span>
              {isOverdue && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">🚨 OVERDUE</Badge>}
              {isSnoozed && <Badge variant="outline" className="text-[10px] px-1.5 py-0"><AlarmClock className="h-2.5 w-2.5 mr-0.5" />Snoozed</Badge>}
            </div>
            {item.description && (
              <p className={cn("text-xs text-muted-foreground mt-0.5", !expanded && "line-clamp-2")}
                 onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
                {item.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <span className={cn("text-[10px] px-2 py-0.5 rounded border tabular-nums", due.cls)}>{due.label}</span>
            {item.owner && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                <User className="inline h-2.5 w-2.5 mr-0.5" />{item.owner}
              </span>
            )}
            {conceptInfo && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                {conceptInfo.slug && CONCEPT_EMOJI[conceptInfo.slug]} {conceptInfo.alias || conceptInfo.name}
              </span>
            )}
            <span className={cn("text-[10px] px-2 py-0.5 rounded border", STATUS_PILL[item.status])}>{STATUS_LABEL[item.status]}</span>
            <SourceIcon className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {item.status !== "done" && (
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Mark done" onClick={onMarkDone}>
            <CheckCircle2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Snooze"><Clock className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onSnooze("1d")}>Tomorrow</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze("3d")}>3 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze("1w")}>1 week</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze("monday")}>Next Monday</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Reassign"><User className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Assign to</DropdownMenuLabel>
            {owners.map((o) => (
              <DropdownMenuItem key={o} onClick={() => onReassign(o)} className="capitalize">{o}</DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onReassign("")}>Unassign</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

// ---------------- Form ----------------
function ActionForm({
  item, concepts, contracts, onChange, onSave, onCancel, saving,
}: {
  item: ActionItem;
  concepts: any[];
  contracts: any[];
  onChange: (it: ActionItem) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set = (patch: Partial<ActionItem>) => onChange({ ...item, ...patch });
  const owners = useOwnerOptions();
  const filteredContracts = item.concept_id ? contracts.filter((c) => c.concept_id === item.concept_id) : [];

  return (
    <div className="space-y-4 py-4">
      <FestivalBackBar />
      <div className="space-y-1.5">
        <Label>Title *</Label>
        <Input value={item.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea rows={3} value={item.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Due date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start font-normal">
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {item.due_date ? format(new Date(item.due_date + "T00:00:00"), "d MMM yyyy") : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single"
                selected={item.due_date ? new Date(item.due_date + "T00:00:00") : undefined}
                onSelect={(d) => set({ due_date: d ? d.toISOString().slice(0,10) : null })}
                className={cn("p-3 pointer-events-auto")} />
              {item.due_date && (
                <div className="p-2 border-t"><Button variant="ghost" size="sm" className="w-full" onClick={() => set({ due_date: null })}>Clear</Button></div>
              )}
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={item.priority} onValueChange={(v) => set({ priority: v as Priority })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={item.status} onValueChange={(v) => set({ status: v as Status })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Owner</Label>
          <Select value={item.owner ?? "__none"} onValueChange={(v) => set({ owner: v === "__none" ? null : v })}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Unassigned</SelectItem>
              {owners.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Concept</Label>
          <Select value={item.concept_id ?? "__none"} onValueChange={(v) => set({ concept_id: v === "__none" ? null : v, contract_id: null })}>
            <SelectTrigger><SelectValue placeholder="Festival-wide" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Festival-wide</SelectItem>
              {concepts.map((c) => <SelectItem key={c.id} value={c.id}>{CONCEPT_EMOJI[c.slug as ConceptSlug] ?? ""} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Contract</Label>
          <Select value={item.contract_id ?? "__none"} onValueChange={(v) => set({ contract_id: v === "__none" ? null : v })} disabled={!item.concept_id}>
            <SelectTrigger><SelectValue placeholder={item.concept_id ? "None" : "Select concept first"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None</SelectItem>
              {filteredContracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.concept_alias || c.concept?.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select value={item.source ?? "manual"} onValueChange={(v) => set({ source: v as Source })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Source ref</Label>
          <Input value={item.source_ref ?? ""} onChange={(e) => set({ source_ref: e.target.value })} placeholder="email subject, file..." />
        </div>
      </div>

      <SheetFooter className="flex-row justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
      </SheetFooter>
    </div>
  );
}
