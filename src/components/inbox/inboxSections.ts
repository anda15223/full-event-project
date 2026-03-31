import {
  DollarSign, BellRing, FileCheck, Wrench, CalendarClock,
  AlertTriangle, CheckCircle, Trash2, Globe,
} from "lucide-react";
import { createElement } from "react";
import type { Email } from "@/hooks/useEmailAgent";

export interface EmailSection {
  key: string;
  label: string;
  emoji: string;
  description: string;
  color: string;
  borderColor: string;
  iconColor: string;
  icon: React.ReactNode;
  filter: (e: Email) => boolean;
  defaultCollapsed?: boolean;
  renderStyle: "card" | "list" | "compact";
}

const kw = (text: string | null | undefined, terms: string[]) =>
  terms.some(t => text?.toLowerCase().includes(t));

export const SECTIONS: EmailSection[] = [
  {
    key: "overdue",
    label: "OVERDUE / REMINDERS",
    emoji: "🔴",
    description: "Immediate attention — overdue payments and urgent reminders",
    color: "bg-destructive/4",
    borderColor: "border-destructive/25",
    iconColor: "text-destructive",
    icon: createElement(BellRing, { className: "h-4 w-4" }),
    filter: (e) =>
      e.action_required === true &&
      e.classification !== "invoice" &&
      kw(e.summary, ["overdue", "reminder", "rykker", "unpaid", "restance"]) ||
      kw(e.subject, ["rykker", "reminder", "overdue", "unpaid", "restance"]),
    renderStyle: "card",
  },
  {
    key: "invoices",
    label: "INVOICES — To Process",
    emoji: "💰",
    description: "Invoice emails requiring processing and payment",
    color: "bg-agent-green/4",
    borderColor: "border-agent-green/20",
    iconColor: "text-agent-green",
    icon: createElement(DollarSign, { className: "h-4 w-4" }),
    filter: (e) => e.classification === "invoice" && e.action_required !== false,
    renderStyle: "card",
  },
  {
    key: "settlement",
    label: "SETTLEMENT DOCS",
    emoji: "📋",
    description: "Settlement documentation to review and file",
    color: "bg-agent-blue/4",
    borderColor: "border-agent-blue/20",
    iconColor: "text-agent-blue",
    icon: createElement(FileCheck, { className: "h-4 w-4" }),
    filter: (e) =>
      e.classification === "information" &&
      kw(e.summary, ["settlement", "afregning"]) ||
      kw(e.subject, ["settlement", "afregning"]),
    renderStyle: "card",
  },
  {
    key: "accounting",
    label: "ACCOUNTING / SYSTEM",
    emoji: "🔧",
    description: "System renewals, integrations, and accounting actions",
    color: "bg-agent-purple/4",
    borderColor: "border-agent-purple/20",
    iconColor: "text-agent-purple",
    icon: createElement(Wrench, { className: "h-4 w-4" }),
    filter: (e) =>
      e.classification === "task" &&
      kw(e.summary, ["renew", "system", "integration", "e-conomic", "bank"]) ||
      kw(e.subject, ["renew", "e-conomic", "integration"]),
    renderStyle: "card",
  },
  {
    key: "operational",
    label: "OPERATIONAL / EVENTS",
    emoji: "📌",
    description: "Events, operations, and items requiring reply or action",
    color: "bg-agent-orange/4",
    borderColor: "border-agent-orange/20",
    iconColor: "text-agent-orange",
    icon: createElement(CalendarClock, { className: "h-4 w-4" }),
    filter: (e) =>
      (e.classification === "task" || (e.classification === "waiting" && e.action_required)) &&
      !kw(e.summary, ["renew", "system", "integration", "e-conomic", "bank"]) &&
      !kw(e.subject, ["renew", "e-conomic", "integration"]),
    renderStyle: "card",
  },
  {
    key: "romania",
    label: "ROMANIA",
    emoji: "🌍",
    description: "All Romania-related operations grouped here",
    color: "bg-agent-blue/4",
    borderColor: "border-agent-blue/20",
    iconColor: "text-agent-blue",
    icon: createElement(Globe, { className: "h-4 w-4" }),
    filter: (e) =>
      e.company?.toLowerCase() === "romania" ||
      kw(e.summary, ["romania", "romanian", "bucurești", "bucharest"]) ||
      kw(e.subject, ["romania", "romanian"]),
    renderStyle: "card",
  },
  {
    key: "needs_review",
    label: "NEEDS REVIEW",
    emoji: "🔍",
    description: "Low-confidence AI classifications requiring manual check",
    color: "bg-warning/4",
    borderColor: "border-warning/25",
    iconColor: "text-warning",
    icon: createElement(AlertTriangle, { className: "h-4 w-4" }),
    filter: (e) => e.needs_review === true,
    renderStyle: "card",
  },
  {
    key: "fyi",
    label: "FYI — No Action Needed",
    emoji: "✅",
    description: "Confirmations, delivery notes, and informational emails",
    color: "bg-success/4",
    borderColor: "border-success/20",
    iconColor: "text-success",
    icon: createElement(CheckCircle, { className: "h-4 w-4" }),
    filter: (e) =>
      (e.classification === "information" || e.classification === "waiting") &&
      !e.action_required &&
      !e.needs_review &&
      !kw(e.summary, ["settlement", "afregning"]) &&
      !kw(e.subject, ["settlement", "afregning"]),
    defaultCollapsed: true,
    renderStyle: "list",
  },
  {
    key: "ignore",
    label: "IGNORE — Clutter",
    emoji: "🗑️",
    description: "Newsletters, promotions, and irrelevant emails",
    color: "bg-secondary/40",
    borderColor: "border-border/30",
    iconColor: "text-muted-foreground",
    icon: createElement(Trash2, { className: "h-4 w-4" }),
    filter: (e) => e.classification === "irrelevant" && !e.needs_review,
    defaultCollapsed: true,
    renderStyle: "compact",
  },
];

/* Derive a suggested action label + priority */
export type Priority = "urgent" | "important" | "normal" | "ignore";

export function derivePriority(email: Email): Priority {
  if (kw(email.summary, ["overdue", "unpaid", "rykker", "restance"]) ||
      kw(email.subject, ["overdue", "rykker", "unpaid"])) return "urgent";
  if (email.action_required) return "important";
  if (email.classification === "irrelevant") return "ignore";
  return "normal";
}

export const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string; bg: string; text: string }> = {
  urgent:    { label: "Urgent",    dot: "bg-destructive",       bg: "bg-destructive/10", text: "text-destructive" },
  important: { label: "Important", dot: "bg-agent-orange",      bg: "bg-agent-orange/10", text: "text-agent-orange" },
  normal:    { label: "Normal",    dot: "bg-agent-blue",        bg: "bg-agent-blue/10", text: "text-agent-blue" },
  ignore:    { label: "Ignore",    dot: "bg-muted-foreground",  bg: "bg-secondary/50", text: "text-muted-foreground" },
};

export function deriveAction(email: Email): string {
  if (email.classification === "invoice") return "Process & pay";
  if (email.action_required) {
    if (kw(email.summary, ["reply"])) return "Reply";
    if (kw(email.summary, ["pay"])) return "PAY NOW";
    if (kw(email.summary, ["renew"])) return "Renew";
    if (kw(email.summary, ["review"])) return "Review";
    if (kw(email.summary, ["check"])) return "Check";
    if (kw(email.summary, ["fill"])) return "Fill in";
    if (kw(email.summary, ["confirm"])) return "Confirm";
    return "Action needed";
  }
  if (email.classification === "information") return "Review & file";
  if (email.classification === "waiting") return "Awaiting response";
  return "—";
}

/* Assign emails: needs_review first, then romania (cross-cutting), then by section order */
export function assignToSections(emails: Email[]): Map<string, Email[]> {
  const map = new Map<string, Email[]>();
  SECTIONS.forEach(s => map.set(s.key, []));

  const assigned = new Set<string>();

  // needs_review first
  for (const email of emails) {
    if (email.needs_review) {
      map.get("needs_review")!.push(email);
      assigned.add(email.id);
    }
  }

  // romania cross-cutting (can pull from any classification)
  const romaniaSection = SECTIONS.find(s => s.key === "romania")!;
  for (const email of emails) {
    if (assigned.has(email.id)) continue;
    if (romaniaSection.filter(email)) {
      map.get("romania")!.push(email);
      assigned.add(email.id);
    }
  }

  // then by section priority
  for (const section of SECTIONS) {
    if (section.key === "needs_review" || section.key === "romania") continue;
    for (const email of emails) {
      if (assigned.has(email.id)) continue;
      if (section.filter(email)) {
        map.get(section.key)!.push(email);
        assigned.add(email.id);
      }
    }
  }

  // unassigned processed → fyi
  for (const email of emails) {
    if (!assigned.has(email.id) && email.processed) {
      map.get("fyi")!.push(email);
    }
  }

  return map;
}
