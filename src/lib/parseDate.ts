/**
 * Normalize a free-form date string into ISO YYYY-MM-DD.
 * Accepts: ISO (with/without time), DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY,
 * YYYY/MM/DD, and English/Danish month-name forms via Date parsing fallback.
 * Returns null if it can't be parsed into a valid date.
 *
 * Used to defend DB `date` columns from AI-returned localized formats
 * (Danish hotel confirmations frequently emit "21.05.2026" or "21/05/2026"),
 * which would otherwise cause the entire UPDATE to error and be swallowed.
 */
export function toIsoDate(input: unknown): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  // Already ISO date or ISO timestamp
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY (European order)
  const eu = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (eu) {
    const d = eu[1].padStart(2, "0");
    const m = eu[2].padStart(2, "0");
    let y = eu[3];
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${m}-${d}`;
  }

  // YYYY/MM/DD
  const ym = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}-${ym[3].padStart(2, "0")}`;

  // Fallback: native Date (handles "May 21, 2026", "21 May 2026", etc.)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}
