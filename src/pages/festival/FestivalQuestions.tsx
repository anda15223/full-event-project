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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateRange } from "@/lib/dateFormat";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";
import {
  Plus, CheckCircle2, Pencil, Trash2, Pause, Flame,
  AlertTriangle, Search, FileDown, HelpCircle,
} from "lucide-react";

type Status = "open" | "resolved" | "deferred";
type Priority = "critical" | "high" | "medium" | "low";
type QuestionType =
  | "verify_operating_entity" | "concept_inclusion" | "contract_terms"
  | "logistics" | "commercial" | "general";

const STATUSES: Status[] = ["open", "resolved", "deferred"];
const PRIORITIES: Priority[] = ["critical", "high", "medium", "low"];
const QTYPES: QuestionType[] = [
  "verify_operating_entity", "concept_inclusion", "contract_terms",
  "logistics", "commercial", "general",
];
const OWNERS = ["fif", "marius", "jonas_kring", "festival", "costel", "marko"];

const PRIORITY_DOT: Record<Priority, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-muted-foreground/40",
};
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const TYPE_BADGE: Record<QuestionType, string> = {
  verify_operating_entity: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  concept_inclusion: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  contract_terms: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  logistics: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30",
  commercial: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  general: "bg-muted/40 text-muted-foreground border-border",
};
const TYPE_LABEL: Record<QuestionType, string> = {
  verify_operating_entity: "Verify entity",
  concept_inclusion: "Concept inclusion",
  contract_terms: "Contract terms",
  logistics: "Logistics",
  commercial: "Commercial",
  general: "General",
};

export interface OpenQuestion {
  id: string;
  festival_id: string;
  concept_id: string | null;
  contract_id: string | null;
  question: string;
  context: string | null;
  question_type: QuestionType | null;
  priority: Priority;
  status: Status;
  blocking_what: string | null;
  decision_owner: string | null;
  deadline: string | null;
  resolution: string | null;
  resolved_at: string | null;
  escalated_at: string | null;
  show_on_overview: boolean;
  created_at: string;
  updated_at: string;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function dayDiff(iso: string) {
  const d = new Date(iso + "T00:00:00").getTime();
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((d - t.getTime()) / 86400000);
}
function deadlineChip(iso: string | null) {
  if (!iso) return null;
  const diff = dayDiff(iso);
  const label = format(new Date(iso + "T00:00:00"), "d MMM");
  if (diff < 0) return { cls: "border-destructive/40 bg-destructive/10 text-destructive", label: `${label} · ${Math.abs(diff)}d overdue` };
  if (diff === 0) return { cls: "border-orange-500/40 bg-orange-500/10 text-orange-700", label: `${label} · today` };
  if (diff <= 7) return { cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700", label: `${label} · in ${diff}d` };
  return { cls: "border-border bg-muted/40 text-muted-foreground", label };
}

export default function FestivalQuestions() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("q");

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
    queryKey: ["festival-contracts-q", festival?.id],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data } = await supabase.from("festival_contracts")
        .select("id, concept_id, concept_alias, contract_status, concept:concepts(slug, name)")
        .eq("festival_id", festival!.id);
      return (data ?? []) as any[];
    },
  });

  const { data: questions = [], isLoading, refetch } = useQuery({
    queryKey: ["festival-questions", festival?.id],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("festival_open_questions")
        .select("*").eq("festival_id", festival!.id).eq("visibility", "public").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpenQuestion[];
    },
  });

  useEffect(() => {
    if (!festival?.id) return;
    const ch = supabase.channel(`questions-${festival.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "festival_open_questions", filter: `festival_id=eq.${festival.id}` },
        () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [festival?.id, refetch]);

  useEffect(() => {
    if (!highlightId || questions.length === 0) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`fq-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2400);
      }
    }, 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, questions.length]);

  const [tab, setTab] = useState<"all" | Status>(highlightId ? "all" : "open");
  const [pill, setPill] = useState<null | "critical" | "deadline" | "mine" | "blocking">(null);
  const [groupBy, setGroupBy] = useState<"priority" | "type" | "owner" | "concept">("priority");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<OpenQuestion | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resolving, setResolving] = useState<OpenQuestion | null>(null);
  const [deferring, setDeferring] = useState<OpenQuestion | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: questions.length, open: 0, resolved: 0, deferred: 0, critical: 0 };
    questions.forEach((q) => {
      if (q.status === "open") c.open++;
      if (q.status === "resolved") c.resolved++;
      if (q.status === "deferred") c.deferred++;
      if (q.status === "open" && q.priority === "critical") c.critical++;
    });
    return c;
  }, [questions]);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (tab !== "all" && q.status !== tab) return false;
      if (pill === "critical" && q.priority !== "critical") return false;
      if (pill === "deadline" && !q.deadline) return false;
      if (pill === "mine" && q.decision_owner !== "fif") return false;
      if (pill === "blocking" && !q.blocking_what) return false;
      if (search) {
        const s = search.toLowerCase();
        const t = `${q.question} ${q.context ?? ""} ${q.blocking_what ?? ""}`.toLowerCase();
        if (!t.includes(s)) return false;
      }
      return true;
    });
  }, [questions, tab, pill, search]);

  const conceptById = useMemo(() => {
    const m = new Map<string, { slug?: ConceptSlug; name: string; alias?: string }>();
    contracts.forEach((c: any) => {
      if (c.concept_id) m.set(c.concept_id, { slug: c.concept?.slug, name: c.concept?.name, alias: c.concept_alias });
    });
    concepts.forEach((c) => { if (!m.has(c.id)) m.set(c.id, { slug: c.slug, name: c.name }); });
    return m;
  }, [contracts, concepts]);

  const grouped = useMemo(() => {
    const g = new Map<string, OpenQuestion[]>();
    filtered.forEach((q) => {
      let key = "—";
      if (groupBy === "priority") key = q.priority;
      else if (groupBy === "type") key = q.question_type ?? "general";
      else if (groupBy === "owner") key = q.decision_owner || "Unassigned";
      else if (groupBy === "concept") key = q.concept_id ? (conceptById.get(q.concept_id)?.alias || conceptById.get(q.concept_id)?.name || "Concept") : "Festival-wide";
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(q);
    });
    g.forEach((arr) => arr.sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr) return pr;
      return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
    }));
    // sort group keys by priority rank if grouping by priority
    let entries = Array.from(g.entries());
    if (groupBy === "priority") {
      entries.sort((a, b) => (PRIORITY_RANK[a[0] as Priority] ?? 9) - (PRIORITY_RANK[b[0] as Priority] ?? 9));
    }
    return entries;
  }, [filtered, groupBy, conceptById]);

  const updateQ = useMutation({
    mutationFn: async (patch: Partial<OpenQuestion> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await (supabase as any).from("festival_open_questions").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival-questions", festival?.id] }),
    onError: (e: any) => toast.error(e.message),
  });
  const deleteQ = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("festival_open_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["festival-questions", festival?.id] }); },
  });
  const upsertQ = useMutation({
    mutationFn: async (payload: Partial<OpenQuestion>) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await (supabase as any).from("festival_open_questions").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("festival_open_questions").insert({ ...payload, festival_id: festival!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setDrawerOpen(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["festival-questions", festival?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openNew() {
    setEditing({
      id: "", festival_id: festival?.id ?? "", concept_id: null, contract_id: null,
      question: "", context: "", question_type: "general", priority: "medium", status: "open",
      blocking_what: "", decision_owner: null, deadline: null,
      resolution: null, resolved_at: null, escalated_at: null,
      show_on_overview: false, created_at: "", updated_at: "",
    });
    setDrawerOpen(true);
  }

  if (!festival) return <div className="max-w-6xl mx-auto p-6"><Skeleton className="h-40 w-full" /></div>;
  const daysToFestival = dayDiff(festival.start_date);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <Link to={`/festivals/${slug}`} className="text-xs text-muted-foreground hover:underline">← {festival.name}</Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Open Questions — {festival.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDateRange(festival.start_date, festival.end_date)} ·{" "}
            <span className="tabular-nums">{daysToFestival >= 0 ? `T−${daysToFestival} days` : `${Math.abs(daysToFestival)}d ago`}</span>
            {" · "}
            <span className="text-foreground font-medium">{counts.open} open</span>
            {counts.critical > 0 && <span className="text-destructive ml-2">· {counts.critical} critical</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/festivals/${slug}/questions/export`}><FileDown className="h-4 w-4 mr-1" />Export PDF</Link>
          </Button>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add question</Button>
        </div>
      </header>

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
              <TabsTrigger value="resolved">Resolved ({counts.resolved})</TabsTrigger>
              <TabsTrigger value="deferred">Deferred ({counts.deferred})</TabsTrigger>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
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
            { v: "deadline", label: "📅 Has deadline" },
            { v: "mine", label: "Mine to decide" },
            { v: "blocking", label: "🚧 Blocking work" },
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
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="type">Type</SelectItem>
                <SelectItem value="owner">Decision owner</SelectItem>
                <SelectItem value="concept">Concept</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center space-y-3">
          <HelpCircle className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">
            {questions.length === 0
              ? "No open questions at this festival."
              : "No questions match your filters."}
          </p>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add a question to track a pending decision</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([key, list]) => (
            <section key={key}>
              <h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-muted-foreground mb-2 capitalize">
                {key} <span className="text-foreground/60">· {list.length}</span>
              </h2>
              <div className="space-y-2">
                {list.map((q) => (
                  <QuestionCard key={q.id} question={q}
                    conceptInfo={q.concept_id ? conceptById.get(q.concept_id) : undefined}
                    contract={q.contract_id ? contracts.find((c: any) => c.id === q.contract_id) : undefined}
                    onResolve={() => setResolving(q)}
                    onDefer={() => setDeferring(q)}
                    onEscalate={() => updateQ.mutate({ id: q.id, escalated_at: new Date().toISOString(), priority: "critical", show_on_overview: true })}
                    onEdit={() => { setEditing(q); setDrawerOpen(true); }}
                    onDelete={() => setDeleteId(q.id)}
                    onReopen={() => updateQ.mutate({ id: q.id, status: "open", resolution: null, resolved_at: null })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Add/Edit drawer */}
      <Sheet open={drawerOpen} onOpenChange={(o) => { setDrawerOpen(o); if (!o) setEditing(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing?.id ? "Edit question" : "Add question"}</SheetTitle>
            <SheetDescription>{festival.name}</SheetDescription>
          </SheetHeader>
          {editing && (
            <QuestionForm
              question={editing}
              concepts={concepts}
              contracts={contracts}
              onChange={setEditing}
              onSave={() => {
                if (!editing.question.trim()) { toast.error("Question is required"); return; }
                const payload: any = { ...editing };
                if (!payload.id) delete payload.id;
                delete payload.created_at; delete payload.updated_at;
                upsertQ.mutate(payload);
              }}
              onCancel={() => { setDrawerOpen(false); setEditing(null); }}
              saving={upsertQ.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Resolve drawer */}
      <ResolveDrawer
        question={resolving}
        contracts={contracts}
        onClose={() => setResolving(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["festival-questions", festival?.id] })}
      />

      {/* Defer dialog */}
      <AlertDialog open={!!deferring} onOpenChange={(o) => !o && setDeferring(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Defer question</AlertDialogTitle>
            <AlertDialogDescription>This will mark the question as deferred. You can re-open it later.</AlertDialogDescription>
          </AlertDialogHeader>
          <DeferReason
            onCancel={() => setDeferring(null)}
            onConfirm={(reason) => {
              if (deferring) updateQ.mutate({
                id: deferring.id, status: "deferred",
                resolution: reason ? `Deferred: ${reason}` : "Deferred",
              });
              setDeferring(null);
            }}
          />
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete question?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteQ.mutate(deleteId); setDeleteId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeferReason({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (r: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <>
      <Textarea placeholder="Why deferring? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={() => onConfirm(reason)}>Defer</AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

// =================== Card ===================
export function QuestionCard({
  question: q, conceptInfo, contract, festivalLabel, festivalSlug,
  onResolve, onDefer, onEscalate, onEdit, onDelete, onReopen,
}: {
  question: OpenQuestion;
  conceptInfo?: { slug?: ConceptSlug; name: string; alias?: string };
  contract?: any;
  festivalLabel?: string;
  festivalSlug?: string;
  onResolve: () => void;
  onDefer: () => void;
  onEscalate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReopen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const dl = deadlineChip(q.deadline);
  const isOverdue = q.deadline && q.status === "open" && dayDiff(q.deadline) < 0;
  const qtype = (q.question_type ?? "general") as QuestionType;

  return (
    <div id={`fq-${q.id}`}
      className={cn("group rounded-lg border bg-card p-3.5 hover:shadow-sm transition-all flex gap-3 items-start",
      q.status === "resolved" && "opacity-70",
      q.status === "deferred" && "opacity-60",
      isOverdue && "border-destructive/40")}>
      <div className={cn("h-2.5 w-2.5 rounded-full mt-2 shrink-0", PRIORITY_DOT[q.priority])} title={q.priority} />

      <div className="flex-1 min-w-0">
        {isOverdue && (
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase text-destructive">
            <AlertTriangle className="h-3 w-3" /> Overdue answer
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {festivalLabel && festivalSlug && (
                <Link to={`/festivals/${festivalSlug}/questions?q=${q.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80">
                  {festivalLabel}
                </Link>
              )}
              <p className="font-semibold text-[15px] leading-snug">{q.question}</p>
            </div>
            {q.context && (
              <p className={cn("text-xs text-muted-foreground mt-1 cursor-pointer", !expanded && "line-clamp-2")}
                 onClick={() => setExpanded(v => !v)}>
                {q.context}
              </p>
            )}
            {q.status === "resolved" && q.resolution && (
              <div className="mt-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-1.5 text-xs text-emerald-800">
                <span className="font-semibold">✓ Resolution:</span> {q.resolution}
              </div>
            )}
            {q.status === "deferred" && q.resolution && (
              <div className="mt-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                <Pause className="inline h-3 w-3 mr-1" />{q.resolution}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-normal", TYPE_BADGE[qtype])}>
                {TYPE_LABEL[qtype]}
              </Badge>
              {q.decision_owner && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                  👤 {q.decision_owner.replace("_", " ")}
                </span>
              )}
              {dl && (
                <span className={cn("text-[10px] px-2 py-0.5 rounded border tabular-nums", dl.cls)}>
                  📅 {dl.label}
                </span>
              )}
              {conceptInfo && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                  {conceptInfo.slug && CONCEPT_EMOJI[conceptInfo.slug]} {conceptInfo.alias || conceptInfo.name}
                </span>
              )}
              {contract && (
                <span className="text-[10px] px-2 py-0.5 rounded border bg-muted/40 text-muted-foreground">
                  📄 {contract.contract_status ?? "contract"}
                </span>
              )}
              {q.escalated_at && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30">
                  <Flame className="inline h-2.5 w-2.5 mr-0.5" />Escalated
                </span>
              )}
            </div>
            {q.blocking_what && (
              <p className="mt-1.5 text-xs text-orange-700 dark:text-orange-300">
                🚧 <span className="font-medium">Blocks:</span> {q.blocking_what}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {q.status === "open" ? (
          <>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Resolve" onClick={onResolve}>
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Defer" onClick={onDefer}>
              <Pause className="h-3.5 w-3.5" />
            </Button>
            {!q.escalated_at && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Escalate" onClick={onEscalate}>
                <Flame className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        ) : (
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Re-open" onClick={onReopen}>
            <HelpCircle className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

// =================== Form ===================
function QuestionForm({
  question, concepts, contracts, onChange, onSave, onCancel, saving,
}: {
  question: OpenQuestion;
  concepts: any[];
  contracts: any[];
  onChange: (q: OpenQuestion) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set = (patch: Partial<OpenQuestion>) => onChange({ ...question, ...patch });
  const filteredContracts = question.concept_id ? contracts.filter((c) => c.concept_id === question.concept_id) : contracts;

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-1.5">
        <Label>Question *</Label>
        <Textarea rows={2} value={question.question} onChange={(e) => set({ question: e.target.value })} placeholder="What needs to be decided?" autoFocus />
      </div>
      <div className="space-y-1.5">
        <Label>Context</Label>
        <Textarea rows={3} value={question.context ?? ""} onChange={(e) => set({ context: e.target.value })} placeholder="Why this matters, what triggered it" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={question.question_type ?? "general"} onValueChange={(v) => set({ question_type: v as QuestionType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {QTYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={question.priority} onValueChange={(v) => set({ priority: v as Priority })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Decision owner</Label>
          <Select value={question.decision_owner ?? "__none"} onValueChange={(v) => set({ decision_owner: v === "__none" ? null : v })}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Unassigned</SelectItem>
              {OWNERS.map((o) => <SelectItem key={o} value={o} className="capitalize">{o.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Deadline</Label>
          <Input type="date" value={question.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value || null })} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Blocking what?</Label>
          <Input value={question.blocking_what ?? ""} onChange={(e) => set({ blocking_what: e.target.value })} placeholder="e.g. Cannot send POS contract" />
        </div>
        <div className="space-y-1.5">
          <Label>Concept</Label>
          <Select value={question.concept_id ?? "__none"} onValueChange={(v) => set({ concept_id: v === "__none" ? null : v, contract_id: null })}>
            <SelectTrigger><SelectValue placeholder="Festival-wide" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Festival-wide</SelectItem>
              {concepts.map((c) => <SelectItem key={c.id} value={c.id}>{CONCEPT_EMOJI[c.slug as ConceptSlug] ?? ""} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Contract</Label>
          <Select value={question.contract_id ?? "__none"} onValueChange={(v) => set({ contract_id: v === "__none" ? null : v })}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None</SelectItem>
              {filteredContracts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.concept_alias || c.concept?.name} {c.operating_entity ? `· ${c.operating_entity}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={question.show_on_overview} onCheckedChange={(c) => set({ show_on_overview: !!c })} />
        Show on Festival Overview attention strip
      </label>

      <SheetFooter className="flex-row justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
      </SheetFooter>
    </div>
  );
}

// =================== Resolve Drawer ===================
function ResolveDrawer({
  question, contracts, onClose, onDone,
}: {
  question: OpenQuestion | null;
  contracts: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [resolution, setResolution] = useState("");
  const [createAction, setCreateAction] = useState(false);
  const [createRule, setCreateRule] = useState(false);
  const [updateContract, setUpdateContract] = useState(false);
  const [updateAssignment, setUpdateAssignment] = useState(false);

  // Action item fields
  const [actTitle, setActTitle] = useState("");
  const [actDesc, setActDesc] = useState("");
  const [actDue, setActDue] = useState("");
  const [actOwner, setActOwner] = useState("fif");
  const [actPriority, setActPriority] = useState<Priority>("medium");

  // Rule fields
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleDesc, setRuleDesc] = useState("");
  const [ruleSeverity, setRuleSeverity] = useState<"critical" | "important" | "info">("important");

  // Contract fields
  const [contractEntity, setContractEntity] = useState("");
  const [contractCvr, setContractCvr] = useState("");
  const [contractStatus, setContractStatus] = useState("");

  // Assignment toggle
  const [assignAction, setAssignAction] = useState<"add" | "remove">("add");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!question) return;
    setResolution(""); setCreateAction(false); setCreateRule(false);
    setUpdateContract(false); setUpdateAssignment(false);
    setActTitle(question.question); setActDesc("");
    setActDue(""); setActOwner("fif"); setActPriority("medium");
    setRuleTitle(question.question.slice(0, 80)); setRuleDesc(""); setRuleSeverity("important");
    if (question.contract_id) {
      const c = contracts.find((ct: any) => ct.id === question.contract_id);
      setContractEntity(c?.operating_entity ?? "");
      setContractStatus(c?.contract_status ?? "");
      setContractCvr("");
    }
  }, [question, contracts]);

  if (!question) return null;
  const qtype = question.question_type;
  const showContractOption = qtype === "verify_operating_entity" || qtype === "contract_terms";
  const showAssignOption = qtype === "concept_inclusion";

  async function save() {
    if (!resolution.trim()) { toast.error("Resolution is required"); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      // 1. Mark question resolved
      const { error: e1 } = await (supabase as any).from("festival_open_questions")
        .update({ status: "resolved", resolution, resolved_at: now, resolved_date: now.slice(0,10) })
        .eq("id", question!.id);
      if (e1) throw e1;

      // 2. Action item
      if (createAction) {
        const { error } = await supabase.from("festival_action_items").insert({
          festival_id: question!.festival_id,
          concept_id: question!.concept_id,
          contract_id: question!.contract_id,
          title: actTitle, description: actDesc || resolution,
          due_date: actDue || null, owner: actOwner, priority: actPriority,
          status: "open", source: "intelligence", source_ref: question!.id,
        } as any);
        if (error) throw error;
      }

      // 3. Cross-festival rule
      if (createRule) {
        const { error } = await supabase.from("cross_festival_rules").insert({
          rule_name: ruleTitle, rule_description: ruleDesc || resolution,
          severity: ruleSeverity, source: `Resolved question @ festival ${question!.festival_id}`,
        } as any);
        if (error) throw error;
      }

      // 4. Update contract
      if (updateContract && question!.contract_id) {
        const patch: any = {};
        if (contractEntity) patch.operating_entity = contractEntity;
        if (contractCvr) patch.operating_entity_cvr = contractCvr;
        if (contractStatus) patch.contract_status = contractStatus;
        if (Object.keys(patch).length) {
          const { error } = await supabase.from("festival_contracts").update(patch).eq("id", question!.contract_id);
          if (error) throw error;
        }
      }

      // 5. Update assignment
      if (updateAssignment && question!.concept_id) {
        if (assignAction === "add") {
          const { error } = await supabase.from("festival_concept_assignments").insert({
            festival_id: question!.festival_id, concept_id: question!.concept_id,
            role: "manager",
          } as any);
          if (error && !String(error.message).includes("duplicate")) throw error;
        } else {
          const { error } = await supabase.from("festival_concept_assignments").delete()
            .eq("festival_id", question!.festival_id).eq("concept_id", question!.concept_id);
          if (error) throw error;
        }
      }

      toast.success("Question resolved");
      onDone(); onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to resolve");
    } finally { setSaving(false); }
  }

  return (
    <Sheet open={!!question} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Resolve question</SheetTitle>
          <SheetDescription className="line-clamp-2">{question.question}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>Resolution *</Label>
            <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What's the answer?" autoFocus />
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">What happens next?</p>
            <div className="space-y-2.5 rounded-lg border p-3 bg-muted/30">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={createAction} onCheckedChange={(c) => setCreateAction(!!c)} className="mt-0.5" />
                <span>Create action item from this resolution</span>
              </label>
              {createAction && (
                <div className="ml-6 space-y-2 pl-3 border-l-2 border-primary/30">
                  <Input placeholder="Title" value={actTitle} onChange={(e) => setActTitle(e.target.value)} />
                  <Textarea rows={2} placeholder="Description" value={actDesc} onChange={(e) => setActDesc(e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    <Input type="date" value={actDue} onChange={(e) => setActDue(e.target.value)} />
                    <Select value={actOwner} onValueChange={setActOwner}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{OWNERS.map(o => <SelectItem key={o} value={o} className="capitalize">{o.replace("_", " ")}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={actPriority} onValueChange={(v) => setActPriority(v as Priority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={createRule} onCheckedChange={(c) => setCreateRule(!!c)} className="mt-0.5" />
                <span>Add as cross-festival rule</span>
              </label>
              {createRule && (
                <div className="ml-6 space-y-2 pl-3 border-l-2 border-primary/30">
                  <Input placeholder="Rule title" value={ruleTitle} onChange={(e) => setRuleTitle(e.target.value)} />
                  <Textarea rows={2} placeholder="Rule description" value={ruleDesc} onChange={(e) => setRuleDesc(e.target.value)} />
                  <Select value={ruleSeverity} onValueChange={(v) => setRuleSeverity(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="important">Important</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showContractOption && question.contract_id && (
                <>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={updateContract} onCheckedChange={(c) => setUpdateContract(!!c)} className="mt-0.5" />
                    <span>Update contract operating entity / status</span>
                  </label>
                  {updateContract && (
                    <div className="ml-6 space-y-2 pl-3 border-l-2 border-primary/30">
                      <Input placeholder="Operating entity" value={contractEntity} onChange={(e) => setContractEntity(e.target.value)} />
                      <Input placeholder="CVR" value={contractCvr} onChange={(e) => setContractCvr(e.target.value)} />
                      <Select value={contractStatus} onValueChange={setContractStatus}>
                        <SelectTrigger><SelectValue placeholder="Contract status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_started">Not started</SelectItem>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="signed">Signed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              {showAssignOption && question.concept_id && (
                <>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={updateAssignment} onCheckedChange={(c) => setUpdateAssignment(!!c)} className="mt-0.5" />
                    <span>Update concept assignment for this festival</span>
                  </label>
                  {updateAssignment && (
                    <div className="ml-6 pl-3 border-l-2 border-primary/30">
                      <Select value={assignAction} onValueChange={(v) => setAssignAction(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="add">Add concept to festival</SelectItem>
                          <SelectItem value="remove">Remove concept from festival</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save resolution"}</Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
