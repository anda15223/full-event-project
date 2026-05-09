/**
 * Normalize DB-sourced strings for safe rendering inside @react-pdf/renderer.
 * - Converts literal "\u2192" escape sequences (6 chars) to real glyphs
 * - Converts smart quotes to straight ASCII
 * - Converts ASCII "->" to a real arrow (U+2192)
 * - Strips zero-width chars and emoji that the binder font cannot render
 *
 * Danish (æ ø å) and Romanian (ș ț ă î â) letters are preserved.
 */
export function normalizeForPdf(text: string | null | undefined): string {
  if (text === null || text === undefined) return "";
  let s = String(text);

  // Literal escape sequences sometimes pasted into DB content
  s = s
    .replace(/\\u2192/g, " -> ")
    .replace(/\\u00d7/g, "×")
    .replace(/\\u2014/g, "—")
    .replace(/\\u2013/g, "–");

  // Glyphs Open Sans v17 cannot render cleanly
  s = s
    .replace(/≠/g, "!=")
    .replace(/[\u2018\u2019\u201A\u201B`]/g, "'") // curly + backtick → straight
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');

  return s
    // Open Sans cannot render U+2192/U+2190 reliably — fall back to ASCII
    .replace(/\s*→\s*/g, " -> ")
    .replace(/\s*←\s*/g, " <- ")
    // zero-width / BOM
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    // common emoji icons that the binder font cannot render
    .replace(/[\u2709\uFE0F]/g, "")
    .replace(/\uD83D[\uDCE7\uDCE8\uDCF1\uDCDE\uDCF2]/g, "");
}

export function dash(v: string | number | null | undefined): string {
  const s = v === 0 || v === "0" ? "0" : v;
  return s === null || s === undefined || s === "" ? "\u2014" : String(s);
}
