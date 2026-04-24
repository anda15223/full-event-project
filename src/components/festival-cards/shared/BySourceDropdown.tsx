import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type BySource = "by_us" | "by_festival";

interface Props {
  value: BySource;
  onChange: (next: BySource) => void;
  /** Festival this item belongs to (required for equipment_db registration). */
  festivalId: string;
  /** Item label, e.g. "Pølsevogn", "Kaffemaskine". Required when value="by_us". */
  itemName: string;
  /** Card this dropdown lives in, e.g. "cooking_equipment". Used for dedup + provenance. */
  cardOrigin: string;
  /** Optional initial quantity to store on equipment row. */
  quantity?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Dropdown choosing whether an item is supplied "by us" or "by the festival".
 * When "by_us" is selected, an equipment_db row is upserted (festival_id + item_name + card_origin).
 * When switching back to "by_festival", the row's source is updated.
 */
export function BySourceDropdown({
  value, onChange, festivalId, itemName, cardOrigin, quantity, className, disabled,
}: Props) {
  const qc = useQueryClient();
  const [pendingValue, setPendingValue] = useState<BySource | null>(null);

  const upsertMut = useMutation({
    mutationFn: async (next: BySource) => {
      if (!festivalId || !itemName?.trim() || !cardOrigin) {
        throw new Error("Missing festival, item name or card origin");
      }
      // Look for existing row first (UNIQUE on festival_id + item_name + card_origin)
      const { data: existing, error: selErr } = await supabase
        .from("equipment_db")
        .select("id")
        .eq("festival_id", festivalId)
        .eq("item_name", itemName.trim())
        .eq("card_origin", cardOrigin)
        .maybeSingle();
      if (selErr && selErr.code !== "PGRST116") throw selErr;

      if (existing) {
        const { error } = await supabase
          .from("equipment_db")
          .update({ source: next, ...(quantity ? { quantity } : {}) })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("equipment_db").insert({
          festival_id: festivalId,
          item_name: itemName.trim(),
          card_origin: cardOrigin,
          source: next,
          status: "pending",
          quantity: quantity ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, next) => {
      qc.invalidateQueries({ queryKey: ["equipment_db", festivalId] });
      onChange(next);
      toast.success(next === "by_us" ? "Added to our equipment list" : "Marked as provided by festival");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not register equipment"),
    onSettled: () => setPendingValue(null),
  });

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const v = next as BySource;
        setPendingValue(v);
        upsertMut.mutate(v);
      }}
      disabled={disabled || upsertMut.isPending}
    >
      <SelectTrigger className={className ?? "h-8 w-[150px] text-xs"}>
        {upsertMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="by_us" className="text-xs">By us</SelectItem>
        <SelectItem value="by_festival" className="text-xs">By festival</SelectItem>
      </SelectContent>
    </Select>
  );
}

export default BySourceDropdown;
