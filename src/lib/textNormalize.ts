/**
 * Normalize text for PDF output.
 *
 * Strips ALL non-ASCII characters to ensure bulletproof rendering
 * regardless of font fallback behavior. Trade-off: PDFs are pure
 * ASCII; the app UI retains full Unicode.
 *
 * Mappings:
 *   - Danish: æ Æ ø Ø å Å → ae Ae o O a A
 *   - Romanian: ă â î ș ț (+ caps, + cedilla variants) → a a i s t (+ caps)
 *   - Romance diacritics: ç é à etc → c e a etc
 *   - Em/en-dash: — – → -
 *   - Smart quotes: " " ' ' → " '
 *   - Ellipsis: … → ...
 *   - Arrows: → → " to "
 *   - Emoji: stripped entirely
 *   - Catch-all: any remaining non-ASCII → stripped
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

  // 1. Danish characters → Latin equivalents
  const DANISH: Record<string, string> = {
    "æ": "ae", "Æ": "Ae",
    "ø": "o",  "Ø": "O",
    "å": "a",  "Å": "A",
  };
  s = s.replace(/[æÆøØåÅ]/g, (ch) => DANISH[ch] ?? ch);

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

  // 7. FINAL catch-all: strip any remaining non-ASCII byte.
  // Safety net for Cyrillic, CJK, unusual symbols, surrogate halves, etc.
  s = s.replace(/[^\x00-\x7F]/g, "");

  return s;
}

export function dash(v: string | number | null | undefined): string {
  const s = v === 0 || v === "0" ? "0" : v;
  return s === null || s === undefined || s === "" ? "-" : String(s);
}
