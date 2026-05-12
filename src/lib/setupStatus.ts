export type SetupStatusInfo = {
  status: "green" | "amber" | "red" | "neutral";
  label: string;
};

export const SETUP_STATUS_PILL: Record<SetupStatusInfo["status"], string> = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  red: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  neutral: "bg-muted text-muted-foreground border",
};

export function computeSetupStatus(args: {
  phaseCount: number;
  daysUntilSetup: number | null;
}): SetupStatusInfo {
  if (args.phaseCount === 0) return { status: "red", label: "No setup plan" };
  if (args.daysUntilSetup !== null && args.daysUntilSetup < 7 && args.phaseCount < 5) {
    return { status: "amber", label: `${args.phaseCount} phases — review needed` };
  }
  return { status: "green", label: `${args.phaseCount} phases planned` };
}

export function computePhaseStatus(phase: {
  status: string | null;
  scheduled_start_at: string | null;
}): SetupStatusInfo {
  const s = (phase.status ?? "planned").toLowerCase();
  if (s === "done" || s === "completed") return { status: "green", label: "Done" };
  if (s === "in_progress" || s === "active") return { status: "amber", label: "In progress" };
  return { status: "neutral", label: "Planned" };
}

export type PhaseTypeKey =
  | "load" | "drive" | "setup" | "opening" | "teardown" | "return" | "other";

export function inferPhaseType(work_type: string | null | undefined, title?: string | null): PhaseTypeKey {
  const w = (work_type ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (w === "load" || /load[\s-]?out|pack/i.test(t)) return "load";
  if (w === "drive" || /drive|convoy|en route/i.test(t)) return "drive";
  if (w === "opening" || /open(s|ing)?\b/i.test(t)) return "opening";
  if (w === "teardown" || w === "takedown" || /teardown|takedown|clean[- ]?up/i.test(t)) return "teardown";
  if (w === "return" || /return/i.test(t)) return "return";
  if (w === "setup" || w === "facade-build") return "setup";
  return "other";
}

export const PHASE_TYPE_LABEL: Record<PhaseTypeKey, string> = {
  load: "Load",
  drive: "Drive",
  setup: "Setup",
  opening: "Opening",
  teardown: "Teardown",
  return: "Return",
  other: "Other",
};

export const PHASE_TYPE_ACCENT: Record<PhaseTypeKey, string> = {
  load:     "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  drive:    "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  setup:    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  opening:  "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  teardown: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  return:   "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  other:    "bg-muted text-muted-foreground",
};
