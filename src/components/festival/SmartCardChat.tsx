import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ChatMsg = { role: "user" | "assistant"; content: string };

export function SmartCardChat({
  cardId,
  cardTitle,
  onMutated,
  refreshKey = 0,
}: {
  cardId: string;
  cardTitle: string;
  onMutated: () => void;
  refreshKey?: number;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load chat history when first opened
  useEffect(() => {
    if (!open || loadedHistory || !cardId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("smart_chat_messages")
        .select("role,content")
        .eq("card_id", cardId)
        .order("created_at")
        .limit(40);
      setMessages((data || []) as ChatMsg[]);
      setLoadedHistory(true);
    })();
  }, [open, loadedHistory, cardId]);

  // Auto-open + reload messages when refreshKey changes (e.g. after AI extraction)
  useEffect(() => {
    if (refreshKey === 0) return;
    setOpen(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("smart_chat_messages")
        .select("role,content")
        .eq("card_id", cardId)
        .order("created_at")
        .limit(40);
      setMessages((data || []) as ChatMsg[]);
      setLoadedHistory(true);
    })();
  }, [refreshKey, cardId]);

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
      const { data, error } = await supabase.functions.invoke("smart-card-chat", {
        body: { card_id: cardId, message: text, history: messages.slice(-12) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply = (data as any)?.reply || "Done.";
      setMessages([...next, { role: "assistant", content: reply }]);
      const actions = (data as any)?.actions || [];
      if (actions.length) {
        toast.success(`AI applied ${actions.length} change${actions.length === 1 ? "" : "s"}`);
        onMutated();
      }
    } catch (e: any) {
      toast.error(`Chat failed: ${e.message || e}`);
      setMessages(next); // keep user msg
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-border/60 bg-muted/10">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-2.5 flex items-center gap-2 text-sm font-medium text-foreground/80 hover:bg-muted/30 transition"
      >
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        <span className="flex-1 text-left">Ask AI about this card</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3">
          <div
            ref={scrollRef}
            className="max-h-64 overflow-y-auto space-y-2 rounded-md border border-border/40 bg-background p-3"
          >
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Tell the AI what to add or change for "{cardTitle}". E.g. "Add a todo to call Godik
                by Friday", or "Set the freezer quantity to 3".
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
              placeholder="Tell the AI what to do…"
              className="min-h-[44px] max-h-32 text-sm resize-none"
              disabled={sending}
            />
            <Button onClick={send} disabled={sending || !input.trim()} size="sm" className="h-11 px-3">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
