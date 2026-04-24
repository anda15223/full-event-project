import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, ShieldCheck, Printer, Send, Loader2, PackagePlus, Check } from "lucide-react";
import { toast } from "sonner";
import { CardUploadZone } from "./shared";

interface Props {
  festivalId: string;
}

const CARD_ORIGIN = "safety_compliance";

const TRAINING_SECTIONS = [
  { key: "fire", label: "Fire" },
  { key: "first_aid", label: "First Aid" },
  { key: "hot_oil", label: "Hot Oil" },
  { key: "cvr", label: "CVR" },
  { key: "inspections", label: "Inspections" },
] as const;

type TrainingSection = (typeof TRAINING_SECTIONS)[number]["key"];

type ChecklistItem = {
  id: string;
  section: TrainingSection;
  label: string;
  done: boolean;
};

type PrintItem = {
  id: string;
  item_name: string;
  quantity: string;
  registered: boolean;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const lsKey = (festivalId: string, k: string) => `safety_${festivalId}_${k}`;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function SafetyComplianceCard({ festivalId }: Props) {
  const qc = useQueryClient();

  const [checklist, setChecklist] = useState<ChecklistItem[]>(() =>
    loadJSON(lsKey(festivalId, "checklist"), [
      { id: crypto.randomUUID(), section: "fire" as TrainingSection, label: "Fire extinguisher present", done: false },
      { id: crypto.randomUUID(), section: "first_aid" as TrainingSection, label: "First aid kit visible", done: false },
      { id: crypto.randomUUID(), section: "hot_oil" as TrainingSection, label: "Hot oil safety briefing", done: false },
      { id: crypto.randomUUID(), section: "cvr" as TrainingSection, label: "CVR posted at stand", done: false },
      { id: crypto.randomUUID(), section: "inspections" as TrainingSection, label: "Inspection logbook ready", done: false },
    ]),
  );
  useEffect(() => saveJSON(lsKey(festivalId, "checklist"), checklist), [checklist, festivalId]);

  const addChecklistItem = (section: TrainingSection) => {
    setChecklist((prev) => [...prev, { id: crypto.randomUUID(), section, label: "", done: false }]);
  };
  const updateChecklistItem = (id: string, patch: Partial<ChecklistItem>) => {
    setChecklist((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };
  const removeChecklistItem = (id: string) =>
    setChecklist((prev) => prev.filter((i) => i.id !== id));

  const [printItems, setPrintItems] = useState<PrintItem[]>(() =>
    loadJSON(lsKey(festivalId, "print_items"), [
      { id: crypto.randomUUID(), item_name: "Smiley face", quantity: "1", registered: false },
      { id: crypto.randomUUID(), item_name: "Rama daka", quantity: "1", registered: false },
      { id: crypto.randomUUID(), item_name: "Oil", quantity: "", registered: false },
    ]),
  );
  useEffect(() => saveJSON(lsKey(festivalId, "print_items"), printItems), [printItems, festivalId]);

  const addPrintItem = () =>
    setPrintItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), item_name: "", quantity: "", registered: false },
    ]);
  const updatePrintItem = (id: string, patch: Partial<PrintItem>) =>
    setPrintItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const removePrintItem = (id: string) =>
    setPrintItems((prev) => prev.filter((i) => i.id !== id));

  const { data: existingEquipment = [] } = useQuery({
    queryKey: ["equipment_db_safety_dedup", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_db")
        .select("id, item_name, card_origin")
        .eq("festival_id", festivalId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const findDuplicate = (name: string) => {
    const norm = name.trim().toLowerCase();
    if (!norm) return null;
    return existingEquipment.find((e) => (e.item_name ?? "").trim().toLowerCase() === norm) ?? null;
  };

  const registerAsEquipment = async (item: PrintItem) => {
    const trimmed = item.item_name.trim();
    if (!trimmed) {
      toast.error("Item name required");
      return;
    }
    const dup = findDuplicate(trimmed);
    if (dup) {
      updatePrintItem(item.id, { registered: true });
      toast.info(`Already tracked${dup.card_origin ? ` in ${dup.card_origin}` : ""} — not duplicated`);
      return;
    }
    const { error } = await supabase.from("equipment_db").insert({
      festival_id: festivalId,
      item_name: trimmed,
      quantity: item.quantity || null,
      source: "by_us",
      status: "pending",
      card_origin: CARD_ORIGIN,
      notes: "Registered from Safety & Compliance",
    });
    if (error) {
      toast.error(`Register failed: ${error.message}`);
      return;
    }
    updatePrintItem(item.id, { registered: true });
    qc.invalidateQueries({ queryKey: ["equipment_db_safety_dedup", festivalId] });
    toast.success(`Registered "${trimmed}" in equipment`);
  };

  const [chat, setChat] = useState<ChatMessage[]>(() =>
    loadJSON(lsKey(festivalId, "chat"), [
      {
        role: "assistant" as const,
        content:
          "Hi — I can help you draft a printable safety training list for this festival. Tell me about the stand, crew size, and any specific risks you want to cover.",
      },
    ]),
  );
  useEffect(() => saveJSON(lsKey(festivalId, "chat"), chat), [chat, festivalId]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const next = [...chat, { role: "user" as const, content: text }];
    setChat(next);
    setChatInput("");
    setChatLoading(true);
    try {
      const checklistSummary = TRAINING_SECTIONS.map((s) => {
        const items = checklist.filter((c) => c.section === s.key);
        return `${s.label}:\n${items.map((i) => `- [${i.done ? "x" : " "}] ${i.label}`).join("\n") || "  (none)"}`;
      }).join("\n\n");

      const systemPrompt = `You are a safety & compliance assistant for a Danish festival food stand operator (The Fish Project).\nHelp the user build a clear, printable safety training list. Be concrete and concise.\nCurrent checklist for this festival:\n\n${checklistSummary}\n\nItems planned to print/bring:\n${printItems
        .map((p) => `- ${p.item_name || "(unnamed)"}${p.quantity ? ` x${p.quantity}` : ""}`)
        .join("\n") || "  (none)"}`;

      const { data, error } = await supabase.functions.invoke("smart-card-chat", {
        body: {
          mode: "safety_training",
          system: systemPrompt,
          messages: next,
        },
      });
      if (error) throw error;
      const reply: string = data?.reply ?? data?.content ?? "Sorry, I didn't get a response.";
      setChat([...next, { role: "assistant", content: reply }]);
    } catch (e: any) {
      toast.error(`AI failed: ${e.message ?? e}`);
      setChat([
        ...next,
        { role: "assistant", content: "Sorry, I couldn't reach the assistant. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const printTrainingList = async () => {
    setPrinting(true);
    try {
      const lastAssistant = [...chat].reverse().find((m) => m.role === "assistant");
      const aiBody = lastAssistant?.content ?? "(No AI-generated content yet — chat with the assistant first.)";

      const checklistHtml = TRAINING_SECTIONS.map((s) => {
        const items = checklist.filter((c) => c.section === s.key);
        return `<h3>${s.label}</h3><ul>${items
          .map((i) => `<li>${i.done ? "☑" : "☐"} ${escapeHtml(i.label || "(blank)")}</li>`)
          .join("")}</ul>`;
      }).join("");

      const printHtml = `<!doctype html><html><head><meta charset="utf-8"/><title>Safety Training List</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #111; line-height: 1.5; }
  h1 { margin: 0 0 4px; } h2 { margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { margin-top: 16px; } ul { margin: 4px 0 12px; padding-left: 20px; }
  pre { white-space: pre-wrap; font-family: inherit; background: #f6f6f6; padding: 12px; border-radius: 6px; }
  .meta { color: #666; font-size: 12px; }
</style></head><body>
  <h1>Safety & Compliance Training List</h1>
  <div class="meta">Generated ${new Date().toLocaleString()}</div>
  <h2>Checklist</h2>
  ${checklistHtml}
  <h2>Items to Print or Bring</h2>
  <ul>${printItems
    .map(
      (p) =>
        `<li>${escapeHtml(p.item_name || "(unnamed)")}${
          p.quantity ? ` — qty ${escapeHtml(p.quantity)}` : ""
        }${p.registered ? " <em>(registered as equipment)</em>" : ""}</li>`,
    )
    .join("")}</ul>
  <h2>AI-Generated Training Notes</h2>
  <pre>${escapeHtml(aiBody)}</pre>
</body></html>`;

      const w = window.open("", "_blank");
      if (!w) {
        toast.error("Pop-up blocked — allow pop-ups to print");
        return;
      }
      w.document.write(printHtml);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 250);
    } catch (e: any) {
      toast.error(`Print failed: ${e.message ?? e}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Safety & Compliance</h2>
        </div>

        <div className="space-y-5">
          {TRAINING_SECTIONS.map((section) => {
            const items = checklist.filter((c) => c.section === section.key);
            return (
              <div key={section.key} className="rounded-md border bg-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">{section.label}</h3>
                  <Button size="sm" variant="ghost" onClick={() => addChecklistItem(section.key)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add item
                  </Button>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No items yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={item.done}
                          onCheckedChange={(v) => updateChecklistItem(item.id, { done: !!v })}
                        />
                        <Input
                          value={item.label}
                          onChange={(e) => updateChecklistItem(item.id, { label: e.target.value })}
                          placeholder="What to check / print / bring…"
                          className={`h-8 text-sm ${
                            !item.label.trim() ? "border-destructive/50" : ""
                          }`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => removeChecklistItem(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Items to Print or Bring</h2>
          <Button size="sm" variant="outline" onClick={addPrintItem}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add item
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Use <strong>Register as Equipment</strong> to add to the festival's equipment list.
          Duplicates (same name + festival) are automatically skipped.
        </p>
        {printItems.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No items.</p>
        ) : (
          <div className="space-y-2">
            {printItems.map((item) => {
              const dup = findDuplicate(item.item_name);
              const alreadyTracked = !!dup;
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_120px_auto_auto] gap-2 items-center"
                >
                  <Input
                    value={item.item_name}
                    onChange={(e) => updatePrintItem(item.id, { item_name: e.target.value })}
                    placeholder="Item name (e.g. Smiley face)"
                    className={`h-9 ${!item.item_name.trim() ? "border-destructive/50" : ""}`}
                  />
                  <Input
                    value={item.quantity}
                    onChange={(e) => updatePrintItem(item.id, { quantity: e.target.value })}
                    placeholder="Qty"
                    className="h-9"
                  />
                  {item.registered || alreadyTracked ? (
                    <div className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 h-9 text-xs">
                      <Check className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">
                        {alreadyTracked && !item.registered ? "Already tracked" : "Registered"}
                      </span>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => registerAsEquipment(item)}
                      disabled={!item.item_name.trim()}
                    >
                      <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
                      Register as Equipment
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    onClick={() => removePrintItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">AI Training List Generator</h2>
          <Button size="sm" onClick={printTrainingList} disabled={printing}>
            {printing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Printer className="h-3.5 w-3.5 mr-1.5" />
            )}
            Print Training List
          </Button>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 max-h-72 overflow-y-auto space-y-2">
          {chat.map((m, idx) => (
            <div
              key={idx}
              className={`text-sm rounded-md px-3 py-2 ${
                m.role === "assistant"
                  ? "bg-card border"
                  : "bg-primary/10 ml-8"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                {m.role === "assistant" ? "AI" : "You"}
              </div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          {chatLoading && (
            <div className="text-sm rounded-md px-3 py-2 bg-card border flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="flex gap-2 mt-3">
          <Textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChat();
              }
            }}
            placeholder="Describe the stand, crew, risks…"
            className="min-h-[44px] max-h-32 resize-none"
            disabled={chatLoading}
          />
          <Button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <CardUploadZone
        festivalId={festivalId}
        cardName="safety_compliance"
        title="Safety & Compliance documents"
        subtitle="Upload certificates, inspection reports, training material…"
      />
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default SafetyComplianceCard;
