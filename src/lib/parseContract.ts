import { supabase } from "@/integrations/supabase/client";

export interface ContractSummary {
  festival: {
    name: string;
    festival_entity: string;
    stadeholder_entity: string;
  };
  dates: {
    festival_days: string[];
    opening_hours: string[];
    setup_access: string;
    camping: string;
  };
  contacts: Array<{
    role: string;
    name: string;
    email: string;
    phone: string;
  }>;
  menu: Array<{
    item: string;
    concept: string;
    lactose_free: string;
    gluten_free: string;
    vegetarian: string;
    vegan: string;
    local: string;
  }>;
  location: {
    venue: string;
    kommune: string;
    stand_placement_status: string;
  };
  cost: {
    commission_pct: string;
    deposit: string;
    penalty_per_breach: string;
    ip_breach_penalty: string;
    late_order_fee: string;
    meal_ticket_price: string;
    settlement_terms: string;
  };
  deadlines: Array<{
    date: string;
    item: string;
    clause_ref: string;
  }>;
  obligations: string[];
}

export async function parseContractSummary(
  contractText: string,
  contractId?: string,
): Promise<ContractSummary> {
  const { data, error } = await supabase.functions.invoke("parse-contract", {
    body: { contractText, contractId },
  });
  if (error) throw new Error(error.message ?? "Failed to parse contract");
  if (!data?.summary) throw new Error("No summary returned");
  return data.summary as ContractSummary;
}
