import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FestivalTileCounts = {
  topskiltCount: number | null;
  setupCount: number | null;
  equipmentCount: number | null;
  equipmentTotalKw: number | null;
  facadeCount: number | null;
  facadeApprovedCount: number | null;
  powerCount: number | null;
  powerTotalKw: number | null;
  powerOrderUploadedCount: number | null;
  safetyOpenCount: number | null;
  safetyTotalCount: number | null;
  accommodationCount: number | null;
  accommodationNights: number | null;
  pricesItemCount: number | null;
  pricesConceptCount: number | null;
};

const sb: any = supabase;

export function useFestivalTileCounts(festivalId: string | null) {
  const q = useQuery({
    queryKey: ["festival-tile-counts", festivalId],
    enabled: !!festivalId,
    queryFn: async (): Promise<FestivalTileCounts> => {
      const fid = festivalId!;

      // Get contract IDs first (needed for topskilt/facade/power which key off contract)
      const { data: contracts } = await sb
        .from("festival_contracts")
        .select("id")
        .eq("festival_id", fid)
        .eq("is_active", true);
      const contractIds = (contracts ?? []).map((c: any) => c.id);

      const inContracts = contractIds.length > 0;

      const [
        topskilt,
        setup,
        equipment,
        facade,
        power,
        safety,
        accommodation,
        prices,
      ] = await Promise.all([
        inContracts
          ? sb.from("festival_topskilt").select("id", { count: "exact", head: true }).in("festival_contract_id", contractIds)
          : Promise.resolve({ count: 0 }),
        sb.from("festival_setup").select("id", { count: "exact", head: true }).eq("festival_id", fid),
        sb.from("festival_equipment").select("qty").eq("festival_id", fid),
        inContracts
          ? sb.from("festival_facade").select("id, design_status").in("festival_contract_id", contractIds)
          : Promise.resolve({ data: [] }),
        inContracts
          ? sb.from("festival_power").select("id, total_kw_estimate, order_list_file_path, festival_power_equipment(id)").in("festival_contract_id", contractIds)
          : Promise.resolve({ data: [] }),
        sb.from("festival_safety").select("id").eq("festival_id", fid),
        sb.from("festival_accommodation").select("id, check_in_date, check_out_date, capacity, assigned_staff_count").eq("festival_id", fid),
        sb.from("festival_concept_prices").select("id, festival_concept_price_item(id)").eq("festival_id", fid),
      ]);

      // Equipment: sum qty
      const eqRows = (equipment.data ?? []) as any[];
      const equipmentCount = eqRows.length
        ? eqRows.reduce((s, r) => s + (r.qty ?? 1), 0)
        : null;

      // Facade
      const facadeRows = (facade.data ?? []) as any[];
      const facadeCount = facadeRows.length || null;
      const printedSet = new Set(["printed", "approved", "ready", "complete"]);
      const facadeApprovedCount = facadeRows.length
        ? facadeRows.filter((r) => printedSet.has(String(r.design_status))).length
        : null;

      // Power — only count rows that actually have content (equipment items, kW estimate, or uploaded order list)
      const allPowerRows = (power.data ?? []) as any[];
      const powerRows = allPowerRows.filter((r) => {
        const hasEquip = Array.isArray(r.festival_power_equipment) && r.festival_power_equipment.length > 0;
        const hasKw = Number(r.total_kw_estimate) > 0;
        const hasOrder = !!r.order_list_file_path;
        return hasEquip || hasKw || hasOrder;
      });
      const powerCount = powerRows.length || null;
      const powerOrderUploadedCount = powerRows.length
        ? powerRows.filter((r) => !!r.order_list_file_path).length
        : null;
      const powerTotalKw = powerRows.length
        ? Math.round(powerRows.reduce((s, r) => s + (Number(r.total_kw_estimate) || 0), 0))
        : null;

      // Accommodation: derive nights as sum of (check_out - check_in) * (assigned_staff_count or capacity or 1)
      const accomRows = (accommodation.data ?? []) as any[];
      const accommodationCount = accomRows.length || null;
      let nights = 0;
      let anyNights = false;
      for (const r of accomRows) {
        if (r.check_in_date && r.check_out_date) {
          const ci = new Date(r.check_in_date + "T00:00:00").getTime();
          const co = new Date(r.check_out_date + "T00:00:00").getTime();
          const days = Math.max(0, Math.round((co - ci) / 86400000));
          const beds = r.assigned_staff_count ?? r.capacity ?? 1;
          nights += days * beds;
          anyNights = true;
        }
      }

      // Prices: count concepts with a price list + total items across them
      const priceRows = ((prices as any).data ?? []) as any[];
      const pricesConceptCount = priceRows.length || null;
      const pricesItemCount = priceRows.length
        ? priceRows.reduce((s, r) => s + ((r.festival_concept_price_item ?? []).length), 0) || null
        : null;

      return {
        topskiltCount: (topskilt as any).count ?? null,
        setupCount: (setup as any).count ?? null,
        equipmentCount,
        equipmentTotalKw: null,
        facadeCount,
        facadeApprovedCount,
        powerCount,
        powerTotalKw,
        powerOrderUploadedCount,
        safetyOpenCount: null,
        safetyTotalCount: ((safety.data ?? []) as any[]).length || null,
        accommodationCount,
        accommodationNights: anyNights ? nights : null,
        pricesItemCount,
        pricesConceptCount,
      };
    },
  });

  return { ...(q.data ?? {} as FestivalTileCounts), isLoading: q.isLoading };
}
