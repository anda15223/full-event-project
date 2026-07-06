/**
 * Central PDF font registration for @react-pdf/renderer.
 *
 * OpenSans TTF is the stable PDF font. Avoid WOFF here: react-pdf can
 * render missing letters/ligatures in generated reports with some WOFFs.
 * These gstatic TTF URLs are already used by legacy festival exports.
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
        { src: "https://fonts.gstatic.com/s/opensans/v17/mem8YaGs126MiZpBA-UFVZ0e.ttf", fontWeight: 400 },
        { src: "https://fonts.gstatic.com/s/opensans/v17/mem5YaGs126MiZpBA-UN7rgOUuhsKKSTjw.ttf", fontWeight: 500 },
        { src: "https://fonts.gstatic.com/s/opensans/v17/mem5YaGs126MiZpBA-UN7rgOUuhsKKSTjw.ttf", fontWeight: 600 },
        { src: "https://fonts.gstatic.com/s/opensans/v17/mem5YaGs126MiZpBA-UN7rgOUuhsKKSTjw.ttf", fontWeight: 700 },
      ],
    });

    Font.register({
      family: "OpenSans",
      fonts: [
        { src: "https://fonts.gstatic.com/s/opensans/v17/mem8YaGs126MiZpBA-UFVZ0e.ttf", fontWeight: 400 },
        { src: "https://fonts.gstatic.com/s/opensans/v17/mem5YaGs126MiZpBA-UN7rgOUuhsKKSTjw.ttf", fontWeight: 700 },
      ],
    });

    Font.registerHyphenationCallback((w) => [w]);
  } catch {
    // ignore — Font.register may throw in non-PDF contexts
  }
}

// Auto-register on import
registerPdfFonts();
