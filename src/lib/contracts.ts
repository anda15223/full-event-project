// Contract status / payment helpers shared by per-festival + master pages

export type ContractStatus =
  | "not_started" | "in_negotiation" | "pending_signature"
  | "signed" | "stalled" | "cancelled";

export type PaymentStatus =
  | "not_invoiced" | "invoiced" | "partial" | "paid" | "disputed";

export const STATUS_META: Record<ContractStatus, { label: string; chipClass: string; emoji: string }> = {
  not_started:       { label: "Not started",       chipClass: "bg-muted text-muted-foreground border-border",                emoji: "🆕" },
  in_negotiation:    { label: "In negotiation",    chipClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",   emoji: "🔄" },
  pending_signature: { label: "Pending signature", chipClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30", emoji: "⏳" },
  signed:            { label: "Signed",            chipClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", emoji: "✅" },
  stalled:           { label: "Stalled",           chipClass: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",         emoji: "🚨" },
  cancelled:         { label: "Cancelled",         chipClass: "bg-muted text-muted-foreground line-through border-border",      emoji: "✖" },
};

export const PAYMENT_META: Record<PaymentStatus, { label: string; chipClass: string }> = {
  not_invoiced: { label: "Not invoiced", chipClass: "bg-muted text-muted-foreground border-border" },
  invoiced:     { label: "Invoiced",     chipClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  partial:      { label: "Partially paid", chipClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  paid:         { label: "Paid",         chipClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  disputed:     { label: "Disputed",     chipClass: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30" },
};

export const SIGNING_PLATFORMS = [
  "ADDO Sign", "DocuSign", "email_PDF", "physical_paper", "other",
] as const;

export const STATUS_ORDER: ContractStatus[] = [
  "stalled", "pending_signature", "in_negotiation", "not_started", "signed", "cancelled",
];

export function formatDKK(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return "—";
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Number(n)) + " kr";
}

export function daysBetween(a: string | Date | null, b: string | Date | null): number | null {
  if (!a || !b) return null;
  const da = typeof a === "string" ? new Date(a + (a.length === 10 ? "T00:00:00" : "")) : a;
  const db = typeof b === "string" ? new Date(b + (b.length === 10 ? "T00:00:00" : "")) : b;
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function pushStatusEntry(history: any[] | null | undefined, entry: { from?: string; to: string; reason?: string; by?: string }) {
  const list = Array.isArray(history) ? [...history] : [];
  list.push({ ...entry, at: new Date().toISOString() });
  return list;
}
