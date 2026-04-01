import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, X, Brain, Loader2 } from "lucide-react";
import { useInvoiceChat } from "@/hooks/useInvoiceChat";
import ReactMarkdown from "react-markdown";

interface Props {
  invoiceId: string;
  onDeleted?: () => void;
}

export default function InvoiceChatPanel({ invoiceId, onDeleted }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { messages, isLoading, sendMessage, lastBrainRule, invoiceDeleted, reset } = useInvoiceChat(invoiceId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (invoiceDeleted && onDeleted) {
      const timer = setTimeout(onDeleted, 1500);
      return () => clearTimeout(timer);
    }
  }, [invoiceDeleted, onDeleted]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  const handleClose = () => {
    setIsOpen(false);
    reset();
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        title="Talk to AI about this invoice"
      >
        <MessageCircle size={14} />
        <span>Ask AI</span>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="border-t border-border/40 bg-secondary/30 rounded-b-xl overflow-hidden"
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <MessageCircle size={12} />
            <span>Invoice AI Chat</span>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="space-y-2 mb-3 max-h-52 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              Tell me what's wrong with this invoice...
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`rounded-lg px-3 py-2 text-xs max-w-[85%] ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border/40 text-foreground"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-xs prose-invert max-w-none [&_p]:m-0 [&_p]:leading-relaxed">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-lg px-3 py-2 bg-card border border-border/40">
                <Loader2 size={14} className="animate-spin text-primary" />
              </div>
            </div>
          )}
        </div>

        {/* Brain rule confirmation */}
        <AnimatePresence>
          {lastBrainRule && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-3 rounded-lg bg-primary/5 border border-primary/20 p-2.5"
            >
              <div className="flex items-center gap-1.5">
                <Brain size={12} className="text-primary" />
                <span className="text-[11px] font-medium text-primary">Brain updated</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Rule saved: "{lastBrainRule}"
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                This pattern will be recognised automatically next time
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Deleted notice */}
        {invoiceDeleted && (
          <div className="mb-3 rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-center">
            <p className="text-[11px] font-medium text-destructive">Invoice removed</p>
          </div>
        )}

        {/* Input */}
        {!invoiceDeleted && (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Tell me what's wrong..."
              className="flex-1 bg-card border border-border/40 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-primary text-primary-foreground rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              <Send size={12} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
