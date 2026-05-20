// Helpers for the festival scheduling card.

export function positionLabel(
  stationLabel: string,
  positionNumber: number,
  siblingCount: number,
): string {
  if (siblingCount <= 1) return stationLabel;
  return `${stationLabel} ${positionNumber}`;
}

export function conceptAccentClass(slug: string | null | undefined): string {
  switch (slug) {
    case "fish-chips": return "bg-sky-50/70 border-sky-200 text-sky-900";
    case "gyros":      return "bg-amber-50/70 border-amber-200 text-amber-900";
    case "creperie":   return "bg-rose-50/70 border-rose-200 text-rose-900";
    case "chicks":     return "bg-emerald-50/70 border-emerald-200 text-emerald-900";
    default:           return "bg-slate-50/70 border-slate-200 text-slate-900";
  }
}

export function conceptChipClass(slug: string | null | undefined): string {
  switch (slug) {
    case "fish-chips": return "bg-sky-100 border-sky-300 text-sky-900";
    case "gyros":      return "bg-amber-100 border-amber-300 text-amber-900";
    case "creperie":   return "bg-rose-100 border-rose-300 text-rose-900";
    case "chicks":     return "bg-emerald-100 border-emerald-300 text-emerald-900";
    default:           return "bg-slate-100 border-slate-300 text-slate-900";
  }
}

export interface FestivalDay {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Thu 21"
}

export function festivalDays(startDate: string, endDate: string): FestivalDay[] {
  const out: FestivalDay[] = [];
  if (!startDate || !endDate) return out;
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return out;
  const fmtWd = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push({
      date: `${y}-${m}-${d}`,
      label: `${fmtWd.format(cur)} ${cur.getDate()}`,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function formatHoursMinutes(totalHours: number): string {
  if (!totalHours || totalHours <= 0) return "0h";
  const totalMin = Math.round(totalHours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatTimeHHMM(t: string | null | undefined): string {
  if (!t) return "";
  // expects HH:MM:SS or HH:MM
  return t.slice(0, 5);
}
