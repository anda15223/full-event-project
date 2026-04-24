import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  CalendarClock, Check, Download, FileDown, Loader2, Plus,
  RefreshCw, Save, Sparkles, Trash2, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { CardUploadZone, EditableField } from "./shared";

interface Props {
  festivalId: string;
}

const CARD_ORIGIN = "setup_timeline";
const TEMPLATE_KEY_PREFIX = "timeline_template:";

type TimelineItem = {
  id: string;          // local-only, generated
  day_offset: number;
  date: string;        // YYYY-MM-DD
  action: string;
  responsible?: string;
  priority: "urgent" | "high" | "normal" | "low";
  status: "pending" | "in_progress" | "done";
  category?: string;
};

type TaskRow = {
  id: string;
  task: string;
  status: "pending" | "in_progress" | "done";
  priority: "urgent" | "high" | "normal" | "low";
  deadline: string | null;
  card_origin: string | null;
  notes: string | null;
};

const PRIORITY_ORDER: Record<TimelineItem["priority"], number> = {
  urgent: 0, high: 1, normal: 2, low: 3,
};

const PRIORITY_BADGE: Record<TimelineItem["priority"], string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  normal: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function SetupTimelineCard({ festivalId }: Props) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Festival info (for date math + name)
  const { data: festival } = useQuery({
    queryKey: ["festival_basic", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, name, slug, start_date, end_date")
        .eq("id", festivalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!festivalId,
  });

  // Pending tasks pulled from tasks_deadlines
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks_deadlines", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks_deadlines")
        .select("id, task, status, priority, deadline, card_origin, notes")
        .eq("festival_id", festivalId)
        .order("priority")
        .order("deadline", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });

  // Saved timeline (latest brain entry for this festival)
  const { data: savedTimeline } = useQuery({
    queryKey: ["timeline_brain", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("id, content, structured_data, updated_at")
        .eq("festival_id", festivalId)
        .eq("category", "setup_timeline")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && (error as any).code !== "PGRST116") throw error;
      return data;
    },
  });

  // Hydrate items from saved timeline on first load
  useEffect(() => {
    const sd: any = savedTimeline?.structured_data ?? {};
    if (Array.isArray(sd.items) && items.length === 0) {
      setItems(
        sd.items.map((it: any) => ({
          id: it.id || uid(),
          day_offset: Number(it.day_offset ?? 0),
          date: it.date ?? "",
          action: it.action ?? "",
          responsible: it.responsible ?? "",
          priority: (it.priority ?? "normal") as TimelineItem["priority"],
          status: (it.status ?? "pending") as TimelineItem["status"],
          category: it.category ?? "",
        })),
      );
      if (typeof sd.summary === "string") setAiSummary(sd.summary);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTimeline?.id]);

  // Templates: brain entries scope=global, key starting with timeline_template:
  const { data: templates = [] } = useQuery({
    queryKey: ["timeline_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("id, key_name, display_name, structured_data, updated_at")
        .like("key_name", `${TEMPLATE_KEY_PREFIX}%`)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---- AI generate ----
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-setup-timeline",
        { body: { festival_id: festivalId } },
      );
      if (error) throw error;
      const list: any[] = data?.timeline ?? [];
      const next = list.map((it) => ({
        id: uid(),
        day_offset: Number(it.day_offset ?? 0),
        date: it.date ?? "",
        action: it.action ?? "",
        responsible: it.responsible ?? "",
        priority: (it.priority ?? "normal") as TimelineItem["priority"],
        status: "pending" as const,
        category: it.category ?? "",
      }));
      setItems(next);
      setAiSummary(data?.summary ?? "");
      toast.success(`Generated ${next.length} timeline items`);
    } catch (e: any) {
      toast.error(e?.message || "AI generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // ---- Persist (save current timeline back to brain_entries) ----
  const persistTimeline = async (next: TimelineItem[], summary = aiSummary) => {
    const payload = {
      key_name: `setup_timeline:${festivalId}`,
      display_name: `Setup timeline — ${festival?.name ?? festivalId}`,
      content: next
        .map((i) => `${i.date} (D${i.day_offset >= 0 ? "+" : ""}${i.day_offset}) — ${i.action}`)
        .join("\n"),
      category: "setup_timeline",
      source: "ai",
      scope: "festival" as const,
      festival_id: festivalId,
      structured_data: { items: next, summary } as any,
    };

    if (savedTimeline?.id) {
      const { error } = await supabase
        .from("brain_entries")
        .update(payload)
        .eq("id", savedTimeline.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("brain_entries").insert(payload);
      if (error) throw error;
    }
    qc.invalidateQueries({ queryKey: ["timeline_brain", festivalId] });
  };

  const updateItem = (id: string, patch: Partial<TimelineItem>) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, ...patch } : it));
      // Fire-and-forget persist
      persistTimeline(next).catch((e) => toast.error(e.message));
      return next;
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      persistTimeline(next).catch((e) => toast.error(e.message));
      return next;
    });
  };

  const addBlank = () => {
    const today = new Date().toISOString().slice(0, 10);
    const next: TimelineItem[] = [
      ...items,
      {
        id: uid(),
        day_offset: 0,
        date: festival?.start_date ?? today,
        action: "",
        responsible: "",
        priority: "normal",
        status: "pending",
        category: "",
      },
    ];
    setItems(next);
    persistTimeline(next).catch((e) => toast.error(e.message));
  };

  // ---- Templates ----
  const saveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Give the template a name");
      return;
    }
    setSavingTemplate(true);
    try {
      const stripped = items.map(({ id, date, ...rest }) => rest); // keep day_offset, drop concrete dates
      const { error } = await supabase.from("brain_entries").insert({
        key_name: `${TEMPLATE_KEY_PREFIX}${templateName.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
        display_name: templateName.trim(),
        content: `Timeline template: ${templateName.trim()} (${stripped.length} items)`,
        category: "setup_timeline_template",
        source: "user",
        scope: "global",
        structured_data: { items: stripped } as any,
        tags: ["timeline", "template"],
      });
      if (error) throw error;
      toast.success(`Template "${templateName}" saved`);
      setTemplateName("");
      qc.invalidateQueries({ queryKey: ["timeline_templates"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  };

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    const tplItems: any[] = (tpl?.structured_data as any)?.items ?? [];
    if (!festival?.start_date) {
      toast.error("Festival has no start date");
      return;
    }
    const start = new Date(festival.start_date);
    const next: TimelineItem[] = tplItems.map((it: any) => {
      const d = new Date(start);
      d.setDate(d.getDate() + Number(it.day_offset ?? 0));
      return {
        id: uid(),
        day_offset: Number(it.day_offset ?? 0),
        date: d.toISOString().slice(0, 10),
        action: it.action ?? "",
        responsible: it.responsible ?? "",
        priority: (it.priority ?? "normal") as TimelineItem["priority"],
        status: "pending" as const,
        category: it.category ?? "",
      };
    });
    setItems(next);
    persistTimeline(next).catch((e) => toast.error(e.message));
    toast.success(`Applied template "${tpl?.display_name}"`);
  };

  // ---- Pending task actions ----
  const markTaskDone = async (taskId: string) => {
    const { error } = await supabase
      .from("tasks_deadlines")
      .update({ status: "done" })
      .eq("id", taskId);
    if (error) toast.error(error.message);
    else {
      toast.success("Task done");
      qc.invalidateQueries({ queryKey: ["tasks_deadlines", festivalId] });
    }
  };

  const updateTask = async (taskId: string, patch: Partial<TaskRow>) => {
    const { error } = await supabase
      .from("tasks_deadlines")
      .update(patch as any)
      .eq("id", taskId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["tasks_deadlines", festivalId] });
  };

  // ---- PDF export ----
  const exportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    let y = margin;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Setup Timeline — ${festival?.name ?? "Festival"}`, margin, y);
    y += 22;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (festival?.start_date && festival?.end_date) {
      doc.text(`Festival: ${festival.start_date} → ${festival.end_date}`, margin, y);
      y += 16;
    }
    doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, margin, y);
    y += 22;

    if (aiSummary) {
      doc.setFont("helvetica", "italic");
      const wrapped = doc.splitTextToSize(aiSummary, 515);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 12 + 10;
      doc.setFont("helvetica", "normal");
    }

    const sorted = [...items].sort((a, b) => a.day_offset - b.day_offset);
    sorted.forEach((it) => {
      if (y > 780) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.text(
        `${it.date}  D${it.day_offset >= 0 ? "+" : ""}${it.day_offset}`,
        margin, y,
      );
      doc.setFont("helvetica", "normal");
      doc.text(`[${it.priority.toUpperCase()}]`, margin + 130, y);
      y += 14;
      const lines = doc.splitTextToSize(
        `• ${it.action}${it.responsible ? `  —  ${it.responsible}` : ""}${it.category ? `  (${it.category})` : ""}`,
        515,
      );
      doc.text(lines, margin + 12, y);
      y += lines.length * 12 + 6;
    });

    const slug = festival?.slug ?? "festival";
    doc.save(`setup-timeline-${slug}.pdf`);
  };

  // ---- Group tasks by priority ----
  const pendingTasks = tasks.filter((t) => t.status !== "done");
  const tasksByPriority: Record<TimelineItem["priority"], TaskRow[]> = {
    urgent: [], high: [], normal: [], low: [],
  };
  pendingTasks.forEach((t) => {
    tasksByPriority[(t.priority || "normal") as TimelineItem["priority"]].push(t);
  });

  const sortedItems = [...items].sort((a, b) => a.day_offset - b.day_offset);

  return (
    <div className="space-y-5">
      {/* AI Generator + actions header */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            {generating
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Sparkles className="h-4 w-4" />}
            {items.length > 0 ? "Regenerate AI plan" : "Generate AI plan"}
          </Button>

          <Button variant="outline" size="sm" onClick={addBlank} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add item
          </Button>

          <Select onValueChange={applyTemplate}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Apply template…" />
            </SelectTrigger>
            <SelectContent>
              {templates.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No templates yet
                </div>
              )}
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={items.length === 0}>
                <Save className="h-3.5 w-3.5" /> Save as template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Save current timeline as template</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Template name</Label>
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. Standard 4-day festival"
                  />
                </div>
                <Button onClick={saveAsTemplate} disabled={savingTemplate} className="w-full">
                  {savingTemplate && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Save template
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="sm"
            onClick={exportPdf}
            disabled={items.length === 0}
            className="gap-1.5 ml-auto"
          >
            <FileDown className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
        {aiSummary && (
          <div className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3 italic">
            {aiSummary}
          </div>
        )}
      </Card>

      {/* Timeline */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="font-medium text-sm">Chronological timeline</h3>
          <Badge variant="secondary" className="text-[10px] ml-auto">
            {items.length} items
          </Badge>
        </div>

        {sortedItems.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-md">
            <Wand2 className="h-5 w-5 mx-auto mb-2 opacity-60" />
            No timeline yet. Click <span className="font-medium">Generate AI plan</span> or add items manually.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left font-medium py-2 pr-2 w-[110px]">Date</th>
                  <th className="text-left font-medium py-2 pr-2 w-[60px]">Day</th>
                  <th className="text-left font-medium py-2 pr-2">Action</th>
                  <th className="text-left font-medium py-2 pr-2 w-[140px]">Responsible</th>
                  <th className="text-left font-medium py-2 pr-2 w-[110px]">Priority</th>
                  <th className="text-left font-medium py-2 pr-2 w-[120px]">Status</th>
                  <th className="w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((it) => (
                  <tr key={it.id} className="border-b last:border-0 align-top">
                    <td className="py-1.5 pr-2">
                      <EditableField
                        type="date"
                        value={it.date}
                        onChange={(v) => updateItem(it.id, { date: v })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <EditableField
                        type="number"
                        value={it.day_offset}
                        onChange={(v) => updateItem(it.id, { day_offset: Number(v) || 0 })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <EditableField
                        value={it.action}
                        placeholder="What needs to happen…"
                        onChange={(v) => updateItem(it.id, { action: v })}
                      />
                      {it.category && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {it.category}
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      <EditableField
                        value={it.responsible ?? ""}
                        placeholder="—"
                        onChange={(v) => updateItem(it.id, { responsible: v })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Select
                        value={it.priority}
                        onValueChange={(v) =>
                          updateItem(it.id, { priority: v as TimelineItem["priority"] })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="urgent">Urgent</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <Select
                        value={it.status}
                        onValueChange={(v) =>
                          updateItem(it.id, { status: v as TimelineItem["status"] })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In progress</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeItem(it.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pending action items */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          <h3 className="font-medium text-sm">Pending action items</h3>
          <Badge variant="secondary" className="text-[10px] ml-auto">
            {pendingTasks.length} open
          </Badge>
        </div>

        {pendingTasks.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No open tasks. Anything missing on other cards will show up here.
          </div>
        ) : (
          (Object.keys(PRIORITY_ORDER) as TimelineItem["priority"][]).map((p) => {
            const list = tasksByPriority[p];
            if (list.length === 0) return null;
            return (
              <div key={p} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge className={`text-[10px] uppercase ${PRIORITY_BADGE[p]}`}>{p}</Badge>
                  <span className="text-xs text-muted-foreground">{list.length} item(s)</span>
                </div>
                <div className="space-y-1">
                  {list.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md border bg-card"
                    >
                      <div className="flex-1 min-w-0">
                        <EditableField
                          value={t.task}
                          onChange={(v) => updateTask(t.id, { task: v })}
                        />
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                          {t.card_origin && (
                            <span className="font-mono">{t.card_origin}</span>
                          )}
                          {t.deadline && <span>Due: {t.deadline}</span>}
                        </div>
                      </div>
                      <Input
                        type="date"
                        value={t.deadline ?? ""}
                        onChange={(e) =>
                          updateTask(t.id, { deadline: e.target.value || null })
                        }
                        className="h-8 text-xs w-[140px]"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markTaskDone(t.id)}
                        className="h-8 gap-1"
                      >
                        <Check className="h-3.5 w-3.5" /> Done
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </Card>

      {/* Upload zone */}
      <CardUploadZone
        festivalId={festivalId}
        cardName={CARD_ORIGIN}
        title="Setup Timeline & Action Items"
        subtitle="Upload run sheets, build schedules, or planning docs. AI will summarize and store with this card."
      />
    </div>
  );
}

export default SetupTimelineCard;
