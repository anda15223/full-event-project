import { motion } from "framer-motion";
import {
  AlertTriangle, Building2, Tag, Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmails, useCompanies, useUpdateEmail } from "@/hooks/useEmailAgent";

export default function AgentReviewQueue() {
  const { data: companies } = useCompanies();
  const { data: emails, isLoading } = useEmails({ needs_review: true });
  const updateEmail = useUpdateEmail();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="page-header">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="section-label text-warning">Human Review</span>
        </div>
        <h1 className="page-title">Review Queue</h1>
        <p className="page-subtitle">Emails that need manual verification — low confidence, unknown company, or ambiguous classification</p>
      </div>

      <div className="premium-card p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${(emails || []).length > 0 ? "bg-warning/8" : "bg-success/8"}`}>
          {(emails || []).length > 0 ? (
            <AlertTriangle className="h-4.5 w-4.5 text-warning" />
          ) : (
            <Check className="h-4.5 w-4.5 text-success" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            <span className={`font-bold ${(emails || []).length > 0 ? "text-warning" : "text-success"}`}>{(emails || []).length}</span> email{(emails || []).length !== 1 ? "s" : ""} pending review
          </p>
          <p className="text-xs text-muted-foreground">
            {(emails || []).length > 0 ? "Review and approve AI suggestions below" : "All items have been reviewed"}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading...</div>
      ) : (emails || []).length === 0 ? (
        <div className="text-center py-16">
          <Check className="h-12 w-12 text-success/30 mx-auto mb-3" />
          <p className="text-foreground font-heading font-semibold">All clear!</p>
          <p className="text-sm text-muted-foreground mt-1">No emails need review</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(emails || []).map((email) => (
            <motion.div
              key={email.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="premium-card p-5"
            >
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-warning/8 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{email.subject || "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{email.sender}</p>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">
                    {email.received_at ? new Date(email.received_at).toLocaleString() : ""}
                  </p>

                  {/* Review reason */}
                  <div className="mt-3 p-3 rounded-xl bg-destructive/4 border border-destructive/10">
                    <p className="text-xs text-destructive">{email.review_reason || "Requires manual review"}</p>
                  </div>

                  {/* AI guess */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {email.classification && (
                      <Badge variant="outline" className="text-xs rounded-lg border-border/40">AI: {email.classification}</Badge>
                    )}
                    {email.company && (
                      <Badge variant="outline" className="text-xs rounded-lg border-border/40">AI: {email.company}</Badge>
                    )}
                    {email.confidence !== null && (
                      <Badge variant="outline" className="text-xs rounded-lg border-border/40">
                        {Math.round((email.confidence || 0) * 100)}% confidence
                      </Badge>
                    )}
                  </div>

                  {email.summary && (
                    <p className="text-xs text-muted-foreground mt-3 italic bg-secondary/40 p-3 rounded-xl">{email.summary}</p>
                  )}

                  {/* Override controls */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Select
                      onValueChange={(val) =>
                        updateEmail.mutate({ id: email.id, updates: { company: val, needs_review: false } })
                      }
                    >
                      <SelectTrigger className="w-48 h-9 text-xs bg-secondary/50 border-0 rounded-xl">
                        <Building2 className="h-3 w-3 mr-1" />
                        <SelectValue placeholder="Assign company" />
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
                        updateEmail.mutate({ id: email.id, updates: { classification: val, needs_review: false } })
                      }
                    >
                      <SelectTrigger className="w-36 h-9 text-xs bg-secondary/50 border-0 rounded-xl">
                        <Tag className="h-3 w-3 mr-1" />
                        <SelectValue placeholder="Reclassify" />
                      </SelectTrigger>
                      <SelectContent>
                        {["invoice", "task", "waiting", "information", "irrelevant"].map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs border-success/20 text-success hover:bg-success/6 rounded-xl"
                      onClick={() =>
                        updateEmail.mutate({ id: email.id, updates: { needs_review: false } })
                      }
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Approve as-is
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
