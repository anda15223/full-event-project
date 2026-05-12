export type PricesStatusInfo = {
  status: "green" | "amber" | "red" | "neutral";
  label: string;
};

export function computePricesStatus(prices: {
  itemCount: number;
  source_pdf_path: string | null;
}): PricesStatusInfo {
  if (prices.itemCount === 0 && !prices.source_pdf_path) {
    return { status: "red", label: "No prices set" };
  }
  if (prices.itemCount === 0 && prices.source_pdf_path) {
    return { status: "amber", label: "Uploaded, not parsed" };
  }
  if (prices.itemCount < 3) {
    return { status: "amber", label: `${prices.itemCount} items` };
  }
  return { status: "green", label: `${prices.itemCount} items` };
}

export const PRICES_STATUS_PILL: Record<PricesStatusInfo["status"], string> = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  red:   "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  neutral: "bg-muted text-muted-foreground border",
};
