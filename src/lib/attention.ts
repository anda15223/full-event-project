export type Bucket = "overdue" | "today" | "this-week" | "later";

export interface AttentionSummary {
  festival_id: string;
  festival_name: string;
  festival_slug: string;
  festival_start_date: string;
  count_overdue: number;
  count_today: number;
  count_this_week: number;
  count_later: number;
  count_critical: number;
  total_attention_items: number;
  worst_bucket: Bucket | "clear";
}

export interface AttentionItem {
  festival_id: string;
  festival_name: string;
  festival_slug: string;
  festival_start_date: string;
  source_table: string;
  source_id: string;
  source_card_label: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  due_at: string | null;
  status: string | null;
  priority: string | null;
  owner_name: string | null;
  concept_id: string | null;
  concept_name: string | null;
  urgency_bucket: Bucket;
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  "this-week": "This week",
  later: "Later",
};

export const BUCKET_EMOJI: Record<Bucket, string> = {
  overdue: "🚨",
  today: "🔴",
  "this-week": "🟡",
  later: "🟢",
};

export const BUCKET_ORDER: Bucket[] = ["overdue", "today", "this-week", "later"];

export function bucketBadgeClasses(bucket: Bucket, count: number): string {
  if (bucket === "later") return "bg-muted text-muted-foreground border-border";
  if (count === 0) return "bg-muted text-muted-foreground border-border";
  switch (bucket) {
    case "overdue":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "today":
      return "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300";
    case "this-week":
      return "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-300";
  }
}

export function priorityChipClasses(priority: string | null): string {
  switch (priority) {
    case "critical":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "high":
      return "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function bucketSectionClasses(bucket: Bucket): string {
  switch (bucket) {
    case "overdue":
      return "border-destructive/40 bg-destructive/5";
    case "today":
      return "border-orange-500/40 bg-orange-500/5";
    case "this-week":
      return "border-yellow-500/40 bg-yellow-500/5";
    case "later":
      return "border-border bg-muted/40";
  }
}

export function formatDueDate(dueDate: string | null): { text: string; overdue: boolean } {
  if (!dueDate) return { text: "—", overdue: false };
  const d = new Date(dueDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const dateStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (diff < 0) return { text: `${dateStr} · ${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`, overdue: true };
  if (diff === 0) return { text: `${dateStr} · Today`, overdue: false };
  if (diff === 1) return { text: `${dateStr} · Tomorrow`, overdue: false };
  if (diff <= 7) return { text: `${dateStr} · in ${diff} days`, overdue: false };
  return { text: dateStr, overdue: false };
}

export function bucketRank(b: Bucket): number {
  return BUCKET_ORDER.indexOf(b) + 1;
}

export function priorityRank(p: string | null): number {
  return p === "critical" ? 1 : p === "high" ? 2 : p === "normal" ? 3 : 4;
}

export function sortItems(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => {
    const br = bucketRank(a.urgency_bucket) - bucketRank(b.urgency_bucket);
    if (br) return br;
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr) return pr;
    return (a.due_date ?? "").localeCompare(b.due_date ?? "");
  });
}
