import { motion } from "framer-motion";
import { Building2, Eye, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type Email } from "@/hooks/useEmailAgent";
import { deriveAction, derivePriority, PRIORITY_CONFIG } from "./inboxSections";

interface EmailCardProps {
  email: Email;
  index: number;
  isSelected: boolean;
  sectionKey: string;
  onSelect: (e: Email) => void;
}

export function EmailCard({ email, index, isSelected, sectionKey, onSelect }: EmailCardProps) {
  const action = deriveAction(email);
  const priority = derivePriority(email);
  const pConfig = PRIORITY_CONFIG[priority];
  const isUrgent = priority === "urgent" || sectionKey === "overdue";

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      onClick={() => onSelect(email)}
      className={`w-full text-left premium-card p-4 transition-all ${
        isSelected
          ? "ring-2 ring-agent-purple/30 shadow-md"
          : "hover:shadow-md"
      }`}
    >
      {/* Top row: priority dot + sender + action */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${pConfig.dot}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">
              {email.sender?.replace(/<.*>/, "").trim() || "Unknown"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${
            isUrgent ? "bg-destructive/10 text-destructive" : `${pConfig.bg} ${pConfig.text}`
          }`}>
            {action}
          </span>
          <Eye className="h-3.5 w-3.5 text-muted-foreground/30" />
        </div>
      </div>

      {/* Subject */}
      <p className="text-xs text-foreground/80 truncate mb-2.5 pl-5">
        {email.subject || "(no subject)"}
        {email.needs_review && <AlertTriangle className="h-3 w-3 text-warning inline ml-1.5" />}
      </p>

      {/* Bottom: company + priority badge + date */}
      <div className="flex items-center gap-2 pl-5 flex-wrap">
        {email.company && (
          <Badge variant="outline" className="text-[10px] h-5 rounded-lg border-border/40 gap-1 px-2">
            <Building2 className="h-3 w-3" /> {email.company}
          </Badge>
        )}
        <Badge variant="outline" className={`text-[10px] h-5 rounded-lg border-0 ${pConfig.bg} ${pConfig.text} px-2`}>
          {pConfig.label}
        </Badge>
        {email.received_at && (
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {new Date(email.received_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </motion.button>
  );
}

/* ── List-style row (for FYI) ── */
export function EmailListItem({ email }: { email: Email }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
      <span className="text-xs text-foreground/70">
        <span className="font-medium">{email.sender?.replace(/<.*>/, "").trim()}</span>
        {" — "}
        {email.subject || "(no subject)"}
        {email.company && <span className="text-muted-foreground"> ({email.company})</span>}
      </span>
    </div>
  );
}

/* ── Compact summary (for ignore) ── */
export function EmailCompactSummary({ emails }: { emails: Email[] }) {
  const senders = emails.map(e => e.sender?.replace(/<.*>/, "").trim()).filter(Boolean);
  const unique = [...new Set(senders)];

  return (
    <p className="text-xs text-muted-foreground/70 leading-relaxed px-5 pb-4">
      {unique.length > 0
        ? `Newsletters, promotions, and irrelevant: ${unique.join(", ")}`
        : `${emails.length} irrelevant emails filtered out.`}
    </p>
  );
}
