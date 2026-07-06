import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LoadingVehicle = { id: string; vehicle_type: string; license_plate?: string | null };

/**
 * Returns ALL festival_transport rows for the festival, so the "Pack into"
 * selector in Equipment stays in sync with the Transport section. Any vehicle
 * created there is immediately available to assign as a packing vehicle.
 * Name comes from the linked season_rental first, then falls back to the
 * free-form vehicle_type column.
 */
export function useFestivalVehicles(festivalId: string | undefined | null) {
  const q = useQuery({
    queryKey: ["festival-loading-vehicles", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_transport")
        .select("id, vehicle_type, license_plate, season_rental:season_rentals(vehicle_type, license_plate)")
        .eq("festival_id", festivalId!)
        .order("vehicle_type", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return rows
        .map((r) => ({
          id: r.id as string,
          vehicle_type: (r.season_rental?.vehicle_type ?? r.vehicle_type ?? "Vehicle") as string,
          license_plate: (r.season_rental?.license_plate ?? r.license_plate ?? null) as string | null,
        }))
        .sort((a, b) => a.vehicle_type.localeCompare(b.vehicle_type)) as LoadingVehicle[];
    },
    enabled: !!festivalId,
  });
  return { vehicles: q.data ?? [], loading: q.isLoading };
}
