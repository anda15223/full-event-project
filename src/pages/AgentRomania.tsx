import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, ChevronDown, ChevronRight, ExternalLink, FileText, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEmails, useEmailInvoices, useEmailTasks } from "@/hooks/useEmailAgent";

export default function AgentRomania() {
  const { data: emails, isLoading } = useEmails({ company: "Romania" });
  const { data: invoices } = useEmailInvoices({ company: "Romania" });
  const { data: tasks } = useEmailTasks({ company: "Romania" });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const sections = useMemo(() => {
    if (!emails) return [];
    const inv = emails.filter(e => e.classification === "invoice");
    const actionable = emails.filter(e => e.classification === "task" && e.action_required);
    const info = emails.filter(e => e.classification === "information" || e.classification === "waiting");
    const other = emails.filter(e =>
      e.classification !== "invoice" && e.classification !== "task" &&
      e.classification !== "information" && e.classification !== "waiting"
    );
    return [
      { key: "invoices", label: "Romanian Invoices", emoji: "💰", items: inv, color: "border-agent-green/20" },
      { key: "tasks", label: "Romanian Tasks", emoji: "📌", items: actionable, color: "border-agent-orange/20" },
      { key: "info", label: "Information", emoji: "📋", items: info, color: "border-agent-blue/20" },
      { key: "other", label: "Other", emoji: "📎", items: other, color: "border-border/30" },
    ].filter(s => s.items.length > 0);
  }, [emails]);

  const metrics = useMemo(() => ({
    totalEmails: emails?.length || 0,
    invoiceCount: invoices?.length || 0,
    taskCount: tasks?.length || 0,
    totalAmount: invoices?.reduce((sum, inv) => sum + (inv.amount || 0), 0) || 0,
  }), [emails, invoices, tasks]);

  const toggle = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-br from-agent-blue/10 via-agent-blue/5 to-transparent border border-agent-blue/15 p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-agent-blue to-primary flex items-center justify-center">
            <Globe className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Romania Operations</h1>
            <p className="text-sm text-muted-foreground">All Romanian business communication in one view</p>
          </div>
        </div>
      </motion.div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Emails", value: metrics.totalEmails, color: "text-foreground" },
          { label: "Invoices", value: metrics.invoiceCount, color: "text-agent-green", icon: FileText },
          { label: "Tasks", value: metrics.taskCount, color: "text-agent-orange", icon: ListTodo },
          { label: "Total Amount", value: `${metrics.totalAmount.toLocaleString("ro-RO")} RON`, color: "text-agent-green" },
        ].map((m, i) => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-xl border border-border/40 p-4 text-center">
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Sections */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading Romania operations...</div>
      ) : sections.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No Romanian emails found</div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {sections.map(section => (
              <motion.div key={section.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`bg-white rounded-xl border ${section.color} overflow-hidden`}>
                <button onClick={() => toggle(section.key)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{section.emoji}</span>
                    <span className="font-medium text-sm">{section.label}</span>
                    <Badge variant="secondary" className="text-[10px]">{section.items.length}</Badge>
                  </div>
                  {collapsed[section.key] ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {!collapsed[section.key] && (
                  <div className="px-5 pb-4 space-y-2">
                    {section.items.map(email => (
                      <div key={email.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{email.subject || "(no subject)"}</p>
                          <p className="text-xs text-muted-foreground truncate">{email.sender}</p>
                          {email.summary && <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">{email.summary}</p>}
                        </div>
                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          <Badge variant="outline" className="text-[10px]">{email.classification}</Badge>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                            <ExternalLink className="h-3 w-3" /> Open
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
