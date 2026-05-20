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
