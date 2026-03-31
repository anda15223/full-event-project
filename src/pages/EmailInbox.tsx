import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Mail, FileText, CheckSquare, Search, ArrowLeft, Clock, Building2, User } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useEmails, useSyncAndClassify, useFetchEmailBody, type Email } from "@/hooks/useEmailAgent";
import { Loader2 } from "lucide-react";

const classificationConfig: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  invoice: { label: "Invoice", color: "bg-primary/10 text-primary border-primary/20", icon: FileText },
  task: { label: "Task", color: "bg-accent/10 text-accent border-accent/20", icon: CheckSquare },
  waiting: { label: "Waiting", color: "bg-chart-3/10 text-chart-3 border-chart-3/20", icon: Clock },
  information: { label: "Info", color: "bg-muted text-muted-foreground border-border", icon: Mail },
  irrelevant: { label: "Irrelevant", color: "bg-destructive/10 text-destructive border-destructive/20", icon: Mail },
};

export default function EmailInbox() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const { data: emails, isLoading } = useEmails();
  const syncAndClassify = useSyncAndClassify();

  const filteredEmails = useMemo(() => {
    let list = emails || [];
    if (filter !== "all") list = list.filter((e) => e.classification === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.subject?.toLowerCase().includes(q) ||
          e.sender?.toLowerCase().includes(q) ||
          e.summary?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [emails, filter, search]);

  // Detail view when an email is selected
  if (selectedEmail) {
    return <EmailDetail email={selectedEmail} onBack={() => setSelectedEmail(null)} />;
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Email Inbox</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every email is either an <strong className="text-primary">Invoice</strong> or a <strong className="text-accent">Task</strong>
          </p>
        </div>
        <Button
          onClick={() => syncAndClassify.mutate(undefined)}
          disabled={syncAndClassify.isPending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncAndClassify.isPending ? "animate-spin" : ""}`} />
          {syncAndClassify.isPending ? "Syncing..." : "Sync Emails"}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search emails..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[{ key: "all", label: "All" }, { key: "invoice", label: "Invoices" }, { key: "task", label: "Tasks" }].map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.key)}
              className={filter === f.key ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading emails...</div>
      ) : filteredEmails.length === 0 ? (
        <Card className="glass-panel">
          <CardContent className="py-16 text-center">
            <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="font-semibold mb-1">No emails found</h3>
            <p className="text-sm text-muted-foreground">Click "Sync Emails" to fetch from your mailbox.</p>
          </CardContent>
        </Card>
      ) : (
        <AnimatePresence>
          <div className="space-y-2">
            {filteredEmails.map((email, i) => {
              const config = classificationConfig[email.classification || ""];
              const IconComp = config?.icon || Mail;
              return (
                <motion.div
                  key={email.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <Card
                    onClick={() => setSelectedEmail(email)}
                    className={`glass-panel cursor-pointer hover:border-primary/30 transition-all border-l-2 ${
                      email.classification === "invoice" ? "border-l-primary" :
                      email.classification === "task" ? "border-l-accent" : "border-l-muted"
                    }`}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                          email.classification === "invoice" ? "bg-primary/10" : "bg-accent/10"
                        }`}>
                          <IconComp className={`w-4 h-4 ${email.classification === "invoice" ? "text-primary" : "text-accent"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium truncate text-foreground">
                              {email.sender || "Unknown"}
                            </span>
                            {config && (
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
                                {config.label}
                              </Badge>
                            )}
                            {!email.processed && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted text-muted-foreground">Pending</Badge>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground shrink-0">
                              {email.received_at ? format(new Date(email.received_at), "MMM d, HH:mm") : ""}
                            </span>
                          </div>
                          <p className="text-sm truncate font-medium text-foreground">{email.subject}</p>
                          {email.summary && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{email.summary}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
