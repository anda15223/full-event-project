// Shared helper: compute the equipment-driven auto oil consumable used by
// both FestivalGroceries.tsx (Orders / Trolleys tabs) and the trolley export
// page. Kept in sync so an ingredient with ordered packs never appears on one
// path and vanishes on the other.

import { supabase } from "@/integrations/supabase/client";

export type OilIngredientLike = {
  id: string;
  name: string;
  sku?: string | null;
  pack_size?: number | null;
  pack_label?: string | null;
  supplier_id?: string | null;
};

export type AutoOilConsumable = {
  id: string;
  festival_id: string;
  ingredient_id: string;
  qty: number;
  unit_mode: "packs";
  note: string;
};

export function matchOilIngredient<T extends OilIngredientLike>(ingredients: T[]): T | null {
  return ingredients.find(i => {
    if (i.sku && i.sku.trim() === "205082") return true;
    const n = (i.name || "").trim().toLowerCase();
    return n === "organic frying oil"
      || n.startsWith("fritureolie")
      || (n.includes("frying oil") && n.includes("pride"));
  }) ?? null;
}

export function classifyFryer(name: string, powerKw: number | null): { cap: number; label: string } | null {
  const n = (name || "").toLowerCase();
  if (n.includes("daka")) return null;
  const isRedfox = n.includes("redfox") || n.includes("red fox");
  const isFryer = isRedfox || n.includes("fryer") || n.includes("friture") || n.includes("frituregryde");
  if (!isFryer) return null;
  const kw = Number(powerKw ?? 0);
  const cap = isRedfox ? 25 : (kw >= 15 ? 25 : 12);
  return { cap, label: name };
}

function fmtL(x: number): string {
  const r = Math.round(x * 10) / 10;
  return (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)).replace(".", ",");
}

export function computeAutoOil(opts: {
  festivalId: string;
  ingredients: OilIngredientLike[];
  fryerRows: Array<{ equipment_name: string; quantity: number | null; power_kw: number | null }>;
  oilBackupFactor: number;
}): AutoOilConsumable | null {
  const oil = matchOilIngredient(opts.ingredients);
  if (!oil) return null;
  const groups = new Map<string, { label: string; cap: number; qty: number }>();
  let totalFryers = 0;
  for (const row of opts.fryerRows) {
    const info = classifyFryer(row.equipment_name ?? "", row.power_kw);
    const q = row.quantity ?? 0;
    if (!info || q <= 0) continue;
    const key = `${row.equipment_name}|${info.cap}`;
    const g = groups.get(key) ?? { label: info.label, cap: info.cap, qty: 0 };
    g.qty += q;
    groups.set(key, g);
    totalFryers += q;
  }
  if (totalFryers <= 0) return null;
  const parts: string[] = [];
  let capSum = 0;
  for (const g of groups.values()) {
    parts.push(`${g.qty} x ${g.label} (${g.cap} L)`);
    capSum += g.qty * g.cap;
  }
  const totalL = capSum * opts.oilBackupFactor;
  const packs = totalL > 0 ? Math.ceil(totalL / 15) : 0;
  if (packs <= 0) return null;
  const breakdown = `${parts.join(" + ")} = ${fmtL(capSum)} L × ${opts.oilBackupFactor} = ${fmtL(totalL)} L → ${packs} dunke à 15 L`;
  return {
    id: "auto:oil",
    festival_id: opts.festivalId,
    ingredient_id: oil.id,
    qty: packs,
    unit_mode: "packs",
    note: breakdown,
  };
}

/** Fetch fryer equipment rows for a festival (contracts → power → equipment). */
export async function fetchFestivalFryerEquipment(festivalId: string) {
  const { data: contracts } = await supabase
    .from("festival_contracts").select("id")
    .eq("festival_id", festivalId).eq("is_active", true);
  const cIds = (contracts ?? []).map((c: any) => c.id);
  if (cIds.length === 0) return [];
  const { data: powers } = await supabase
    .from("festival_power").select("id").in("festival_contract_id", cIds);
  const pIds = (powers ?? []).map((p: any) => p.id);
  if (pIds.length === 0) return [];
  const { data } = await supabase
    .from("festival_power_equipment")
    .select("equipment_name, quantity, power_kw")
    .in("festival_power_id", pIds);
  return (data ?? []) as Array<{ equipment_name: string; quantity: number | null; power_kw: number | null }>;
}
