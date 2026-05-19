import { useMemo, useState, KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowLeft, Plus, Pencil, Users, X, Archive, RotateCcw, Search } from "lucide-react";

type Source = "soborg" | "local" | "unknown";
type Proficiency = "lead" | "trained" | "can_help";

interface Staff {
  id: string;
  full_name: string;
  display_name: string | null;
  home_location: string | null;
  source: Source | null;
  phone: string | null;
  email: string | null;
  languages: string[] | null;
  dietary_notes: string | null;
  tshirt_size: string | null;
  general_notes: string | null;
  is_active: boolean;
}
interface Station { id: string; concept_id: string | null; code: string; label: string; display_order: number | null; }
interface Concept { id: string; name: string; short_name: string | null; display_order: number | null; is_active: boolean | null; }
interface Skill { id: string; staff_id: string; station_id: string; proficiency: Proficiency; }

const SOURCE_LABEL: Record<Source, string> = { soborg: "Søborg", local: "Local", unknown: "Unknown" };
const PROF_DOT: Record<Proficiency, string> = {
  lead: "bg-emerald-500",
  trained: "bg-sky-500",
  can_help: "bg-zinc-400",
};
const PROF_LABEL: Record<Proficiency, string> = { lead: "Lead", trained: "Trained", can_help: "Can help" };

function initials(name: string) {
  return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
}

const emptyDraft = (): Partial<Staff> => ({
  full_name: "",
  display_name: "",
  home_location: "",
  source: "unknown",
  phone: "",
  email: "",
  languages: [],
  dietary_notes: "",
  tshirt_size: "",
  general_notes: "",
  is_active: true,
});

export default function StaffDirectory() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | Source>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [editing, setEditing] = useState<Staff | null>(null);
  const [draft, setDraft] = useState<Partial<Staff>>(emptyDraft());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [langInput, setLangInput] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Staff | null>(null);

  // new skill row
  const [newSkillConcept, setNewSkillConcept] = useState<string>("");
  const [newSkillStation, setNewSkillStation] = useState<string>("");
  const [newSkillProf, setNewSkillProf] = useState<Proficiency>("trained");

  const staffQ = useQuery({
    queryKey: ["staff-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, full_name, display_name, home_location, source, phone, email, languages, dietary_notes, tshirt_size, general_notes, is_active")
        .order("is_active", { ascending: false })
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Staff[];
    },
  });

  const stationsQ = useQuery({
    queryKey: ["stations-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("station").select("id, concept_id, code, label, display_order");
      if (error) throw error;
      return (data ?? []) as Station[];
    },
  });

  const conceptsQ = useQuery({
    queryKey: ["concepts-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concepts")
        .select("id, name, short_name, display_order, is_active")
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Concept[];
    },
  });

  const skillsQ = useQuery({
    queryKey: ["staff-skills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_station_skill")
        .select("id, staff_id, station_id, proficiency");
      if (error) throw error;
      return (data ?? []) as Skill[];
    },
  });

  const stationById = useMemo(() => {
    const m = new Map<string, Station>();
    (stationsQ.data ?? []).forEach(s => m.set(s.id, s));
    return m;
  }, [stationsQ.data]);

  const skillsByStaff = useMemo(() => {
    const m = new Map<string, Skill[]>();
    (skillsQ.data ?? []).forEach(s => {
      const arr = m.get(s.staff_id) ?? [];
      arr.push(s);
      m.set(s.staff_id, arr);
    });
    return m;
  }, [skillsQ.data]);

  const all = staffQ.data ?? [];
  const counts = useMemo(() => {
    const c = { total: all.length, active: 0, archived: 0, soborg: 0, local: 0, unknown: 0 };
    all.forEach(s => {
      if (s.is_active) c.active++; else c.archived++;
      const src = (s.source ?? "unknown") as Source;
      c[src]++;
    });
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(s => {
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "archived" && s.is_active) return false;
      if (sourceFilter !== "all" && (s.source ?? "unknown") !== sourceFilter) return false;
      if (q) {
        const hay = `${s.full_name} ${s.display_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, search, sourceFilter, statusFilter]);

  function openAdd() {
    setEditing(null);
    setDraft(emptyDraft());
    setLangInput("");
    setDrawerOpen(true);
  }
  function openEdit(s: Staff) {
    setEditing(s);
    setDraft({ ...s, languages: s.languages ?? [] });
    setLangInput("");
    setNewSkillConcept(""); setNewSkillStation(""); setNewSkillProf("trained");
    setDrawerOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: (draft.full_name ?? "").trim(),
        display_name: draft.display_name?.trim() || null,
        home_location: draft.home_location?.trim() || null,
        source: (draft.source ?? "unknown") as Source,
        phone: draft.phone?.trim() || null,
        email: draft.email?.trim() || null,
        languages: (draft.languages && draft.languages.length) ? draft.languages : null,
        dietary_notes: draft.dietary_notes?.trim() || null,
        tshirt_size: draft.tshirt_size?.trim() || null,
        general_notes: draft.general_notes?.trim() || null,
      };
      if (!payload.full_name) throw new Error("Full name is required");
      if (editing) {
        const { data, error } = await supabase.from("staff").update(payload).eq("id", editing.id).select().single();
        if (error) throw error;
        return data as Staff;
      } else {
        const { data, error } = await supabase.from("staff").insert(payload).select().single();
        if (error) throw error;
        return data as Staff;
      }
    },
    onSuccess: (s) => {
      toast.success(editing ? "Person updated" : "Person added");
      qc.invalidateQueries({ queryKey: ["staff-directory"] });
      setEditing(s);
      setDraft({ ...s, languages: s.languages ?? [] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const addSkillMut = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Save the person first");
      if (!newSkillStation) throw new Error("Pick a station");
      const { error } = await supabase
        .from("staff_station_skill")
        .upsert(
          { staff_id: editing.id, station_id: newSkillStation, proficiency: newSkillProf },
          { onConflict: "staff_id,station_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Skill saved");
      qc.invalidateQueries({ queryKey: ["staff-skills"] });
      setNewSkillStation("");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to add skill"),
  });

  const updateSkillProfMut = useMutation({
    mutationFn: async (args: { id: string; proficiency: Proficiency }) => {
      const { error } = await supabase.from("staff_station_skill").update({ proficiency: args.proficiency }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-skills"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const removeSkillMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_station_skill").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-skills"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const archiveMut = useMutation({
    mutationFn: async (args: { id: string; active: boolean }) => {
      const { error } = await supabase.from("staff").update({ is_active: args.active }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      toast.success(v.active ? "Restored" : "Archived");
      qc.invalidateQueries({ queryKey: ["staff-directory"] });
      setArchiveTarget(null);
      setDrawerOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  function addLang() {
    const v = langInput.trim();
    if (!v) return;
    const cur = draft.languages ?? [];
    if (cur.includes(v)) { setLangInput(""); return; }
    setDraft({ ...draft, languages: [...cur, v] });
    setLangInput("");
  }
  function removeLang(l: string) {
    setDraft({ ...draft, languages: (draft.languages ?? []).filter(x => x !== l) });
  }
  function onLangKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addLang(); }
  }

  const editingSkills = editing ? (skillsByStaff.get(editing.id) ?? []) : [];
  const conceptOptions = (conceptsQ.data ?? []).filter(c => c.is_active !== false);
  const stationsForConcept = useMemo(() => {
    if (!newSkillConcept) return [];
    if (newSkillConcept === "__mgmt__") return (stationsQ.data ?? []).filter(s => !s.concept_id);
    return (stationsQ.data ?? []).filter(s => s.concept_id === newSkillConcept);
  }, [newSkillConcept, stationsQ.data]);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>

      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 flex items-center justify-center">
          <Users className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Staff Directory</h1>
          <p className="text-muted-foreground mt-1">
            Your permanent team across all festivals. People stay here even when not assigned to an event.
          </p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add person</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{counts.total} total</Badge>
        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{counts.active} active</Badge>
        <Badge variant="secondary">{counts.archived} archived</Badge>
        <Badge variant="outline">{counts.soborg} Søborg / {counts.local} local / {counts.unknown} unknown</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={sourceFilter} onValueChange={(v: any) => setSourceFilter(v)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="soborg">Søborg</SelectItem>
            <SelectItem value="local">Local</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {staffQ.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 flex items-center justify-center mb-3">
            <Users className="h-6 w-6" />
          </div>
          <p className="text-muted-foreground">
            No staff yet. Add your first team member or import a roster PDF (coming in S3).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const skills = skillsByStaff.get(s.id) ?? [];
            return (
              <div key={s.id} className={cn("rounded-2xl border bg-card p-5 flex gap-4 items-start", !s.is_active && "opacity-60")}>
                <div className="h-12 w-12 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 flex items-center justify-center font-semibold shrink-0">
                  {initials(s.full_name)}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold">{s.full_name}</span>
                    {s.display_name && <span className="text-sm text-muted-foreground">({s.display_name})</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.home_location && <Badge variant="outline" className="font-normal">{s.home_location}</Badge>}
                    <Badge variant="outline" className="font-normal">{SOURCE_LABEL[(s.source ?? "unknown") as Source]}</Badge>
                  </div>
                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map(sk => {
                        const st = stationById.get(sk.station_id);
                        return (
                          <span key={sk.id} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs">
                            <span className={cn("h-1.5 w-1.5 rounded-full", PROF_DOT[sk.proficiency])} />
                            {st?.label ?? "Unknown station"}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {s.languages && s.languages.length > 0 && (
                    <div className="text-xs text-muted-foreground">{s.languages.join(" · ")}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.is_active ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Archived</Badge>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit person" : "Add person"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Full name *</Label>
              <Input value={draft.full_name ?? ""} onChange={e => setDraft({ ...draft, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Display name</Label>
              <Input value={draft.display_name ?? ""} onChange={e => setDraft({ ...draft, display_name: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Use for disambiguation, e.g. "Prieten Anik 1"</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Home location</Label>
                <Input value={draft.home_location ?? ""} onChange={e => setDraft({ ...draft, home_location: e.target.value })} />
              </div>
              <div>
                <Label>Source</Label>
                <Select value={(draft.source ?? "unknown") as string} onValueChange={(v: any) => setDraft({ ...draft, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soborg">Søborg</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={draft.phone ?? ""} onChange={e => setDraft({ ...draft, phone: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={draft.email ?? ""} onChange={e => setDraft({ ...draft, email: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Languages</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(draft.languages ?? []).map(l => (
                  <span key={l} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {l}
                    <button type="button" onClick={() => removeLang(l)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Type and press Enter" value={langInput} onChange={e => setLangInput(e.target.value)} onKeyDown={onLangKey} />
                <Button type="button" variant="outline" onClick={addLang}>Add</Button>
              </div>
            </div>
            <div>
              <Label>Dietary notes</Label>
              <Textarea rows={2} value={draft.dietary_notes ?? ""} onChange={e => setDraft({ ...draft, dietary_notes: e.target.value })} />
            </div>
            <div>
              <Label>T-shirt size</Label>
              <Input placeholder="XS / S / M / L / XL / XXL" value={draft.tshirt_size ?? ""} onChange={e => setDraft({ ...draft, tshirt_size: e.target.value })} />
            </div>
            <div>
              <Label>General notes</Label>
              <Textarea rows={3} value={draft.general_notes ?? ""} onChange={e => setDraft({ ...draft, general_notes: e.target.value })} />
            </div>

            <div className="border-t pt-4 space-y-3">
              <Label className="text-base">Station skills</Label>
              {!editing ? (
                <p className="text-sm text-muted-foreground">Save first, then add skills.</p>
              ) : (
                <>
                  {editingSkills.length === 0 && <p className="text-sm text-muted-foreground">No skills yet.</p>}
                  <div className="space-y-2">
                    {editingSkills.map(sk => {
                      const st = stationById.get(sk.station_id);
                      return (
                        <div key={sk.id} className="flex items-center gap-2 rounded-lg border p-2">
                          <span className={cn("h-2 w-2 rounded-full", PROF_DOT[sk.proficiency])} />
                          <span className="flex-1 text-sm">{st?.label ?? "?"}</span>
                          <Select value={sk.proficiency} onValueChange={(v: any) => updateSkillProfMut.mutate({ id: sk.id, proficiency: v })}>
                            <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lead">Lead</SelectItem>
                              <SelectItem value="trained">Trained</SelectItem>
                              <SelectItem value="can_help">Can help</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" onClick={() => removeSkillMut.mutate(sk.id)}><X className="h-4 w-4" /></Button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Add skill</div>
                    <Select value={newSkillConcept} onValueChange={v => { setNewSkillConcept(v); setNewSkillStation(""); }}>
                      <SelectTrigger><SelectValue placeholder="Concept" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__mgmt__">Management / cross-concept</SelectItem>
                        {conceptOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={newSkillStation} onValueChange={setNewSkillStation} disabled={!newSkillConcept}>
                      <SelectTrigger><SelectValue placeholder="Station" /></SelectTrigger>
                      <SelectContent>
                        {stationsForConcept.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={newSkillProf} onValueChange={(v: any) => setNewSkillProf(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="trained">Trained</SelectItem>
                        <SelectItem value="can_help">Can help</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" onClick={() => addSkillMut.mutate()} disabled={!newSkillStation || addSkillMut.isPending}>
                      <Plus className="h-4 w-4 mr-1" /> Add skill
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          <SheetFooter className="flex-row justify-between sm:justify-between gap-2">
            {editing ? (
              <Button
                variant="outline"
                onClick={() => {
                  if (editing.is_active) setArchiveTarget(editing);
                  else archiveMut.mutate({ id: editing.id, active: true });
                }}
              >
                {editing.is_active ? <><Archive className="h-4 w-4 mr-1" /> Archive</> : <><RotateCcw className="h-4 w-4 mr-1" /> Restore</>}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {editing ? "Save changes" : "Add person"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveTarget?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll be hidden from the active list but their history is kept. You can restore anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveTarget && archiveMut.mutate({ id: archiveTarget.id, active: false })}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
