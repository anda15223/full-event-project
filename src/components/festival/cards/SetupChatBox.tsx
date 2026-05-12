import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props { festivalId: string; festivalSlug: string }
type Msg = { role: "user" | "assistant"; content: string };

const SAMPLE_PROMPTS = [
  "How many people do I need for setup?",
  "What should I prioritise this week?",
  "Are there any phases that look risky?",
];

export function SetupChatBox({ festivalId, festivalSlug }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text?: string) => {
    const userMessage = (text ?? input).trim();
    if (!userMessage || sending) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(next);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("setup-chat", {
        body: { festivalId, conversationHistory: messages, userMessage },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const reply = String(data?.reply ?? "").trim() || "(no reply)";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e: any) {
      toast.error(e?.message ?? "AI error");
      setMessages((m) => [...m, { role: "assistant", content: "_Sorry — I hit an error. Try again._" }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-4 flex flex-col h-[600px] sticky top-4">
      <div className="flex items-center gap-2 pb-3 border-b">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <MessageCircle className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">Setup planner AI</div>
          <div className="text-[11px] text-muted-foreground">Ask anything about your setup.</div>
        </div>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto py-3 space-y-2 pr-1">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground space-y-2">
            <div className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Try asking:</div>
            {SAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="block text-left w-full px-3 py-2 rounded-lg bg-muted hover:bg-muted/70 text-xs"
              >
                "{p}"
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "rounded-2xl px-3 py-2 max-w-[85%] text-xs whitespace-pre-wrap leading-relaxed",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl px-3 py-2 text-xs flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 border-t flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
            else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Ask the planner…"
          rows={2}
          className="text-xs resize-none flex-1 min-h-0"
          disabled={sending}
        />
        <Button onClick={() => send()} disabled={sending || !input.trim()} size="sm" className="h-9">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
