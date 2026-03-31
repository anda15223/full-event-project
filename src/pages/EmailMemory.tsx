import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, Users, Building2, Clock, Globe, Tag, FileDown, BookOpen, Zap } from "lucide-react";
import { useEmails, useCompanies, useEmailInvoices } from "@/hooks/useEmailAgent";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { exportMemoryDocument } from "@/lib/exportMemoryDoc";
import { toast } from "sonner";

export default function EmailMemory() {
  const { data: emails } = useEmails();
  const { data: companies } = useCompanies();
  const { data: invoices } = useEmailInvoices();

  const stats = useMemo(() => {
    if (!emails) return { senders: [], languages: [], companies: new Map(), recentSubjects: [] };
    const senderMap = new Map<string, number>();
    const langMap = new Map<string, number>();
    const companyMap = new Map<string, number>();
    emails.forEach(e => {
      if (e.sender) senderMap.set(e.sender, (senderMap.get(e.sender) || 0) + 1);
      if (e.language) langMap.set(e.language, (langMap.get(e.language) || 0) + 1);
      if (e.company) companyMap.set(e.company, (companyMap.get(e.company) || 0) + 1);
    });
    return {
      senders: [...senderMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
      languages: [...langMap.entries()].sort((a, b) => b[1] - a[1]),
      companies: companyMap,
      recentSubjects: emails.slice(0, 8),
    };
  }, [emails]);

  const suppliers = useMemo(() => {
    if (!invoices) return [];
    const map = new Map<string, number>();
    invoices.forEach(inv => { if (inv.supplier_name) map.set(inv.supplier_name, (map.get(inv.supplier_name) || 0) + 1); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [invoices]);

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportMemoryDocument({
        totalEmails: emails?.length || 0,
        senders: stats.senders,
        suppliers,
        companies: (companies || []).map(c => ({ name: c.name, emailCount: stats.companies.get(c.name) || 0 })),
        languages: stats.languages,
        recentEmails: stats.recentSubjects.map(e => ({
          sender: e.sender || "Unknown", subject: e.subject || "", company: e.company || "",
          classification: e.classification || "", date: e.received_at ? new Date(e.received_at).toLocaleDateString() : "",
        })),
      });
      toast.success("Memory report exported as Word document");
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  // AI insights
  const insights = useMemo(() => {
    const items: string[] = [];
    if (stats.senders.length > 0) items.push(`Top sender: ${stats.senders[0][0]} (${stats.senders[0][1]} emails)`);
    if (suppliers.length > 0) items.push(`Most active supplier: ${suppliers[0][0]} (${suppliers[0][1]} invoices)`);
    const topLang = stats.languages[0];
    if (topLang) items.push(`Primary language: ${topLang[0]} (${topLang[1]} emails)`);
    return items;
  }, [stats, suppliers]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-agent-blue/10 via-agent-blue/5 to-transparent border border-agent-blue/15 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-5 w-5 text-agent-blue" />
              <span className="text-xs font-semibold tracking-wider uppercase text-agent-blue">Business Knowledge</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tight text-foreground">
              Email Memory
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Everything the system has learned from your communications
            </p>
          </div>
          <Button onClick={handleExport} disabled={exporting} className="rounded-xl bg-agent-blue hover:bg-agent-blue/90 text-white gap-2">
            <FileDown className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export as Word"}
          </Button>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Emails", value: emails?.length || 0, icon: Brain, color: "text-agent-blue", bg: "bg-agent-blue/6" },
          { label: "Known Senders", value: stats.senders.length, icon: Users, color: "text-agent-purple", bg: "bg-agent-purple/6" },
          { label: "Companies", value: companies?.length || 0, icon: Building2, color: "text-agent-green", bg: "bg-agent-green/6" },
          { label: "Known Suppliers", value: suppliers.length, icon: Tag, color: "text-agent-orange", bg: "bg-agent-orange/6" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="premium-card p-5">
            <div className={`h-10 w-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <div className={`text-3xl font-bold font-heading tracking-tight ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <div className="premium-card p-5 border-agent-blue/15">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-agent-blue" />
            <span className="text-xs font-semibold tracking-wider uppercase text-agent-blue">AI Insights</span>
          </div>
          <div className="space-y-2">
            {insights.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-foreground/80">
                <div className="h-1.5 w-1.5 rounded-full bg-agent-blue shrink-0" />
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge Grid */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="premium-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Users className="h-4 w-4 text-agent-purple" />
            <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Known Senders</h3>
          </div>
          <div className="space-y-0.5">
            {stats.senders.map(([sender, count]) => (
              <div key={sender} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-secondary/50 transition-colors">
                <span className="text-sm truncate flex-1">{sender}</span>
                <Badge variant="secondary" className="text-[10px] border-0">{count}</Badge>
              </div>
            ))}
            {stats.senders.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No senders yet</p>}
          </div>
        </div>

        <div className="premium-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Tag className="h-4 w-4 text-agent-green" />
            <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Known Suppliers</h3>
          </div>
          <div className="space-y-0.5">
            {suppliers.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-secondary/50 transition-colors">
                <span className="text-sm truncate flex-1">{name}</span>
                <Badge variant="secondary" className="text-[10px] bg-agent-green/10 text-agent-green border-0">{count}</Badge>
              </div>
            ))}
            {suppliers.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No suppliers yet</p>}
          </div>
        </div>

        <div className="premium-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Building2 className="h-4 w-4 text-agent-blue" />
            <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Companies</h3>
          </div>
          <div className="space-y-0.5">
            {companies?.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-secondary/50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-2 rounded-full bg-agent-blue" />
                  <span className="text-sm">{c.name}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] border-0">{stats.companies.get(c.name) || 0} emails</Badge>
              </div>
            ))}
            {(!companies || companies.length === 0) && <p className="text-sm text-muted-foreground text-center py-6">No companies configured</p>}
          </div>
        </div>

        <div className="premium-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Globe className="h-4 w-4 text-warning" />
            <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Languages</h3>
          </div>
          <div className="space-y-0.5">
            {stats.languages.map(([lang, count]) => (
              <div key={lang} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-secondary/50 transition-colors">
                <span className="text-sm capitalize">{lang || "Unknown"}</span>
                <Badge variant="secondary" className="text-[10px] border-0">{count}</Badge>
              </div>
            ))}
            {stats.languages.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No languages detected</p>}
          </div>
        </div>
      </div>

      {/* Recently Learned */}
      <div className="premium-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <BookOpen className="h-4 w-4 text-agent-blue" />
          <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Recently Learned</h3>
        </div>
        <div className="space-y-0.5">
          {stats.recentSubjects.map(email => (
            <div key={email.id} className="flex items-start gap-3 py-2.5 px-2 rounded-xl hover:bg-secondary/40 transition-colors">
              <div className="h-1.5 w-1.5 rounded-full bg-agent-blue mt-2.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{email.sender || "Unknown"}</span>
                  {email.company && <Badge variant="secondary" className="text-[10px] border-0">{email.company}</Badge>}
                  {email.classification && <Badge variant="secondary" className="text-[10px] bg-primary/6 text-primary border-0">{email.classification}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{email.subject}</p>
              </div>
              <span className="text-[11px] text-muted-foreground/40 shrink-0">
                {email.received_at ? new Date(email.received_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
