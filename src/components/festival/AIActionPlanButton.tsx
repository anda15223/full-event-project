import { useState } from "react";
import { Sparkles, Loader2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Suggested {
  title: string;
  description: string | null;
  priority: "critical" | "high" | "medium" | "low";
  due_date: string | null;
  owner: string | null;
  category: string | null;
}

interface Props {
  festivalId: string;
  onCreated?: () => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-muted text-muted-foreground",
};

export function AIActionPlanButton({ festivalId, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggested[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const generate = async () => {
    setLoading(true);
    setSuggestions([]);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("generate-action-plan", {
        body: { festivalId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const actions: Suggested[] = data?.actions ?? [];
      setSuggestions(actions);
      setSelected(new Set(actions.map((_, i) => i)));
      if (actions.length === 0) toast.info("No new actions suggested");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  };

  const openDialog = () => {
    setOpen(true);
    if (suggestions.length === 0) void generate();
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const addSelected = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const rows = Array.from(selected).map((i) => {
        const s = suggestions[i];
        return {
          festival_id: festivalId,
          title: s.title,
          description: s.description,
          priority: s.priority,
          due_date: s.due_date,
          owner: s.owner,
          category: s.category,
          source: "intelligence",
          status: "open",
          is_draft: false,
        };
      });
      const { error } = await supabase.from("festival_action_items").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} action${rows.length === 1 ? "" : "s"} added`);
      setOpen(false);
      setSuggestions([]);
      setSelected(new Set());
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <Wand2 className="h-4 w-4 mr-1" /> AI action plan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI-generated action plan
            </DialogTitle>
            <DialogDescription>
              Built from the festival info, contracts, contacts, existing actions and open questions.
              Pick which ones to add.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking through the festival…
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No suggestions yet.{" "}
                <button className="text-primary hover:underline" onClick={generate}>Generate now</button>
              </div>
            ) : (
              <ul className="space-y-2">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-lg border bg-card p-3 hover:bg-muted/30 transition"
                  >
                    <Checkbox checked={selected.has(i)} onCheckedChange={() => toggle(i)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{s.title}</span>
                        <Badge variant="outline" className={PRIORITY_COLOR[s.priority]}>{s.priority}</Badge>
                        {s.due_date && (
                          <Badge variant="outline" className="text-xs">due {s.due_date}</Badge>
                        )}
                        {s.owner && (
                          <Badge variant="outline" className="text-xs">{s.owner}</Badge>
                        )}
                        {s.category && (
                          <span className="text-[11px] text-muted-foreground">· {s.category}</span>
                        )}
                      </div>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.description}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="outline" onClick={generate} disabled={loading || saving}>
              {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Re-generate
            </Button>
            <Button onClick={addSelected} disabled={saving || selected.size === 0 || loading}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Add {selected.size > 0 ? `${selected.size} ` : ""}selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AIActionPlanButton;
