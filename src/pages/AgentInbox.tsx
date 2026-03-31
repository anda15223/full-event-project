import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Search, Filter, RefreshCw, Zap, ChevronDown, ChevronRight,
  AlertTriangle, Clock, FileText, CheckCircle, XCircle, Building2,
  Eye, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useEmails,
  useCompanies,
  useFetchEmails,
  useClassifyEmails,
  useClassifyAllEmails,
  useUpdateEmail,
  type Email,
} from "@/hooks/useEmailAgent";

const classificationIcons: Record<string, React.ReactNode> = {
  invoice: <FileText className="h-4 w-4" />,
  task: <CheckCircle className="h-4 w-4" />,
  waiting: <Clock className="h-4 w-4" />,
  information: <Eye className="h-4 w-4" />,
  irrelevant: <XCircle className="h-4 w-4" />,
};

const classificationColors: Record<string, string> = {
  invoice: "bg-chart-1/20 text-chart-1 border-chart-1/30",
  task: "bg-accent/20 text-accent border-accent/30",
  waiting: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  information: "bg-muted text-muted-foreground border-border",
  irrelevant: "bg-destructive/20 text-destructive border-destructive/30",
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
  const classifyEmails = useClassifyEmails();
  const classifyAll = useClassifyAllEmails();
  const updateEmail = useUpdateEmail();

  const filteredEmails = (emails || []).filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.subject?.toLowerCase().includes(s) ||
      e.sender?.toLowerCase().includes(s) ||
      e.summary?.toLowerCase().includes(s)
    );
  });

  const unprocessedCount = (emails || []).filter((e) => !e.processed).length;
  const reviewCount = (emails || []).filter((e) => e.needs_review).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Email Agent Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered email classification & task extraction
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={sinceDate}
            onChange={(e) => setSinceDate(e.target.value)}
            className="w-40 bg-card border-border"
          />
          <Button
            onClick={() => fetchEmails.mutate(sinceDate || undefined)}
            disabled={fetchEmails.isPending}
            variant="outline"
            className="border-border"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${fetchEmails.isPending ? "animate-spin" : ""}`} />
            Fetch
          </Button>
          <Button
            onClick={() => classifyEmails.mutate(undefined)}
            disabled={classifyEmails.isPending || unprocessedCount === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Zap className={`h-4 w-4 mr-2 ${classifyEmails.isPending ? "animate-pulse" : ""}`} />
            Classify ({unprocessedCount})
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {["invoice", "task", "waiting", "information", "irrelevant"].map((cls) => {
          const count = (emails || []).filter((e) => e.classification === cls).length;
          return (
            <button
              key={cls}
              onClick={() => setFilterClassification(filterClassification === cls ? "all" : cls)}
              className={`p-3 rounded-lg border transition-all ${
                filterClassification === cls
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                {classificationIcons[cls]}
                <span className="capitalize">{cls}</span>
              </div>
              <div className="text-xl font-bold mt-1 text-foreground">{count}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-48 bg-card border-border">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies?.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
            <SelectItem value="Unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterReview} onValueChange={setFilterReview}>
          <SelectTrigger className="w-40 bg-card border-border">
            <AlertTriangle className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Review" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="review">Needs Review ({reviewCount})</SelectItem>
            <SelectItem value="no_review">Reviewed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Email List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* List */}
        <div className="lg:col-span-2 space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading emails...</div>
          ) : filteredEmails.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No emails found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use "Fetch" to pull emails from your inbox
              </p>
            </div>
          ) : (
            filteredEmails.map((email) => (
              <motion.button
                key={email.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelectedEmail(email)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedEmail?.id === email.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {email.subject || "(no subject)"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {email.sender}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {email.classification && (
                      <Badge variant="outline" className={`text-[10px] ${classificationColors[email.classification] || ""}`}>
                        {email.classification}
                      </Badge>
                    )}
                    {email.needs_review && (
                      <AlertTriangle className="h-3 w-3 text-primary" />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {email.company && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                      {email.company}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {email.received_at ? new Date(email.received_at).toLocaleDateString() : ""}
                  </span>
                </div>
              </motion.button>
            ))
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {selectedEmail ? (
              <motion.div
                key={selectedEmail.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="border border-border rounded-lg bg-card p-5 space-y-4"
              >
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {selectedEmail.subject || "(no subject)"}
                  </h2>
                  <p className="text-sm text-muted-foreground">{selectedEmail.sender}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedEmail.received_at
                      ? new Date(selectedEmail.received_at).toLocaleString()
                      : ""}
                  </p>
                </div>

                {/* Classification & Company */}
                <div className="flex flex-wrap gap-2">
                  {selectedEmail.classification && (
                    <Badge variant="outline" className={classificationColors[selectedEmail.classification] || ""}>
                      {classificationIcons[selectedEmail.classification]}
                      <span className="ml-1 capitalize">{selectedEmail.classification}</span>
                    </Badge>
                  )}
                  {selectedEmail.company && (
                    <Badge variant="outline" className="border-accent/30 text-accent">
                      <Building2 className="h-3 w-3 mr-1" />
                      {selectedEmail.company}
                    </Badge>
                  )}
                  {selectedEmail.confidence !== null && (
                    <Badge variant="outline" className="text-muted-foreground border-border">
                      {Math.round((selectedEmail.confidence || 0) * 100)}% conf
                    </Badge>
                  )}
                </div>

                {/* Review Warning */}
                {selectedEmail.needs_review && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="flex items-center gap-2 text-primary text-sm font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      Needs Manual Review
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedEmail.review_reason || "Low confidence classification"}
                    </p>
                    {/* Manual override controls */}
                    <div className="flex gap-2 mt-3">
                      <Select
                        onValueChange={(val) =>
                          updateEmail.mutate({
                            id: selectedEmail.id,
                            updates: { company: val, needs_review: false },
                          })
                        }
                      >
                        <SelectTrigger className="w-48 h-8 text-xs bg-card">
                          <SelectValue placeholder="Reassign company" />
                        </SelectTrigger>
                        <SelectContent>
                          {companies?.map((c) => (
                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                          ))}
                          <SelectItem value="Unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        onValueChange={(val) =>
                          updateEmail.mutate({
                            id: selectedEmail.id,
                            updates: { classification: val, needs_review: false },
                          })
                        }
                      >
                        <SelectTrigger className="w-36 h-8 text-xs bg-card">
                          <SelectValue placeholder="Reclassify" />
                        </SelectTrigger>
                        <SelectContent>
                          {["invoice", "task", "waiting", "information", "irrelevant"].map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Summary */}
                {selectedEmail.summary && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      AI Summary
                    </h3>
                    <p className="text-sm text-foreground">{selectedEmail.summary}</p>
                  </div>
                )}

                {/* Body */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Email Body
                  </h3>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-[300px] overflow-y-auto bg-secondary/50 rounded-lg p-3">
                    {selectedEmail.body_text || "(empty)"}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="border border-border rounded-lg bg-card p-12 text-center">
                <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Select an email to view details</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
