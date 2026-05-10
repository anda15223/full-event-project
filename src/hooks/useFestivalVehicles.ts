import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LoadingVehicle = { id: string; vehicle_type: string };

/**
 * Returns festival_transport rows that have loading capacity
 * (lift vehicles, Iveco, vans, 9-seater). Excludes passenger cars.
 *
 * Phase 2K-3: name comes from canonical season_rentals via JOIN, with
 * defensive fallback to the legacy festival_transport.vehicle_type column.
 */
export function useFestivalVehicles(festivalId: string | undefined | null) {
  const q = useQuery({
    queryKey: ["festival-loading-vehicles", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_transport")
        .select("id, vehicle_type, season_rental:season_rentals(vehicle_type)")
        .eq("festival_id", festivalId!)
        .order("vehicle_type", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const filtered = rows
        .map((r) => ({
          id: r.id as string,
          vehicle_type: (r.season_rental?.vehicle_type ?? r.vehicle_type ?? "") as string,
        }))
        .filter((r) => {
          const n = r.vehicle_type.toLowerCase();
          return (
            n.includes("lift") ||
            n.includes("iveco") ||
            n.includes("van") ||
            n.includes("9-seater")
          );
        })
        .sort((a, b) => a.vehicle_type.localeCompare(b.vehicle_type));
      return filtered as LoadingVehicle[];
    },
    enabled: !!festivalId,
  });
  return { vehicles: q.data ?? [], loading: q.isLoading };
}
