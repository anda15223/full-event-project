// Date range formatting utility — uses en-dash (U+2013) with non-breaking spaces.

const NBSP = "\u00A0";
const EN_DASH = "\u2013";

function toDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  // Treat YYYY-MM-DD as local midnight to avoid TZ shifts
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d + "T00:00:00");
  return new Date(d);
}

export interface FormatDateRangeOptions {
  locale?: string;
  /** Force long format even when same month */
  long?: boolean;
}

/**
 * Format a date range with an en-dash separator.
 * Same month: "21–24 May 2026"
 * Different months/years: "21 May – 24 Jun 2026" / "21 Dec 2025 – 3 Jan 2026"
 */
export function formatDateRange(
  start: Date | string,
  end: Date | string,
  options: FormatDateRangeOptions = {},
): string {
  const { locale = "en-GB", long = false } = options;
  const s = toDate(start);
  const e = toDate(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";

  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();

  const month = (d: Date) => d.toLocaleDateString(locale, { month: "short" });
  const day = (d: Date) => d.getDate();
  const year = (d: Date) => d.getFullYear();

  if (sameMonth && !long) {
    return `${day(s)}${EN_DASH}${day(e)}${NBSP}${month(e)}${NBSP}${year(e)}`;
  }
  if (sameYear) {
    return `${day(s)}${NBSP}${month(s)}${NBSP}${EN_DASH}${NBSP}${day(e)}${NBSP}${month(e)}${NBSP}${year(e)}`;
  }
  return `${day(s)}${NBSP}${month(s)}${NBSP}${year(s)}${NBSP}${EN_DASH}${NBSP}${day(e)}${NBSP}${month(e)}${NBSP}${year(e)}`;
}
