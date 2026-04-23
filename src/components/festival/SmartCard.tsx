import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Upload, FileText, File as FileIcon, Loader2, Sparkles, Brain,
  ChevronDown, ChevronRight, GripVertical, Download, Pencil, Check, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SmartCardChat } from "./SmartCardChat";

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
  const [editMode, setEditMode] = useState(false);

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

  // ---- Section + line CRUD ----
  const addSection = async () => {
    if (!card) return;
    const order = sections.length ? Math.max(...sections.map(s => s.order_index)) + 1 : 0;
    const { error } = await (supabase as any).from("smart_sections").insert({
      card_id: card.id, title: "New section", order_index: order, source: "manual",
    });
    if (error) toast.error("Add failed"); else reload();
  };

  const updateSection = async (id: string, patch: Partial<SSection>) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, ...patch } as SSection : s));
    const { error } = await (supabase as any).from("smart_sections").update(patch).eq("id", id);
    if (error) toast.error("Save failed");
  };

  const deleteSection = async (id: string) => {
    if (!confirm("Delete this section and all its lines?")) return;
    const { error } = await (supabase as any).from("smart_sections").delete().eq("id", id);
    if (error) { toast.error("Delete failed"); return; }
    reload();
  };

  const addLine = async (sectionId: string) => {
    const sectionLines = lines.filter(l => l.section_id === sectionId);
    const order = sectionLines.length ? Math.max(...sectionLines.map(l => l.order_index)) + 1 : 0;
    const { error } = await (supabase as any).from("smart_lines").insert({
      section_id: sectionId, label: "", order_index: order, source: "manual",
    });
    if (error) toast.error("Add failed"); else reload();
  };

  const updateLine = async (id: string, patch: Partial<SLine>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } as SLine : l));
    const { error } = await (supabase as any).from("smart_lines").update(patch).eq("id", id);
    if (error) toast.error("Save failed");
  };

  const deleteLine = async (id: string) => {
    setLines(prev => prev.filter(l => l.id !== id));
    const { error } = await (supabase as any).from("smart_lines").delete().eq("id", id);
    if (error) { toast.error("Delete failed"); reload(); }
  };

  // ---- Todo CRUD ----
  const toggleTodo = async (id: string, current: string) => {
    const next = current === "done" ? "open" : "done";
    setTodos(prev => prev.map(t => t.id === id ? { ...t, status: next } : t));
    const { error } = await (supabase as any).from("smart_todos").update({ status: next }).eq("id", id);
    if (error) { toast.error("Save failed"); reload(); }
  };
  const deleteTodo = async (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
    const { error } = await (supabase as any).from("smart_todos").delete().eq("id", id);
    if (error) { toast.error("Delete failed"); reload(); }
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

        // Trigger AI extraction
        setExtracting(true);
        try {
          const { data, error } = await supabase.functions.invoke("smart-card-extract", {
            body: {
              action: "extract",
              file_id: fileRow.id,
              card_id: card.id,
              card_key: cardKey,
              festival_id: festivalId,
              concept_id: conceptId || null,
              file_url: pub.publicUrl,
              file_name: file.name,
              mime_type: file.type,
            },
          });
          if (error) throw error;
          const wcount = Array.isArray(data?.warnings) ? data.warnings.length : 0;
          if (wcount > 0) {
            toast.warning(
              `AI extracted ${data?.sections_created || 0} sections — ${wcount} issue${wcount === 1 ? "" : "s"} need attention`,
              { description: data.warnings.slice(0, 3).map((w: any) => `• ${w.message}`).join("\n") },
            );
          } else {
            toast.success(`AI extracted ${data?.sections_created || 0} sections from ${file.name}`);
          }
        } catch (e: any) {
          toast.error(`AI extract failed: ${e.message || e}`);
        } finally {
          setExtracting(false);
        }
      }
      await reload();
    } finally {
      setUploading(false);
    }
  };

  const grabFromBrain = async () => {
    if (!card) return;
    setGrabbing(true);
    try {
      const { data, error } = await supabase.functions.invoke("smart-card-extract", {
        body: {
          action: "grab_brain",
          card_key: cardKey,
          festival_id: festivalId,
          concept_id: conceptId || null,
        },
      });
      if (error) throw error;
      const suggestions: Array<{ title: string; lines: any[] }> = data?.suggestions || [];
      if (!suggestions.length) {
        toast.info("Brain has nothing for this card yet — fill it in and it'll learn.");
        return;
      }
      // Insert each suggestion as a section with brain source
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
      toast.success(`Grabbed ${suggestions.length} sections from Brain`);
      reload();
    } catch (e: any) {
      toast.error(`Brain grab failed: ${e.message || e}`);
    } finally {
      setGrabbing(false);
    }
  };

  const deleteFile = async (f: SFile) => {
    if (!confirm(`Delete file ${f.filename}?`)) return;
    if (f.storage_path) await supabase.storage.from("festival-photos").remove([f.storage_path]);
    await (supabase as any).from("smart_files").delete().eq("id", f.id);
    reload();
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
      <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {editMode && !hideBrainButton && (
            <Button size="sm" variant="outline" className="h-8" onClick={grabFromBrain} disabled={grabbing}>
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
          <Button
            size="sm"
            variant={editMode ? "default" : "outline"}
            className="h-8"
            onClick={() => setEditMode(v => !v)}
          >
            {editMode ? <><Check className="h-3.5 w-3.5 mr-1" /> Done</> : <><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</>}
          </Button>
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
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noreferrer" className="opacity-0 group-hover:opacity-100">
                      <Download className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                  <button onClick={() => deleteFile(f)} className="opacity-0 group-hover:opacity-100 text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
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
              </div>
            );
          })}
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
        <SmartCardChat cardId={card.id} cardTitle={title} onMutated={reload} />
      )}
    </Card>
  );
}
