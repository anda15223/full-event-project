import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Building2, Tag, Check, X, ChevronRight,
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-primary" />
          Manual Review Queue
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Emails that need manual verification — low confidence, unknown company, or ambiguous classification
        </p>
      </div>

      <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
        <p className="text-sm text-foreground">
          <span className="font-bold text-primary">{(emails || []).length}</span> email{(emails || []).length !== 1 ? "s" : ""} pending review
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (emails || []).length === 0 ? (
        <div className="text-center py-12">
          <Check className="h-12 w-12 text-chart-5 mx-auto mb-3" />
          <p className="text-foreground font-medium">All clear!</p>
          <p className="text-sm text-muted-foreground">No emails need review</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(emails || []).map((email) => (
            <motion.div
              key={email.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="p-4 rounded-lg border border-border bg-card"
            >
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{email.subject || "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground">{email.sender}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {email.received_at ? new Date(email.received_at).toLocaleString() : ""}
                  </p>

                  {/* Review reason */}
                  <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/20">
                    <p className="text-xs text-destructive">
                      {email.review_reason || "Requires manual review"}
                    </p>
                  </div>

                  {/* AI guess */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {email.classification && (
                      <Badge variant="outline" className="text-xs">
                        AI: {email.classification}
                      </Badge>
                    )}
                    {email.company && (
                      <Badge variant="outline" className="text-xs">
                        AI: {email.company}
                      </Badge>
                    )}
                    {email.confidence !== null && (
                      <Badge variant="outline" className="text-xs">
                        {Math.round((email.confidence || 0) * 100)}% confidence
                      </Badge>
                    )}
                  </div>

                  {email.summary && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{email.summary}</p>
                  )}

                  {/* Override controls */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Select
                      onValueChange={(val) =>
                        updateEmail.mutate({
                          id: email.id,
                          updates: { company: val, needs_review: false },
                        })
                      }
                    >
                      <SelectTrigger className="w-48 h-8 text-xs bg-secondary border-0">
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
                        updateEmail.mutate({
                          id: email.id,
                          updates: { classification: val, needs_review: false },
                        })
                      }
                    >
                      <SelectTrigger className="w-36 h-8 text-xs bg-secondary border-0">
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
                      className="h-8 text-xs border-chart-5 text-chart-5 hover:bg-chart-5/10"
                      onClick={() =>
                        updateEmail.mutate({
                          id: email.id,
                          updates: { needs_review: false },
                        })
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
