// Helpers for the staff-v2 schedule grid.

export interface FestivalDay {
  iso: string;          // YYYY-MM-DD
  weekday: string;      // "Thu"
  label: string;        // "Thu 21 May"
}

export function festivalDays(startIso: string, endIso: string): FestivalDay[] {
  const out: FestivalDay[] = [];
  if (!startIso || !endIso) return out;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return out;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const weekday = dayNames[cursor.getUTCDay()];
    const dd = cursor.getUTCDate();
    const mm = monthNames[cursor.getUTCMonth()];
    out.push({ iso, weekday, label: `${weekday} ${dd} ${mm}` });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (out.length > 30) break;
  }
  return out;
}

export function formatHoursMinutes(h: number): string {
  if (!h || isNaN(h)) return "0h 0m";
  const sign = h < 0 ? "-" : "";
  const abs = Math.abs(h);
  const hours = Math.floor(abs);
  const mins = Math.round((abs - hours) * 60);
  if (mins === 60) return `${sign}${hours + 1}h 0m`;
  return `${sign}${hours}h ${mins}m`;
}

// Canonical concept slug order used across the app.
export const CONCEPT_ORDER = ["fish-chips", "gyros", "creperie", "chicks"] as const;

export function conceptAccentClass(slug: string | null | undefined): string {
  switch (slug) {
    case "fish-chips": return "bg-sky-100 text-sky-800 border-sky-200";
    case "gyros":      return "bg-amber-100 text-amber-800 border-amber-200";
    case "creperie":   return "bg-rose-100 text-rose-800 border-rose-200";
    case "chicks":     return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:           return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function conceptHeaderClass(slug: string | null | undefined): string {
  switch (slug) {
    case "fish-chips": return "bg-sky-50/70 border-sky-200";
    case "gyros":      return "bg-amber-50/70 border-amber-200";
    case "creperie":   return "bg-rose-50/70 border-rose-200";
    case "chicks":     return "bg-emerald-50/70 border-emerald-200";
    default:           return "bg-slate-50/70 border-slate-200";
  }
}
