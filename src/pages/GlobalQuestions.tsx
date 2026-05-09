import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AlertTriangle, Flame, Calendar as CalIcon, Pause, Search, ChevronDown, HelpCircle } from "lucide-react";
import { QuestionCard, type OpenQuestion } from "./festival/FestivalQuestions";

type Status = "open" | "resolved" | "deferred";
type Priority = "critical" | "high" | "medium" | "low";

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

interface Item extends OpenQuestion {
  festival: { id: string; slug: string; name: string; start_date: string; end_date: string } | null;
  concept: { slug: any; name: string } | null;
}

function dayDiff(iso: string) {
  const d = new Date(iso + "T00:00:00").getTime();
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((d - t.getTime()) / 86400000);
}
function festivalUrgency(startDate: string): { cls: string; chip: string } {
  const d = dayDiff(startDate);
  if (d < 0) return { cls: "bg-muted/30 border-border", chip: `${Math.abs(d)}d ago` };
  if (d <= 7) return { cls: "bg-red-500/10 border-red-500/30", chip: `T−${d}` };
  if (d <= 21) return { cls: "bg-orange-500/10 border-orange-500/30", chip: `T−${d}` };
  if (d <= 60) return { cls: "bg-yellow-500/10 border-yellow-500/30", chip: `T−${d}` };
  return { cls: "bg-muted/30 border-border", chip: `T−${d}` };
}

export default function GlobalQuestions() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const { data: festivals = [] } = useQuery({
    queryKey: ["all-festivals"],
    queryFn: async () => {
      const { data } = await supabase.from("festivals").select("id, slug, name, start_date, end_date").order("start_date");
      return (data ?? []) as Array<{ id: string; slug: string; name: string; start_date: string; end_date: string }>;
    },
  });

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["global-questions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("festival_open_questions")
        .select(`*, festival:festivals(id, slug, name, start_date, end_date), concept:concepts(slug, name)`);
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("global-questions")
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_open_questions" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const [selectedFests, setSelectedFests] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedPriorities, setSelectedPriorities] = useState<Set<Priority>>(new Set());
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set(["open"]));
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"festival" | "type" | "priority" | "owner">("festival");
  const [tile, setTile] = useState<null | "overdue" | "critical" | "week" | "deferred">(null);

  const today = new Date().toISOString().slice(0, 10);
  const tiles = useMemo(() => {
    let overdue = 0, critical = 0, week = 0, deferred = 0;
    items.forEach((q) => {
      if (q.status === "deferred") deferred++;
      if (q.status === "open") {
        if (q.priority === "critical") critical++;
        if (q.deadline) {
          const d = dayDiff(q.deadline);
          if (d < 0) overdue++;
          else if (d <= 7) week++;
        }
      }
    });
    return { overdue, critical, week, deferred };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((q) => {
      if (tile === "overdue") {
        if (q.status !== "open" || !q.deadline || dayDiff(q.deadline) >= 0) return false;
      } else if (tile === "critical") {
        if (q.status !== "open" || q.priority !== "critical") return false;
      } else if (tile === "week") {
        if (q.status !== "open" || !q.deadline) return false;
        const d = dayDiff(q.deadline); if (d < 0 || d > 7) return false;
      } else if (tile === "deferred") {
        if (q.status !== "deferred") return false;
      } else {
        if (statusFilter.size > 0 && !statusFilter.has(q.status as Status)) return false;
      }
      if (selectedFests.size > 0 && q.festival && !selectedFests.has(q.festival.slug)) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(q.question_type ?? "general")) return false;
      if (selectedPriorities.size > 0 && !selectedPriorities.has(q.priority)) return false;
      if (selectedOwners.size > 0) {
        const o = q.decision_owner ?? "__unassigned";
        if (!selectedOwners.has(o)) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        if (!`${q.question} ${q.context ?? ""}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [items, tile, statusFilter, selectedFests, selectedTypes, selectedPriorities, selectedOwners, search]);

  const groups = useMemo(() => {
    type G = { key: string; label: string; sortKey: number; festival?: Item["festival"]; items: Item[] };
    const map = new Map<string, G>();
    const add = (key: string, label: string, sortKey: number, fest: Item["festival"] | undefined, it: Item) => {
      if (!map.has(key)) map.set(key, { key, label, sortKey, festival: fest, items: [] });
      map.get(key)!.items.push(it);
    };
    filtered.forEach((q) => {
      if (groupBy === "festival") {
        const k = q.festival?.slug ?? "__none";
        const sort = q.festival ? Math.max(0, dayDiff(q.festival.start_date)) : 99999;
        add(k, q.festival?.name ?? "No festival", sort, q.festival, q);
      } else if (groupBy === "type") {
        const t = q.question_type ?? "general";
        add(t, t.replace(/_/g, " "), 0, undefined, q);
      } else if (groupBy === "priority") {
        add(q.priority, q.priority, PRIORITY_RANK[q.priority], undefined, q);
      } else {
        const o = q.decision_owner ?? "__unassigned";
        add(o, o === "__unassigned" ? "Unassigned" : o.replace("_", " "), 0, undefined, q);
      }
    });
    const arr = Array.from(map.values());
    arr.sort((a, b) => a.sortKey - b.sortKey);
    arr.forEach((g) => g.items.sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr) return pr;
      return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
    }));
    return arr;
  }, [filtered, groupBy]);

  const updateQ = useMutation({
    mutationFn: async (patch: Partial<Item> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await (supabase as any).from("festival_open_questions").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["global-questions"] }),
    onError: (e: any) => toast.error(e.message),
  });
  const deleteQ = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("festival_open_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["global-questions"] }); },
  });

  function toggle<T>(set: Set<T>, val: T, setter: (s: Set<T>) => void) {
    const n = new Set(set);
    if (n.has(val)) n.delete(val); else n.add(val);
    setter(n);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">❓ Open Questions</h1>
        <p className="text-sm text-muted-foreground mt-1">{items.length} total across {festivals.length} festivals</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile icon={AlertTriangle} label="Overdue" count={tiles.overdue} color="destructive"
          active={tile === "overdue"} onClick={() => setTile(tile === "overdue" ? null : "overdue")} />
        <Tile icon={Flame} label="Critical" count={tiles.critical} color="orange"
          active={tile === "critical"} onClick={() => setTile(tile === "critical" ? null : "critical")} />
        <Tile icon={CalIcon} label="This week" count={tiles.week} color="yellow"
          active={tile === "week"} onClick={() => setTile(tile === "week" ? null : "week")} />
        <Tile icon={Pause} label="Deferred" count={tiles.deferred} color="amber"
          active={tile === "deferred"} onClick={() => setTile(tile === "deferred" ? null : "deferred")} />
      </div>

      <div className="rounded-lg border bg-card p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mr-1">Festivals:</span>
          {festivals.map((f) => {
            const active = selectedFests.has(f.slug);
            const u = festivalUrgency(f.start_date);
            return (
              <button key={f.id} onClick={() => toggle(selectedFests, f.slug, setSelectedFests)}
                className={cn("text-[11px] px-2 py-0.5 rounded-full border transition-all",
                  active ? "bg-primary text-primary-foreground border-primary" : `${u.cls} hover:opacity-80`)}>
                {f.name}
              </button>
            );
          })}
          {selectedFests.size > 0 && <button onClick={() => setSelectedFests(new Set())} className="text-[11px] text-muted-foreground underline ml-1">clear</button>}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Type:</span>
          {["verify_operating_entity","concept_inclusion","contract_terms","logistics","commercial","general"].map((t) => {
            const active = selectedTypes.has(t);
            return (
              <button key={t} onClick={() => toggle(selectedTypes, t, setSelectedTypes)}
                className={cn("text-[11px] px-2 py-0.5 rounded-full border",
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted")}>
                {t.replace(/_/g, " ")}
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
                {p}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status:</span>
          {(["open","resolved","deferred"] as Status[]).map((s) => {
            const active = statusFilter.has(s);
            return (
              <button key={s} onClick={() => toggle(statusFilter, s, setStatusFilter)}
                className={cn("text-[11px] px-2 py-0.5 rounded-full border capitalize",
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted")}>
                {s}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Group:</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
              <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="festival">Festival</SelectItem>
                <SelectItem value="type">Type</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="owner">Decision owner</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-7 pl-7 w-44 text-xs" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <HelpCircle className="h-8 w-8 mx-auto mb-2" />
          No questions match your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupSection key={g.key} group={g} onUpdate={(p) => updateQ.mutate(p)} onDelete={(id) => deleteQ.mutate(id)} />
          ))}
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

function GroupSection({ group, onUpdate, onDelete }: {
  group: { key: string; label: string; festival?: Item["festival"]; items: Item[] };
  onUpdate: (p: Partial<Item> & { id: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const headerCls = group.festival
    ? festivalUrgency(group.festival.start_date).cls
    : "bg-muted/30 border-border";
  const chip = group.festival ? festivalUrgency(group.festival.start_date).chip : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className={cn("sticky top-0 z-10 backdrop-blur rounded-lg border px-3 py-2 cursor-pointer flex items-center gap-3", headerCls)}>
          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
          <h2 className="font-heading font-semibold text-sm flex-1 capitalize">
            {group.label}
            {chip && <span className="ml-2 text-xs font-normal opacity-80 tabular-nums">{chip}</span>}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">{group.items.length}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-2">
        {group.items.map((q) => (
          <QuestionCard key={q.id} question={q}
            festivalLabel={group.festival ? undefined : q.festival?.name}
            festivalSlug={group.festival ? undefined : q.festival?.slug}
            conceptInfo={q.concept ? { slug: q.concept.slug, name: q.concept.name } : undefined}
            onResolve={() => {
              // Quick resolve via prompt; full drawer is on per-festival page
              const r = window.prompt("Resolution:");
              if (r) onUpdate({ id: q.id, status: "resolved", resolution: r, resolved_at: new Date().toISOString() } as any);
            }}
            onDefer={() => onUpdate({ id: q.id, status: "deferred" } as any)}
            onEscalate={() => onUpdate({ id: q.id, escalated_at: new Date().toISOString(), priority: "critical", show_on_overview: true } as any)}
            onEdit={() => {
              if (q.festival) window.location.href = `/festivals/${q.festival.slug}/questions?q=${q.id}`;
            }}
            onDelete={() => { if (confirm("Delete this question?")) onDelete(q.id); }}
            onReopen={() => onUpdate({ id: q.id, status: "open", resolved_at: null } as any)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
