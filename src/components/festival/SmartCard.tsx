import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Upload, FileText, File as FileIcon, Loader2, Sparkles, Brain,
  ChevronDown, ChevronRight, GripVertical, Download, Pencil, Check, Eye, Save, X, Copy, Wand2,
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
  /** Other concepts in the same festival/section — enables "Copy item to other concepts" */
  siblingConcepts?: { id: string; name: string }[];
  /** When true, each line shows a concept dropdown; on Save, lines with concept assigned get moved into that concept's per-concept card */
  conceptAssignerMode?: boolean;
  /** When provided, each line gets an Inventory category dropdown (persists immediately to meta.inventory_category). */
  inventoryCategories?: string[];
  /** When provided alongside siblingConcepts, each line gets a Concept allocator dropdown that persists immediately to meta.allocated_concept_id. */
  enableInlineConceptAllocator?: boolean;
};

type SCard = { id: string; title: string | null; meta: any };
type SSection = { id: string; title: string; description: string | null; order_index: number; source: string; source_file_id: string | null };
type SLine = {
  id: string; section_id: string; label: string | null; value: string | null;
  quantity: string | null; notes: string | null; status: string | null;
  owner: string | null; due_date: string | null; order_index: number;
  source: string; source_file_id: string | null;
  meta?: Record<string, any> | null;
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
  hideBrainButton, siblingConcepts, conceptAssignerMode,
  inventoryCategories, enableInlineConceptAllocator,
}: SmartCardProps) {
  // line.id -> target concept id chosen via dropdown (only used when conceptAssignerMode)
  const [lineConceptAssignment, setLineConceptAssignment] = useState<Record<string, string>>({});
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const [wiping, setWiping] = useState(false);
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
  const [moveErrors, setMoveErrors] = useState<{ conceptName: string; count: number; reason: string }[]>([]);
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
    pending.todoDeletes.length > 0 ||
    (conceptAssignerMode && Object.values(lineConceptAssignment).some(v => !!v));

  // ---- Initial load: get-or-create the card, then sections+lines+files ----
  const reload = useCallback(async () => {
    if (!festivalId) return;
    setLoading(true);
    try {
      // Find or create the SmartCard row (scope: festival-level when no conceptId, else per-concept)
      let query = (supabase as any)
        .from("smart_cards")
        .select("*")
        .eq("card_key", cardKey)
        .eq("festival_id", festivalId);
      query = conceptId ? query.eq("concept_id", conceptId) : query.is("concept_id", null);
      let { data: cards } = await query.limit(1);
      let c = cards?.[0];
      if (!c) {
        const insert: any = { card_key: cardKey, festival_id: festivalId, title, concept_id: conceptId ?? null };
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

  // Duplicate a line inline — inserts a copy directly under the source line in the same section.
  const duplicateLineInline = (id: string) => {
    const src = lines.find(l => l.id === id);
    if (!src) return;
    const draft: SLine = {
      id: `draft-${crypto.randomUUID()}`,
      section_id: src.section_id,
      label: src.label, value: src.value, quantity: src.quantity, notes: src.notes,
      status: src.status, owner: src.owner, due_date: src.due_date,
      order_index: src.order_index + 0.5, // temporary; we re-sequence below
      source: "manual", source_file_id: null,
    };
    setLines(prev => {
      // insert directly after src, then renumber order_index for that section
      const sectionLines = prev.filter(l => l.section_id === src.section_id);
      const others = prev.filter(l => l.section_id !== src.section_id);
      const idx = sectionLines.findIndex(l => l.id === src.id);
      const inserted = [...sectionLines.slice(0, idx + 1), draft, ...sectionLines.slice(idx + 1)]
        .map((l, i) => ({ ...l, order_index: i }));
      // capture renumbered order changes for non-draft existing lines
      setPending(p => {
        const lineUpdates = { ...p.lineUpdates };
        for (const l of inserted) {
          if (l.id === draft.id) continue;
          if (isDraftId(l.id)) continue;
          lineUpdates[l.id] = { ...(lineUpdates[l.id] || {}), order_index: l.order_index };
        }
        // replace lineInserts entries' order for draft items in this section
        const lineInserts = p.lineInserts.map(li => {
          if (li.section_id !== src.section_id) return li;
          const match = inserted.find(x => x.id === li.id);
          return match ? { ...li, order_index: match.order_index } : li;
        });
        return {
          ...p,
          lineInserts: [...lineInserts, { ...draft, order_index: inserted.find(x => x.id === draft.id)!.order_index }],
          lineUpdates,
        };
      });
      return [...others, ...inserted];
    });
  };


  // ---- Copy a single line into other concept cards (same cardKey + section title) ----
  const [copyOpenForLine, setCopyOpenForLine] = useState<string | null>(null);
  const [copyTargets, setCopyTargets] = useState<Record<string, boolean>>({});
  const [copying, setCopying] = useState(false);

  // ---- Duplicate an entire section (with its lines) into other concept cards ----
  const [dupSectionId, setDupSectionId] = useState<string | null>(null);
  const [dupTargets, setDupTargets] = useState<Record<string, boolean>>({});
  const [duplicating, setDuplicating] = useState(false);

  const openDuplicateSection = (sectionId: string) => {
    setDupTargets({});
    setDupSectionId(sectionId);
  };

  const duplicateSectionToConcepts = async () => {
    if (!dupSectionId) return;
    const section = sections.find(s => s.id === dupSectionId);
    if (!section) { toast.error("Section not found"); return; }
    if (isDraftId(section.id)) { toast.error("Save the section first, then duplicate."); return; }
    const targets = Object.entries(dupTargets).filter(([, v]) => v).map(([k]) => k);
    if (!targets.length) { toast.error("Pick at least one concept"); return; }
    const sectionLines = lines.filter(l => l.section_id === section.id && !isDraftId(l.id));

    setDuplicating(true);
    try {
      for (const targetConceptId of targets) {
        // 1. Find/create target SmartCard
        let { data: targetCard } = await (supabase as any)
          .from("smart_cards")
          .select("id")
          .eq("festival_id", festivalId)
          .eq("card_key", cardKey)
          .eq("concept_id", targetConceptId)
          .maybeSingle();

        if (!targetCard) {
          const conceptName = siblingConcepts?.find(c => c.id === targetConceptId)?.name ?? "Concept";
          const { data: created, error: cErr } = await (supabase as any)
            .from("smart_cards")
            .insert({
              festival_id: festivalId,
              card_key: cardKey,
              concept_id: targetConceptId,
              title: `${title.split(" — ")[0]} — ${conceptName}`,
              meta: {},
            })
            .select("id")
            .single();
          if (cErr) throw cErr;
          targetCard = created;
        }

        // 2. Find/create section by title
        let { data: targetSection } = await (supabase as any)
          .from("smart_sections")
          .select("id")
          .eq("card_id", targetCard.id)
          .eq("title", section.title)
          .maybeSingle();

        if (!targetSection) {
          const { data: maxRow } = await (supabase as any)
            .from("smart_sections")
            .select("order_index")
            .eq("card_id", targetCard.id)
            .order("order_index", { ascending: false })
            .limit(1)
            .maybeSingle();
          const nextOrder = (maxRow?.order_index ?? -1) + 1;
          const { data: createdSec, error: sErr } = await (supabase as any)
            .from("smart_sections")
            .insert({
              card_id: targetCard.id,
              title: section.title,
              description: section.description,
              order_index: nextOrder,
              source: "manual",
            })
            .select("id")
            .single();
          if (sErr) throw sErr;
          targetSection = createdSec;
        }

        // 3. Insert all lines
        if (sectionLines.length > 0) {
          const { data: maxLine } = await (supabase as any)
            .from("smart_lines")
            .select("order_index")
            .eq("section_id", targetSection.id)
            .order("order_index", { ascending: false })
            .limit(1)
            .maybeSingle();
          let next = (maxLine?.order_index ?? -1) + 1;
          const payload = sectionLines.map(l => ({
            section_id: targetSection.id,
            label: l.label,
            value: l.value,
            quantity: l.quantity,
            notes: l.notes,
            status: l.status,
            owner: l.owner,
            due_date: l.due_date,
            order_index: next++,
            source: "manual",
          }));
          const { error: lErr } = await (supabase as any).from("smart_lines").insert(payload);
          if (lErr) throw lErr;
        }
      }
      toast.success(`Section duplicated to ${targets.length} concept${targets.length > 1 ? "s" : ""}`);
      setDupSectionId(null);
    } catch (e: any) {
      console.error(e);
      toast.error(`Duplicate failed: ${e.message ?? "unknown"}`);
    } finally {
      setDuplicating(false);
    }
  };

  const openCopyDialog = (lineId: string) => {
    setCopyTargets({});
    setCopyOpenForLine(lineId);
  };

  const copyLineToConcepts = async () => {
    if (!copyOpenForLine) return;
    const line = lines.find(l => l.id === copyOpenForLine);
    const section = sections.find(s => s.id === line?.section_id);
    if (!line || !section) { toast.error("Line not found"); return; }
    const targets = Object.entries(copyTargets).filter(([, v]) => v).map(([k]) => k);
    if (!targets.length) { toast.error("Pick at least one concept"); return; }

    setCopying(true);
    try {
      for (const targetConceptId of targets) {
        // 1. Find or create the target SmartCard
        let { data: targetCard } = await (supabase as any)
          .from("smart_cards")
          .select("id")
          .eq("festival_id", festivalId)
          .eq("card_key", cardKey)
          .eq("concept_id", targetConceptId)
          .maybeSingle();

        if (!targetCard) {
          const conceptName = siblingConcepts?.find(c => c.id === targetConceptId)?.name ?? "Concept";
          const { data: created, error: cErr } = await (supabase as any)
            .from("smart_cards")
            .insert({
              festival_id: festivalId,
              card_key: cardKey,
              concept_id: targetConceptId,
              title: `${title.split(" — ")[0]} — ${conceptName}`,
              meta: {},
            })
            .select("id")
            .single();
          if (cErr) throw cErr;
          targetCard = created;
        }

        // 2. Find or create section with same title in target card
        let { data: targetSection } = await (supabase as any)
          .from("smart_sections")
          .select("id, order_index")
          .eq("card_id", targetCard.id)
          .eq("title", section.title)
          .maybeSingle();

        if (!targetSection) {
          const { data: maxRow } = await (supabase as any)
            .from("smart_sections")
            .select("order_index")
            .eq("card_id", targetCard.id)
            .order("order_index", { ascending: false })
            .limit(1)
            .maybeSingle();
          const nextOrder = (maxRow?.order_index ?? -1) + 1;
          const { data: createdSec, error: sErr } = await (supabase as any)
            .from("smart_sections")
            .insert({
              card_id: targetCard.id,
              title: section.title,
              description: section.description,
              order_index: nextOrder,
              source: "manual",
            })
            .select("id, order_index")
            .single();
          if (sErr) throw sErr;
          targetSection = createdSec;
        }

        // 3. Insert duplicated line
        const { data: maxLine } = await (supabase as any)
          .from("smart_lines")
          .select("order_index")
          .eq("section_id", targetSection.id)
          .order("order_index", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextLineOrder = (maxLine?.order_index ?? -1) + 1;

        const { error: lErr } = await (supabase as any)
          .from("smart_lines")
          .insert({
            section_id: targetSection.id,
            label: line.label,
            value: line.value,
            quantity: line.quantity,
            notes: line.notes,
            status: line.status,
            owner: line.owner,
            due_date: line.due_date,
            order_index: nextLineOrder,
            source: "manual",
          });
        if (lErr) throw lErr;
      }
      toast.success(`Copied to ${targets.length} concept${targets.length > 1 ? "s" : ""}`);
      setCopyOpenForLine(null);
    } catch (e: any) {
      console.error(e);
      toast.error(`Copy failed: ${e.message ?? "unknown"}`);
    } finally {
      setCopying(false);
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

  /** Wipe ALL per-concept cards (concept_id IS NOT NULL) for this card_key + festival.
   *  Used to reset legacy mixed data so the Common List becomes the single source of truth.
   *  Only meaningful in conceptAssignerMode (the Common List card itself). */
  const wipePerConceptCards = async () => {
    if (!conceptAssignerMode || !festivalId) return;
    setWiping(true);
    try {
      const { data: targetCards, error: cErr } = await (supabase as any)
        .from("smart_cards")
        .select("id")
        .eq("festival_id", festivalId)
        .eq("card_key", cardKey)
        .not("concept_id", "is", null);
      if (cErr) throw cErr;
      const cardIds = (targetCards ?? []).map((c: any) => c.id);
      if (!cardIds.length) {
        toast.info("No per-concept cards to clear");
        return;
      }
      const { data: secs, error: sErr } = await (supabase as any)
        .from("smart_sections").select("id").in("card_id", cardIds);
      if (sErr) throw sErr;
      const secIds = (secs ?? []).map((s: any) => s.id);
      if (secIds.length) {
        const { error: lErr } = await (supabase as any)
          .from("smart_lines").delete().in("section_id", secIds);
        if (lErr) throw lErr;
        const { error: dsErr } = await (supabase as any)
          .from("smart_sections").delete().in("id", secIds);
        if (dsErr) throw dsErr;
      }
      toast.success(`Cleared ${cardIds.length} concept card${cardIds.length === 1 ? "" : "s"}. Now assign concepts in the Common List and Save.`);
    } catch (e: any) {
      toast.error(`Reset failed: ${e.message || e}`);
    } finally {
      setWiping(false);
      setWipeDialogOpen(false);
    }
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
      // 4. Insert new lines (resolve draft section ids) — keep draft->real id map for assigner
      const lineIdMap: Record<string, string> = {};
      if (pending.lineInserts.length) {
        const rows = pending.lineInserts.map(l => ({
          section_id: sectionIdMap[l.section_id] || l.section_id,
          label: l.label, value: l.value, quantity: l.quantity, notes: l.notes,
          status: l.status, owner: l.owner, due_date: l.due_date,
          order_index: l.order_index, source: l.source,
        }));
        const { data, error } = await (supabase as any).from("smart_lines").insert(rows).select();
        if (error) throw error;
        pending.lineInserts.forEach((draft, i) => { lineIdMap[draft.id] = data[i].id; });
      }
      // 5. Update existing lines
      for (const [id, patch] of Object.entries(pending.lineUpdates)) {
        const { error } = await (supabase as any).from("smart_lines").update(patch).eq("id", id);
        if (error) throw error;
      }
      // 5b. Concept assigner: move lines into per-concept cards, then delete from this common card
      const movedLineIds: string[] = [];
      const moveFailures: { conceptName: string; count: number; reason: string }[] = [];
      setMoveErrors([]);
      if (Object.keys(lineConceptAssignment).length) {
        // group by concept (translate draft line ids -> real ids inserted in step 4)
        const byConcept: Record<string, string[]> = {};
        const unresolvedDrafts: string[] = [];
        for (const [lineId, targetConceptId] of Object.entries(lineConceptAssignment)) {
          if (!targetConceptId) continue;
          const realId = isDraftId(lineId) ? lineIdMap[lineId] : lineId;
          if (!realId) { unresolvedDrafts.push(lineId); continue; }
          if (targetConceptId === conceptId) continue; // same card, no-op
          (byConcept[targetConceptId] ||= []).push(realId);
        }
        if (unresolvedDrafts.length) {
          moveFailures.push({
            conceptName: "—",
            count: unresolvedDrafts.length,
            reason: "Draft lines weren't saved before move (missing real id).",
          });
        }
        for (const [targetConceptId, lineIds] of Object.entries(byConcept)) {
          const conceptName = siblingConcepts?.find(c => c.id === targetConceptId)?.name ?? "Concept";
          try {
            // Fetch moved lines fresh from DB so we have real section_ids + values
            const { data: linesToMove, error: fetchErr } = await (supabase as any)
              .from("smart_lines").select("*").in("id", lineIds);
            if (fetchErr) throw fetchErr;
            if (!linesToMove?.length) {
              moveFailures.push({ conceptName, count: lineIds.length, reason: "Lines not found in database." });
              continue;
            }
            if (linesToMove.length < lineIds.length) {
              moveFailures.push({
                conceptName,
                count: lineIds.length - linesToMove.length,
                reason: "Some lines were deleted before save.",
              });
            }

            // Get-or-create target SmartCard
            let { data: tCard, error: tCardErr } = await (supabase as any)
              .from("smart_cards")
              .select("id")
              .eq("festival_id", festivalId)
              .eq("card_key", cardKey)
              .eq("concept_id", targetConceptId)
              .maybeSingle();
            if (tCardErr) throw tCardErr;
            if (!tCard) {
              const { data: created, error: cErr } = await (supabase as any)
                .from("smart_cards")
                .insert({ festival_id: festivalId, card_key: cardKey, concept_id: targetConceptId, title: `${title.split(" — ")[0]} — ${conceptName}`, meta: {} })
                .select("id").single();
              if (cErr) throw cErr;
              tCard = created;
            }

            const successfullyMoved: string[] = [];
            // For each source section, get-or-create matching section in target card and insert lines
            const sectionsTouched = Array.from(new Set(linesToMove.map((l: any) => l.section_id)));
            for (const srcSecId of sectionsTouched) {
              // Try in-memory first; if section was just inserted, look up via reverse sectionIdMap; else fetch from DB
              let srcSec: any = sections.find(s => s.id === srcSecId);
              if (!srcSec) {
                const draftId = Object.keys(sectionIdMap).find(k => sectionIdMap[k] === srcSecId);
                if (draftId) srcSec = sections.find(s => s.id === draftId);
              }
              if (!srcSec) {
                const { data: fetched } = await (supabase as any)
                  .from("smart_sections").select("id, title, description").eq("id", srcSecId).maybeSingle();
                srcSec = fetched;
              }
              const inSection = linesToMove.filter((l: any) => l.section_id === srcSecId);
              if (!srcSec) {
                moveFailures.push({ conceptName, count: inSection.length, reason: "Source section could not be resolved." });
                continue;
              }
              let { data: tSec } = await (supabase as any)
                .from("smart_sections").select("id, order_index")
                .eq("card_id", tCard.id).eq("title", srcSec.title).maybeSingle();
              if (!tSec) {
                const { data: maxRow } = await (supabase as any)
                  .from("smart_sections").select("order_index")
                  .eq("card_id", tCard.id).order("order_index", { ascending: false }).limit(1).maybeSingle();
                const nextOrder = (maxRow?.order_index ?? -1) + 1;
                const { data: createdSec, error: sErr } = await (supabase as any)
                  .from("smart_sections")
                  .insert({ card_id: tCard.id, title: srcSec.title, description: srcSec.description, order_index: nextOrder, source: "manual" })
                  .select("id, order_index").single();
                if (sErr) {
                  moveFailures.push({ conceptName, count: inSection.length, reason: `Couldn't create target section: ${sErr.message}` });
                  continue;
                }
                tSec = createdSec;
              }
              const { data: maxLine } = await (supabase as any)
                .from("smart_lines").select("order_index")
                .eq("section_id", tSec.id).order("order_index", { ascending: false }).limit(1).maybeSingle();
              let nextLineOrder = (maxLine?.order_index ?? -1) + 1;
              const rows = inSection.map((l: any) => ({
                section_id: tSec.id,
                label: l.label, value: l.value, quantity: l.quantity, notes: l.notes,
                status: l.status, owner: l.owner, due_date: l.due_date,
                order_index: nextLineOrder++, source: l.source,
              }));
              if (rows.length) {
                const { error: lErr } = await (supabase as any).from("smart_lines").insert(rows);
                if (lErr) {
                  moveFailures.push({ conceptName, count: rows.length, reason: `Insert failed: ${lErr.message}` });
                  continue;
                }
                successfullyMoved.push(...inSection.map((l: any) => l.id));
              }
            }
            movedLineIds.push(...successfullyMoved);
          } catch (e: any) {
            moveFailures.push({ conceptName, count: lineIds.length, reason: e?.message || "Unknown error" });
          }
        }
      }
      // 6. Delete lines (including moved ones)
      const allDeletes = Array.from(new Set([...pending.lineDeletes, ...movedLineIds]));
      if (allDeletes.length) {
        const { error } = await (supabase as any).from("smart_lines").delete().in("id", allDeletes);
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
      const totalFailed = moveFailures.reduce((s, f) => s + f.count, 0);
      if (totalFailed > 0) {
        setMoveErrors(moveFailures);
        toast.warning(`Saved with ${totalFailed} line${totalFailed === 1 ? "" : "s"} not moved. See details below.`);
      } else {
        setMoveErrors([]);
        toast.success("Saved");
      }
      resetPending();
      setLineConceptAssignment({});
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
    const visibleSelectedIds = visibleBrainDocs.filter((d) => selectedBrainIds.has(d.id)).map((d) => d.id);
    const useSourceCard = sourceCardFilter !== "all";
    if (!useSourceCard && visibleSelectedIds.length === 0) {
      toast.error("Select the Brain documents you want to extract from.");
      return;
    }

    setBrainPickerOpen(false);
    setGrabbing(true);
    try {
      const { data, error } = await supabase.functions.invoke("smart-card-extract", {
        body: {
          action: "grab_brain",
          card_key: cardKey,
          festival_id: festivalId,
          concept_id: conceptId || null,
          source_card_key: useSourceCard ? sourceCardFilter : undefined,
          brain_ids: useSourceCard ? undefined : visibleSelectedIds,
        },
      });
      if (error) throw error;
      const suggestions: Array<{ title: string; lines: any[] }> = data?.suggestions || [];
      setBrainDiagnostics(data?.diagnostics || null);
      if (data?.diagnostics) setShowDiagnostics(true);
      if (!suggestions.length) {
        toast.info(
          useSourceCard
            ? `No ${cardKey} info found in ${sourceCardFilter}.`
            : "Picked Brain docs didn't yield card-specific info — try different docs.",
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
        useSourceCard
          ? `Grabbed ${suggestions.length} section(s) from ${sourceCardFilter}`
          : `Grabbed ${suggestions.length} section(s) from ${visibleSelectedIds.length} Brain doc(s)`,
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
          {conceptAssignerMode && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setWipeDialogOpen(true)}
              disabled={wiping}
              title="Clear all per-concept cards so the Common List becomes the single source of truth"
            >
              {wiping ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
              Fix legacy mixed items
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

      {/* Move-failure inline alert */}
      {moveErrors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium text-destructive">
              {moveErrors.reduce((s, f) => s + f.count, 0)} line{moveErrors.reduce((s, f) => s + f.count, 0) === 1 ? "" : "s"} could not be moved
            </div>
            <button
              type="button"
              onClick={() => setMoveErrors([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {moveErrors.map((f, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{f.conceptName}</span>: {f.count} line{f.count === 1 ? "" : "s"} — {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Concept assigner banner */}
      {conceptAssignerMode && editMode && siblingConcepts && siblingConcepts.length > 0 && (() => {
        const totalLines = lines.filter(l => !isDraftId(l.id)).length;
        const assignedCount = Object.values(lineConceptAssignment).filter(v => !!v).length;
        const byConcept: Record<string, number> = {};
        Object.entries(lineConceptAssignment).forEach(([, cId]) => {
          if (cId) byConcept[cId] = (byConcept[cId] || 0) + 1;
        });
        const assignAllUnassigned = (cId: string) => {
          setLineConceptAssignment(prev => {
            const next = { ...prev };
            for (const l of lines) {
              if (isDraftId(l.id)) continue;
              if (!next[l.id]) next[l.id] = cId;
            }
            return next;
          });
        };
        return (
          <div className="px-4 py-3 bg-primary/5 border-y border-primary/20">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="text-xs">
                <p className="font-semibold text-primary mb-1">
                  Split items into concept cards
                </p>
                <p className="text-muted-foreground">
                  Pick a concept on each row using the <span className="font-medium text-foreground">— concept —</span> dropdown, then press <span className="font-medium text-foreground">Save</span>. Items will move to the matching concept card below.
                </p>
                <p className="mt-1 text-foreground">
                  <span className="font-medium">{assignedCount}</span> of {totalLines} assigned
                  {Object.keys(byConcept).length > 0 && (
                    <span className="text-muted-foreground">
                      {" "}— {Object.entries(byConcept).map(([cId, n]) => {
                        const name = siblingConcepts.find(c => c.id === cId)?.name ?? "?";
                        return `${name}: ${n}`;
                      }).join(", ")}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Bulk assign all unassigned →</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {siblingConcepts.map(c => (
                    <Button
                      key={c.id}
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => assignAllUnassigned(c.id)}
                    >
                      {c.name}
                    </Button>
                  ))}
                  {assignedCount > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] text-muted-foreground"
                      onClick={() => setLineConceptAssignment({})}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                {editMode && !conceptAssignerMode && !!siblingConcepts && siblingConcepts.length > 0 && !isDraftId(section.id) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Duplicate this section to other concepts"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => openDuplicateSection(section.id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicate
                  </Button>
                )}
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
                    sectionLines.map(line => {
                       const canCopy = true;
                      // Show concept-assigner dropdown whenever we have sibling concepts to move/assign to.
                      // In conceptAssignerMode (Common List) it splits to that concept on Save.
                      // On per-concept cards it MOVES the line to the chosen concept on Save.
                      const showAssigner = !!siblingConcepts && siblingConcepts.length > 0;
                      const assigned = lineConceptAssignment[line.id] || "";
                      const showInlineConcept = enableInlineConceptAllocator && !!siblingConcepts && siblingConcepts.length > 0;
                      const showInventory = !!inventoryCategories && inventoryCategories.length > 0;
                      const extraCol = showInventory ? "_130px" : "";
                      const gridCols = showAssigner
                        ? (canCopy ? `grid-cols-[1fr_1.6fr_70px_120px${extraCol}_60px_24px_24px]` : `grid-cols-[1fr_1.6fr_70px_120px${extraCol}_60px_24px]`)
                        : (canCopy ? `grid-cols-[1fr_2fr_80px${extraCol}_60px_24px_24px]` : `grid-cols-[1fr_2fr_80px${extraCol}_60px_24px]`);
                      const inlineConceptVal = (line.meta as any)?.allocated_concept_id ?? "";
                      const inventoryVal = (line.meta as any)?.inventory_category ?? "";
                      const persistMeta = async (patch: Record<string, any>) => {
                        const newMeta = { ...((line.meta as any) || {}), ...patch };
                        // Optimistic update
                        setLines(prev => prev.map(l => l.id === line.id ? ({ ...l, meta: newMeta }) : l));
                        if (!isDraftId(line.id)) {
                          const { error } = await (supabase as any).from("smart_lines").update({ meta: newMeta }).eq("id", line.id);
                          if (error) toast.error(`Could not save: ${error.message}`);
                        }
                      };
                      return (
                      <div key={line.id} className="space-y-1">
                      <div className={cn("grid gap-1.5 items-center group", gridCols)}>
                        <Input value={line.label ?? ""} onChange={(e) => updateLine(line.id, { label: e.target.value })} placeholder="Item" className="h-7 text-xs" />
                        <Input value={line.value ?? ""} onChange={(e) => updateLine(line.id, { value: e.target.value })} placeholder="Note" className="h-7 text-xs" />
                        <Input value={line.quantity ?? ""} onChange={(e) => updateLine(line.id, { quantity: e.target.value })} placeholder="Amount" className="h-7 text-xs" />
                        
                        {showAssigner && (
                          <select
                            value={assigned}
                            onChange={(e) => setLineConceptAssignment(prev => ({ ...prev, [line.id]: e.target.value }))}
                            className={cn(
                              "h-7 text-xs rounded border bg-background px-1",
                              assigned ? "border-primary text-primary font-medium" : "border-border text-muted-foreground"
                            )}
                            title="Assign to concept (moves on Save)"
                          >
                            <option value="">— concept —</option>
                            {siblingConcepts!.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        )}
                        {showInventory && (
                          <select
                            value={inventoryVal}
                            onChange={(e) => persistMeta({ inventory_category: e.target.value || null })}
                            className={cn(
                              "h-7 text-[11px] rounded border bg-background px-1",
                              inventoryVal ? "border-primary text-primary font-medium" : "border-border text-muted-foreground"
                            )}
                            title="Inventory category"
                          >
                            <option value="">— inventory —</option>
                            {inventoryCategories!.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        )}
                        <Badge variant="outline" className={cn("h-5 px-1 text-[9px] justify-center", sourceColor(line.source))}>
                          {sourceLabel(line.source)}
                        </Badge>
                        {canCopy && (
                          <Button variant="ghost" size="sm" title="Duplicate this line right below" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary" onClick={() => duplicateLineInline(line.id)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100" onClick={() => deleteLine(line.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {showInlineConcept && (
                        <div className="flex gap-1.5 pl-1 items-center">
                          <select
                            value={inlineConceptVal}
                            onChange={(e) => persistMeta({ allocated_concept_id: e.target.value || null })}
                            className={cn(
                              "h-6 text-[11px] rounded border bg-background px-1.5 min-w-[120px]",
                              inlineConceptVal ? "border-primary text-primary font-medium" : "border-border text-muted-foreground"
                            )}
                            title="Allocate to station/concept"
                          >
                            <option value="">— allocate to —</option>
                            {siblingConcepts!.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      </div>
                      );
                    })
                  ) : (
                    sectionLines.length > 0 && (
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
                        setSelectedBrainIds(
                          next === "all"
                            ? new Set(brainDocs.filter((d) => d.recommended).map((d) => d.id))
                            : new Set()
                        );
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
              <span>{visibleBrainDocs.filter((d) => selectedBrainIds.has(d.id)).length} of {visibleBrainDocs.length} shown selected</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setSelectedBrainIds(new Set(visibleBrainDocs.map((d) => d.id)))}
                disabled={!visibleBrainDocs.length}
              >
                Select all
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setSelectedBrainIds(new Set())}
                disabled={!selectedBrainIds.size}
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
                disabled={(sourceCardFilter === "all" && visibleBrainDocs.filter((d) => selectedBrainIds.has(d.id)).length === 0) || grabbing}
              >
                {grabbing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                {sourceCardFilter !== "all"
                  ? `Extract from ${sourceCardFilter}`
                  : `Extract from ${visibleBrainDocs.filter((d) => selectedBrainIds.has(d.id)).length} doc(s)`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy line to other concepts */}
      <Dialog open={!!copyOpenForLine} onOpenChange={(o) => !o && setCopyOpenForLine(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Copy item to other concepts</DialogTitle>
            <DialogDescription>
              The item will be added to the same section in each selected concept's card.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            {(siblingConcepts ?? []).filter(c => c.id !== conceptId).map(c => (
              <label key={c.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!copyTargets[c.id]}
                  onChange={(e) => setCopyTargets(prev => ({ ...prev, [c.id]: e.target.checked }))}
                />
                <span className="text-sm">{c.name}</span>
              </label>
            ))}
            {(siblingConcepts ?? []).filter(c => c.id !== conceptId).length === 0 && (
              <p className="text-xs text-muted-foreground">No other concepts available.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCopyOpenForLine(null)} disabled={copying}>
              Cancel
            </Button>
            <Button size="sm" onClick={copyLineToConcepts} disabled={copying}>
              {copying ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate entire section to other concepts */}
      <Dialog open={!!dupSectionId} onOpenChange={(o) => !o && setDupSectionId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate section to other concepts</DialogTitle>
            <DialogDescription>
              The section and all its lines will be copied into each selected concept's card.
              If a section with the same title already exists, the lines will be appended.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            {(siblingConcepts ?? []).filter(c => c.id !== conceptId).map(c => (
              <label key={c.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!dupTargets[c.id]}
                  onChange={(e) => setDupTargets(prev => ({ ...prev, [c.id]: e.target.checked }))}
                />
                <span className="text-sm">{c.name}</span>
              </label>
            ))}
            {(siblingConcepts ?? []).filter(c => c.id !== conceptId).length === 0 && (
              <p className="text-xs text-muted-foreground">No other concepts available.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDupSectionId(null)} disabled={duplicating}>
              Cancel
            </Button>
            <Button size="sm" onClick={duplicateSectionToConcepts} disabled={duplicating}>
              {duplicating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wipe per-concept cards confirmation */}
      <AlertDialog open={wipeDialogOpen} onOpenChange={setWipeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all per-concept cards?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every section and line from the per-concept {title.split(" — ")[0].toLowerCase()} cards (Fish & Chips, Gyros, La Creperie, Chicks 'n' Buns, …) for this festival.
              Uploaded files and the Common List are <strong>not</strong> touched. After this, assign concepts on each Common List row and press <strong>Save</strong> to repopulate the concept cards cleanly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={wiping}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); wipePerConceptCards(); }}
              disabled={wiping}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {wiping ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Clear concept cards
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

