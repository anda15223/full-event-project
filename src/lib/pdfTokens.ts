/**
 * PDF Color Tokens
 *
 * Single source of truth for all PDF export colors.
 * Mirrors the app's Tailwind palette so PDFs carry the same
 * visual signals as the on-screen UI.
 *
 * @react-pdf accepts hex colors only, not Tailwind class names.
 */

export const PDF_COLORS = {
  // Semantic priority colors (mirrors app cards/pills)
  critical: '#DC2626',       // red-600 — blocking, action needed
  criticalBg: '#FEE2E2',     // red-100 — faint pink wash for backgrounds
  criticalBorder: '#FCA5A5', // red-300

  warning: '#F59E0B',        // amber-500 — pending, due soon
  warningBg: '#FEF3C7',      // amber-100
  warningBorder: '#FCD34D',  // amber-300

  success: '#10B981',        // emerald-500 — done, confirmed, ready
  successBg: '#D1FAE5',      // emerald-100
  successBorder: '#6EE7B7',  // emerald-300

  info: '#3B82F6',           // blue-500 — open, in-progress, neutral status
  infoBg: '#DBEAFE',         // blue-100
  infoBorder: '#93C5FD',     // blue-300

  // Neutral / structural
  textPrimary: '#111827',    // gray-900 — body text
  textSecondary: '#6B7280',  // gray-500 — secondary labels
  textMuted: '#9CA3AF',      // gray-400 — metadata
  border: '#E5E7EB',         // gray-200 — subtle dividers
  borderStrong: '#D1D5DB',   // gray-300

  // Date urgency (mirrors Action Items date pills)
  overdue: '#DC2626',        // red-600 — same as critical
  overdueBg: '#FEE2E2',      // red-100
  thisWeek: '#F59E0B',       // amber-500 — same as warning
  thisWeekBg: '#FEF3C7',     // amber-100
  later: '#6B7280',          // gray-500 — neutral

  // Vehicle color coding (per Sprint 5 visual polish plan)
  car1: '#3B82F6',           // blue-500 — Car 1 (e.g. Gyros)
  car2: '#10B981',           // emerald-500 — Car 2 (e.g. Fish & Chips)
  car3: '#F59E0B',           // amber-500 — Car 3 (Chicks + Creperie)
  unassigned: '#DC2626',     // red-600 — no vehicle assigned

  // Backgrounds
  pageBg: '#FFFFFF',         // white
  cardBg: '#F9FAFB',         // gray-50 — subtle card backgrounds
} as const;

export type PdfColorToken = keyof typeof PDF_COLORS;

/**
 * Helper: get priority color for a given priority level.
 * Used by action items, contracts, timeline events, etc.
 */
export function pdfPriorityColor(priority: string | null | undefined): string {
  switch (priority?.toLowerCase()) {
    case 'critical':
    case 'high':
      return PDF_COLORS.critical;
    case 'important':
    case 'medium':
      return PDF_COLORS.warning;
    case 'low':
    case 'info':
    case 'normal':
      return PDF_COLORS.textMuted;
    default:
      return PDF_COLORS.border;
  }
}

/**
 * Helper: get status color for action items, contracts, etc.
 */
export function pdfStatusColor(status: string | null | undefined): { fg: string; bg: string; border: string } {
  switch (status?.toLowerCase()) {
    case 'open':
    case 'pending':
      return { fg: PDF_COLORS.info, bg: PDF_COLORS.infoBg, border: PDF_COLORS.infoBorder };
    case 'in_progress':
    case 'in progress':
      return { fg: PDF_COLORS.warning, bg: PDF_COLORS.warningBg, border: PDF_COLORS.warningBorder };
    case 'done':
    case 'completed':
    case 'confirmed':
    case 'ready':
      return { fg: PDF_COLORS.success, bg: PDF_COLORS.successBg, border: PDF_COLORS.successBorder };
    case 'blocked':
    case 'overdue':
      return { fg: PDF_COLORS.critical, bg: PDF_COLORS.criticalBg, border: PDF_COLORS.criticalBorder };
    default:
      return { fg: PDF_COLORS.textSecondary, bg: PDF_COLORS.cardBg, border: PDF_COLORS.border };
  }
}

/**
 * Helper: get date urgency color based on days until deadline.
 * negative = overdue, 0-7 = this week, >7 = later
 */
export function pdfDateUrgencyColor(daysUntil: number | null | undefined): { fg: string; bg: string } {
  if (daysUntil === null || daysUntil === undefined) {
    return { fg: PDF_COLORS.textMuted, bg: PDF_COLORS.cardBg };
  }
  if (daysUntil < 0) {
    return { fg: PDF_COLORS.overdue, bg: PDF_COLORS.overdueBg };
  }
  if (daysUntil <= 3) {
    return { fg: PDF_COLORS.warning, bg: PDF_COLORS.warningBg };
  }
  if (daysUntil <= 7) {
    return { fg: PDF_COLORS.warning, bg: PDF_COLORS.warningBg };
  }
  return { fg: PDF_COLORS.later, bg: PDF_COLORS.cardBg };
}
