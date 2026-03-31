import { Badge } from "@/components/ui/badge";
import { Brain, Users, Building2, Clock, Globe, Tag } from "lucide-react";
import { useEmails, useCompanies, useEmailInvoices } from "@/hooks/useEmailAgent";
import { motion } from "framer-motion";
import { useMemo } from "react";

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
    invoices.forEach(inv => {
      if (inv.supplier_name) map.set(inv.supplier_name, (map.get(inv.supplier_name) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [invoices]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="page-header">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4 text-agent-blue" />
          <span className="section-label text-agent-blue">Email Memory Agent</span>
        </div>
        <h1 className="page-title">Email Memory</h1>
        <p className="page-subtitle">Everything the system has learned from your emails</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Emails", value: emails?.length || 0, icon: Brain, color: "text-agent-blue" },
          { label: "Known Senders", value: stats.senders.length, icon: Users, color: "text-agent-purple" },
          { label: "Companies", value: companies?.length || 0, icon: Building2, color: "text-agent-green" },
          { label: "Known Suppliers", value: suppliers.length, icon: Tag, color: "text-agent-orange" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="premium-card p-5">
            <div className="h-10 w-10 rounded-xl bg-secondary/80 flex items-center justify-center mb-3">
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div className="metric-value">{s.value}</div>
            <div className="metric-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="premium-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="section-label">Known Senders</h3>
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
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h3 className="section-label">Known Suppliers</h3>
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
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="section-label">Companies</h3>
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
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h3 className="section-label">Languages</h3>
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

      <div className="premium-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="section-label">Recently Learned</h3>
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
