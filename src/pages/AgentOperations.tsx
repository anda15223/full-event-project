import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, CalendarClock, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEmails, useEmailTasks, useCompanies, useUpdateTask } from "@/hooks/useEmailAgent";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AgentOperations() {
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const { data: companies } = useCompanies();
  const { data: emails, isLoading: loadingEmails } = useEmails(
    filterCompany !== "all" ? { company: filterCompany } : undefined
  );
  const { data: tasks } = useEmailTasks(
    filterCompany !== "all" ? { company: filterCompany } : undefined
  );
  const updateTask = useUpdateTask();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const operationalEmails = useMemo(() => {
    if (!emails) return [];
    return emails.filter(e =>
      e.assigned_agent === "operational_agent" ||
      e.assigned_agent === "accounting_agent" ||
      (e.classification === "task" && e.action_required)
    );
  }, [emails]);

  const sections = useMemo(() => {
    const accounting = operationalEmails.filter(e => e.assigned_agent === "accounting_agent");
    const operational = operationalEmails.filter(e => e.assigned_agent === "operational_agent");
    const other = operationalEmails.filter(e =>
      e.assigned_agent !== "accounting_agent" && e.assigned_agent !== "operational_agent"
    );
    return [
      { key: "accounting", label: "Accounting & System", emoji: "🔧", items: accounting, color: "border-agent-purple/20" },
      { key: "operational", label: "Operational & Events", emoji: "📌", items: operational, color: "border-agent-orange/20" },
      { key: "other", label: "Other Tasks", emoji: "📋", items: other, color: "border-border/30" },
    ].filter(s => s.items.length > 0);
  }, [operationalEmails]);

  const metrics = useMemo(() => ({
    total: operationalEmails.length,
    accounting: operationalEmails.filter(e => e.assigned_agent === "accounting_agent").length,
    operational: operationalEmails.filter(e => e.assigned_agent === "operational_agent").length,
    urgent: operationalEmails.filter(e =>
      e.summary?.toLowerCase().includes("overdue") || e.summary?.toLowerCase().includes("urgent")
    ).length,
  }), [operationalEmails]);

  const toggle = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-br from-agent-purple/10 via-agent-orange/5 to-transparent border border-agent-purple/15 p-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-agent-purple to-agent-orange flex items-center justify-center">
                <Wrench className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-heading font-bold text-foreground">Operations Center</h1>
                <p className="text-sm text-muted-foreground">Accounting, system tasks & operational events</p>
              </div>
            </div>
          </div>
          <Select value={filterCompany} onValueChange={setFilterCompany}>
            <SelectTrigger className="w-48 h-9 text-xs bg-white/80"><SelectValue placeholder="All companies" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Items", value: metrics.total, color: "text-foreground" },
          { label: "Accounting", value: metrics.accounting, color: "text-agent-purple" },
          { label: "Operational", value: metrics.operational, color: "text-agent-orange" },
          { label: "Urgent", value: metrics.urgent, color: "text-destructive" },
        ].map((m, i) => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-xl border border-border/40 p-4 text-center">
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Sections */}
      {loadingEmails ? (
        <div className="text-center py-16 text-muted-foreground">Loading operations...</div>
      ) : sections.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No operational items found</div>
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
                          <p className="text-xs text-muted-foreground truncate">{email.sender} · {email.company || "Unknown"}</p>
                          {email.summary && <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">{email.summary}</p>}
                        </div>
                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          {email.action_required && (
                            <Badge variant="outline" className="text-[10px] border-agent-orange/30 text-agent-orange">Action</Badge>
                          )}
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
