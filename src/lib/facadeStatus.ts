export type FacadeStatusInfo = {
  status: "green" | "amber" | "red" | "neutral";
  label: string;
  emoji: string;
};

export function computeFacadeStatus(facade: {
  design_status: string | null;
}): FacadeStatusInfo {
  const s = (facade.design_status ?? "").toLowerCase();
  if (s === "printed" || s === "installed" || s === "festival_approved")
    return { status: "green", label: "Printed", emoji: "🖨" };
  if (s === "in_design" || s === "in_review")
    return { status: "amber", label: "In design", emoji: "✏️" };
  if (s === "damaged_replace_needed")
    return { status: "red", label: "Damaged", emoji: "🚨" };
  if (s === "reused_from_2025")
    return { status: "green", label: "Reused", emoji: "♻️" };
  return { status: "neutral", label: "Not started", emoji: "⚪" };
}

export const FACADE_STATUS_PILL: Record<FacadeStatusInfo["status"], string> = {
  green: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  red: "bg-destructive/10 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
};
