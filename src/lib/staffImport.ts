// Staff roster import helpers — used by FestivalStaffV2 to translate a
// parse-document staff_roster payload into writes against the new staff schema.

export type Day = "thu" | "fri" | "sat" | "sun";

export interface ParsedShift {
  day: Day;
  start: string | null;
  end: string | null;
  label: string | null;
}

export interface ParsedPerson {
  full_name: string;
  concept_group: string;
  home_location: string | null;
  station: string | null;
  source: string | null;
  works: { thu: boolean; fri: boolean; sat: boolean; sun: boolean };
  needs_accom: { thu: boolean; fri: boolean; sat: boolean; sun: boolean };
  confirmed: boolean;
  shifts: ParsedShift[];
}

export interface ParsedRoster {
  festival_hint: string | null;
  summary: {
    total_people: number | null;
    confirmed: number | null;
    need_accom: number | null;
  };
  people: ParsedPerson[];
  raw_notes: string;
}

export interface StationRow {
  id: string;
  concept_id: string | null;
  code: string;
  label: string;
}

export interface ExistingStaff {
  id: string;
  full_name: string;
}

// ---------------------------------------------------------------------------
// Concept mapping
// ---------------------------------------------------------------------------

// Returns the concept SLUG (or null for Management / Not assigned).
export function mapConceptGroup(group: string | null | undefined): string | null {
  if (!group) return null;
  const g = group.trim().toLowerCase();
  if (g === "management" || g === "not assigned") return null;
  if (g === "fish & chips" || g === "fish and chips" || g === "fish chips") return "fish-chips";
  if (g === "la creperie" || g === "la crêperie" || g === "creperie" || g === "crêperie") return "creperie";
  if (g === "gyropolis gyros" || g === "gyros" || g === "gyropolis") return "gyros";
  if (g === "chicks 'n' buns" || g === "chicks n buns" || g === "chicks & buns" || g === "chicks") return "chicks";
  return null;
}

export function isNotAssigned(group: string | null | undefined): boolean {
  return !!group && group.trim().toLowerCase() === "not assigned";
}

// ---------------------------------------------------------------------------
// Station resolution
// ---------------------------------------------------------------------------

function slugifyStation(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "station";
}

export type StationResolution =
  | { kind: "found"; stationId: string }
  | { kind: "none" }
  | { kind: "propose"; label: string; conceptSlug: string | null; suggestedCode: string };

export function resolveStation(
  rawStation: string | null | undefined,
  conceptId: string | null,
  stations: StationRow[],
  conceptSlug: string | null,
): StationResolution {
  if (!rawStation || !rawStation.trim()) return { kind: "none" };
  const needle = rawStation.trim().toLowerCase();

  // Prefer stations in this concept; fall back to mgmt/null-concept matches.
  const inConcept = stations.filter((s) => s.concept_id === conceptId);
  for (const s of inConcept) {
    if (s.label.toLowerCase() === needle || s.code.toLowerCase() === needle) {
      return { kind: "found", stationId: s.id };
    }
  }
  // Loose contains match within concept
  for (const s of inConcept) {
    if (s.label.toLowerCase().includes(needle) || needle.includes(s.label.toLowerCase())) {
      return { kind: "found", stationId: s.id };
    }
  }

  return {
    kind: "propose",
    label: rawStation.trim(),
    conceptSlug,
    suggestedCode: slugifyStation(rawStation),
  };
}

// ---------------------------------------------------------------------------
// Shift hours
// ---------------------------------------------------------------------------

function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (isNaN(h) || isNaN(min) || h > 24 || min > 59) return null;
  return h + min / 60;
}

export interface ComputedShift {
  hours: number;
  crossesMidnight: boolean;
}

export function computeShiftHours(
  start: string | null | undefined,
  end: string | null | undefined,
): ComputedShift {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s == null || e == null) return { hours: 0, crossesMidnight: false };
  let h = e - s;
  let crosses = false;
  if (e <= s) {
    h = (e + 24) - s;
    crosses = true;
  }
  // round to 0.5
  return { hours: Math.round(h * 2) / 2, crossesMidnight: crosses };
}

// ---------------------------------------------------------------------------
// Match-or-create plan
// ---------------------------------------------------------------------------

export type PlanStatus = "reuse" | "create_new" | "needs_review";

export interface PlanRow {
  parsed: ParsedPerson;
  status: PlanStatus;
  matchedStaffId?: string;
  ambiguityReason?: string;
  // populated during user review
  userChoice?: { mode: "create_new" } | { mode: "link"; staffId: string };
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchOrCreatePlan(
  parsedPeople: ParsedPerson[],
  existingStaff: ExistingStaff[],
): PlanRow[] {
  // Index existing by normalized name → list of ids (could be duplicates)
  const existingByName = new Map<string, ExistingStaff[]>();
  for (const e of existingStaff) {
    const k = norm(e.full_name);
    const list = existingByName.get(k) ?? [];
    list.push(e);
    existingByName.set(k, list);
  }

  // First-token map across the PARSED roster, so we can detect shared first
  // tokens (e.g. Anik / Prieten Anik / Anik friend) which are the classic
  // ambiguity signal in this domain.
  const firstTokenCount = new Map<string, number>();
  for (const p of parsedPeople) {
    const t = norm(p.full_name).split(" ")[0];
    if (!t) continue;
    firstTokenCount.set(t, (firstTokenCount.get(t) ?? 0) + 1);
  }

  return parsedPeople.map<PlanRow>((p) => {
    const nk = norm(p.full_name);
    const matches = existingByName.get(nk) ?? [];

    // Ambiguity: multiple existing rows with the same name
    if (matches.length > 1) {
      return {
        parsed: p,
        status: "needs_review",
        ambiguityReason: `${matches.length} existing staff rows share this exact name`,
      };
    }

    const firstTok = nk.split(" ")[0];
    const sharedToken = firstTok && (firstTokenCount.get(firstTok) ?? 0) > 1;

    // Exact single match: reuse — UNLESS this name shares its first token with
    // another person in this very roster (disambiguator pattern). In that case
    // we still send to needs_review so a human picks.
    if (matches.length === 1 && !sharedToken) {
      return { parsed: p, status: "reuse", matchedStaffId: matches[0].id };
    }
    if (matches.length === 1 && sharedToken) {
      return {
        parsed: p,
        status: "needs_review",
        matchedStaffId: matches[0].id,
        ambiguityReason: `Shares first name "${firstTok}" with other people in this roster`,
      };
    }

    // No name match
    if (sharedToken) {
      return {
        parsed: p,
        status: "needs_review",
        ambiguityReason: `Shares first name "${firstTok}" with other people in this roster`,
      };
    }
    return { parsed: p, status: "create_new" };
  });
}

// ---------------------------------------------------------------------------
// Festival day mapping
// ---------------------------------------------------------------------------

// Given the festival start/end window (4 days for typical fest: Thu Fri Sat Sun)
// returns a map day→ISO date by aligning to the day-of-week within that window.
// Falls back to start_date + index (thu=0, fri=1, sat=2, sun=3) if the
// festival window doesn't span the right weekday.
export function buildDayDateMap(
  startIso: string,
  endIso: string,
): Record<Day, string> {
  const result: Record<Day, string> = {
    thu: startIso, fri: startIso, sat: startIso, sun: startIso,
  };
  const dayIndex: Record<Day, number> = { thu: 4, fri: 5, sat: 6, sun: 0 };
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");

  for (const d of ["thu", "fri", "sat", "sun"] as Day[]) {
    const target = dayIndex[d];
    const cursor = new Date(start);
    let matched: Date | null = null;
    while (cursor.getTime() <= end.getTime()) {
      if (cursor.getUTCDay() === target) { matched = new Date(cursor); break; }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (matched) {
      result[d] = matched.toISOString().slice(0, 10);
    } else {
      // Fallback: positional offset from start
      const offset: Record<Day, number> = { thu: 0, fri: 1, sat: 2, sun: 3 };
      const fb = new Date(start);
      fb.setUTCDate(fb.getUTCDate() + offset[d]);
      result[d] = fb.toISOString().slice(0, 10);
    }
  }
  return result;
}
