export const FACADE_STATUSES = [
  "not_started",
  "in_design",
  "in_review",
  "festival_approved",
  "reused_from_2025",
  "printed",
  "installed",
  "damaged_replace_needed",
] as const;
export type FacadeStatus = (typeof FACADE_STATUSES)[number];

export const FACADE_STATUS_META: Record<FacadeStatus, { label: string; emoji: string; classes: string }> = {
  not_started:           { label: "Not started",      emoji: "⚪", classes: "bg-muted text-muted-foreground border-border" },
  in_design:             { label: "In design",        emoji: "✏️", classes: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300" },
  in_review:             { label: "In review",        emoji: "👀", classes: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-300" },
  festival_approved:     { label: "Approved",         emoji: "✅", classes: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300" },
  reused_from_2025:      { label: "Reused 2025",      emoji: "♻️", classes: "bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300" },
  printed:               { label: "Printed",          emoji: "🖨", classes: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300" },
  installed:             { label: "Installed",        emoji: "✅", classes: "bg-emerald-600/15 text-emerald-800 border-emerald-600/40 dark:text-emerald-200" },
  damaged_replace_needed:{ label: "Damaged",          emoji: "🚨", classes: "bg-destructive/10 text-destructive border-destructive/30" },
};

export const MATERIAL_TYPES = ["fabric", "forex", "dibond", "vinyl_wrap", "banner_mesh", "other"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const MATERIAL_ORDER_STATUSES = ["not_ordered", "ordered", "in_production", "delivered", "installed"] as const;
export type MaterialOrderStatus = (typeof MATERIAL_ORDER_STATUSES)[number];

export interface FacadeRow {
  id: string;
  festival_contract_id: string;
  design_status: FacadeStatus;
  design_concept_note: string | null;
  design_file_path: string | null;
  design_preview_path: string | null;
  material_type: MaterialType | null;
  material_orders_status: MaterialOrderStatus | null;
  material_supplier: string | null;
  material_deadline: string | null;
  print_deadline: string | null;
  dimensions_text: string | null;
  dimensions_w_cm: number | null;
  dimensions_h_cm: number | null;
  panel_count: number;
  cost_dkk: number | null;
  festival_approval_required: boolean;
  festival_approval_received_at: string | null;
  festival_approval_contact_id: string | null;
  reused_from: string | null;
  reuse_modifications: string | null;
  installation_notes: string | null;
  notes: string | null;
  status_history: any[];
  updated_at: string;
}

export function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function deadlineColor(d: string | null): string {
  if (!d) return "text-muted-foreground";
  const today = new Date(); today.setHours(0,0,0,0);
  const t = new Date(d + "T00:00:00").getTime();
  const days = Math.round((t - today.getTime()) / 86400000);
  if (days < 0) return "text-destructive font-medium";
  if (days <= 7) return "text-orange-600 dark:text-orange-400 font-medium";
  if (days <= 14) return "text-yellow-700 dark:text-yellow-400";
  return "text-foreground";
}

export function pushHistory(history: any[], from: FacadeStatus, to: FacadeStatus, extra: Record<string, any> = {}) {
  return [...(history ?? []), { from, to, at: new Date().toISOString(), ...extra }];
}
