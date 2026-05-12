/**
 * Normalize text for PDF output.
 *
 * Preserves Danish characters (æ Æ ø Ø å Å) — the embedded PDF font
 * supports them. Strips/transliterates Romanian and Romance diacritics
 * for safety, plus normalizes punctuation and emoji.
 */
export function normalizeForPdf(text: string | null | undefined): string {
  if (text === null || text === undefined) return "";
  let s = String(text);

  // Literal escape sequences sometimes pasted into DB content
  s = s
    .replace(/\\u2192/g, " to ")
    .replace(/\\u00d7/g, "x")
    .replace(/\\u2014/g, "-")
    .replace(/\\u2013/g, "-");

  // 1. Danish characters: PRESERVED (æ Æ ø Ø å Å)

  // 2. Romanian characters → Latin equivalents (incl. cedilla variants)
  const ROMANIAN: Record<string, string> = {
    "ă": "a", "Ă": "A",
    "â": "a", "Â": "A",
    "î": "i", "Î": "I",
    "ș": "s", "Ș": "S",
    "ț": "t", "Ț": "T",
    "ş": "s", "Ş": "S",
    "ţ": "t", "Ţ": "T",
  };
  s = s.replace(/[ăĂâÂîÎșȘțȚşŞţŢ]/g, (ch) => ROMANIAN[ch] ?? ch);

  // 3. Romance diacritics
  const ROMANCE_FROM = "çÇêÊéÉèÈëËàÀäÄáÁíÍïÏóÓôÔöÖúÚùÙûÛüÜñÑ";
  const ROMANCE_TO   = "cCeEeEeEeEaAaAaAiIiIoOoOoOuUuUuUuUnN";
  s = s.replace(/[çÇêÊéÉèÈëËàÀäÄáÁíÍïÏóÓôÔöÖúÚùÙûÛüÜñÑ]/g, (ch) => {
    const i = ROMANCE_FROM.indexOf(ch);
    return i >= 0 ? ROMANCE_TO[i] : ch;
  });

  // 4. Special punctuation → ASCII
  s = s
    .replace(/[\u2014\u2013]/g, "-")               // em-dash, en-dash
    .replace(/[\u2018\u2019\u201A\u201B`]/g, "'")  // curly singles + backtick
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')   // curly doubles
    .replace(/\u2026/g, "...")                     // ellipsis
    .replace(/≠/g, "!=");

  // 5. Arrows → plain English
  s = s
    .replace(/\s*↔\s*/g, " to ")
    .replace(/\s*→\s*/g, " to ")
    .replace(/\s*←\s*/g, " from ")
    .replace(/->/g, " to ")
    .replace(/<-/g, " from ");

  // 6. Strip stray ordinals, zero-widths, known emoji
  s = s
    .replace(/[\u00AA\u00BA]/g, "")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/[\u2709\uFE0F]/g, "")
    .replace(/\uD83D[\uDCE7\uDCE8\uDCF1\uDCDE\uDCF2]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");

  // 7. FINAL catch-all: strip any remaining non-ASCII byte EXCEPT Danish chars.
  // Safety net for Cyrillic, CJK, unusual symbols, surrogate halves, etc.
  s = s.replace(/[^\x00-\x7FæÆøØåÅ]/g, "");

  return s;
}

export function dash(v: string | number | null | undefined): string {
  const s = v === 0 || v === "0" ? "0" : v;
  return s === null || s === undefined || s === "" ? "-" : String(s);
}
