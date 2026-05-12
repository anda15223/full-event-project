export type CoolingStatusInfo = {
  status: "green" | "amber" | "red" | "neutral";
  label: string;
};

export function computeCoolingUnitStatus(unit: {
  status: string | null;
}): CoolingStatusInfo {
  const s = (unit.status ?? "").toLowerCase();
  if (s === "confirmed" || s === "delivered") return { status: "green", label: s === "delivered" ? "Delivered" : "Confirmed" };
  if (s === "ordered") return { status: "amber", label: "Ordered" };
  if (s === "pending") return { status: "amber", label: "Pending" };
  if (s === "returned") return { status: "neutral", label: "Returned" };
  if (s === "not_ordered") return { status: "red", label: "Not ordered" };
  return { status: "neutral", label: "—" };
}

export const COOLING_STATUS_PILL: Record<CoolingStatusInfo["status"], string> = {
  green: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  red: "bg-destructive/10 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

export type FestivalCoolingRollup = {
  level: "green" | "amber" | "red" | "neutral";
  label: string;
  detail: string;
};

export function computeFestivalCoolingRollup(args: {
  unitCount: number;
  startDate: string | null;
  confirmedCount: number;
}): FestivalCoolingRollup {
  const { unitCount, startDate, confirmedCount } = args;
  if (unitCount === 0) {
    if (!startDate) return { level: "amber", label: "Order needed", detail: "No cooling units ordered yet." };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(startDate + "T00:00:00");
    const days = Math.ceil((start.getTime() - today.getTime()) / 86400000);
    if (days <= 30) {
      const deadline = new Date(start.getTime() - 21 * 86400000);
      return {
        level: "red",
        label: "No cooling units ordered",
        detail: `Festival is in ${days} day${days === 1 ? "" : "s"}. Order by ${deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`,
      };
    }
    return { level: "amber", label: "Order needed", detail: `Festival is in ${days} days. Plan cooling order.` };
  }
  if (confirmedCount === unitCount) return { level: "green", label: "All confirmed", detail: `${unitCount} unit${unitCount === 1 ? "" : "s"}.` };
  return { level: "amber", label: "In progress", detail: `${confirmedCount}/${unitCount} confirmed.` };
}
