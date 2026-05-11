// Pure functions for power gap analysis.
// Equipment demand vs ordered supply per power-type.

export type PowerType =
  | "16A_240V"
  | "16A_400V"
  | "32A"
  | "63A"
  | "125A"
  | "230V_socket";

export const POWER_TYPES: PowerType[] = [
  "125A",
  "63A",
  "32A",
  "16A_400V",
  "16A_240V",
  "230V_socket",
];

export const POWER_TYPE_LABEL: Record<PowerType, string> = {
  "16A_240V": "16A 240V",
  "16A_400V": "16A 400V",
  "32A": "32A",
  "63A": "63A",
  "125A": "125A",
  "230V_socket": "230V regular socket",
};

export type PowerEquipmentRow = {
  id: string;
  festival_power_id: string;
  position: number;
  equipment_name: string;
  quantity: number;
  power_type: PowerType;
  power_kw: number | null;
  is_shared: boolean | null;
  shared_with_concepts: string[] | null;
  notes: string | null;
};

export type PowerSupply = {
  connections_16a_240v: number | null;
  connections_16a_400v: number | null;
  connections_32a: number | null;
  connections_63a: number | null;
  connections_125a: number | null;
};

// 230V_socket maps physically to a 16A 240V circuit.
function supplyFor(power: PowerSupply, t: PowerType): number {
  switch (t) {
    case "16A_240V":
    case "230V_socket":
      return power.connections_16a_240v ?? 0;
    case "16A_400V":
      return power.connections_16a_400v ?? 0;
    case "32A":
      return power.connections_32a ?? 0;
    case "63A":
      return power.connections_63a ?? 0;
    case "125A":
      return power.connections_125a ?? 0;
  }
}

export type GapStatus = "short" | "match" | "spare";

export type GapRow = {
  power_type: PowerType;
  demand: number;
  supply: number;
  gap: number;
  status: GapStatus;
};

function statusFor(gap: number): GapStatus {
  if (gap < 0) return "short";
  if (gap === 0) return "match";
  return "spare";
}

// Sum supply across multiple power records (avoid double-counting 230V/16A_240V).
function sumSupply(powers: PowerSupply[], t: PowerType): number {
  return powers.reduce((s, p) => s + supplyFor(p, t), 0);
}

function demandFor(equipment: PowerEquipmentRow[], t: PowerType): number {
  let total = 0;
  for (const e of equipment) {
    if (e.power_type !== t) continue;
    const qty = Number(e.quantity ?? 0);
    if (e.is_shared) {
      const split = 1 + (e.shared_with_concepts?.length ?? 0);
      total += qty / split;
    } else {
      total += qty;
    }
  }
  return total;
}

export function computeGap(
  power: PowerSupply,
  equipment: PowerEquipmentRow[],
): GapRow[] {
  return POWER_TYPES.map((t) => {
    const demand = demandFor(equipment, t);
    const supply = supplyFor(power, t);
    const gap = supply - demand;
    return { power_type: t, demand, supply, gap, status: statusFor(gap) };
  }).filter((r) => r.demand > 0 || r.supply > 0);
}

// Tent-level: aggregate demand AND supply across all powers in same tent.
// For shared equipment that lists "shared_with_concepts" pointing to a
// contract that is in the same tent, we collapse it (count once instead of split).
export function computeTentGap(
  powers: PowerSupply[],
  equipmentByPower: Map<string, PowerEquipmentRow[]>,
  contractIdsInTent: string[],
): GapRow[] {
  // Flatten and dedupe shared equipment entries (each shared item appears
  // duplicated only when it's actually defined on multiple powers; spec says
  // "Don't duplicate" — only one concept owns the row. So flatten and treat
  // shared entries as full quantity (no split) since the whole tent owns it).
  const all: PowerEquipmentRow[] = [];
  for (const list of equipmentByPower.values()) {
    for (const e of list) {
      if (e.is_shared && contractIdsInTent.length > 0) {
        // collapse: count full quantity once
        all.push({ ...e, is_shared: false, shared_with_concepts: null });
      } else {
        all.push(e);
      }
    }
  }

  return POWER_TYPES.map((t) => {
    const demand = demandFor(all, t);
    const supply = sumSupply(powers, t);
    const gap = supply - demand;
    return { power_type: t, demand, supply, gap, status: statusFor(gap) };
  }).filter((r) => r.demand > 0 || r.supply > 0);
}
