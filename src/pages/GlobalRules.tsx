import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Plus, Search, Pencil, Copy as CopyIcon, Pause, Play, Trash2, Printer,
  ShieldAlert, AlertTriangle, Info, ScrollText, Link as LinkIcon,
} from "lucide-react";

type Level = "critical" | "important" | "info";

interface Rule {
  id: string;
  rule_name: string;
  rule_description: string;
  severity: Level;
  category: string | null;
  applies_to_festivals: string[] | null;
  applies_to_operators: string[] | null;
  source: string | null;
  effective_from: string | null;
  effective_until: string | null;
  active: boolean;
  linked_question_id: string | null;
  created_at: string;
  updated_at: string;
}

const LEVEL_META: Record<Level, { label: string; chip: string; border: string; icon: typeof ShieldAlert; ring: string }> = {
  critical: {
    label: "Critical",
    chip: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40",
    border: "border-l-4 border-l-red-500",
    icon: ShieldAlert,
    ring: "text-red-600",
  },
  important: {
    label: "Important",
    chip: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/40",
    border: "border-l-4 border-l-orange-500",
    icon: AlertTriangle,
    ring: "text-orange-600",
  },
  info: {
    label: "Info",
    chip: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/40",
    border: "border-l-4 border-l-blue-500",
    icon: Info,
    ring: "text-blue-600",
  },
};

const CATEGORIES = ["operating_entity", "logistics", "staffing", "setup_model", "finance", "general"];

const emptyForm = {
  rule_name: "",
  rule_description: "",
  severity: "important" as Level,
  category: "general" as string,
  applies_to_festivals: [] as string[],
  all_festivals: true,
  source: "",
  effective_from: "",
  effective_until: "",
  active: true,
};

export default function GlobalRules() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const { data: rules = [], isLoading, refetch } = useQuery({
    queryKey: ["cross-festival-rules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cross_festival_rules")
        .select("*")
        .eq("visibility", "public")
        .order("severity", { ascending: true })
        .order("rule_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const { data: festivals = [] } = useQuery({
    queryKey: ["festivals-for-rules"],
    queryFn: async () => {
      const { data } = await supabase
        .from("festivals")
        .select("slug, name, start_date")
        .order("start_date");
      return (data ?? []) as Array<{ slug: string; name: string; start_date: string }>;
    },
  });

  useEffect(() => {
    const ch = supabase.channel("cross-festival-rules")
      .on("postgres_changes", { event: "*", schema: "public", table: "cross_festival_rules" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  // ---- filters ----
  const [levelFilter, setLevelFilter] = useState<"all" | Level>(
    (params.get("level") as Level) || "all"
  );
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(
    new Set((params.get("cats") ?? "").split(",").filter(Boolean))
  );
  const [festivalFilter, setFestivalFilter] = useState<string>(params.get("festival") ?? "all");
  const [showInactive, setShowInactive] = useState(params.get("inactive") === "1");
  const [search, setSearch] = useState(params.get("q") ?? "");

  useEffect(() => {
    const p: Record<string, string> = {};
    if (levelFilter !== "all") p.level = levelFilter;
    if (categoryFilter.size > 0) p.cats = Array.from(categoryFilter).join(",");
    if (festivalFilter !== "all") p.festival = festivalFilter;
    if (showInactive) p.inactive = "1";
    if (search) p.q = search;
    setParams(p, { replace: true });
  }, [levelFilter, categoryFilter, festivalFilter, showInactive, search, setParams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (!showInactive && !r.active) return false;
      if (showInactive && r.active) {
        // when "show inactive" toggled, show only inactive
        return false;
      }
      if (levelFilter !== "all" && r.severity !== levelFilter) return false;
      if (categoryFilter.size > 0 && !categoryFilter.has(r.category ?? "")) return false;
      if (festivalFilter !== "all") {
        const f = r.applies_to_festivals;
        if (f && f.length > 0 && !f.includes(festivalFilter)) return false;
      }
      if (q) {
        const blob = `${r.rule_name} ${r.rule_description} ${r.category ?? ""} ${(r.applies_to_operators ?? []).join(" ")}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rules, levelFilter, categoryFilter, festivalFilter, showInactive, search]);

  // small fix: when showInactive=true, include inactive rules too
  const filteredFinal = useMemo(() => {
    if (!showInactive) return filtered;
    return rules.filter((r) => {
      if (r.active) return false;
      if (levelFilter !== "all" && r.severity !== levelFilter) return false;
      if (categoryFilter.size > 0 && !categoryFilter.has(r.category ?? "")) return false;
      if (festivalFilter !== "all") {
        const f = r.applies_to_festivals;
        if (f && f.length > 0 && !f.includes(festivalFilter)) return false;
      }
      const q = search.trim().toLowerCase();
      if (q) {
        const blob = `${r.rule_name} ${r.rule_description} ${r.category ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rules, showInactive, levelFilter, categoryFilter, festivalFilter, search, filtered]);

  const counts = useMemo(() => {
    const active = rules.filter((r) => r.active);
    return {
      total: active.length,
      critical: active.filter((r) => r.severity === "critical").length,
      important: active.filter((r) => r.severity === "important").length,
      info: active.filter((r) => r.severity === "info").length,
      inactive: rules.filter((r) => !r.active).length,
    };
  }, [rules]);

  const grouped = useMemo(() => {
    const g: Record<Level, Rule[]> = { critical: [], important: [], info: [] };
    for (const r of filteredFinal) g[r.severity]?.push(r);
    return g;
  }, [filteredFinal]);

  // ---- mutations ----
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Rule | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Rule | null>(null);

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setDrawerOpen(true);
  }

  function openEdit(r: Rule) {
    setForm({
      rule_name: r.rule_name,
      rule_description: r.rule_description,
      severity: r.severity,
      category: r.category ?? "general",
      applies_to_festivals: r.applies_to_festivals ?? [],
      all_festivals: !r.applies_to_festivals || r.applies_to_festivals.length === 0,
      source: r.source ?? "",
      effective_from: r.effective_from ?? "",
      effective_until: r.effective_until ?? "",
      active: r.active,
    });
    setEditingId(r.id);
    setDrawerOpen(true);
  }

  function openDuplicate(r: Rule) {
    setForm({
      rule_name: r.rule_name + " (copy)",
      rule_description: r.rule_description,
      severity: r.severity,
      category: r.category ?? "general",
      applies_to_festivals: r.applies_to_festivals ?? [],
      all_festivals: !r.applies_to_festivals || r.applies_to_festivals.length === 0,
      source: r.source ?? "",
      effective_from: r.effective_from ?? "",
      effective_until: r.effective_until ?? "",
      active: r.active,
    });
    setEditingId(null);
    setDrawerOpen(true);
  }

  const saveRule = useMutation({
    mutationFn: async () => {
      const payload: any = {
        rule_name: form.rule_name.trim(),
        rule_description: form.rule_description.trim(),
        severity: form.severity,
        category: form.category || null,
        applies_to_festivals: form.all_festivals ? null : (form.applies_to_festivals.length ? form.applies_to_festivals : null),
        source: form.source.trim() || null,
        effective_from: form.effective_from || null,
        effective_until: form.effective_until || null,
        active: form.active,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        const { error } = await (supabase as any).from("cross_festival_rules").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("cross_festival_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Rule updated" : "Rule created");
      setDrawerOpen(false);
      qc.invalidateQueries({ queryKey: ["cross-festival-rules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const setActive = useMutation({
    mutationFn: async (vars: { id: string; active: boolean }) => {
      const { error } = await (supabase as any)
        .from("cross_festival_rules")
        .update({ active: vars.active, updated_at: new Date().toISOString() })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule status updated");
      qc.invalidateQueries({ queryKey: ["cross-festival-rules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("cross_festival_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule deleted");
      qc.invalidateQueries({ queryKey: ["cross-festival-rules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const festivalLookup = useMemo(() => {
    const m = new Map<string, string>();
    festivals.forEach((f) => m.set(f.slug, f.name));
    return m;
  }, [festivals]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-heading font-bold">Operations Rulebook</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            The constitution of festival operations. Critical rules cannot be violated.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/rules/export"><Printer className="h-4 w-4" /> Print all</Link>
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4" /> Add rule</Button>
        </div>
      </header>

      {/* Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Total active" value={counts.total} icon={ScrollText} cls="bg-muted/40 text-foreground border-border" onClick={() => { setLevelFilter("all"); setShowInactive(false); }} />
        <Tile label="Critical" value={counts.critical} icon={ShieldAlert} cls="bg-red-500/10 text-red-700 border-red-500/40" onClick={() => { setLevelFilter("critical"); setShowInactive(false); }} />
        <Tile label="Important" value={counts.important} icon={AlertTriangle} cls="bg-orange-500/10 text-orange-700 border-orange-500/40" onClick={() => { setLevelFilter("important"); setShowInactive(false); }} />
        <Tile label="Info" value={counts.info} icon={Info} cls="bg-blue-500/10 text-blue-700 border-blue-500/40" onClick={() => { setLevelFilter("info"); setShowInactive(false); }} />
      </div>

      {/* Filters */}
      <section className="rounded-lg border bg-card p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {(["all", "critical", "important", "info"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition",
                levelFilter === l
                  ? l === "all"
                    ? "bg-foreground text-background border-foreground"
                    : LEVEL_META[l as Level].chip
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {l === "all" ? "All" : LEVEL_META[l as Level].label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => {
            const on = categoryFilter.has(c);
            return (
              <button
                key={c}
                onClick={() => {
                  const n = new Set(categoryFilter);
                  on ? n.delete(c) : n.add(c);
                  setCategoryFilter(n);
                }}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium border transition",
                  on ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {c.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>

        <div className="min-w-[180px]">
          <Select value={festivalFilter} onValueChange={setFestivalFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Festival" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All festivals</SelectItem>
              {festivals.map((f) => (
                <SelectItem key={f.slug} value={f.slug}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={showInactive} onCheckedChange={(c) => setShowInactive(!!c)} />
          Show inactive ({counts.inactive})
        </label>

        <div className="relative ml-auto min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, category…"
            className="pl-7 h-8 text-xs"
          />
        </div>
      </section>

      {/* Rules grouped by level */}
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : filteredFinal.length === 0 ? (
        <p className="text-sm text-muted-foreground p-6 text-center">No rules match these filters.</p>
      ) : (
        <div className="space-y-6">
          {(["critical", "important", "info"] as Level[]).map((level) => {
            const list = grouped[level];
            if (list.length === 0) return null;
            const Meta = LEVEL_META[level];
            const Icon = Meta.icon;
            return (
              <section key={level}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={cn("h-5 w-5", Meta.ring)} />
                  <h2 className="font-heading text-lg font-semibold">{Meta.label} rules</h2>
                  <span className="text-xs text-muted-foreground">({list.length})</span>
                </div>
                <div className="space-y-3">
                  {list.map((r) => (
                    <RuleCard
                      key={r.id}
                      rule={r}
                      festivalLookup={festivalLookup}
                      onEdit={() => openEdit(r)}
                      onDuplicate={() => openDuplicate(r)}
                      onDeactivate={() => {
                        if (r.severity === "critical" && r.active) setConfirmDeactivate(r);
                        else setActive.mutate({ id: r.id, active: !r.active });
                      }}
                      onDelete={() => setConfirmDelete(r)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Add/Edit drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit rule" : "Add rule"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.rule_name} onChange={(e) => setForm({ ...form, rule_name: e.target.value })} />
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea
                rows={6}
                value={form.rule_description}
                onChange={(e) => setForm({ ...form, rule_description: e.target.value })}
                placeholder="Full rule text. Line breaks preserved."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Level *</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as Level })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="important">Important</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Festivals affected</Label>
              <label className="flex items-center gap-2 text-sm mt-1">
                <Checkbox
                  checked={form.all_festivals}
                  onCheckedChange={(c) => setForm({ ...form, all_festivals: !!c, applies_to_festivals: c ? [] : form.applies_to_festivals })}
                />
                All festivals (no restriction)
              </label>
              {!form.all_festivals && (
                <div className="mt-2 flex flex-wrap gap-1 max-h-40 overflow-y-auto p-2 border rounded">
                  {festivals.map((f) => {
                    const on = form.applies_to_festivals.includes(f.slug);
                    return (
                      <button
                        type="button"
                        key={f.slug}
                        onClick={() => {
                          const next = on
                            ? form.applies_to_festivals.filter((s) => s !== f.slug)
                            : [...form.applies_to_festivals, f.slug];
                          setForm({ ...form, applies_to_festivals: next });
                        }}
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[11px] border",
                          on ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground"
                        )}
                      >
                        {f.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <Label>Source</Label>
              <Input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="e.g. Internal decision 12 May 2026, or email subject"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Effective from</Label>
                <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
              </div>
              <div>
                <Label>Effective until</Label>
                <Input type="date" value={form.effective_until} onChange={(e) => setForm({ ...form, effective_until: e.target.value })} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.active} onCheckedChange={(c) => setForm({ ...form, active: !!c })} />
              Active
            </label>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.rule_name.trim() || !form.rule_description.trim() || saveRule.isPending}
              onClick={() => saveRule.mutate()}
            >
              {editingId ? "Save changes" : "Create rule"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Critical deactivate confirm */}
      <AlertDialog open={!!confirmDeactivate} onOpenChange={(o) => !o && setConfirmDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate critical rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Critical rules are part of the operations constitution. Deactivating may cause downstream
              ingestion or operational decisions to break this policy. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeactivate) setActive.mutate({ id: confirmDeactivate.id, active: false });
                setConfirmDeactivate(null);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This rule will be permanently removed. To preserve history, use Deactivate instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) deleteRule.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Permanently delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Tile({
  label, value, icon: Icon, cls, onClick,
}: { label: string; value: number; icon: typeof ScrollText; cls: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("rounded-lg border p-4 text-left transition hover:opacity-90", cls)}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-3xl font-heading font-bold tabular-nums mt-1">{value}</div>
    </button>
  );
}

function RuleCard({
  rule, festivalLookup, onEdit, onDuplicate, onDeactivate, onDelete,
}: {
  rule: Rule;
  festivalLookup: Map<string, string>;
  onEdit: () => void;
  onDuplicate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const Meta = LEVEL_META[rule.severity];
  const Icon = Meta.icon;
  const fests = rule.applies_to_festivals ?? [];
  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-4",
        Meta.border,
        !rule.active && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", Meta.ring)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h3 className="font-heading text-base font-semibold leading-tight">{rule.rule_name}</h3>
            <div className="flex items-center gap-1 shrink-0">
              <span className={cn("text-[10px] uppercase font-semibold px-2 py-0.5 rounded border", Meta.chip)}>
                {Meta.label}
              </span>
              {!rule.active && (
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded border border-border bg-muted text-muted-foreground">
                  Inactive
                </span>
              )}
            </div>
          </div>

          <p className="text-sm text-foreground mt-2 whitespace-pre-line">{rule.rule_description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            {rule.category && (
              <span className="px-2 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground">
                {rule.category.replace(/_/g, " ")}
              </span>
            )}
            {fests.length === 0 ? (
              <span className="px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                All festivals
              </span>
            ) : (
              fests.map((slug) => (
                <Link
                  key={slug}
                  to={`/festivals/${slug}`}
                  className="px-2 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary hover:underline"
                >
                  {festivalLookup.get(slug) ?? slug}
                </Link>
              ))
            )}
            {(rule.applies_to_operators ?? []).map((op) => (
              <span key={op} className="px-2 py-0.5 rounded border border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300">
                {op}
              </span>
            ))}
            {rule.source && (
              <span className="px-2 py-0.5 rounded border border-border bg-background text-muted-foreground">
                Source: {rule.source}
              </span>
            )}
            {(rule.effective_from || rule.effective_until) && (
              <span className="px-2 py-0.5 rounded border border-border bg-background text-muted-foreground">
                {rule.effective_from ?? "—"} → {rule.effective_until ?? "permanent"}
              </span>
            )}
            {rule.linked_question_id && (
              <Link
                to={`/questions?q=${rule.linked_question_id}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:underline"
              >
                <LinkIcon className="h-3 w-3" /> From question
              </Link>
            )}
          </div>

          <div className="mt-3 flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            <Button variant="ghost" size="sm" onClick={onDuplicate}><CopyIcon className="h-3.5 w-3.5" /> Duplicate</Button>
            <Button variant="ghost" size="sm" onClick={onDeactivate}>
              {rule.active ? <><Pause className="h-3.5 w-3.5" /> Deactivate</> : <><Play className="h-3.5 w-3.5" /> Reactivate</>}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
