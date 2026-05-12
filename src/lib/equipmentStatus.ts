export type EquipCategory =
  | "cooking" | "prep" | "table" | "scaffold" | "trolley" | "pos" | "sink"
  | "signage" | "popup_tent" | "cable" | "fire_safety" | "first_aid"
  | "consumable_storage" | "facade" | "topskilt" | "cooling" | "other";

export const CATEGORY_META: Record<EquipCategory, { label: string; emoji: string; order: number }> = {
  cooking:            { label: "Cooking",           emoji: "🔥", order: 1 },
  prep:               { label: "Prep",              emoji: "🧹", order: 2 },
  cooling:            { label: "Cooling",           emoji: "❄️", order: 3 },
  table:              { label: "Tables",            emoji: "◽", order: 4 },
  sink:               { label: "Sinks",             emoji: "🚰", order: 5 },
  pos:                { label: "POS",               emoji: "💳", order: 6 },
  scaffold:           { label: "Scaffold",          emoji: "🏗️", order: 7 },
  trolley:            { label: "Trolleys",          emoji: "🛒", order: 8 },
  popup_tent:         { label: "Pop-up Tents",      emoji: "⛺", order: 9 },
  facade:             { label: "Facade",            emoji: "🖼️", order: 10 },
  topskilt:           { label: "Topskilt",          emoji: "🪧", order: 11 },
  signage:            { label: "Signage",           emoji: "📋", order: 12 },
  cable:              { label: "Cables",            emoji: "🔌", order: 13 },
  fire_safety:        { label: "Fire Safety",       emoji: "🧯", order: 14 },
  first_aid:          { label: "First Aid",         emoji: "🩹", order: 15 },
  consumable_storage: { label: "Storage",           emoji: "📦", order: 16 },
  other:              { label: "Other",             emoji: "▫️", order: 99 },
};

export type EquipmentRow = {
  id: string;
  festival_power_id: string;
  position: number;
  equipment_name: string;
  quantity: number;
  power_type: string | null;
  power_kw: number | null;
  is_powered: boolean;
  category: EquipCategory;
  loads_from_soborg: boolean;
  notes: string | null;
};

export type EquipStatus = { status: "green" | "amber" | "gray"; label: string };

export function computeConceptEquipmentStatus(rows: EquipmentRow[]): EquipStatus {
  if (rows.length === 0) return { status: "gray", label: "No equipment" };
  const poweredMissingKw = rows.some((r) => r.is_powered && (r.power_kw == null || Number(r.power_kw) === 0));
  if (poweredMissingKw) return { status: "amber", label: "Missing kW" };
  return { status: "green", label: "Equipped" };
}

export function summarizeConceptEquipment(rows: EquipmentRow[]) {
  let items = 0, powered = 0, kw = 0;
  rows.forEach((r) => {
    items += r.quantity;
    if (r.is_powered) {
      powered += r.quantity;
      kw += Number(r.power_kw ?? 0) * r.quantity;
    }
  });
  return { items, powered, kw: Math.round(kw * 10) / 10 };
}

export function groupByCategory(rows: EquipmentRow[]) {
  const map = new Map<EquipCategory, EquipmentRow[]>();
  rows.forEach((r) => {
    const arr = map.get(r.category) ?? [];
    arr.push(r);
    map.set(r.category, arr);
  });
  return Array.from(map.entries()).sort(
    (a, b) => (CATEGORY_META[a[0]]?.order ?? 99) - (CATEGORY_META[b[0]]?.order ?? 99)
  );
}

export const ALL_CATEGORIES: EquipCategory[] = (Object.keys(CATEGORY_META) as EquipCategory[])
  .sort((a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order);
