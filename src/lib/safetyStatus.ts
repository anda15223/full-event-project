export type SafetyStatusInfo = {
  status: "green" | "amber" | "red" | "neutral";
  label: string;
  classes: string;
  dot: string;
};

export type SafetyZoneFields = {
  fire_extinguisher_count: number | null;
  fire_extinguisher_checked: boolean | null;
  fire_blanket_count: number | null;
  fire_blanket_checked: boolean | null;
  first_aid_kit: boolean | null;
  first_aid_checked: boolean | null;
  permits_obtained: boolean | null;
  briefing_done: boolean | null;
};

export function computeZoneSafetyStatus(zone: SafetyZoneFields): SafetyStatusInfo {
  const items = [
    (zone.fire_extinguisher_count ?? 0) > 0 && !!zone.fire_extinguisher_checked,
    (zone.fire_blanket_count ?? 0) > 0 && !!zone.fire_blanket_checked,
    !!zone.first_aid_kit && !!zone.first_aid_checked,
    !!zone.permits_obtained,
    !!zone.briefing_done,
  ];
  const done = items.filter(Boolean).length;
  if (done === items.length) {
    return {
      status: "green",
      label: "All clear",
      classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      dot: "bg-emerald-500",
    };
  }
  if (done === 0) {
    return {
      status: "red",
      label: "Not started",
      classes: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
      dot: "bg-red-500",
    };
  }
  return {
    status: "amber",
    label: `${done}/${items.length} checked`,
    classes: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    dot: "bg-amber-500",
  };
}

export function computeFestivalCertStatus(row: any): SafetyStatusInfo {
  if (!row) return { status: "neutral", label: "No data", classes: "bg-muted text-muted-foreground border", dot: "bg-muted-foreground" };
  const checks: boolean[] = [];
  const greens = ["passed", "certified", "not_required", "passed_with_remarks"];
  if (row.gas_safety_required) checks.push(greens.includes(row.gas_safety_status));
  checks.push(greens.includes(row.food_authority_status));
  if (row.electrical_certification_status !== "not_required") {
    checks.push(greens.includes(row.electrical_certification_status));
  }
  const fails = [row.gas_safety_status, row.food_authority_status, row.electrical_certification_status].some((s) => s === "failed");
  if (fails) return { status: "red", label: "Failed item", classes: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30", dot: "bg-red-500" };
  const allOk = checks.length > 0 && checks.every(Boolean);
  if (allOk) return { status: "green", label: "All certified", classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", dot: "bg-emerald-500" };
  return { status: "amber", label: "In progress", classes: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30", dot: "bg-amber-500" };
}
