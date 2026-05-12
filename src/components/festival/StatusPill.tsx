import { cn } from "@/lib/utils";

export type StatusPillTone = "green" | "amber" | "red" | "blue" | "violet" | "neutral";

const TONE: Record<StatusPillTone, string> = {
  green:   "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  amber:   "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  red:     "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  blue:    "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  violet:  "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  neutral: "bg-muted text-muted-foreground border",
};

const DOT: Record<StatusPillTone, string> = {
  green:   "bg-emerald-500",
  amber:   "bg-amber-500",
  red:     "bg-rose-500",
  blue:    "bg-blue-500",
  violet:  "bg-violet-500",
  neutral: "bg-muted-foreground/50",
};

interface StatusPillProps {
  tone?: StatusPillTone;
  /** Alias for `tone` to match earlier spec wording */
  status?: StatusPillTone;
  label: string;
  size?: "sm" | "md";
  withDot?: boolean;
  className?: string;
}

/**
 * Canonical status pill used across the festival module.
 * Pattern: rounded-full · px-3 py-1 (md) or px-2 py-0.5 (sm) · subtle bg + border + colored dot.
 */
export function StatusPill({
  tone,
  status,
  label,
  size = "md",
  withDot = true,
  className,
}: StatusPillProps) {
  const t = tone ?? status ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[10px] uppercase tracking-wide" : "px-3 py-1 text-xs",
        TONE[t],
        className,
      )}
    >
      {withDot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT[t])} />}
      {label}
    </span>
  );
}

export default StatusPill;
