import { useRef, useState } from "react";
import { Send, Loader2, MessageCircleQuestion } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  festivalId: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  quote?: string;
}

export function FestivalInfoChat({ festivalId }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("festival-info-chat", {
        body: {
          festivalId,
          question: q,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setMessages([
        ...next,
        { role: "assistant", content: data?.answer ?? "", quote: data?.quote ?? "" },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to ask");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <section className="rounded-xl border bg-card mt-3">
      <div className="flex items-center gap-2 p-3 border-b">
        <MessageCircleQuestion className="h-4 w-4 text-primary" />
        <h3 className="font-heading text-sm font-semibold">Ask the festival info</h3>
        <span className="text-[11px] text-muted-foreground ml-1">
          Answers come straight from the parsed text.
        </span>
      </div>

      <div className="p-3 space-y-3 max-h-[360px] overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground">
            Try: "What time is load-in?", "Where do I park?", "When do we need to leave?"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "user" ? (
              <div className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm max-w-[85%]">
                {m.content}
              </div>
            ) : (
              <div className="space-y-2 max-w-[92%]">
                <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                {m.quote && (
                  <blockquote className="border-l-2 border-primary/50 pl-3 py-1 text-[12.5px] italic text-muted-foreground bg-muted/30 rounded-r-md whitespace-pre-wrap">
                    {m.quote}
                  </blockquote>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the info…
          </div>
        )}
      </div>

      <div className="p-3 border-t flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask a question about this festival…"
          rows={1}
          className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[38px] max-h-32"
        />
        <Button size="sm" onClick={send} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </section>
  );
}

export default FestivalInfoChat;
