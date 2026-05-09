/**
 * Normalize DB-sourced strings for safe rendering inside @react-pdf/renderer.
 * - Converts smart quotes to straight ASCII (Open Sans v17 supports both, but
 *   mixed corpora render more reliably with one form)
 * - Converts ASCII "->" to a real arrow (U+2192)
 * - Strips zero-width chars that occasionally come in via copy/paste
 *
 * Danish letters (æ ø å Æ Ø Å) and Romanian letters (ș ț ă î â) are preserved.
 */
export function normalizeForPdf(text: string | null | undefined): string {
  if (text === null || text === undefined) return "";
  const s = String(text);
  return s
    // smart quotes → straight
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // ASCII arrows → unicode arrow glyph
    .replace(/->/g, "\u2192")
    .replace(/<-/g, "\u2190")
    // zero-width / BOM
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    // common emoji icons that the binder font cannot render
    .replace(/[\u2709\uFE0F]/g, "") // ✉
    .replace(/\uD83D[\uDCE7\uDCE8\uDCF1\uDCDE\uDCF2]/g, ""); // 📧 📨 📱 📞 📲
}

export function dash(v: string | number | null | undefined): string {
  const s = v === 0 || v === "0" ? "0" : v;
  return s === null || s === undefined || s === "" ? "\u2014" : String(s);
}
