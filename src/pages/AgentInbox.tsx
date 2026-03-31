import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Search, RefreshCw, Zap, RotateCcw, XCircle,
  AlertTriangle, Building2, FolderOpen, Inbox, Clock,
  MessageSquare, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useEmails, useCompanies, useFetchEmails, useClassifyAllEmails,
  useSyncAndClassify, useReprocessEmail, useUpdateEmail, type Email,
} from "@/hooks/useEmailAgent";
import { SECTIONS, assignToSections } from "@/components/inbox/inboxSections";
import { EmailCard, EmailListItem, EmailCompactSummary } from "@/components/inbox/EmailCard";

export default function AgentInbox() {
  const [search, setSearch] = useState("");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [sinceDate, setSinceDate] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    SECTIONS.forEach(s => { if (s.defaultCollapsed) init[s.key] = true; });
    return init;
  });
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  const { data: companies } = useCompanies();
  const { data: emails, isLoading } = useEmails({
    company: filterCompany !== "all" ? filterCompany : undefined,
  });
  const fetchEmails = useFetchEmails();
  const classifyAll = useClassifyAllEmails();
  const syncAndClassify = useSyncAndClassify();
  const reprocessEmail = useReprocessEmail();
  const updateEmail = useUpdateEmail();

  const allEmails = emails || [];
  const filteredEmails = useMemo(() => {
    if (!search) return allEmails;
    const s = search.toLowerCase();
    return allEmails.filter(e =>
      e.subject?.toLowerCase().includes(s) || e.sender?.toLowerCase().includes(s) || e.summary?.toLowerCase().includes(s)
    );
  }, [allEmails, search]);

  const sectionMap = useMemo(() => assignToSections(filteredEmails), [filteredEmails]);

  const unprocessedCount = allEmails.filter(e => !e.processed).length;
  const reviewCount = allEmails.filter(e => e.needs_review).length;
  const isBusy = fetchEmails.isPending || classifyAll.isPending || syncAndClassify.isPending;

  const metrics = useMemo(() => ({
    total: allEmails.length,
    unprocessed: unprocessedCount,
    review: reviewCount,
    actionRequired: allEmails.filter(e => e.action_required).length,
  }), [allEmails, unprocessedCount, reviewCount]);

  const toggleSection = (key: string) =>
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-agent-purple/10 via-agent-purple/5 to-transparent border border-agent-purple/15 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FolderOpen className="h-5 w-5 text-agent-purple" />
              <span className="text-xs font-semibold tracking-wider uppercase text-agent-purple">Email Decision Center</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tight text-foreground">
              Inbox Summary
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Emails organized by business category — what needs attention now
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={sinceDate} onChange={e => setSinceDate(e.target.value)} className="w-40 bg-card border-border/50 rounded-xl" />
            <Button onClick={() => syncAndClassify.mutate(sinceDate || undefined)} disabled={isBusy} className="bg-agent-purple text-white hover:bg-agent-purple/90 rounded-xl gap-2">
              <RefreshCw className={`h-4 w-4 ${syncAndClassify.isPending ? "animate-spin" : ""}`} />
              {syncAndClassify.isPending ? "Syncing..." : "Sync Emails"}
            </Button>
            <Button onClick={() => classifyAll.mutate()} disabled={isBusy || unprocessedCount === 0} variant="outline" className="border-border/50 rounded-xl gap-2">
              <Zap className={`h-4 w-4 ${classifyAll.isPending ? "animate-pulse" : ""}`} /> Classify ({unprocessedCount})
            </Button>
          </div>
        </div>
      </div>

      {/* Pipeline status */}
      {isBusy && (
        <div className="p-3.5 rounded-xl bg-agent-purple/6 border border-agent-purple/15 text-sm text-agent-purple flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {syncAndClassify.isPending ? "Running full pipeline (Fetch → Store → Classify)..." :
           fetchEmails.isPending ? "Stage 1: Fetching from IMAP..." :
           "Stage 2: AI classification in progress..."}
        </div>
      )}

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Emails", value: metrics.total, icon: Inbox, color: "text-foreground", bg: "bg-secondary/60" },
          { label: "Unprocessed", value: metrics.unprocessed, icon: Clock, color: "text-agent-purple", bg: "bg-agent-purple/6" },
          { label: "Needs Review", value: metrics.review, icon: AlertTriangle, color: "text-warning", bg: "bg-warning/6" },
          { label: "Action Required", value: metrics.actionRequired, icon: MessageSquare, color: "text-destructive", bg: "bg-destructive/6" },
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search emails..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card border-border/40 rounded-xl" />
        </div>
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-48 bg-card border-border/40 rounded-xl"><Building2 className="h-4 w-4 mr-2" /><SelectValue placeholder="Company" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
            <SelectItem value="Unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sectioned View */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading emails...</div>
      ) : allEmails.length === 0 ? (
        <div className="premium-card p-12 text-center">
          <Mail className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No emails found</p>
          <p className="text-xs text-muted-foreground mt-1">Use "Sync Emails" to fetch & classify</p>
        </div>
      ) : (
        <div className="space-y-4">
          {SECTIONS.map(section => {
            const sectionEmails = sectionMap.get(section.key) || [];
            if (sectionEmails.length === 0) return null;
            const isCollapsed = collapsedSections[section.key];

            return (
              <div key={section.key} className={`rounded-2xl border ${section.borderColor} ${section.color} overflow-hidden`}>
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={section.iconColor}>{section.icon}</span>
                    <span className="text-sm font-semibold text-foreground">
                      {section.emoji} {section.label}
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-2 py-0 border-0">
                      {sectionEmails.length}
                    </Badge>
                    <span className="text-xs text-muted-foreground hidden md:inline">
                      {section.description}
                    </span>
                  </div>
                  <motion.div animate={{ rotate: isCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                </button>

                {/* Section content */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      {section.renderStyle === "card" ? (
                        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {sectionEmails.map((email, idx) => (
                            <EmailCard
                              key={email.id}
                              email={email}
                              index={idx}
                              isSelected={selectedEmail?.id === email.id}
                              sectionKey={section.key}
                              onSelect={setSelectedEmail}
                            />
                          ))}
                        </div>
                      ) : section.renderStyle === "list" ? (
                        <div className="px-5 pb-4 space-y-0.5">
                          {sectionEmails.map(email => (
                            <EmailListItem key={email.id} email={email} />
                          ))}
                        </div>
                      ) : (
                        <EmailCompactSummary emails={sectionEmails} />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Email Detail Drawer */}
      <AnimatePresence>
        {selectedEmail && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 right-4 left-4 md:left-auto md:w-[500px] z-50"
          >
            <div className="premium-card p-6 space-y-4 shadow-xl border-agent-purple/20">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-heading font-semibold text-foreground truncate">{selectedEmail.subject || "(no subject)"}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedEmail.sender}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{selectedEmail.received_at ? new Date(selectedEmail.received_at).toLocaleString() : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => reprocessEmail.mutate(selectedEmail.id)} disabled={reprocessEmail.isPending} className="rounded-lg border-border/40 gap-1 h-7 text-[11px]">
                    <RotateCcw className={`h-3 w-3 ${reprocessEmail.isPending ? "animate-spin" : ""}`} /> Reprocess
                  </Button>
                  <button onClick={() => setSelectedEmail(null)} className="text-muted-foreground hover:text-foreground">
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedEmail.classification && (
                  <Badge variant="outline" className="rounded-lg text-[10px]">{selectedEmail.classification}</Badge>
                )}
                {selectedEmail.company && (
                  <Badge variant="outline" className="rounded-lg border-agent-green/20 text-agent-green bg-agent-green/6 text-[10px]">
                    <Building2 className="h-3 w-3 mr-1" />{selectedEmail.company}
                  </Badge>
                )}
                {selectedEmail.confidence != null && (
                  <Badge variant="outline" className="rounded-lg text-muted-foreground border-border/40 text-[10px]">{Math.round((selectedEmail.confidence || 0) * 100)}%</Badge>
                )}
              </div>

              {selectedEmail.needs_review && (
                <div className="p-3 rounded-xl bg-warning/6 border border-warning/15">
                  <div className="flex items-center gap-2 text-warning text-xs font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Needs Manual Review</div>
                  <p className="text-[11px] text-muted-foreground mt-1">{selectedEmail.review_reason || "Low confidence"}</p>
                  <div className="flex gap-2 mt-2">
                    <Select onValueChange={val => { updateEmail.mutate({ id: selectedEmail.id, updates: { company: val, needs_review: false } }); setSelectedEmail(null); }}>
                      <SelectTrigger className="w-40 h-7 text-[10px] bg-card rounded-lg"><SelectValue placeholder="Reassign company" /></SelectTrigger>
                      <SelectContent>
                        {companies?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select onValueChange={val => { updateEmail.mutate({ id: selectedEmail.id, updates: { classification: val, needs_review: false } }); setSelectedEmail(null); }}>
                      <SelectTrigger className="w-32 h-7 text-[10px] bg-card rounded-lg"><SelectValue placeholder="Reclassify" /></SelectTrigger>
                      <SelectContent>
                        {["invoice", "task", "waiting", "information", "irrelevant"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {selectedEmail.summary && (
                <div>
                  <h3 className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-1.5">AI Summary</h3>
                  <p className="text-xs text-foreground/80 leading-relaxed bg-secondary/40 p-3 rounded-xl">{selectedEmail.summary}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
