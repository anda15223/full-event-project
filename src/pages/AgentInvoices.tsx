import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Building2, Calendar, Hash, Loader2, Sparkles, ChevronDown,
  AlertTriangle, Clock, CheckCircle, DollarSign, TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmailInvoices, useCompanies, useExtractAllInvoices } from "@/hooks/useEmailAgent";

export default function AgentInvoices() {
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const { data: companies } = useCompanies();
  const { data: invoices, isLoading } = useEmailInvoices({
    company: filterCompany !== "all" ? filterCompany : undefined,
  });
  const extractAll = useExtractAllInvoices();

  const allInvoices = invoices || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const groupByCurrency = (items: typeof allInvoices) => {
    const groups: Record<string, number> = {};
    items.forEach(i => {
      const cur = i.currency || "DKK";
      groups[cur] = (groups[cur] || 0) + (i.amount || 0);
    });
    return groups;
  };

  const formatByCurrency = (groups: Record<string, number>) =>
    Object.entries(groups).map(([cur, amt]) => `${amt.toLocaleString("da-DK")} ${cur}`).join(" · ");

  const metrics = useMemo(() => {
    const total = allInvoices.length;
    const totalByCurrency = groupByCurrency(allInvoices);
    const overdue = allInvoices.filter(i => i.due_date && new Date(i.due_date) < today).length;
    const dueThisWeek = allInvoices.filter(i => {
      if (!i.due_date) return false;
      const d = new Date(i.due_date);
      return d >= today && d <= weekFromNow;
    }).length;
    const companiesCount = new Set(allInvoices.map(i => i.company).filter(Boolean)).size;
    return { total, totalByCurrency, overdue, dueThisWeek, companiesCount };
  }, [allInvoices]);

  // Smart sections
  const sections = useMemo(() => {
    const overdue = allInvoices.filter(i => i.due_date && new Date(i.due_date) < today);
    const dueThisWeek = allInvoices.filter(i => {
      if (!i.due_date) return false;
      const d = new Date(i.due_date);
      return d >= today && d <= weekFromNow;
    });
    const upcoming = allInvoices.filter(i => {
      if (!i.due_date) return false;
      return new Date(i.due_date) > weekFromNow;
    });
    const noDue = allInvoices.filter(i => !i.due_date);
    return [
      { key: "overdue", label: "🔴 Overdue", invoices: overdue, color: "border-destructive/30 bg-destructive/4" },
      { key: "due_week", label: "🟡 Due This Week", invoices: dueThisWeek, color: "border-warning/30 bg-warning/4" },
      { key: "upcoming", label: "🔵 Upcoming", invoices: upcoming, color: "border-agent-blue/20 bg-agent-blue/4" },
      { key: "no_date", label: "⚪ No Due Date", invoices: noDue, color: "border-border/30 bg-secondary/30" },
    ];
  }, [allInvoices]);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const suggestions = useMemo(() => {
    const items: string[] = [];
    if (metrics.overdue > 0) items.push(`${metrics.overdue} invoice${metrics.overdue > 1 ? "s" : ""} overdue — pay today`);
    if (metrics.dueThisWeek > 0) items.push(`${metrics.dueThisWeek} invoice${metrics.dueThisWeek > 1 ? "s" : ""} due this week`);
    return items;
  }, [metrics]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-agent-green/10 via-success/5 to-transparent border border-agent-green/15 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-agent-green" />
              <span className="text-xs font-semibold tracking-wider uppercase text-agent-green">Cash Control Center</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tight text-foreground">
              Invoice Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Invoices extracted from emails, organized by urgency
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger className="w-48 bg-card border-border/40 rounded-xl">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              onClick={() => extractAll.mutate()}
              disabled={extractAll.isPending}
              className="rounded-xl bg-agent-green hover:bg-agent-green/90 text-white gap-2"
            >
              {extractAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Extract from PDFs
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Invoices", value: metrics.total, icon: FileText, color: "text-foreground", bg: "bg-secondary/60" },
          { label: "Total Amount", value: `${metrics.totalAmount.toLocaleString("da-DK")} DKK`, icon: DollarSign, color: "text-agent-green", bg: "bg-agent-green/6" },
          { label: "Overdue", value: metrics.overdue, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/6" },
          { label: "Due This Week", value: metrics.dueThisWeek, icon: Clock, color: "text-warning", bg: "bg-warning/6" },
        ].map((m, i) => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="premium-card p-5">
            <div className={`h-10 w-10 rounded-xl ${m.bg} flex items-center justify-center mb-3`}>
              <m.icon className={`h-5 w-5 ${m.color}`} />
            </div>
            <div className={`text-2xl font-bold font-heading tracking-tight ${m.color}`}>{m.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
          </motion.div>
        ))}
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="premium-card p-5 border-agent-green/15">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-agent-green" />
            <span className="text-xs font-semibold tracking-wider uppercase text-agent-green">AI Insights</span>
          </div>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-foreground/80">
                <div className="h-1.5 w-1.5 rounded-full bg-agent-green shrink-0" />
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Smart Sections */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading invoices...</div>
      ) : allInvoices.length === 0 ? (
        <div className="premium-card p-12 text-center">
          <CheckCircle className="h-16 w-16 text-success/30 mx-auto mb-4" />
          <h3 className="text-lg font-heading font-semibold text-foreground mb-1">No invoices yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Extract invoices from PDF attachments to get started</p>
          <Button onClick={() => extractAll.mutate()} disabled={extractAll.isPending} className="rounded-xl bg-agent-green hover:bg-agent-green/90 text-white gap-2">
            <Sparkles className="h-4 w-4" /> Extract from PDFs
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.filter(s => s.invoices.length > 0).map(section => {
            const isCollapsed = collapsedSections[section.key];
            return (
              <div key={section.key} className={`rounded-2xl border ${section.color} overflow-hidden`}>
                <button
                  onClick={() => setCollapsedSections(prev => ({ ...prev, [section.key]: !prev[section.key] }))}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">{section.label}</span>
                    <Badge variant="secondary" className="text-[10px] px-2 py-0 border-0">{section.invoices.length}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {section.invoices.reduce((s, i) => s + (i.amount || 0), 0).toLocaleString("da-DK")} DKK
                    </span>
                  </div>
                  <motion.div animate={{ rotate: isCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {section.invoices.map(inv => (
                          <motion.div key={inv.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="premium-card p-5 hover:shadow-md transition-all">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-foreground">{inv.supplier_name || "Unknown supplier"}</h4>
                                {inv.company && (
                                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                                    <Building2 className="h-3 w-3" /> {inv.company}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-lg font-bold text-agent-green font-heading">
                                  {inv.amount !== null ? inv.amount.toLocaleString("da-DK") : "—"}
                                </span>
                                <span className="text-xs text-muted-foreground ml-1">{inv.currency || "DKK"}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                              {inv.invoice_number && (
                                <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {inv.invoice_number}</span>
                              )}
                              {inv.invoice_date && (
                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(inv.invoice_date).toLocaleDateString()}</span>
                              )}
                              {inv.due_date && (
                                <span className={`flex items-center gap-1 font-medium ${new Date(inv.due_date) < today ? "text-destructive" : "text-warning"}`}>
                                  <Clock className="h-3 w-3" /> Due: {new Date(inv.due_date).toLocaleDateString()}
                                </span>
                              )}
                              {inv.vat !== null && <span>VAT: {inv.vat?.toLocaleString("da-DK")}</span>}
                              {inv.attachment_present && <Badge variant="outline" className="text-[9px] h-4 rounded-md">📎 PDF</Badge>}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
