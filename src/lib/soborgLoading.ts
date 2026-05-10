import { supabase } from "@/integrations/supabase/client";

const sb: any = supabase;

export type LoadingItem = {
  id: string;
  name: string;
  quantity: number;
  power_type: string | null;
  power_kw: number | null;
  is_shared: boolean;
  notes: string | null;
  category: string;
};

export type ConceptGroup = {
  concept_id: string;
  concept_slug: string;
  concept_name: string;
  contract_id: string;
  concept_alias: string | null;
  items_by_category: Record<string, LoadingItem[]>;
  total_items: number;
};

export type VehicleGroup = {
  vehicle_id: string;
  vehicle_type: string;
  license_plate: string | null;
  concepts: ConceptGroup[];
  car_total_items: number;
};

export type CoolingItem = {
  id: string;
  unit_label: string;
  cooling_model: string | null;
  container_type: string | null;
  supplier: string | null;
  delivery_date: string | null;
  pickup_date: string | null;
  quantity: number;
};

export type SoborgLoadingManifest = {
  festival: { id: string; slug: string; name: string; start_date: string; end_date: string };
  vehicles: VehicleGroup[];
  unassigned: { concepts: ConceptGroup[] };
  not_loaded_from_soborg: { items: CoolingItem[] };
  total_items: number;
};

const CATEGORY_ORDER = [
  "cooking", "table", "scaffold", "trolley", "pos", "prep", "sink",
  "popup_tent", "facade", "topskilt", "other",
];

export function categoryLabel(cat: string): string {
  switch (cat) {
    case "cooking": return "Cooking equipment";
    case "table": return "Tables";
    case "scaffold": return "Scaffold bars";
    case "trolley": return "Trolleys";
    case "pos": return "POS / cash registers";
    case "prep": return "Prep tables";
    case "sink": return "Sinks";
    case "popup_tent": return "Pop-up tents";
    case "facade": return "Facade";
    case "topskilt": return "Topskilt";
    default: return cat.charAt(0).toUpperCase() + cat.slice(1);
  }
}

export function sortedCategories(map: Record<string, LoadingItem[]>): string[] {
  const keys = Object.keys(map);
  return keys.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export async function getSoborgLoadingManifest(festivalSlug: string): Promise<SoborgLoadingManifest | null> {
  const { data: f } = await sb.from("festivals")
    .select("id, slug, name, start_date, end_date")
    .eq("slug", festivalSlug).maybeSingle();
  if (!f) return null;
  const fid = f.id;

  const [contractsRes, transportRes, conceptsRes, coolingRes] = await Promise.all([
    sb.from("festival_contracts")
      .select("id, concept_id, concept_alias, assigned_vehicle_id")
      .eq("festival_id", fid),
    sb.from("festival_transport").select("id, vehicle_type, license_plate").eq("festival_id", fid),
    sb.from("concepts").select("id, slug, name, display_order"),
    sb.from("festival_cooling_unit")
      .select("id, unit_label, cooling_model, container_type, container_count, supplier, delivery_date, pickup_date")
      .eq("festival_id", fid),
  ]);

  const contracts = (contractsRes.data ?? []) as any[];
  const transport = (transportRes.data ?? []) as any[];
  const concepts = (conceptsRes.data ?? []) as any[];
  const cooling = (coolingRes.data ?? []) as any[];

  const conceptById = new Map(concepts.map((c: any) => [c.id, c]));
  const vehicleById = new Map(transport.map((v: any) => [v.id, v]));
  const contractById = new Map(contracts.map((k: any) => [k.id, k]));

  // Fetch power records and equipment
  const contractIds = contracts.map((c: any) => c.id);
  const powerRes = contractIds.length
    ? await sb.from("festival_power").select("id, festival_contract_id").in("festival_contract_id", contractIds)
    : { data: [] };
  const powers = (powerRes.data ?? []) as any[];
  const powerToContract = new Map(powers.map((p: any) => [p.id, p.festival_contract_id]));
  const powerIds = powers.map((p: any) => p.id);

  const eqRes = powerIds.length
    ? await sb.from("festival_power_equipment")
        .select("id, festival_power_id, equipment_name, quantity, power_type, power_kw, is_shared, notes, category, loads_from_soborg, position")
        .in("festival_power_id", powerIds)
        .eq("loads_from_soborg", true)
        .order("position")
    : { data: [] };
  const equipment = (eqRes.data ?? []) as any[];

  // Build a per-contract concept group (only those that have at least 1 item)
  const conceptGroupByContract = new Map<string, ConceptGroup>();
  function ensureGroup(contractId: string): ConceptGroup | null {
    const k = contractById.get(contractId);
    if (!k) return null;
    let grp = conceptGroupByContract.get(contractId);
    if (!grp) {
      const c = conceptById.get(k.concept_id);
      grp = {
        concept_id: k.concept_id,
        concept_slug: c?.slug ?? "",
        concept_name: c?.name ?? "—",
        contract_id: contractId,
        concept_alias: k.concept_alias ?? null,
        items_by_category: {},
        total_items: 0,
      };
      conceptGroupByContract.set(contractId, grp);
    }
    return grp;
  }

  for (const e of equipment) {
    const contractId = powerToContract.get(e.festival_power_id);
    if (!contractId) continue;
    const grp = ensureGroup(contractId);
    if (!grp) continue;
    const cat = e.category || "other";
    const arr = grp.items_by_category[cat] ?? (grp.items_by_category[cat] = []);
    arr.push({
      id: e.id,
      name: e.equipment_name,
      quantity: e.quantity ?? 1,
      power_type: e.power_type,
      power_kw: e.power_kw,
      is_shared: !!e.is_shared,
      notes: e.notes,
      category: cat,
    });
    grp.total_items += e.quantity ?? 1;
  }

  // Bucket concept groups by vehicle (only contracts with at least 1 item)
  const vehicleMap = new Map<string, VehicleGroup>();
  const unassigned: ConceptGroup[] = [];

  for (const [contractId, grp] of conceptGroupByContract) {
    const k = contractById.get(contractId);
    const vehId = k?.assigned_vehicle_id;
    if (!vehId) {
      unassigned.push(grp);
      continue;
    }
    const veh = vehicleById.get(vehId);
    let vg = vehicleMap.get(vehId);
    if (!vg) {
      vg = {
        vehicle_id: vehId,
        vehicle_type: veh?.vehicle_type ?? "Unknown vehicle",
        license_plate: veh?.license_plate ?? null,
        concepts: [],
        car_total_items: 0,
      };
      vehicleMap.set(vehId, vg);
    }
    vg.concepts.push(grp);
    vg.car_total_items += grp.total_items;
  }

  // Also include concepts with NO equipment but with assigned_vehicle_id? Skip; loading manifest is about items.
  // Surface unassigned concepts that have NO equipment but exist as contracts? Per spec — "concepts without
  // assigned_vehicle_id" warns. Include any contract w/o vehicle even with zero items, so user can assign.
  for (const k of contracts) {
    if (k.assigned_vehicle_id) continue;
    if (conceptGroupByContract.has(k.id)) continue;
    const c = conceptById.get(k.concept_id);
    unassigned.push({
      concept_id: k.concept_id,
      concept_slug: c?.slug ?? "",
      concept_name: c?.name ?? "—",
      contract_id: k.id,
      concept_alias: k.concept_alias ?? null,
      items_by_category: {},
      total_items: 0,
    });
  }

  // Sort vehicles by vehicle_type, concepts inside by name
  const vehicles = [...vehicleMap.values()].sort((a, b) => a.vehicle_type.localeCompare(b.vehicle_type));
  vehicles.forEach((v) => v.concepts.sort((a, b) => a.concept_name.localeCompare(b.concept_name)));
  unassigned.sort((a, b) => a.concept_name.localeCompare(b.concept_name));

  const total_items = vehicles.reduce((s, v) => s + v.car_total_items, 0);

  // Cooling: delivered on-site
  const coolingItems: CoolingItem[] = cooling.map((u: any) => ({
    id: u.id,
    unit_label: u.unit_label,
    cooling_model: u.cooling_model,
    container_type: u.container_type,
    supplier: u.supplier,
    delivery_date: u.delivery_date,
    pickup_date: u.pickup_date,
    quantity: u.container_count ?? 1,
  }));

  return {
    festival: f,
    vehicles,
    unassigned: { concepts: unassigned },
    not_loaded_from_soborg: { items: coolingItems },
    total_items,
  };
}
