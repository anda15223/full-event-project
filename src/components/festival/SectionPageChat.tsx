import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type ChatMsg = { role: "user" | "assistant"; content: string };

/**
 * Per-section AI chat. Scoped strictly to one festival section page.
 * Calls the `section-page-chat` edge function which reads the section's
 * questions, current answers and (optionally) its SmartCard, and can
 * update answers, create action items, and add SmartCard lines.
 */
export function SectionPageChat({
  festivalId,
  sectionKey,
  sectionTitle,
}: {
  festivalId: string;
  sectionKey: string;
  sectionTitle: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset history when navigating between sections
  useEffect(() => {
    setMessages([]);
  }, [festivalId, sectionKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("section-page-chat", {
        body: {
          festival_id: festivalId,
          section_key: sectionKey,
          message: text,
          history: messages.slice(-12),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply = (data as any)?.reply || "Done.";
      setMessages([...next, { role: "assistant", content: reply }]);
      const actions = (data as any)?.actions || [];
      if (actions.length) {
        toast.success(`AI applied ${actions.length} change${actions.length === 1 ? "" : "s"}`);
        // refresh likely-affected queries
        qc.invalidateQueries({ queryKey: ["festival_answers", festivalId] });
        qc.invalidateQueries({ queryKey: ["smart_card"] });
        qc.invalidateQueries({ queryKey: ["smart_sections"] });
        qc.invalidateQueries({ queryKey: ["smart_lines"] });
      }
    } catch (e: any) {
      toast.error(`Chat failed: ${e.message || e}`);
      setMessages(next);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="overflow-hidden border-violet-200/40 dark:border-violet-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3 flex items-center gap-2 text-sm font-medium hover:bg-muted/30 transition"
      >
        <Sparkles className="h-4 w-4 text-violet-500" />
        <span className="flex-1 text-left">
          Ask AI about <span className="font-semibold">{sectionTitle}</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3 border-t border-border/40">
          <div
            ref={scrollRef}
            className="max-h-72 overflow-y-auto space-y-2 rounded-md border border-border/40 bg-background p-3 mt-3"
          >
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                I only know about <span className="font-medium">{sectionTitle}</span>. Try:{" "}
                "Set the deadline to next Friday", "Add a todo to confirm with the supplier",
                or "What's missing on this page?"
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "text-sm rounded-md px-3 py-2 max-w-[90%] whitespace-pre-wrap leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> AI is working…
              </div>
            )}
          </div>

          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Tell the AI what to change on "${sectionTitle}"…`}
              className="min-h-[44px] max-h-32 text-sm resize-none"
              disabled={sending}
            />
            <Button onClick={send} disabled={sending || !input.trim()} size="sm" className="h-11 px-3">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
