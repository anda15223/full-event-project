export const GAS_STATUSES = ["not_required","scheduled","passed","failed","pending_reschedule"] as const;
export const FOOD_STATUSES = ["not_scheduled","scheduled","passed","passed_with_remarks","failed","not_required"] as const;
export const ELEC_STATUSES = ["not_required","pending","certified","failed"] as const;

export type GasStatus = typeof GAS_STATUSES[number];
export type FoodStatus = typeof FOOD_STATUSES[number];
export type ElecStatus = typeof ELEC_STATUSES[number];

export const STATUS_LABEL: Record<string,string> = {
  not_required:"Not required", scheduled:"Scheduled", passed:"Passed",
  failed:"Failed", pending_reschedule:"Pending reschedule",
  not_scheduled:"Not scheduled", passed_with_remarks:"Passed (with remarks)",
  pending:"Pending", certified:"Certified",
};

export function statusClasses(s: string): string {
  if (s==="passed"||s==="certified") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s==="failed") return "bg-red-50 text-red-700 border-red-200";
  if (s==="scheduled"||s==="pending"||s==="passed_with_remarks") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s==="not_required") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export type SafetyRow = any;

export function pushHistory(history: any[] | null | undefined, entry: { field: string; from: any; to: any; note?: string }) {
  const arr = Array.isArray(history) ? history.slice() : [];
  arr.push({ ...entry, at: new Date().toISOString() });
  return arr;
}

export type ReadinessLevel = "green" | "yellow" | "red";

export function computeReadiness(row: SafetyRow, festivalStartISO: string | null): ReadinessLevel {
  if (!row) return "yellow";
  const today = new Date();
  const start = festivalStartISO ? new Date(festivalStartISO) : null;
  const daysToStart = start ? Math.ceil((start.getTime() - today.getTime())/(1000*60*60*24)) : 999;

  // Required items list
  const checks: { req: boolean; status: string }[] = [
    { req: row.gas_safety_required, status: row.gas_safety_status },
    { req: true, status: row.food_authority_status },
    { req: row.electrical_certification_status !== "not_required", status: row.electrical_certification_status },
  ];

  let red = false, yellow = false;
  for (const c of checks) {
    if (!c.req) continue;
    if (c.status === "failed") red = true;
    else if (c.status === "not_scheduled" && daysToStart <= 14) red = true;
    else if (c.status === "scheduled" || c.status === "pending" || c.status === "passed_with_remarks") yellow = true;
    else if (c.status === "not_scheduled") yellow = true;
    else if (daysToStart <= 14 && c.status !== "passed" && c.status !== "certified" && c.status !== "not_required") yellow = true;
  }
  if (red) return "red";
  if (yellow) return "yellow";
  return "green";
}

export const READINESS_META: Record<ReadinessLevel, { label: string; classes: string; dot: string }> = {
  green: { label: "On track", classes: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  yellow: { label: "Attention", classes: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  red: { label: "Critical", classes: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
};
