import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Search, RefreshCw, Zap, RotateCcw,
  AlertTriangle, Clock, FileText, CheckCircle, XCircle, Building2,
  Eye, FolderOpen, Inbox, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useEmails, useCompanies, useFetchEmails, useClassifyAllEmails,
  useSyncAndClassify, useReprocessEmail, useUpdateEmail, type Email,
} from "@/hooks/useEmailAgent";

const classificationIcons: Record<string, React.ReactNode> = {
  invoice: <FileText className="h-4 w-4" />,
  task: <CheckCircle className="h-4 w-4" />,
  waiting: <Clock className="h-4 w-4" />,
  information: <Eye className="h-4 w-4" />,
  irrelevant: <XCircle className="h-4 w-4" />,
};

const classificationColors: Record<string, string> = {
  invoice: "bg-agent-green/10 text-agent-green border-agent-green/20",
  task: "bg-agent-orange/10 text-agent-orange border-agent-orange/20",
  waiting: "bg-warning/10 text-warning border-warning/20",
  information: "bg-secondary text-muted-foreground border-border",
  irrelevant: "bg-destructive/8 text-destructive border-destructive/20",
};

export default function AgentInbox() {
  const [search, setSearch] = useState("");
  const [filterClassification, setFilterClassification] = useState<string>("all");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterReview, setFilterReview] = useState<string>("all");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [sinceDate, setSinceDate] = useState("");

  const { data: companies } = useCompanies();
  const { data: emails, isLoading } = useEmails({
    classification: filterClassification !== "all" ? filterClassification : undefined,
    company: filterCompany !== "all" ? filterCompany : undefined,
    needs_review: filterReview === "review" ? true : filterReview === "no_review" ? false : undefined,
  });
  const fetchEmails = useFetchEmails();
  const classifyAll = useClassifyAllEmails();
  const syncAndClassify = useSyncAndClassify();
  const reprocessEmail = useReprocessEmail();
  const updateEmail = useUpdateEmail();

  const allEmails = emails || [];
  const filteredEmails = allEmails.filter(e => {
    if (!search) return true;
    const s = search.toLowerCase();
    return e.subject?.toLowerCase().includes(s) || e.sender?.toLowerCase().includes(s) || e.summary?.toLowerCase().includes(s);
  });

  const unprocessedCount = allEmails.filter(e => !e.processed).length;
  const reviewCount = allEmails.filter(e => e.needs_review).length;
  const isBusy = fetchEmails.isPending || classifyAll.isPending || syncAndClassify.isPending;

  const metrics = useMemo(() => ({
    total: allEmails.length,
    unprocessed: unprocessedCount,
    review: reviewCount,
    actionRequired: allEmails.filter(e => e.action_required).length,
  }), [allEmails, unprocessedCount, reviewCount]);

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
              Organized Inbox
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pipeline: IMAP → Database → AI Classification
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={sinceDate} onChange={e => setSinceDate(e.target.value)} className="w-40 bg-card border-border/50 rounded-xl" />
            <Button onClick={() => syncAndClassify.mutate(sinceDate || undefined)} disabled={isBusy} className="bg-agent-purple text-white hover:bg-agent-purple/90 rounded-xl gap-2">
              <RefreshCw className={`h-4 w-4 ${syncAndClassify.isPending ? "animate-spin" : ""}`} />
              {syncAndClassify.isPending ? "Syncing..." : "Sync Emails"}
            </Button>
            <Button onClick={() => fetchEmails.mutate(sinceDate || undefined)} disabled={isBusy} variant="outline" className="border-border/50 rounded-xl gap-2">
              <RefreshCw className={`h-4 w-4 ${fetchEmails.isPending ? "animate-spin" : ""}`} /> Fetch Only
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
            <div className={`text-3xl font-bold font-heading tracking-tight ${m.color}`}>{m.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Classification chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "All", count: allEmails.length },
          ...["invoice", "task", "waiting", "information", "irrelevant"].map(cls => ({
            key: cls, label: cls.charAt(0).toUpperCase() + cls.slice(1),
            count: allEmails.filter(e => e.classification === cls).length,
          })),
        ].map(chip => (
          <button key={chip.key} onClick={() => setFilterClassification(chip.key)}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
              filterClassification === chip.key
                ? "bg-agent-purple/10 text-agent-purple border border-agent-purple/20"
                : "bg-card border border-border/40 text-muted-foreground hover:border-border/60"
            }`}
          >
            {chip.key !== "all" && classificationIcons[chip.key] && <span className="inline-flex mr-1.5 align-middle">{classificationIcons[chip.key]}</span>}
            {chip.label} <span className="ml-1.5 font-semibold">{chip.count}</span>
          </button>
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
        <Select value={filterReview} onValueChange={setFilterReview}>
          <SelectTrigger className="w-40 bg-card border-border/40 rounded-xl"><AlertTriangle className="h-4 w-4 mr-2" /><SelectValue placeholder="Review" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="review">Needs Review ({reviewCount})</SelectItem>
            <SelectItem value="no_review">Reviewed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Email List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">Loading emails...</div>
          ) : filteredEmails.length === 0 ? (
            <div className="premium-card p-12 text-center">
              <Mail className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No emails found</p>
              <p className="text-xs text-muted-foreground mt-1">Use "Sync Emails" to fetch & classify</p>
            </div>
          ) : (
            filteredEmails.map(email => (
              <motion.button key={email.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelectedEmail(email)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                  selectedEmail?.id === email.id
                    ? "border-agent-purple/25 bg-agent-purple/4 shadow-sm"
                    : "border-border/30 bg-card hover:border-border/50 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{email.subject || "(no subject)"}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{email.sender}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {email.classification ? (
                      <Badge variant="outline" className={`text-[10px] ${classificationColors[email.classification] || ""}`}>{email.classification}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-border/50 text-muted-foreground">pending</Badge>
                    )}
                    {email.needs_review && <AlertTriangle className="h-3 w-3 text-warning" />}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {email.company && <span className="text-[10px] px-2 py-0.5 rounded-lg bg-secondary/80 text-secondary-foreground">{email.company}</span>}
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">{email.received_at ? new Date(email.received_at).toLocaleDateString() : ""}</span>
                </div>
              </motion.button>
            ))
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {selectedEmail ? (
              <motion.div key={selectedEmail.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="premium-card p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-foreground">{selectedEmail.subject || "(no subject)"}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{selectedEmail.sender}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{selectedEmail.received_at ? new Date(selectedEmail.received_at).toLocaleString() : ""}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => reprocessEmail.mutate(selectedEmail.id)} disabled={reprocessEmail.isPending} className="rounded-xl border-border/40 gap-1">
                    <RotateCcw className={`h-4 w-4 ${reprocessEmail.isPending ? "animate-spin" : ""}`} /> Reprocess
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedEmail.classification && (
                    <Badge variant="outline" className={`rounded-lg ${classificationColors[selectedEmail.classification] || ""}`}>
                      {classificationIcons[selectedEmail.classification]}<span className="ml-1 capitalize">{selectedEmail.classification}</span>
                    </Badge>
                  )}
                  {selectedEmail.company && (
                    <Badge variant="outline" className="rounded-lg border-agent-green/20 text-agent-green bg-agent-green/6">
                      <Building2 className="h-3 w-3 mr-1" />{selectedEmail.company}
                    </Badge>
                  )}
                  {selectedEmail.confidence != null && (
                    <Badge variant="outline" className="rounded-lg text-muted-foreground border-border/40">{Math.round((selectedEmail.confidence || 0) * 100)}% conf</Badge>
                  )}
                </div>
                {selectedEmail.needs_review && (
                  <div className="p-4 rounded-xl bg-warning/6 border border-warning/15">
                    <div className="flex items-center gap-2 text-warning text-sm font-medium"><AlertTriangle className="h-4 w-4" /> Needs Manual Review</div>
                    <p className="text-xs text-muted-foreground mt-1.5">{selectedEmail.review_reason || "Low confidence classification"}</p>
                    <div className="flex gap-2 mt-3">
                      <Select onValueChange={val => updateEmail.mutate({ id: selectedEmail.id, updates: { company: val, needs_review: false } })}>
                        <SelectTrigger className="w-48 h-8 text-xs bg-card rounded-lg"><SelectValue placeholder="Reassign company" /></SelectTrigger>
                        <SelectContent>
                          {companies?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                          <SelectItem value="Unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select onValueChange={val => updateEmail.mutate({ id: selectedEmail.id, updates: { classification: val, needs_review: false } })}>
                        <SelectTrigger className="w-36 h-8 text-xs bg-card rounded-lg"><SelectValue placeholder="Reclassify" /></SelectTrigger>
                        <SelectContent>
                          {["invoice", "task", "waiting", "information", "irrelevant"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {selectedEmail.summary && (
                  <div>
                    <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-2">AI Summary</h3>
                    <p className="text-sm text-foreground/80 leading-relaxed bg-secondary/40 p-4 rounded-xl">{selectedEmail.summary}</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="premium-card p-12 text-center">
                <Mail className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">Select an email to view details</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
