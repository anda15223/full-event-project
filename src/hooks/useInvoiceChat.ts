import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatResult = {
  reply: string;
  action: string;
  action_taken: boolean;
  brain_rule_saved: boolean;
  brain_rule_name: string | null;
  invoice_deleted: boolean;
};

export function useInvoiceChat(invoiceId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastBrainRule, setLastBrainRule] = useState<string | null>(null);
  const [invoiceDeleted, setInvoiceDeleted] = useState(false);
  const qc = useQueryClient();

  const sendMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);
    setLastBrainRule(null);

    try {
      const { data, error } = await supabase.functions.invoke("invoice-chat", {
        body: {
          invoice_id: invoiceId,
          message: userMessage,
          chat_history: messages, // send previous history (not including current)
        },
      });

      if (error) throw error;

      const result = data as ChatResult;

      setMessages([...newMessages, { role: "assistant", content: result.reply }]);

      if (result.brain_rule_saved && result.brain_rule_name) {
        setLastBrainRule(result.brain_rule_name);
      }

      if (result.invoice_deleted) {
        setInvoiceDeleted(true);
        toast.success("Invoice removed — brain rule saved");
      }

      if (result.action_taken) {
        qc.invalidateQueries({ queryKey: ["invoices"] });
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to send message";
      setMessages([...newMessages, { role: "assistant", content: `Sorry, I hit an error: ${errMsg}` }]);
      toast.error("Chat error");
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setLastBrainRule(null);
    setInvoiceDeleted(false);
  };

  return { messages, isLoading, sendMessage, lastBrainRule, invoiceDeleted, reset };
}
