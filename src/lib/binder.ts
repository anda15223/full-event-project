import { supabase } from "@/integrations/supabase/client";
import { getSoborgLoadingManifest, type SoborgLoadingManifest } from "@/lib/soborgLoading";

const sb: any = supabase;

export type BinderFestival = {
  id: string;
  slug: string;
  name: string;
  start_date: string;
  end_date: string;
  city?: string | null;
};

export type BinderData = {
  festival: BinderFestival;
  generatedAt: string;
  // Sections
  actionItems: any[];
  contacts: any[];
  primaryContacts: any[];
  timelineEvents: any[];
  contracts: any[];
  concepts: any[];
  transport: any[];
  transportLegs: any[];
  staff: any[];
  facade: any[];
  power: any[];
  powerEquipment: any[];
  cooling: any[];
  coolingAssignments: any[];
  safety: any | null;
  accommodation: any[];
  questions: any[];
  rules: any[];
  topskilt: any[];
  soborgLoading: SoborgLoadingManifest | null;
  // Block 4-5 additions
  hours: any[];
  safetyZones: any[];
  accommodationRooms: any[];
  conceptPrices: any[];          // festival_concept_prices rows
  conceptPriceItems: any[];      // festival_concept_price_item rows
  setupPhases: any[];            // festival_setup rows
  // Overview-derived
  criticalCount: number;
  overdueCount: number;
};

export async function loadBinderData(slug: string): Promise<BinderData | null> {
  const { data: f } = await sb.from("festivals")
    .select("id, slug, name, start_date, end_date, city").eq("slug", slug).maybeSingle();
  if (!f) return null;
  const fid = f.id;
  const today = new Date().toISOString().slice(0, 10);

  const queries = await Promise.all([
    sb.from("festival_action_items")
      .select("id, title, description, due_date, status, priority, owner, concept_id")
      .eq("festival_id", fid),
    sb.from("festival_contacts")
      .select("id, full_name, role, email, phone, organization, is_primary, contact_type, notes")
      .eq("festival_id", fid).order("is_primary", { ascending: false }).order("role"),
    sb.from("festival_timeline_event").select("*").eq("festival_id", fid)
      .order("event_date").order("event_time", { nullsFirst: false }),
    sb.from("festival_contracts")
      .select("id, concept_id, concept_alias, contract_status, contract_signed_date, signing_platform, contract_value_dkk, counterparty_name, counterparty_cvr, key_obligations, contract_signed_by, inspection_date, site_clearance_deadline")
      .eq("festival_id", fid).eq("is_active", true),
    sb.from("concepts").select("id, slug, name, display_order, color_hex").order("display_order"),
    sb.from("festival_transport").select("id, vehicle_type, capacity, status, notes, accreditation_pdf_path, accreditation_uploaded_at, license_plate, season_rental_id, season_rental:season_rentals(id, vehicle_type, capacity, license_plate, accreditation_pdf_path, accreditation_uploaded_at, ownership, reservation_number)").eq("festival_id", fid),
    sb.from("festival_staff").select("id, name, role, home_location, requires_transport, concept_id").eq("festival_id", fid),
    sb.from("festival_safety").select("*").eq("festival_id", fid).maybeSingle(),
    sb.from("festival_accommodation").select("*").eq("festival_id", fid).order("check_in_date"),
    sb.from("festival_open_questions")
      .select("id, question, context, status, priority, question_type, decision_owner, deadline, blocking_what")
      .eq("festival_id", fid).eq("status", "open").eq("visibility", "public"),
    sb.rpc("get_active_rules_for_festival", { festival_slug: slug }),
  ]);

  const [
    actionsRes, contactsRes, timelineRes, contractsRes, conceptsRes,
    transportRes, staffRes, safetyRes, accomRes, questionsRes, rulesRes,
  ] = queries;

  const contracts = contractsRes.data ?? [];
  const contractIds = contracts.map((c: any) => c.id);
  const transport = transportRes.data ?? [];
  const transportIds = transport.map((t: any) => t.id);

  const [legsRes, facadeRes, powerRes, coolingRes, coolingAssignRes, topskiltRes] = await Promise.all([
    transportIds.length
      ? sb.from("transport_legs").select("*").in("transport_id", transportIds).order("leg_date").order("leg_start_time")
      : Promise.resolve({ data: [] }),
    contractIds.length
      ? sb.from("festival_facade").select("*").in("festival_contract_id", contractIds)
      : Promise.resolve({ data: [] }),
    contractIds.length
      ? sb.from("festival_power").select("*").in("festival_contract_id", contractIds)
      : Promise.resolve({ data: [] }),
    sb.from("festival_cooling_unit")
      .select("id, festival_id, unit_label, cooling_model, container_type, container_count, supplier, delivery_date, pickup_date, status, cost_dkk, notes, pallet_count_kol, pallet_count_frys")
      .eq("festival_id", fid).order("created_at"),
    contractIds.length
      ? sb.from("festival_cooling_unit_concepts").select("cooling_unit_id, festival_contract_id").in("festival_contract_id", contractIds)
      : Promise.resolve({ data: [] }),
    contractIds.length
      ? sb.from("festival_topskilt").select("*").in("festival_contract_id", contractIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Power equipment — second hop, keyed by festival_power.id (ALL items, not just powered — Equipment section needs full inventory)
  const powerIds = (powerRes.data ?? []).map((p: any) => p.id);
  const peRes = powerIds.length
    ? await sb.from("festival_power_equipment")
        .select("id, festival_power_id, equipment_name, quantity, power_type, power_kw, is_shared, is_powered, category, loads_from_soborg, linked_facade_id, linked_topskilt_id, notes, position")
        .in("festival_power_id", powerIds).order("position")
    : { data: [] };

  const accomIds = (accomRes.data ?? []).map((a: any) => a.id);
  const [hoursRes, safetyZonesRes, accomRoomsRes, conceptPricesRes, setupRes] = await Promise.all([
    sb.from("festival_hours").select("*").eq("festival_id", fid).order("day_date"),
    sb.from("festival_safety_zone").select("*").eq("festival_id", fid).order("display_order").order("zone_label"),
    accomIds.length
      ? sb.from("festival_accommodation_room").select("*").in("accommodation_id", accomIds).order("position")
      : Promise.resolve({ data: [] }),
    sb.from("festival_concept_prices").select("*").eq("festival_id", fid),
    sb.from("festival_setup").select("*").eq("festival_id", fid).order("scheduled_start_at", { nullsFirst: false }).order("display_order"),
  ]);

  const priceParentIds = (conceptPricesRes.data ?? []).map((p: any) => p.id);
  const priceItemsRes = priceParentIds.length
    ? await sb.from("festival_concept_price_item").select("*").in("concept_prices_id", priceParentIds).order("display_order")
    : { data: [] };

  const soborgLoading = await getSoborgLoadingManifest(slug);

  const actionItems = (actionsRes.data ?? []) as any[];
  const overdueCount = actionItems.filter((a) => a.status !== "done" && a.status !== "closed" && a.due_date && a.due_date < today).length;
  const criticalCount = actionItems.filter((a) => a.status !== "done" && a.status !== "closed" && a.priority === "critical").length;

  return {
    festival: f,
    generatedAt: new Date().toISOString(),
    actionItems,
    contacts: contactsRes.data ?? [],
    primaryContacts: (contactsRes.data ?? []).filter((c: any) => c.is_primary),
    timelineEvents: timelineRes.data ?? [],
    contracts,
    concepts: conceptsRes.data ?? [],
    transport,
    transportLegs: legsRes.data ?? [],
    staff: staffRes.data ?? [],
    facade: facadeRes.data ?? [],
    power: powerRes.data ?? [],
    powerEquipment: peRes.data ?? [],
    cooling: coolingRes.data ?? [],
    coolingAssignments: coolingAssignRes.data ?? [],
    safety: safetyRes.data ?? null,
    accommodation: accomRes.data ?? [],
    questions: questionsRes.data ?? [],
    rules: (rulesRes.data ?? []) as any[],
    topskilt: topskiltRes.data ?? [],
    soborgLoading,
    hours: hoursRes.data ?? [],
    safetyZones: safetyZonesRes.data ?? [],
    accommodationRooms: accomRoomsRes.data ?? [],
    conceptPrices: conceptPricesRes.data ?? [],
    conceptPriceItems: priceItemsRes.data ?? [],
    setupPhases: setupRes.data ?? [],
    criticalCount,
    overdueCount,
  };
}

export const BINDER_SECTIONS = [
  { key: "overview", label: "Festival Overview" },
  { key: "actions", label: "Action Items" },
  { key: "contacts", label: "Key Contacts" },
  { key: "timeline", label: "Setup Timeline" },
  { key: "contracts", label: "Contracts" },
  { key: "transport", label: "Transport" },
  { key: "topskilt", label: "Topskilt" },
  { key: "facade", label: "Facade" },
  { key: "power", label: "Power" },
  { key: "cooling", label: "Cooling" },
  { key: "equipment", label: "Equipment" },
  { key: "accommodation", label: "Accommodation" },
  { key: "safety", label: "Safety" },
  { key: "prices", label: "Prices" },
  { key: "soborg_loading", label: "Søborg Loading Manifest" },
  { key: "questions", label: "Open Questions" },
  { key: "rules", label: "Active Rules" },
] as const;

export type SectionKey = (typeof BINDER_SECTIONS)[number]["key"];
