import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSections, useAllQuestions } from "@/hooks/useFestival";

const KINDS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Datetime" },
  { value: "single_select", label: "Single select" },
  { value: "multi_select", label: "Multi select" },
];

export default function AdminSections() {
  const qc = useQueryClient();
  const { data: sections = [] } = useSections();
  const { data: questions = [] } = useAllQuestions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newQ, setNewQ] = useState({ key: "", prompt: "", kind: "text" });

  const active = sections.find(s => s.id === activeId) || sections[0];
  const sectionQuestions = questions.filter(q => q.section_id === active?.id).sort((a, b) => a.order_index - b.order_index);

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["festival_sections"] });
    qc.invalidateQueries({ queryKey: ["festival_questions_all"] });
  };

  const addQuestion = async () => {
    if (!active || !newQ.key || !newQ.prompt) { toast.error("Key and prompt required"); return; }
    const orderIndex = sectionQuestions.length + 1;
    const { error } = await supabase.from("festival_questions").insert({
      section_id: active.id, key: newQ.key, prompt: newQ.prompt, kind: newQ.kind,
      order_index: orderIndex, required: false,
    });
    if (error) { toast.error(error.message); return; }
    setNewQ({ key: "", prompt: "", kind: "text" });
    refetch();
  };

  const updateQuestion = async (id: string, patch: any) => {
    const { error } = await supabase.from("festival_questions").update(patch).eq("id", id);
    if (error) { toast.error("Save failed"); return; }
    refetch();
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Delete this question? Existing answers for it will be removed.")) return;
    const { error } = await supabase.from("festival_questions").delete().eq("id", id);
    if (error) { toast.error("Delete failed"); return; }
    refetch();
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin · Section Schema</h1>
        <p className="text-sm text-muted-foreground mt-1">Edit the questions that appear on every festival</p>
      </div>

      <Card className="p-3 bg-warning/5 border-warning/30 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <p className="text-[12px] text-warning-foreground">
          Changes here apply to all festivals immediately. New questions appear as unanswered for existing festivals. Historical reports remain frozen at their generation time.
        </p>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-4 p-2 max-h-[600px] overflow-auto">
          {sections.map(s => {
            const isActive = active?.id === s.id;
            const count = questions.filter(q => q.section_id === s.id).length;
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition ${isActive ? "bg-primary/8 text-primary font-medium" : "hover:bg-secondary"}`}
              >
                <div className="flex items-center justify-between">
                  <span>#{s.order_index} {s.title}</span>
                  <Badge variant="outline" className="text-[10px]">{count}</Badge>
                </div>
              </button>
            );
          })}
        </Card>

        <div className="col-span-8 space-y-3">
          {active && (
            <>
              <Card className="p-4">
                <h2 className="font-semibold text-[14px]">{active.title}</h2>
                <p className="text-[12px] text-muted-foreground">key: {active.key} · {sectionQuestions.length} questions</p>
              </Card>

              {sectionQuestions.map(q => (
                <Card key={q.id} className="p-3">
                  <div className="grid grid-cols-12 gap-2">
                    <Input className="col-span-3 h-8 text-[12px] font-mono" defaultValue={q.key} onBlur={(e) => e.target.value !== q.key && updateQuestion(q.id, { key: e.target.value })} />
                    <Input className="col-span-5 h-8 text-[12px]" defaultValue={q.prompt} onBlur={(e) => e.target.value !== q.prompt && updateQuestion(q.id, { prompt: e.target.value })} />
                    <Select value={q.kind} onValueChange={(v) => updateQuestion(q.id, { kind: v })}>
                      <SelectTrigger className="col-span-3 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        {KINDS.map(k => <SelectItem key={k.value} value={k.value} className="text-[12px]">{k.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => deleteQuestion(q.id)} className="col-span-1 h-8 px-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}

              <Card className="p-3 border-dashed">
                <div className="grid grid-cols-12 gap-2">
                  <Input placeholder="key" className="col-span-3 h-8 text-[12px] font-mono" value={newQ.key} onChange={(e) => setNewQ(s => ({ ...s, key: e.target.value }))} />
                  <Input placeholder="Question prompt" className="col-span-5 h-8 text-[12px]" value={newQ.prompt} onChange={(e) => setNewQ(s => ({ ...s, prompt: e.target.value }))} />
                  <Select value={newQ.kind} onValueChange={(v) => setNewQ(s => ({ ...s, kind: v }))}>
                    <SelectTrigger className="col-span-3 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      {KINDS.map(k => <SelectItem key={k.value} value={k.value} className="text-[12px]">{k.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={addQuestion} className="col-span-1 h-8 px-0">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
