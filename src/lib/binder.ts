import { supabase } from "@/integrations/supabase/client";

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
  cooling: any[];
  coolingAssignments: any[];
  safety: any | null;
  accommodation: any[];
  questions: any[];
  rules: any[];
  topskilt: any[];
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
      .select("id, concept_id, concept_alias, contract_status, contract_signed_date, signing_platform, contract_value_dkk, payment_terms, payment_status, counterparty_name, counterparty_cvr, key_obligations, contract_signed_by, operating_entity, inspection_date, site_clearance_deadline")
      .eq("festival_id", fid),
    sb.from("concepts").select("id, slug, name, display_order, color_hex").order("display_order"),
    sb.from("festival_transport").select("id, vehicle_type, capacity, status, notes, accreditation_pdf_path, accreditation_uploaded_at").eq("festival_id", fid),
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
    sb.from("festival_cooling_unit").select("*").eq("festival_id", fid).order("created_at"),
    contractIds.length
      ? sb.from("festival_cooling_unit_concepts").select("cooling_unit_id, festival_contract_id").in("festival_contract_id", contractIds)
      : Promise.resolve({ data: [] }),
    // Topskilt — try table; fall back to empty
    contractIds.length
      ? sb.from("festival_topskilt").select("*").in("festival_contract_id", contractIds).then((r: any) => ({ data: r.data ?? [] }), () => ({ data: [] }))
      : Promise.resolve({ data: [] }),
  ]);

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
    cooling: coolingRes.data ?? [],
    coolingAssignments: coolingAssignRes.data ?? [],
    safety: safetyRes.data ?? null,
    accommodation: accomRes.data ?? [],
    questions: questionsRes.data ?? [],
    rules: (rulesRes.data ?? []) as any[],
    topskilt: topskiltRes.data ?? [],
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
  { key: "facade", label: "Façade" },
  { key: "power", label: "Power" },
  { key: "cooling", label: "Cooling" },
  { key: "safety", label: "Safety" },
  { key: "accommodation", label: "Accommodation" },
  { key: "questions", label: "Open Questions" },
  { key: "rules", label: "Active Rules" },
] as const;

export type SectionKey = (typeof BINDER_SECTIONS)[number]["key"];
