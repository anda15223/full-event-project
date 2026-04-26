import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Upload, FileText, File as FileIcon, Loader2, Sparkles, Brain,
  ChevronDown, ChevronRight, GripVertical, Download, Pencil, Check, Eye, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SmartCardChat } from "./SmartCardChat";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export type SmartCardProps = {
  /** Stable key for this card type, e.g. 'equipment_list','cooling_storage','safety' */
  cardKey: string;
  /** The festival this card belongs to */
  festivalId: string;
  /** Optional concept this card belongs to (per-concept cards) */
  conceptId?: string;
  /** Heading shown at the top of the card */
  title: string;
  /** Subtitle/explanation */
  subtitle?: string;
  /** Show a red "to be ordered / missing" warning when card has zero sections */
  emptyStateWarning?: { label: string; description?: string };
  /** Allowed file extensions for upload */
  acceptedFileTypes?: string;
  /** Hide the brain "Grab info" button (default false) */
  hideBrainButton?: boolean;
};

type SCard = { id: string; title: string | null; meta: any };
type SSection = { id: string; title: string; description: string | null; order_index: number; source: string; source_file_id: string | null };
type SLine = {
  id: string; section_id: string; label: string | null; value: string | null;
  quantity: string | null; notes: string | null; status: string | null;
  owner: string | null; due_date: string | null; order_index: number;
  source: string; source_file_id: string | null;
};
type SValidationWarning = { field: string; message: string; severity: "error" | "warn" };
type SFile = {
  id: string; storage_path: string; url: string | null; filename: string | null;
  mime_type: string | null; size: number | null; ai_summary: string | null;
  parse_status: string; parse_error: string | null; uploaded_at: string;
  warnings: SValidationWarning[] | null;
  meta?: Record<string, any> | null;
};
type STodo = {
  id: string; title: string; description: string | null; due_date: string | null;
  owner: string | null; status: string; source: string; order_index: number;
};
const sourceColor = (s: string) => {
  switch (s) {
    case "ai": return "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-300/40";
    case "brain": return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-300/40";
    case "upload": return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-300/40";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

const sourceLabel = (s: string) => {
  switch (s) {
    case "ai": return "AI";
    case "brain": return "Brain";
    case "upload": return "Upload";
    default: return "Manual";
  }
};

export function SmartCard({
  cardKey, festivalId, conceptId, title, subtitle,
  emptyStateWarning, acceptedFileTypes = ".pdf,.xlsx,.xls,.docx,.doc,.csv,.txt,.png,.jpg,.jpeg,.webp",
  hideBrainButton,
}: SmartCardProps) {
  const [card, setCard] = useState<SCard | null>(null);
  const [sections, setSections] = useState<SSection[]>([]);
  const [lines, setLines] = useState<SLine[]>([]);
  const [files, setFiles] = useState<SFile[]>([]);
  const [todos, setTodos] = useState<STodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openSummary, setOpenSummary] = useState<Record<string, boolean>>({});
  const [brainDiagnostics, setBrainDiagnostics] = useState<any | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  // Brain document picker
  const [brainPickerOpen, setBrainPickerOpen] = useState(false);
  const [brainDocs, setBrainDocs] = useState<any[]>([]);
  const [loadingBrainDocs, setLoadingBrainDocs] = useState(false);
  const [selectedBrainIds, setSelectedBrainIds] = useState<Set<string>>(new Set());
  const [includeOtherCards, setIncludeOtherCards] = useState(true);
  const [sourceCardFilter, setSourceCardFilter] = useState<string>("all");
  const visibleBrainDocs = brainDocs.filter((d) => {
    if (!includeOtherCards && !d.same_card) return false;
    if (sourceCardFilter !== "all" && d.category !== sourceCardFilter) return false;
    return true;
  });
  const [editMode, setEditMode] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<SFile | null>(null);
  const [cascadeDeleteData, setCascadeDeleteData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chatRefreshKey, setChatRefreshKey] = useState(0);
  // Snapshot taken when entering edit mode, used to revert on cancel
  const [snapshot, setSnapshot] = useState<{ sections: SSection[]; lines: SLine[]; todos: STodo[] } | null>(null);
  // Track pending DB operations made during edit mode
  const [pending, setPending] = useState<{
    sectionInserts: SSection[];
    sectionUpdates: Record<string, Partial<SSection>>;
    sectionDeletes: string[];
    lineInserts: SLine[];
    lineUpdates: Record<string, Partial<SLine>>;
    lineDeletes: string[];
    todoUpdates: Record<string, Partial<STodo>>;
    todoDeletes: string[];
  }>({
    sectionInserts: [], sectionUpdates: {}, sectionDeletes: [],
    lineInserts: [], lineUpdates: {}, lineDeletes: [],
    todoUpdates: {}, todoDeletes: [],
  });
  const resetPending = () => setPending({
    sectionInserts: [], sectionUpdates: {}, sectionDeletes: [],
    lineInserts: [], lineUpdates: {}, lineDeletes: [],
    todoUpdates: {}, todoDeletes: [],
  });
  const isDraftId = (id: string) => id.startsWith("draft-");
  const hasUnsavedChanges = () =>
    pending.sectionInserts.length > 0 ||
    Object.keys(pending.sectionUpdates).length > 0 ||
    pending.sectionDeletes.length > 0 ||
    pending.lineInserts.length > 0 ||
    Object.keys(pending.lineUpdates).length > 0 ||
    pending.lineDeletes.length > 0 ||
    Object.keys(pending.todoUpdates).length > 0 ||
    pending.todoDeletes.length > 0;

  // ---- Initial load: get-or-create the card, then sections+lines+files ----
  const reload = useCallback(async () => {
    if (!festivalId) return;
    setLoading(true);
    try {
      // Find or create the SmartCard row
      const filter: any = { card_key: cardKey, festival_id: festivalId };
      if (conceptId) filter.concept_id = conceptId;
      let { data: cards } = await (supabase as any)
        .from("smart_cards")
        .select("*")
        .match(filter)
        .limit(1);
      let c = cards?.[0];
      if (!c) {
        const insert: any = { card_key: cardKey, festival_id: festivalId, title };
        if (conceptId) insert.concept_id = conceptId;
        const { data: created, error } = await (supabase as any)
          .from("smart_cards").insert(insert).select().single();
        if (error) throw error;
        c = created;
      }
      setCard(c);

      const [{ data: secs }, { data: fls }, { data: tds }] = await Promise.all([
        (supabase as any).from("smart_sections").select("*").eq("card_id", c.id).order("order_index"),
        (supabase as any).from("smart_files").select("*").eq("card_id", c.id).order("uploaded_at", { ascending: false }),
        (supabase as any).from("smart_todos").select("*").eq("card_id", c.id).order("order_index"),
      ]);
      setSections(secs || []);
      setFiles(fls || []);
      setTodos(tds || []);

      if (secs && secs.length) {
        const { data: lns } = await (supabase as any)
          .from("smart_lines")
          .select("*")
          .in("section_id", secs.map((s: any) => s.id))
          .order("order_index");
        setLines(lns || []);
      } else {
        setLines([]);
      }
    } catch (e: any) {
      toast.error(`Could not load card: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [cardKey, festivalId, conceptId, title]);

  useEffect(() => { reload(); }, [reload]);

  // ---- Section + line CRUD (deferred — only commit on Save) ----
  const addSection = () => {
    if (!card) return;
    const order = sections.length ? Math.max(...sections.map(s => s.order_index)) + 1 : 0;
    const draft: SSection = {
      id: `draft-${crypto.randomUUID()}`,
      title: "New section",
      description: null,
      order_index: order,
      source: "manual",
      source_file_id: null,
    };
    setSections(prev => [...prev, draft]);
    setPending(p => ({ ...p, sectionInserts: [...p.sectionInserts, draft] }));
  };

  const updateSection = (id: string, patch: Partial<SSection>) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, ...patch } as SSection : s));
    if (isDraftId(id)) {
      setPending(p => ({
        ...p,
        sectionInserts: p.sectionInserts.map(s => s.id === id ? { ...s, ...patch } as SSection : s),
      }));
    } else {
      setPending(p => ({
        ...p,
        sectionUpdates: { ...p.sectionUpdates, [id]: { ...(p.sectionUpdates[id] || {}), ...patch } },
      }));
    }
  };

  const deleteSection = (id: string) => {
    if (!confirm("Delete this section and all its lines? (will apply when you Save)")) return;
    setSections(prev => prev.filter(s => s.id !== id));
    setLines(prev => prev.filter(l => l.section_id !== id));
    if (isDraftId(id)) {
      setPending(p => ({
        ...p,
        sectionInserts: p.sectionInserts.filter(s => s.id !== id),
        lineInserts: p.lineInserts.filter(l => l.section_id !== id),
      }));
    } else {
      setPending(p => ({ ...p, sectionDeletes: [...p.sectionDeletes, id] }));
    }
  };

  const addLine = (sectionId: string) => {
    const sectionLines = lines.filter(l => l.section_id === sectionId);
    const order = sectionLines.length ? Math.max(...sectionLines.map(l => l.order_index)) + 1 : 0;
    const draft: SLine = {
      id: `draft-${crypto.randomUUID()}`,
      section_id: sectionId,
      label: "", value: null, quantity: null, notes: null,
      status: null, owner: null, due_date: null,
      order_index: order, source: "manual", source_file_id: null,
    };
    setLines(prev => [...prev, draft]);
    setPending(p => ({ ...p, lineInserts: [...p.lineInserts, draft] }));
  };

  const updateLine = (id: string, patch: Partial<SLine>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } as SLine : l));
    if (isDraftId(id)) {
      setPending(p => ({
        ...p,
        lineInserts: p.lineInserts.map(l => l.id === id ? { ...l, ...patch } as SLine : l),
      }));
    } else {
      setPending(p => ({
        ...p,
        lineUpdates: { ...p.lineUpdates, [id]: { ...(p.lineUpdates[id] || {}), ...patch } },
      }));
    }
  };

  const deleteLine = (id: string) => {
    setLines(prev => prev.filter(l => l.id !== id));
    if (isDraftId(id)) {
      setPending(p => ({ ...p, lineInserts: p.lineInserts.filter(l => l.id !== id) }));
    } else {
      setPending(p => ({ ...p, lineDeletes: [...p.lineDeletes, id] }));
    }
  };

  // ---- Todo CRUD (deferred when in edit mode) ----
  const toggleTodo = (id: string, current: string) => {
    const next = current === "done" ? "open" : "done";
    setTodos(prev => prev.map(t => t.id === id ? { ...t, status: next } : t));
    if (editMode) {
      setPending(p => ({ ...p, todoUpdates: { ...p.todoUpdates, [id]: { ...(p.todoUpdates[id] || {}), status: next } } }));
    } else {
      // Outside edit mode, persist immediately (checkbox toggle is a quick action)
      (supabase as any).from("smart_todos").update({ status: next }).eq("id", id).then(({ error }: any) => {
        if (error) { toast.error("Save failed"); reload(); }
      });
    }
  };
  const deleteTodo = (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
    if (editMode) {
      setPending(p => ({ ...p, todoDeletes: [...p.todoDeletes, id] }));
    } else {
      (supabase as any).from("smart_todos").delete().eq("id", id).then(({ error }: any) => {
        if (error) { toast.error("Delete failed"); reload(); }
      });
    }
  };

  // ---- Save / Cancel ----
  const enterEditMode = () => {
    setSnapshot({ sections: [...sections], lines: [...lines], todos: [...todos] });
    resetPending();
    setEditMode(true);
  };

  const cancelEdit = () => {
    if (hasUnsavedChanges() && !confirm("Discard unsaved changes?")) return;
    if (snapshot) {
      setSections(snapshot.sections);
      setLines(snapshot.lines);
      setTodos(snapshot.todos);
    }
    resetPending();
    setSnapshot(null);
    setEditMode(false);
  };

  const saveChanges = async () => {
    if (!card) return;
    if (!hasUnsavedChanges()) {
      setEditMode(false);
      setSnapshot(null);
      return;
    }
    setSaving(true);
    try {
      // 1. Insert new sections (draft id -> real id mapping)
      const sectionIdMap: Record<string, string> = {};
      if (pending.sectionInserts.length) {
        const rows = pending.sectionInserts.map(s => ({
          card_id: card.id, title: s.title, description: s.description,
          order_index: s.order_index, source: s.source,
        }));
        const { data, error } = await (supabase as any).from("smart_sections").insert(rows).select();
        if (error) throw error;
        pending.sectionInserts.forEach((draft, i) => { sectionIdMap[draft.id] = data[i].id; });
      }
      // 2. Update existing sections
      for (const [id, patch] of Object.entries(pending.sectionUpdates)) {
        const { error } = await (supabase as any).from("smart_sections").update(patch).eq("id", id);
        if (error) throw error;
      }
      // 3. Delete sections
      if (pending.sectionDeletes.length) {
        const { error } = await (supabase as any).from("smart_sections").delete().in("id", pending.sectionDeletes);
        if (error) throw error;
      }
      // 4. Insert new lines (resolve draft section ids)
      if (pending.lineInserts.length) {
        const rows = pending.lineInserts.map(l => ({
          section_id: sectionIdMap[l.section_id] || l.section_id,
          label: l.label, value: l.value, quantity: l.quantity, notes: l.notes,
          status: l.status, owner: l.owner, due_date: l.due_date,
          order_index: l.order_index, source: l.source,
        }));
        const { error } = await (supabase as any).from("smart_lines").insert(rows);
        if (error) throw error;
      }
      // 5. Update existing lines
      for (const [id, patch] of Object.entries(pending.lineUpdates)) {
        const { error } = await (supabase as any).from("smart_lines").update(patch).eq("id", id);
        if (error) throw error;
      }
      // 6. Delete lines
      if (pending.lineDeletes.length) {
        const { error } = await (supabase as any).from("smart_lines").delete().in("id", pending.lineDeletes);
        if (error) throw error;
      }
      // 7. Update todos
      for (const [id, patch] of Object.entries(pending.todoUpdates)) {
        const { error } = await (supabase as any).from("smart_todos").update(patch).eq("id", id);
        if (error) throw error;
      }
      // 8. Delete todos
      if (pending.todoDeletes.length) {
        const { error } = await (supabase as any).from("smart_todos").delete().in("id", pending.todoDeletes);
        if (error) throw error;
      }
      toast.success("Saved");
      resetPending();
      setSnapshot(null);
      setEditMode(false);
      await reload();
    } catch (e: any) {
      toast.error(`Save failed: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || !card) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        const path = `${festivalId}/${cardKey}/${conceptId || "festival"}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("festival-photos")
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upErr) { toast.error(`Upload failed: ${file.name}`); continue; }
        const { data: pub } = supabase.storage.from("festival-photos").getPublicUrl(path);
        const { data: fileRow, error: fErr } = await (supabase as any).from("smart_files").insert({
          card_id: card.id, storage_path: path, url: pub.publicUrl,
          filename: file.name, mime_type: file.type, size: file.size,
          parse_status: "pending",
        }).select().single();
        if (fErr || !fileRow) { toast.error("Could not save file"); continue; }

        // Brain mode: silently summarize. Do NOT create sections yet.
        // The user must click "Propose changes" on the file to release the info.
        setExtracting(true);
        try {
          const { error } = await supabase.functions.invoke("smart-card-extract", {
            body: {
              action: "summarize",
              file_id: fileRow.id,
              file_url: pub.publicUrl,
              file_name: file.name,
              mime_type: file.type,
            },
          });
          if (error) throw error;
          toast.success(
            `${file.name} stored in Brain`,
            { description: "Click ✨ Propose changes on the file to let AI suggest sections." },
          );
        } catch (e: any) {
          toast.error(`Brain summarize failed: ${e.message || e}`);
        } finally {
          setExtracting(false);
        }
      }
      await reload();
    } finally {
      setUploading(false);
    }
  };

  // On-demand: run structured extraction for a stored file → proposal.
  const proposeFromFile = async (f: SFile) => {
    if (!card) return;
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("smart-card-extract", {
        body: {
          action: "extract",
          dry_run: true,
          file_id: f.id,
          card_id: card.id,
          card_key: cardKey,
          festival_id: festivalId,
          concept_id: conceptId || null,
          file_url: f.url,
          file_name: f.filename,
          mime_type: f.mime_type,
        },
      });
      if (error) throw error;
      const proposed = (data as any)?.sections_proposed || 0;
      toast.success(`AI proposed ${proposed} section(s) — review and Apply.`);
      setChatRefreshKey(k => k + 1);
      await reload();
    } catch (e: any) {
      toast.error(`Propose failed: ${e.message || e}`);
    } finally {
      setExtracting(false);
    }
  };

  const applyProposal = async (f: SFile) => {
    if (!card) return;
    try {
      const { error } = await supabase.functions.invoke("smart-card-extract", {
        body: {
          action: "apply_proposal",
          file_id: f.id,
          card_id: card.id,
          card_key: cardKey,
          festival_id: festivalId,
          concept_id: conceptId || null,
        },
      });
      if (error) throw error;
      toast.success("Proposal applied — sections added to the card");
      setChatRefreshKey(k => k + 1);
      await reload();
    } catch (e: any) {
      toast.error(`Apply failed: ${e.message || e}`);
    }
  };

  const discardProposal = async (f: SFile) => {
    if (!card) return;
    if (!confirm("Discard this AI proposal? The file will stay attached but no sections will be created.")) return;
    try {
      const { error } = await supabase.functions.invoke("smart-card-extract", {
        body: {
          action: "discard_proposal",
          file_id: f.id,
          card_id: card.id,
        },
      });
      if (error) throw error;
      toast.success("Proposal discarded");
      setChatRefreshKey(k => k + 1);
      await reload();
    } catch (e: any) {
      toast.error(`Discard failed: ${e.message || e}`);
    }
  };

  // Step 1: open the picker — load the available Brain documents for this card.
  const openBrainPicker = async () => {
    if (!card) return;
    setBrainPickerOpen(true);
    setLoadingBrainDocs(true);
    setBrainDocs([]);
    try {
      const { data, error } = await supabase.functions.invoke("smart-card-extract", {
        body: {
          action: "list_brain_docs",
          card_key: cardKey,
          festival_id: festivalId,
          concept_id: conceptId || null,
        },
      });
      if (error) throw error;
      const items: any[] = data?.items || [];
      setBrainDocs(items);
      // Pre-select the recommended ones so the default behaviour matches the old "auto" flow.
      setSelectedBrainIds(new Set(items.filter((d) => d.recommended).map((d) => d.id)));
    } catch (e: any) {
      toast.error(`Could not load Brain docs: ${e.message || e}`);
    } finally {
      setLoadingBrainDocs(false);
    }
  };

  // Step 2: actually grab from Brain, restricted to the docs the user picked.
  const confirmGrabFromBrain = async () => {
    if (!card) return;
    const visibleIds = visibleBrainDocs.map((d) => d.id);
    const explicitIds = Array.from(selectedBrainIds);
    const ids = explicitIds.length ? explicitIds : visibleIds;
    if (!ids.length) return;

    setBrainPickerOpen(false);
    setGrabbing(true);
    try {
      const { data, error } = await supabase.functions.invoke("smart-card-extract", {
        body: {
          action: "grab_brain",
          card_key: cardKey,
          festival_id: festivalId,
          concept_id: conceptId || null,
          brain_ids: ids,
        },
      });
      if (error) throw error;
      const suggestions: Array<{ title: string; lines: any[] }> = data?.suggestions || [];
      setBrainDiagnostics(data?.diagnostics || null);
      if (data?.diagnostics) setShowDiagnostics(true);
      if (!suggestions.length) {
        toast.info(
          ids.length
            ? "Picked Brain docs didn't yield card-specific info — try different docs."
            : "Brain has nothing for this card yet — fill it in and it'll learn.",
        );
        return;
      }
      const baseOrder = sections.length ? Math.max(...sections.map(s => s.order_index)) + 1 : 0;
      let order = baseOrder;
      for (const s of suggestions) {
        const { data: sec, error: sErr } = await (supabase as any).from("smart_sections").insert({
          card_id: card.id, title: s.title, order_index: order++, source: "brain",
        }).select().single();
        if (sErr || !sec) continue;
        if (Array.isArray(s.lines) && s.lines.length) {
          await (supabase as any).from("smart_lines").insert(s.lines.map((l: any, i: number) => ({
            section_id: sec.id, label: l.label, value: l.value, quantity: l.quantity, notes: l.notes,
            order_index: i, source: "brain",
          })));
        }
      }
      toast.success(
        `Grabbed ${suggestions.length} section(s) from ${ids.length || "all matching"} Brain doc(s)`,
      );
      reload();
    } catch (e: any) {
      toast.error(`Brain grab failed: ${e.message || e}`);
    } finally {
      setGrabbing(false);
    }
  };

  const toggleBrainDoc = (id: string) => {
    setSelectedBrainIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  useEffect(() => {
    if (!brainPickerOpen || loadingBrainDocs || sourceCardFilter === "all") return;
    const visibleIds = visibleBrainDocs.map((d) => d.id);
    if (visibleIds.length === 0) return;
    const selectedVisibleCount = visibleIds.filter((id) => selectedBrainIds.has(id)).length;
    if (selectedVisibleCount === 0) setSelectedBrainIds(new Set(visibleIds));
  }, [brainPickerOpen, loadingBrainDocs, sourceCardFilter, visibleBrainDocs, selectedBrainIds]);


  // File deletion is staged via the AlertDialog (see fileToDelete state).
  const performDeleteFile = async (f: SFile, alsoDeleteData: boolean) => {
    try {
      if (alsoDeleteData) {
        // Cascade: remove sections (and their lines via FK) and any standalone lines created by this file
        const linkedSections = sections.filter(s => s.source_file_id === f.id).map(s => s.id);
        if (linkedSections.length) {
          await (supabase as any).from("smart_sections").delete().in("id", linkedSections);
        }
        await (supabase as any).from("smart_lines").delete().eq("source_file_id", f.id);
      }
      if (f.storage_path) await supabase.storage.from("festival-photos").remove([f.storage_path]);
      await (supabase as any).from("smart_files").delete().eq("id", f.id);
      toast.success(alsoDeleteData ? "File and extracted data deleted" : "File deleted");
      reload();
    } catch (e: any) {
      toast.error(`Delete failed: ${e.message || e}`);
    }
  };


  // Mark a validation warning as intentional / not-applicable, with the user's reason.
  const dismissWarning = async (f: SFile, field: string, currentReason?: string | null) => {
    const reason = window.prompt(
      `Why is "${field}" not actually missing? (a short note, e.g. "this PDF covers all containers")`,
      currentReason || "",
    );
    if (reason === null) return; // cancelled
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Reason required to dismiss a warning");
      return;
    }
    const meta = (f.meta || {}) as Record<string, any>;
    const dismissed = { ...(meta.dismissed_warnings || {}), [field]: trimmed };
    const { error } = await (supabase as any)
      .from("smart_files")
      .update({ meta: { ...meta, dismissed_warnings: dismissed } })
      .eq("id", f.id);
    if (error) toast.error("Save failed");
    else {
      toast.success("Warning marked as resolved");
      reload();
    }
  };

  // Restore (un-dismiss) a previously-dismissed warning.
  const restoreWarning = async (f: SFile, field: string) => {
    const meta = (f.meta || {}) as Record<string, any>;
    const dismissed = { ...(meta.dismissed_warnings || {}) };
    delete dismissed[field];
    const { error } = await (supabase as any)
      .from("smart_files")
      .update({ meta: { ...meta, dismissed_warnings: dismissed } })
      .eq("id", f.id);
    if (error) toast.error("Save failed");
    else reload();
  };

  if (loading) {
    return (
      <Card className="p-5 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </Card>
    );
  }

  const showWarning = !!emptyStateWarning && sections.length === 0 && files.length === 0;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {editMode && !hideBrainButton && (
            <Button size="sm" variant="outline" className="h-8" onClick={openBrainPicker} disabled={grabbing}>
              {grabbing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
              Grab info
            </Button>
          )}
          {editMode && (
            <label className="inline-flex">
              <input
                type="file"
                multiple
                accept={acceptedFileTypes}
                className="hidden"
                disabled={uploading || extracting}
                onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }}
              />
              <Button size="sm" variant="outline" className="h-8 cursor-pointer" asChild>
                <span>
                  {uploading || extracting
                    ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    : <Upload className="h-3.5 w-3.5 mr-1" />}
                  {extracting ? "AI reading…" : uploading ? "Uploading…" : "Upload"}
                </span>
              </Button>
            </label>
          )}
          {editMode && (
            <Button size="sm" onClick={addSection} className="h-8">
              <Plus className="h-3.5 w-3.5 mr-1" /> Section
            </Button>
          )}
          {editMode ? (
            <>
              <Button size="sm" variant="ghost" className="h-8" onClick={cancelEdit} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                variant="default"
                className="h-8"
                onClick={saveChanges}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                {hasUnsavedChanges() ? `Save${(pending.sectionInserts.length + Object.keys(pending.sectionUpdates).length + pending.sectionDeletes.length + pending.lineInserts.length + Object.keys(pending.lineUpdates).length + pending.lineDeletes.length) > 0 ? ` (${pending.sectionInserts.length + Object.keys(pending.sectionUpdates).length + pending.sectionDeletes.length + pending.lineInserts.length + Object.keys(pending.lineUpdates).length + pending.lineDeletes.length})` : ""}` : "Done"}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={enterEditMode}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
        </div>
      </div>

      {/* Empty-state red warning */}
      {showWarning && (
        <div className="m-4 rounded-lg border-2 border-destructive/50 bg-destructive/5 p-4 text-center">
          <p className="text-sm font-semibold text-destructive">⚠️ {emptyStateWarning!.label}</p>
          {emptyStateWarning!.description && (
            <p className="text-xs text-destructive/80 mt-1">{emptyStateWarning!.description}</p>
          )}
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <div className="px-5 py-3 border-b border-border/50 bg-muted/10 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source files</p>
          {files.map(f => {
            const rawWarnings = Array.isArray(f.warnings) ? f.warnings : [];
            const dismissedMap = (f.meta?.dismissed_warnings || {}) as Record<string, string>;
            const wlist = rawWarnings.map((w: any) => ({
              ...w,
              dismissed: !!dismissedMap[w.field],
              dismiss_reason: dismissedMap[w.field] || null,
            }));
            const activeWarnings = wlist.filter((w: any) => !w.dismissed);
            const errCount = activeWarnings.filter((w: any) => w.severity === "error").length;
            return (
              <div key={f.id} className="space-y-1">
                <div className="flex items-center gap-2 text-sm group">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{f.filename}</span>
                  {f.parse_status === "processing" && <Loader2 className="h-3 w-3 animate-spin text-violet-500" />}
                  {f.parse_status === "done" && activeWarnings.length === 0 && (
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", sourceColor("ai"))}>AI parsed ✓</Badge>
                  )}
                  {f.parse_status === "done" && activeWarnings.length > 0 && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 px-1.5 text-[10px]",
                        errCount > 0
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300/40",
                      )}
                    >
                      {errCount > 0 ? `${errCount} missing` : `${activeWarnings.length} warning${activeWarnings.length === 1 ? "" : "s"}`}
                    </Badge>
                  )}
                  {f.parse_status === "error" && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">parse error</Badge>}
                  {f.parse_status === "stored" && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-300/40">
                      <Brain className="h-2.5 w-2.5 mr-0.5" /> In Brain
                    </Badge>
                  )}
                  {f.parse_status === "preview" && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-300/40">
                      Pending review
                    </Badge>
                  )}
                  {f.parse_status === "discarded" && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-muted text-muted-foreground border-border">
                      Discarded
                    </Badge>
                  )}
                  {(f.parse_status === "stored" || f.parse_status === "discarded") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => proposeFromFile(f)}
                      disabled={extracting}
                      title="Run AI extraction and preview proposed sections"
                    >
                      {extracting
                        ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        : <Sparkles className="h-3 w-3 mr-1" />}
                      Propose changes
                    </Button>
                  )}
                  {f.ai_summary && (
                    <button
                      onClick={() => setOpenSummary(p => ({ ...p, [f.id]: !p[f.id] }))}
                      className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-foreground"
                      title={openSummary[f.id] ? "Hide AI read" : "Show AI read"}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noreferrer" className="opacity-0 group-hover:opacity-100">
                      <Download className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                  <button
                    onClick={() => { setCascadeDeleteData(true); setFileToDelete(f); }}
                    className="opacity-0 group-hover:opacity-100 text-destructive"
                    title="Delete file"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {openSummary[f.id] && f.ai_summary && (
                  <div className="ml-6 mt-1 rounded-md border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                      <Sparkles className="h-3 w-3" /> AI read this from the file
                    </div>
                    <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {f.ai_summary}
                    </p>
                  </div>
                )}
                {wlist.length > 0 && (
                  <ul className="ml-6 space-y-0.5">
                    {wlist.map((w: any, i: number) => (
                      <li
                        key={i}
                        className={cn(
                          "text-[11px] flex items-start gap-1.5 group/w",
                          w.dismissed
                            ? "text-muted-foreground opacity-80"
                            : w.severity === "error"
                              ? "text-destructive"
                              : "text-amber-700 dark:text-amber-300",
                        )}
                      >
                        <span className="shrink-0 mt-0.5">
                          {w.dismissed ? "✅" : w.severity === "error" ? "⛔" : "⚠️"}
                        </span>
                        <span className="flex-1">
                          <span className={w.dismissed ? "line-through" : ""}>{w.message}</span>
                          {w.dismissed && w.dismiss_reason && (
                            <span className="ml-1 italic text-muted-foreground">
                              — {w.dismiss_reason}
                            </span>
                          )}
                        </span>
                        {w.dismissed ? (
                          <span className="flex items-center gap-2 opacity-0 group-hover/w:opacity-100 transition">
                            <button
                              type="button"
                              onClick={() => dismissWarning(f, w.field, w.dismiss_reason)}
                              className="underline hover:text-foreground"
                              title="Edit reason"
                            >
                              edit reason
                            </button>
                            <button
                              type="button"
                              onClick={() => restoreWarning(f, w.field)}
                              className="underline hover:text-foreground"
                              title="Restore as a real warning"
                            >
                              restore
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => dismissWarning(f, w.field)}
                            className="opacity-0 group-hover/w:opacity-100 underline hover:text-foreground transition"
                            title="Mark as not actually missing"
                          >
                            mark as OK
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {/* Pending AI proposal — preview + Apply / Discard */}
                {f.parse_status === "preview" && f.meta?.proposal && (
                  <div className="ml-6 mt-2 rounded-md border-2 border-violet-300 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/30 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                        <Sparkles className="h-3 w-3" /> AI proposal — review before applying
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => discardProposal(f)}
                        >
                          <X className="h-3 w-3 mr-1" /> Discard
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => applyProposal(f)}
                        >
                          <Check className="h-3 w-3 mr-1" /> Apply
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(f.meta.proposal.sections || []).map((s: any, si: number) => (
                        <div key={si} className="rounded border border-violet-200/70 dark:border-violet-900/50 bg-background/60 p-2">
                          <div className="text-xs font-semibold text-foreground mb-1">
                            {s.title}{" "}
                            <span className="text-muted-foreground font-normal">
                              · {(s.lines || []).length} line{(s.lines || []).length === 1 ? "" : "s"}
                            </span>
                          </div>
                          {(s.lines || []).length > 0 && (
                            <ul className="space-y-0.5">
                              {(s.lines || []).slice(0, 8).map((l: any, li: number) => (
                                <li key={li} className="text-[11px] text-foreground/80 leading-snug">
                                  <span className="font-medium">{l.label}</span>
                                  {l.value && <span>: {l.value}</span>}
                                  {l.quantity && <span className="text-muted-foreground"> × {l.quantity}</span>}
                                  {l.notes && <span className="text-muted-foreground italic"> — {l.notes}</span>}
                                </li>
                              ))}
                              {(s.lines || []).length > 8 && (
                                <li className="text-[10px] text-muted-foreground italic">
                                  …and {(s.lines || []).length - 8} more
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Brain diagnostics panel */}
      {brainDiagnostics && (
        <div className="px-5 py-3 border-b border-border/50 bg-amber-50/40 dark:bg-amber-950/20">
          <button
            type="button"
            onClick={() => setShowDiagnostics((v) => !v)}
            className="w-full flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
              <Brain className="h-3.5 w-3.5" />
              Brain diagnostics
              <span className="font-normal normal-case tracking-normal text-muted-foreground">
                · {brainDiagnostics.brain_rows_selected ?? 0} doc(s) selected ·{" "}
                {brainDiagnostics.structured_sections ?? 0} structured + {brainDiagnostics.ai_source_docs ?? 0} AI source(s)
              </span>
            </div>
            {showDiagnostics ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
            )}
          </button>
          {showDiagnostics && (
            <div className="mt-3 space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground">Fetched</div>
                  <div className="font-semibold">{brainDiagnostics.brain_rows_fetched ?? 0}</div>
                </div>
                <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground">Considered</div>
                  <div className="font-semibold">{brainDiagnostics.brain_rows_considered ?? 0}</div>
                </div>
                <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground">Selected</div>
                  <div className="font-semibold">{brainDiagnostics.brain_rows_selected ?? 0}</div>
                </div>
                <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground">AI extraction</div>
                  <div className="font-semibold">
                    {brainDiagnostics.ai_extraction?.attempted
                      ? brainDiagnostics.ai_extraction?.succeeded
                        ? `OK (${brainDiagnostics.ai_extraction?.sections_returned ?? 0} sections)`
                        : "Failed"
                      : "Skipped"}
                  </div>
                </div>
              </div>

              {brainDiagnostics.ai_extraction && !brainDiagnostics.ai_extraction.attempted && (
                <p className="text-muted-foreground italic">
                  AI extraction skipped — {brainDiagnostics.ai_extraction.reason}
                </p>
              )}
              {brainDiagnostics.ai_extraction?.attempted && !brainDiagnostics.ai_extraction.succeeded && (
                <p className="text-destructive">
                  AI extraction failed: {brainDiagnostics.ai_extraction.error}
                </p>
              )}

              {Array.isArray(brainDiagnostics.documents) && brainDiagnostics.documents.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Selected Brain documents</div>
                  <ul className="space-y-1 max-h-48 overflow-auto pr-1">
                    {brainDiagnostics.documents.map((d: any) => (
                      <li key={d.id} className="rounded border border-border/40 bg-background/50 px-2 py-1 flex items-center gap-2">
                        <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase shrink-0">
                          {d.role === "structured_line" ? "structured" : "AI source"}
                        </Badge>
                        <span className="truncate flex-1" title={d.key_name || d.display_name || d.id}>
                          {d.display_name || d.key_name || d.id}
                        </span>
                        <span className="text-muted-foreground text-[10px] shrink-0">
                          {d.category || "—"} · score {d.score} · {d.content_chars}c
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(brainDiagnostics.rejected_examples) && brainDiagnostics.rejected_examples.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Rejected (top 5)</div>
                  <ul className="space-y-1">
                    {brainDiagnostics.rejected_examples.map((d: any) => (
                      <li key={d.id} className="text-muted-foreground">
                        <span className="font-medium text-foreground/80">{d.key_name || d.id}</span>
                        {" — "}{d.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(brainDiagnostics.notes) && brainDiagnostics.notes.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Notes</div>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {brainDiagnostics.notes.map((n: string, i: number) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sections */}
      <div className="divide-y divide-border/60">
        {sections.map(section => {
          const sectionLines = lines.filter(l => l.section_id === section.id);
          const isCollapsed = collapsed[section.id];
          return (
            <div key={section.id} className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setCollapsed(p => ({ ...p, [section.id]: !p[section.id] }))} className="text-muted-foreground hover:text-foreground">
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {editMode ? (
                  <Input
                    value={section.title}
                    onChange={(e) => updateSection(section.id, { title: e.target.value })}
                    className="h-8 text-base font-semibold border-transparent bg-transparent focus-visible:bg-background flex-1"
                  />
                ) : (
                  <h4 className="text-base font-semibold flex-1 truncate">{section.title}</h4>
                )}
                <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] shrink-0", sourceColor(section.source))}>
                  {sourceLabel(section.source)}
                </Badge>
                {editMode && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => deleteSection(section.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {!isCollapsed && (
                <div className="pl-6 space-y-1.5">
                  {sectionLines.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No lines yet.</p>
                  )}
                  {editMode ? (
                    sectionLines.map(line => (
                      <div key={line.id} className="grid grid-cols-[1fr_1.4fr_70px_1fr_60px_24px] gap-1.5 items-center group">
                        <Input value={line.label ?? ""} onChange={(e) => updateLine(line.id, { label: e.target.value })} placeholder="Label" className="h-7 text-xs" />
                        <Input value={line.value ?? ""} onChange={(e) => updateLine(line.id, { value: e.target.value })} placeholder="Value" className="h-7 text-xs" />
                        <Input value={line.quantity ?? ""} onChange={(e) => updateLine(line.id, { quantity: e.target.value })} placeholder="Qty" className="h-7 text-xs" />
                        <Input value={line.notes ?? ""} onChange={(e) => updateLine(line.id, { notes: e.target.value })} placeholder="Notes" className="h-7 text-xs" />
                        <Badge variant="outline" className={cn("h-5 px-1 text-[9px] justify-center", sourceColor(line.source))}>
                          {sourceLabel(line.source)}
                        </Badge>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100" onClick={() => deleteLine(line.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    sectionLines.length > 0 && (
                      cardKey === "equipment_list" ? (
                        <div className="rounded-md border border-border/60 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-xs text-muted-foreground">
                              <tr>
                                <th className="text-left font-medium px-3 py-1.5 w-[35%]">Item</th>
                                <th className="text-left font-medium px-3 py-1.5 w-[20%]">Detail</th>
                                <th className="text-left font-medium px-3 py-1.5 w-[12%]">Qty</th>
                                <th className="text-left font-medium px-3 py-1.5">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sectionLines.map((line, idx) => {
                                const hasLabel = !!line.label?.trim();
                                const hasValue = !!line.value?.trim();
                                const hasQty = !!line.quantity?.trim();
                                const hasNotes = !!line.notes?.trim();
                                if (!hasLabel && !hasValue && !hasQty && !hasNotes) return null;
                                return (
                                  <tr key={line.id} className={cn("border-t border-border/40", idx % 2 === 1 && "bg-muted/20")}>
                                    <td className="px-3 py-1.5 font-medium text-foreground align-top">{line.label || "—"}</td>
                                    <td className="px-3 py-1.5 text-foreground/90 align-top">{line.value || ""}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground align-top tabular-nums">{line.quantity || ""}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground italic align-top">{line.notes || ""}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {sectionLines.map(line => {
                            const hasLabel = !!line.label?.trim();
                            const hasValue = !!line.value?.trim();
                            const hasQty = !!line.quantity?.trim();
                            const hasNotes = !!line.notes?.trim();
                            if (!hasLabel && !hasValue && !hasQty && !hasNotes) return null;
                            return (
                              <li key={line.id} className="text-sm flex flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-snug">
                                {hasLabel && <span className="font-medium text-foreground">{line.label}{hasValue ? ":" : ""}</span>}
                                {hasValue && <span className="text-foreground/90">{line.value}</span>}
                                {hasQty && <span className="text-xs text-muted-foreground">× {line.quantity}</span>}
                                {hasNotes && <span className="text-xs text-muted-foreground italic">— {line.notes}</span>}
                              </li>
                            );
                          })}
                        </ul>
                      )
                    )
                  )}
                  {editMode && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => addLine(section.id)}>
                      <Plus className="h-3 w-3 mr-1" /> Add line
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sections.length === 0 && !showWarning && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Sparkles className="h-5 w-5 mx-auto mb-2 opacity-50" />
            <p>No sections yet. Upload a document, grab from Brain, or add a section manually.</p>
          </div>
        )}
      </div>

      {/* Todos */}
      {todos.length > 0 && (
        <div className="px-5 py-3 border-t border-border/60 bg-amber-50/40 dark:bg-amber-950/10">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            ✓ Todos
          </p>
          <ul className="space-y-1.5">
            {todos.map(t => {
              const overdue = t.due_date && t.status !== "done" && new Date(t.due_date) < new Date(new Date().toDateString());
              return (
                <li key={t.id} className="flex items-start gap-2 text-sm group">
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    onChange={() => toggleTodo(t.id, t.status)}
                    className="mt-1 shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={cn("leading-snug", t.status === "done" && "line-through text-muted-foreground")}>
                      {t.title}
                    </div>
                    {(t.due_date || t.owner) && (
                      <div className={cn("text-[11px] mt-0.5", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                        {t.due_date && <span>📅 {t.due_date}</span>}
                        {t.due_date && t.owner && <span> · </span>}
                        {t.owner && <span>👤 {t.owner}</span>}
                        {overdue && <span className="ml-1">· overdue</span>}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteTodo(t.id)}
                    className="opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* AI chat */}
      {card && (
        <SmartCardChat cardId={card.id} cardTitle={title} onMutated={reload} refreshKey={chatRefreshKey} />
      )}

      {/* Delete file confirmation */}
      <AlertDialog open={!!fileToDelete} onOpenChange={(o) => !o && setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <span className="font-medium text-foreground">{fileToDelete?.filename}</span> will be permanently removed.
                </p>
                <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer p-3 rounded-md border border-border bg-muted/30">
                  <input
                    type="checkbox"
                    checked={cascadeDeleteData}
                    onChange={(e) => setCascadeDeleteData(e.target.checked)}
                    className="mt-0.5 cursor-pointer"
                  />
                  <span>
                    <span className="font-medium">Also delete all data extracted from this file</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Removes every section and line that was created from this upload. Manual entries are kept.
                    </span>
                  </span>
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (fileToDelete) {
                  performDeleteFile(fileToDelete, cascadeDeleteData);
                  setFileToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Brain document picker */}
      <Dialog open={brainPickerOpen} onOpenChange={setBrainPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4" /> Pick Brain documents to extract from
            </DialogTitle>
            <DialogDescription>
              Choose which documents the AI should read for <span className="font-medium text-foreground">{title}</span>.
              Recommended ones (matching this card) are pre-selected. You can also pull info from <span className="font-medium text-foreground">other cards</span> by ticking them below.
            </DialogDescription>
          </DialogHeader>

          {/* Cross-card toggle + source card filter */}
          {!loadingBrainDocs && brainDocs.length > 0 && (() => {
            // Build list of distinct source cards present in brainDocs
            const cardsPresent = Array.from(
              new Set(brainDocs.map((d) => d.category).filter(Boolean) as string[])
            ).sort();
            return (
              <div className="flex flex-wrap items-center gap-3 px-1 pt-1 pb-2 text-xs border-b">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeOtherCards}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIncludeOtherCards(next);
                      if (!next) {
                        setSourceCardFilter("all");
                        setSelectedBrainIds((prev) => {
                          const out = new Set<string>();
                          brainDocs.forEach((d) => {
                            if (d.same_card && prev.has(d.id)) out.add(d.id);
                          });
                          return out;
                        });
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <span className="font-medium">Include info from other cards</span>
                  <span className="text-muted-foreground">
                    ({brainDocs.filter((d) => !d.same_card).length} cross-card docs)
                  </span>
                </label>

                {includeOtherCards && cardsPresent.length > 1 && (
                  <label className="flex items-center gap-2 ml-auto">
                    <span className="text-muted-foreground">Source card:</span>
                    <select
                      value={sourceCardFilter}
                      onChange={(e) => {
                        const next = e.target.value;
                        setSourceCardFilter(next);
                        if (next === "all") {
                          // Re-select recommended docs across all visible
                          setSelectedBrainIds(new Set(
                            brainDocs.filter((d) => d.recommended).map((d) => d.id)
                          ));
                        } else {
                          // Auto-select every doc from the chosen source card
                          setSelectedBrainIds(new Set(
                            brainDocs.filter((d) => d.category === next).map((d) => d.id)
                          ));
                        }
                      }}
                      className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">All cards</option>
                      {cardsPresent.map((c) => (
                        <option key={c} value={c}>
                          {c === cardKey ? `${c} (this card)` : c}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            );
          })()}

          <div className="flex-1 overflow-y-auto -mx-6 px-6 py-2 space-y-1.5">
            {loadingBrainDocs && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading Brain…
              </div>
            )}
            {(() => {
              if (!loadingBrainDocs && visibleBrainDocs.length === 0) {
                return (
                  <div className="text-center text-sm text-muted-foreground py-10">
                    {brainDocs.length === 0
                      ? "Brain has no documents matching this card yet. Upload one or fill it in manually."
                      : sourceCardFilter !== "all"
                        ? `No documents from “${sourceCardFilter}”. Pick another source card or choose “All cards”.`
                        : "No documents on this card yet. Toggle “Include info from other cards” to pull from elsewhere."}
                  </div>
                );
              }
              return null;
            })()}
            {!loadingBrainDocs && brainDocs.length > 0 && (() => {
              if (visibleBrainDocs.length === 0) return null;
              const visibleSelected = visibleBrainDocs.filter((d) => selectedBrainIds.has(d.id)).length;
              const allChecked = visibleSelected === visibleBrainDocs.length;
              const someChecked = visibleSelected > 0 && !allChecked;
              return (
                <label className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-background/95 backdrop-blur border-b flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked; }}
                    onChange={() => {
                      setSelectedBrainIds((prev) => {
                        const next = new Set(prev);
                        if (allChecked) {
                          visibleBrainDocs.forEach((d) => next.delete(d.id));
                        } else {
                          visibleBrainDocs.forEach((d) => next.add(d.id));
                        }
                        return next;
                      });
                    }}
                    className="cursor-pointer"
                  />
                  <span className="text-xs font-medium">
                    {allChecked ? "Uncheck all" : "Check all"}
                  </span>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {visibleSelected} / {visibleBrainDocs.length} shown
                  </span>
                </label>
              );
            })()}
            {!loadingBrainDocs && visibleBrainDocs
              .map((d) => {
              const checked = selectedBrainIds.has(d.id);
              return (
                <label
                  key={d.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                    checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBrainDoc(d.id)}
                    className="mt-1 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {d.display_name || d.key_name}
                      </span>
                      {d.recommended && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-primary/40 text-primary">
                          recommended
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {d.role === "structured_line" ? "structured" : "AI source"}
                      </Badge>
                      {d.category && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] h-4 px-1",
                            d.same_card ? "border-primary/40 text-primary" : "border-amber-400/50 text-amber-700 dark:text-amber-300"
                          )}
                        >
                          {d.same_card ? d.category : `from: ${d.category}`}
                        </Badge>
                      )}
                      {d.scope && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground">
                          {d.scope}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        score {d.score} · used {d.frequency}×
                      </span>
                    </div>
                    {d.content_preview && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {d.content_preview}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2 border-t pt-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{selectedBrainIds.size} of {brainDocs.length} selected</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setSelectedBrainIds(new Set(brainDocs.map((d) => d.id)))}
                disabled={!brainDocs.length}
              >
                Select all
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setSelectedBrainIds(new Set())}
                disabled={!brainDocs.length}
              >
                Clear
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setBrainPickerOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={confirmGrabFromBrain}
                disabled={selectedBrainIds.size === 0 || grabbing}
              >
                {grabbing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                Extract from {selectedBrainIds.size} doc(s)
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
