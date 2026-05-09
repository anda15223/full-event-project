import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LoadingVehicle = { id: string; vehicle_type: string };

/**
 * Returns festival_transport rows that have loading capacity
 * (lift vehicles, Iveco, vans). Excludes passenger cars.
 */
export function useFestivalVehicles(festivalId: string | undefined | null) {
  const q = useQuery({
    queryKey: ["festival-loading-vehicles", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_transport")
        .select("id, vehicle_type")
        .eq("festival_id", festivalId!)
        .or(
          "vehicle_type.ilike.%lift vehicle%,vehicle_type.ilike.%iveco%,vehicle_type.ilike.%van%",
        )
        .order("vehicle_type", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LoadingVehicle[];
    },
    enabled: !!festivalId,
  });
  return { vehicles: q.data ?? [], loading: q.isLoading };
}
