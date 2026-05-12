import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileAccent = "blue" | "violet" | "emerald" | "amber" | "rose" | "slate";
export type TileStatus = "green" | "amber" | "red" | "gray";

interface FestivalTileProps {
  href: string;
  icon: LucideIcon;
  iconAccent?: TileAccent;
  title: string;
  primaryStat: string;
  secondaryStat?: string;
  status?: TileStatus;
  disabled?: boolean;
}

const ACCENT: Record<TileAccent, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const STATUS_DOT: Record<TileStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  gray: "bg-zinc-400",
};

export function FestivalTile({
  href,
  icon: Icon,
  iconAccent = "slate",
  title,
  primaryStat,
  secondaryStat,
  status,
  disabled,
}: FestivalTileProps) {
  return (
    <Link
      to={disabled ? "#" : href}
      className={disabled ? "pointer-events-none" : "block"}
      aria-disabled={disabled || undefined}
    >
      <div
        className={cn(
          "relative rounded-2xl border bg-card p-5 h-full transition-all duration-200",
          disabled
            ? "opacity-50"
            : "hover:shadow-md hover:-translate-y-0.5 hover:border-foreground/20 cursor-pointer"
        )}
      >
        {status && !disabled && (
          <div
            className={cn(
              "absolute top-4 right-4 h-2.5 w-2.5 rounded-full",
              STATUS_DOT[status]
            )}
          />
        )}

        <div
          className={cn(
            "h-11 w-11 rounded-xl flex items-center justify-center mb-3",
            ACCENT[iconAccent]
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>

        <div className="font-semibold text-base leading-tight">{title}</div>
        <div className="text-sm text-muted-foreground mt-1">{primaryStat}</div>
        {secondaryStat && (
          <div className="text-xs text-muted-foreground/80 mt-0.5">{secondaryStat}</div>
        )}

        {disabled && (
          <div className="absolute bottom-3 right-4 text-xs italic text-muted-foreground">
            Coming soon
          </div>
        )}
      </div>
    </Link>
  );
}
