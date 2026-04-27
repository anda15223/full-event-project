import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, Send, Sparkles, Bot, User, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEmails, useEmailTasks, useEmailInvoices, useCompanies } from "@/hooks/useEmailAgent";

type Message = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-chat`;

async function streamChat({
  messages, context, onDelta, onDone, onError,
}: {
  messages: Message[]; context: any; onDelta: (text: string) => void; onDone: () => void; onError: (err: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ messages, context }),
  });
  if (!resp.ok) { const data = await resp.json().catch(() => ({})); onError(data.error || `Error ${resp.status}`); return; }
  if (!resp.body) { onError("No response body"); return; }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { onDone(); return; }
      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch { buffer = line + "\n" + buffer; break; }
    }
  }
  onDone();
}

const suggestions = [
  "Show me overdue invoices",
  "How many emails are pending?",
  "What tasks are urgent?",
  "Summarize today's activity",
];

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: emails } = useEmails();
  const { data: tasks } = useEmailTasks();
  const { data: invoices } = useEmailInvoices();
  const { data: companies } = useCompanies();

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  useEffect(() => { if (isOpen && inputRef.current) inputRef.current.focus(); }, [isOpen]);

  const getContext = useCallback(() => ({
    totalEmails: emails?.length || 0,
    pendingEmails: emails?.filter(e => !e.processed).length || 0,
    totalInvoices: invoices?.length || 0,
    totalTasks: tasks?.length || 0,
    reviewCount: emails?.filter(e => e.needs_review).length || 0,
    companies: companies?.map(c => c.name) || [],
    recentSenders: [...new Set((emails || []).slice(0, 10).map(e => e.sender).filter(Boolean))],
  }), [emails, tasks, invoices, companies]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    let assistantContent = "";
    const updateAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        return [...prev, { role: "assistant", content: assistantContent }];
      });
    };
    try {
      await streamChat({
        messages: [...messages, userMsg], context: getContext(),
        onDelta: updateAssistant, onDone: () => setIsLoading(false),
        onError: (err) => { updateAssistant(`⚠️ ${err}`); setIsLoading(false); },
      });
    } catch { updateAssistant("⚠️ Failed to connect to AI service."); setIsLoading(false); }
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="fixed bottom-6 right-6 z-50">
            <Button onClick={() => setIsOpen(true)} className="h-14 w-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
              <MessageCircle className="h-6 w-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 w-[400px] h-[560px] max-h-[80vh] flex flex-col bg-card border border-border/30 rounded-2xl shadow-2xl shadow-black/8 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/8 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-sm">AI Command</h3>
                  <p className="text-[11px] text-muted-foreground">Control your agents</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8 rounded-xl">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="h-14 w-14 rounded-2xl bg-primary/6 flex items-center justify-center mb-4">
                    <Bot className="h-7 w-7 text-primary" />
                  </div>
                  <h4 className="font-heading font-semibold text-sm mb-1.5">AI Suite Assistant</h4>
                  <p className="text-xs text-muted-foreground mb-6 max-w-[260px] leading-relaxed">
                    Ask me about your emails, invoices, tasks, or give commands to agents.
                  </p>
                  <div className="grid grid-cols-2 gap-2 w-full">
                    {suggestions.map(s => (
                      <button key={s} onClick={() => send(s)} className="text-left text-xs p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors text-foreground/80 leading-relaxed">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-xl bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-lg"
                      : "bg-secondary/50 text-foreground rounded-bl-lg"
                  }`}>
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  </div>
                  {msg.role === "user" && (
                    <div className="h-7 w-7 rounded-xl bg-secondary/80 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-3.5 w-3.5 text-foreground/50" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex gap-2.5">
                  <div className="h-7 w-7 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="bg-secondary/50 rounded-2xl rounded-bl-lg px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-border/30">
              <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask your agents..."
                  disabled={isLoading}
                  className="flex-1 h-10 px-4 rounded-xl bg-secondary/40 border border-border/30 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20 transition-all disabled:opacity-50"
                />
                <Button type="submit" disabled={isLoading || !input.trim()} size="icon" className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
