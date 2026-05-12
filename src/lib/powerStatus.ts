export type PowerStatusInfo = {
  status: "green" | "amber" | "red" | "neutral";
  label: string;
};

export function computePowerStatus(power: {
  status: string | null;
  allocated_kw: number | null;
  demand_kw: number;
}): PowerStatusInfo {
  const allocated = Number(power.allocated_kw ?? 0);
  if (allocated > 0 && power.demand_kw > allocated) {
    const short = power.demand_kw - allocated;
    return { status: "red", label: `Short ${short.toFixed(1)} kW` };
  }
  const s = (power.status ?? "").toLowerCase();
  if (s === "confirmed" || s === "installed" || s === "tested") return { status: "green", label: "Confirmed" };
  if (s === "ordered" || s === "submitted") return { status: "amber", label: "Ordered" };
  if (s === "drawing") return { status: "neutral", label: "Drawing" };
  return { status: "neutral", label: "—" };
}

export const POWER_STATUS_PILL: Record<PowerStatusInfo["status"], string> = {
  green: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  red: "bg-destructive/10 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

export type PowerEquipmentLite = {
  power_kw: number | null;
  quantity: number | null;
  is_powered: boolean | null;
};

export function computeDemandKw(equipment: PowerEquipmentLite[]): number {
  return equipment
    .filter((e) => e.is_powered !== false)
    .reduce((sum, e) => sum + Number(e.power_kw ?? 0) * Number(e.quantity ?? 1), 0);
}
