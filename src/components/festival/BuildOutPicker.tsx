import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Tent, Zap, Snowflake } from "lucide-react";

export type PickerCategory = "tent" | "power" | "cooling" | "other";

export type PickedItem = {
  label: string;
  spec?: string | null;
  qty?: number | null;
  dimensions?: string | null;
  area?: string | null;
  concept_id?: string | null;
  position_notes?: string | null;
};

const ICONS: Record<PickerCategory, any> = {
  tent: Tent, power: Zap, cooling: Snowflake, other: Plus,
};

/**
 * Picker for build-out rows. Lists items from this festival's database
 * (contracts / power / cooling) and lets the user choose which to add
 * as a prefilled build-out row. Also offers a "Blank row" option.
 */
export default function BuildOutPicker({
  category, festivalId, onPick, label,
}: {
  category: PickerCategory;
  festivalId: string;
  onPick: (item: PickedItem) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[category];

  const q = useQuery({
    queryKey: ["buildout-picker", category, festivalId],
    enabled: open && !!festivalId,
    queryFn: async () => {
      if (category === "tent") {
        const { data } = await supabase
          .from("festival_contracts")
          .select("id, concept_id, concept_alias, tent_size, tent_floor, tent_provided_by, stall_count, concept:concepts!concept_id(name)")
          .eq("festival_id", festivalId)
          .eq("is_active", true);
        return (data ?? []).map((c: any) => ({
          key: c.id,
          title: `${c.concept?.name ?? c.concept_alias ?? "Concept"} — tent`,
          subtitle: [c.tent_size, c.tent_floor, c.tent_provided_by && `by ${c.tent_provided_by}`].filter(Boolean).join(" · "),
          item: {
            label: `${c.concept?.name ?? c.concept_alias ?? "Concept"} tent`,
            spec: c.tent_size ?? null,
            dimensions: c.tent_size ?? null,
            qty: c.stall_count ?? 1,
            concept_id: c.concept_id,
            position_notes: c.tent_floor ? `Floor: ${c.tent_floor}` : null,
          } as PickedItem,
        }));
      }
      if (category === "power") {
        const { data: contracts } = await supabase
          .from("festival_contracts")
          .select("id, concept_id, concept_alias, concept:concepts!concept_id(name)")
          .eq("festival_id", festivalId)
          .eq("is_active", true);
        const ids = (contracts ?? []).map((c: any) => c.id);
        if (ids.length === 0) return [];
        const { data: power } = await supabase
          .from("festival_power")
          .select("festival_contract_id, connections_16a_240v, connections_16a_400v, connections_32a, connections_63a, connections_125a, total_kw_estimate, tent_location, notes")
          .in("festival_contract_id", ids);
        return (power ?? []).map((p: any) => {
          const c = (contracts ?? []).find((x: any) => x.id === p.festival_contract_id);
          const parts: string[] = [];
          if (p.connections_16a_240v) parts.push(`${p.connections_16a_240v}×16A/240V`);
          if (p.connections_16a_400v) parts.push(`${p.connections_16a_400v}×16A/400V`);
          if (p.connections_32a) parts.push(`${p.connections_32a}×32A`);
          if (p.connections_63a) parts.push(`${p.connections_63a}×63A`);
          if (p.connections_125a) parts.push(`${p.connections_125a}×125A`);
          const spec = parts.join(" · ") || (p.total_kw_estimate ? `${p.total_kw_estimate} kW` : "");
          const name = c?.concept?.name ?? c?.concept_alias ?? "Concept";
          return {
            key: p.festival_contract_id,
            title: `${name} — power`,
            subtitle: spec || "no connections set",
            item: {
              label: `${name} power`,
              spec,
              concept_id: c?.concept_id ?? null,
              area: p.tent_location ?? null,
              position_notes: p.notes ?? null,
            } as PickedItem,
          };
        });
      }
      if (category === "cooling") {
        const { data } = await supabase
          .from("festival_cooling")
          .select("id, unit_type, power_connection, electrical_cable_length_m, supplier_ref, delivery_date")
          .eq("festival_id", festivalId);
        return (data ?? []).map((u: any) => ({
          key: u.id,
          title: u.unit_type ?? "Cooling unit",
          subtitle: [u.power_connection, u.electrical_cable_length_m && `${u.electrical_cable_length_m}m cable`, u.supplier_ref].filter(Boolean).join(" · "),
          item: {
            label: u.unit_type ?? "Cooling unit",
            spec: u.power_connection ?? null,
            qty: 1,
            position_notes: u.electrical_cable_length_m ? `Cable: ${u.electrical_cable_length_m} m` : null,
          } as PickedItem,
        }));
      }
      return [];
    },
  });

  const items = q.data ?? [];

  const pick = (it: PickedItem) => {
    onPick(it);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-[11px]">
          <Plus className="h-3 w-3 mr-1" /> {label ?? `Add ${category}`}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Icon className="h-4 w-4" /> Add {category} — from this festival
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {q.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : items.length === 0 ? (
            <div className="text-xs text-muted-foreground italic px-1">
              No {category} items found in this festival's database yet. Add them on the{" "}
              {category === "tent" ? "Contracts" : category === "power" ? "Power" : "Cooling"} page,
              or insert a blank row below.
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto space-y-1.5">
              {items.map((it: any) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => pick(it.item)}
                  className="w-full text-left rounded-md border bg-background hover:bg-muted/40 px-3 py-2 transition"
                >
                  <div className="text-xs font-medium">{it.title}</div>
                  {it.subtitle && (
                    <div className="text-[11px] text-muted-foreground truncate">{it.subtitle}</div>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="pt-2 border-t flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground">Scoped to this festival only</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => pick({ label: "" })}
            >
              + Blank row
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
