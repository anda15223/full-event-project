/**
 * Central PDF font registration for @react-pdf/renderer.
 *
 * Inter is the primary font — Open Sans v17 silently drops fi/fl
 * ligatures (e.g. "Confirm" → "Confrm"). Inter renders ligatures
 * cleanly and covers Danish chars (æ Æ ø Ø å Å).
 *
 * Open Sans remains registered as a fallback for any legacy refs.
 *
 * CDN: jsdelivr (chosen in Sprint 5 for reliable WOFF URLs).
 */
import { Font } from "@react-pdf/renderer";

let registered = false;

export function registerPdfFonts() {
  if (registered) return;
  registered = true;

  try {
    Font.register({
      family: "Inter",
      fonts: [
        { src: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/inter-latin-ext-400-normal.woff", fontWeight: 400 },
        { src: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/inter-latin-ext-500-normal.woff", fontWeight: 500 },
        { src: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/inter-latin-ext-600-normal.woff", fontWeight: 600 },
        { src: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/inter-latin-ext-700-normal.woff", fontWeight: 700 },
      ],
    });

    // Open Sans fallback (kept for legacy refs)
    Font.register({
      family: "OpenSans",
      fonts: [
        { src: "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.28/files/open-sans-latin-ext-400-normal.woff", fontWeight: 400 },
        { src: "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.28/files/open-sans-latin-ext-700-normal.woff", fontWeight: 700 },
      ],
    });

    Font.registerHyphenationCallback((w) => [w]);
  } catch {
    // ignore — Font.register may throw in non-PDF contexts
  }
}

// Auto-register on import
registerPdfFonts();
