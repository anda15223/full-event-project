import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFestivalVehicles } from "@/hooks/useFestivalVehicles";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  festivalId: string;
  contractId: string;
  currentVehicleId: string | null;
  className?: string;
  size?: "sm" | "md";
}

const NONE = "__none";

export function VehicleSelector({ festivalId, contractId, currentVehicleId, className, size = "sm" }: Props) {
  const qc = useQueryClient();
  const { vehicles, loading } = useFestivalVehicles(festivalId);

  const update = useMutation({
    mutationFn: async (vehicleId: string | null) => {
      const { error } = await supabase
        .from("festival_contracts")
        .update({ assigned_vehicle_id: vehicleId })
        .eq("id", contractId);
      if (error) throw error;
      return vehicleId;
    },
    onSuccess: () => {
      toast.success("Vehicle assignment saved");
      // Refresh anything that joins on assigned_vehicle_id
      qc.invalidateQueries({ queryKey: ["festival-contracts-grid", festivalId] });
      qc.invalidateQueries({ queryKey: ["festival-contracts"] });
      qc.invalidateQueries({ queryKey: ["festival-power"] });
      qc.invalidateQueries({ queryKey: ["festival-power-equipment"] });
      qc.invalidateQueries({ queryKey: ["festival-facade"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save vehicle"),
  });

  const isUnassigned = !currentVehicleId;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs text-muted-foreground whitespace-nowrap">🚚 Pack into:</span>
      <Select
        value={currentVehicleId ?? NONE}
        onValueChange={(v) => update.mutate(v === NONE ? null : v)}
        disabled={loading || update.isPending}
      >
        <SelectTrigger
          className={cn(
            size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
            isUnassigned && "border-amber-500/60 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200",
          )}
        >
          <SelectValue placeholder="— unassigned —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— unassigned —</SelectItem>
          {vehicles.map((v) => (
            <SelectItem key={v.id} value={v.id}>{v.vehicle_type}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
