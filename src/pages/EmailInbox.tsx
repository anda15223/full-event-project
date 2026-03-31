import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Mail, FileText, CheckSquare, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { mockEmails } from "@/data/mockData";
import { format } from "date-fns";

const classificationConfig: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  invoice: { label: "Invoice", color: "bg-primary/10 text-primary border-primary/20", icon: FileText },
  task: { label: "Task", color: "bg-accent/10 text-accent border-accent/20", icon: CheckSquare },
};

export default function EmailInbox() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filteredEmails = useMemo(() => {
    let result = [...mockEmails];
    if (filter !== "all") result = result.filter(e => e.classification === filter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.fromName.toLowerCase().includes(q) ||
        e.aiSummary.toLowerCase().includes(q)
      );
    }
    return result;
  }, [filter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Email Inbox</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every email is either an <strong className="text-primary">Invoice</strong> or a <strong className="text-accent">Task</strong>
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <RefreshCw className="w-4 h-4 mr-2" /> Sync Emails
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[{ key: "all", label: "All" }, { key: "invoice", label: "Invoices" }, { key: "task", label: "Tasks" }].map(f => (
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

      {filteredEmails.length === 0 ? (
        <Card className="glass-panel">
          <CardContent className="py-16 text-center">
            <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="font-semibold mb-1">No emails found</h3>
            <p className="text-sm text-muted-foreground">No emails match your current filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredEmails.map((email) => {
            const config = classificationConfig[email.classification];
            const IconComp = config.icon;
            return (
              <Card
                key={email.id}
                className={`glass-panel cursor-pointer hover:border-primary/30 transition-all ${!email.isRead ? "border-l-2 border-l-primary" : ""}`}
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
                        <span className={`text-sm font-medium truncate ${!email.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                          {email.fromName}
                        </span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
                          {config.label}
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground shrink-0">
                          {format(new Date(email.receivedAt), "MMM d, HH:mm")}
                        </span>
                      </div>
                      <p className={`text-sm truncate ${!email.isRead ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {email.subject}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{email.aiSummary}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
