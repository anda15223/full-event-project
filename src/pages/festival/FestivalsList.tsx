import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Festival = { id: string; slug: string; name: string; year: number; start_date: string; end_date: string };

// Per-festival visual identity: emoji + HSL accent color
const FESTIVAL_STYLES: Record<string, { emoji: string; hue: number }> = {
  "jelling-2026":          { emoji: "⚔️",  hue: 220 },
  "heartland-2026":        { emoji: "🌳",  hue: 145 },
  "syd-for-solen-2026":    { emoji: "☀️",  hue: 38  },
  "northside-2026":        { emoji: "🎸",  hue: 200 },
  "tinderbox-2026":        { emoji: "🔥",  hue: 12  },
  "smukfest-2026":         { emoji: "🌲",  hue: 160 },
  "roskilde-2026":         { emoji: "🎪",  hue: 340 },
  "copenhell-2026":        { emoji: "🤘",  hue: 0   },
  "grøn-2026":             { emoji: "🍀",  hue: 110 },
  "gron-2026":             { emoji: "🍀",  hue: 110 },
  "nibe-2026":             { emoji: "🎶",  hue: 260 },
  "skanderborg-2026":      { emoji: "🌊",  hue: 195 },
  "vig-2026":              { emoji: "🎡",  hue: 290 },
  "musik-i-lejet-2026":    { emoji: "🏖️",  hue: 50  },
};

const FALLBACK_EMOJIS = ["🎤", "🎫", "🎺", "🥁", "🎷", "🪗", "🎹"];

function styleFor(slug: string, idx: number) {
  if (FESTIVAL_STYLES[slug]) return FESTIVAL_STYLES[slug];
  // Deterministic fallback: spread hues around the wheel
  const hue = (idx * 47) % 360;
  return { emoji: FALLBACK_EMOJIS[idx % FALLBACK_EMOJIS.length], hue };
}

function formatRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const fmt = (d: Date) => `${d.getDate()} ${months[d.getMonth()]}`;
  return `${fmt(s)} – ${fmt(e)} ${e.getFullYear()}`;
}

export default function FestivalsList() {
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("festivals").select("*").order("start_date", { ascending: true }).then(({ data }) => {
      setFestivals((data as Festival[]) ?? []);
      setLoading(false);
    });
  }, []);

  // Group festivals by month (using start_date)
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const groups = festivals.reduce<Record<string, { key: string; label: string; items: Festival[] }>>((acc, f) => {
    const d = new Date(f.start_date);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    if (!acc[key]) acc[key] = { key, label, items: [] };
    acc[key].items.push(f);
    return acc;
  }, {});
  const groupedList = Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));

  // Stable index across all festivals for fallback styling
  const indexOf = new Map(festivals.map((f, i) => [f.id, i]));

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Festivals</h1>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : festivals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No festivals yet. Add one via the database.</p>
      ) : (
        groupedList.map((group) => (
          <section key={group.key} className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-bold uppercase tracking-wide text-foreground">
                {group.label}
              </h2>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {group.items.length} festival{group.items.length === 1 ? "" : "s"}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((f) => {
                const i = indexOf.get(f.id) ?? 0;
                const { emoji, hue } = styleFor(f.slug, i);
                const accent = `hsl(${hue} 70% 50%)`;
                const tint = `hsl(${hue} 70% 96%)`;
                return (
                  <Link
                    key={f.id}
                    to={`/festivals/${f.slug}`}
                    className="group relative rounded-2xl border border-border/50 p-5 bg-card hover:shadow-md transition overflow-hidden"
                    style={{ borderTop: `3px solid ${accent}` }}
                  >
                    <div
                      className="absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-60 group-hover:opacity-90 transition"
                      style={{ background: tint }}
                    />
                    <div
                      className="relative flex h-10 w-10 items-center justify-center rounded-xl text-xl mb-3"
                      style={{ background: tint, color: accent }}
                    >
                      <span aria-hidden>{emoji}</span>
                    </div>
                    <h3 className="relative font-semibold text-foreground tracking-tight">{f.name}</h3>
                    <p className="relative text-xs text-muted-foreground mt-1">
                      {formatRange(f.start_date, f.end_date)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
