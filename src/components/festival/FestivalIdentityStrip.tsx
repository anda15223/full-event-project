import React from "react";
import { cn } from "@/lib/utils";

export interface FestivalIdentityStripProps {
  festival: {
    id: string;
    slug: string;
    name: string;
    start_date: string;
    end_date: string;
  };
}

function formatRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameMonth =
    s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  const sameYear = s.getFullYear() === e.getFullYear();
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-DK", opts).format(d);
  if (sameMonth) {
    return `${s.getDate()} – ${e.getDate()} ${fmt(e, { month: "long", year: "numeric" })}`;
  }
  if (sameYear) {
    return `${fmt(s, { day: "numeric", month: "short" })} – ${fmt(e, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${fmt(s, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(e, { day: "numeric", month: "short", year: "numeric" })}`;
}

function daysUntil(iso: string): number {
  const d = new Date(iso + "T00:00:00").getTime();
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.ceil((d - t.getTime()) / 86400000);
}

function CountdownPill({ startDate }: { startDate: string }) {
  const diff = daysUntil(startDate);
  let label: string;
  let cls: string;
  if (diff < 0) { label = "PAST"; cls = "bg-muted text-muted-foreground"; }
  else if (diff === 0) { label = "TODAY"; cls = "bg-destructive text-destructive-foreground"; }
  else if (diff === 1) { label = "T-1 day"; cls = "bg-destructive text-destructive-foreground"; }
  else if (diff <= 6) { label = `T-${diff} days`; cls = "bg-destructive text-destructive-foreground"; }
  else if (diff <= 14) { label = `T-${diff} days`; cls = "bg-amber-500 text-white"; }
  else { label = `T-${diff} days`; cls = "bg-emerald-600 text-white"; }
  return (
    <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", cls)}>
      {label}
    </span>
  );
}

export function FestivalIdentityStrip({ festival }: FestivalIdentityStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 py-4 mb-4 border-b">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {festival.name}
      </h1>
      <span aria-hidden className="text-muted-foreground">·</span>
      <span className="text-base text-muted-foreground">
        {formatRange(festival.start_date, festival.end_date)}
      </span>
      <span className="ml-auto">
        <CountdownPill startDate={festival.start_date} />
      </span>
    </div>
  );
}

export default FestivalIdentityStrip;
