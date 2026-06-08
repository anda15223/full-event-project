import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Tent, Zap, Snowflake, Droplet, FileText, Flame, Table2 } from "lucide-react";

/**
 * Read-only reference panel that aggregates per-festival source data for the
 * Fidibus build-out brief: tents (from contracts), power (from power page),
 * cooling (from cooling page), water/production notes (from power+contract notes).
 *
 * Per-festival — every query is scoped to `festivalId`. No cross-festival leakage.
 */
export default function BuildOutReferencePanel({ festivalId }: { festivalId: string }) {
  const [open, setOpen] = useState(true);

  // Concepts active for this festival's contracts
  const contractsQ = useQuery({
    queryKey: ["buildout-ref-contracts", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select(
          "id, concept_id, concept_alias, tent_provided_by, tent_size, tent_floor, power_in_contract, stall_count, notes, concept:concepts!concept_id(name, slug)"
        )
        .eq("festival_id", festivalId)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const contractIds = (contractsQ.data ?? []).map((c) => c.id);

  const powerQ = useQuery({
    queryKey: ["buildout-ref-power", festivalId, contractIds.join(",")],
    enabled: contractIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_power")
        .select(
          "id, festival_contract_id, connections_16a_240v, connections_16a_400v, connections_32a, connections_63a, connections_125a, total_kw_estimate, total_amp_estimate, tableau_count, equipment_breakdown, supplier, notes, tent_location"
        )
        .in("festival_contract_id", contractIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const coolingQ = useQuery({
    queryKey: ["buildout-ref-cooling", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_cooling")
        .select(
          "id, unit_type, supplier_ref, delivery_date, pickup_date, power_connection, electrical_cable_length_m, lock_count, contract_notes, notes"
        )
        .eq("festival_id", festivalId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const powerIds = useMemo(
    () => (powerQ.data ?? []).map((p: any) => p.id).filter(Boolean),
    [powerQ.data],
  );

  const equipmentQ = useQuery({
    queryKey: ["buildout-ref-equipment", festivalId, powerIds.join(",")],
    enabled: powerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_power_equipment")
        .select("id, festival_power_id, equipment_name, quantity, category, notes, power_type, is_powered")
        .in("festival_power_id", powerIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const vehiclesQ = useQuery({
    queryKey: ["buildout-ref-vehicles", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_staff_vehicles")
        .select("id, vehicle_name, vehicle_type, load_manifest, notes")
        .eq("festival_id", festivalId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const loading = contractsQ.isLoading || powerQ.isLoading || coolingQ.isLoading;
  const contracts = contractsQ.data ?? [];
  const powerByContract = new Map<string, any>();
  (powerQ.data ?? []).forEach((p) => powerByContract.set(p.festival_contract_id, p));
  const powerIdToContract = new Map<string, string>();
  (powerQ.data ?? []).forEach((p: any) => powerIdToContract.set(p.id, p.festival_contract_id));
  const cooling = coolingQ.data ?? [];
  const equipment = equipmentQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];

  const conceptLabelForPowerId = (powerId: string) => {
    const cId = powerIdToContract.get(powerId);
    const c = contracts.find((x) => x.id === cId);
    return c?.concept?.name ?? c?.concept_alias ?? "—";
  };

  const tablesScaffolding = equipment.filter(
    (e: any) => e.category === "table" || e.category === "scaffold",
  );
  const gasItems = equipment.filter(
    (e: any) =>
      /\bgas\b|gasblus|gasovn|gasflaske|propane|propan/i.test(e.equipment_name ?? "") ||
      /\bgas\b/i.test(e.notes ?? ""),
  );
  const hasAnyGas = gasItems.length > 0;

  const conn = (p: any) => {
    if (!p) return null;
    const parts: string[] = [];
    if (p.connections_16a_240v) parts.push(`${p.connections_16a_240v}× 16A/240V`);
    if (p.connections_16a_400v) parts.push(`${p.connections_16a_400v}× 16A/400V`);
    if (p.connections_32a) parts.push(`${p.connections_32a}× 32A`);
    if (p.connections_63a) parts.push(`${p.connections_63a}× 63A`);
    if (p.connections_125a) parts.push(`${p.connections_125a}× 125A`);
    return parts.length ? parts.join(" · ") : null;
  };

  // Water/production notes — pull from contract notes + power notes / equipment_breakdown
  const productionNotes: { source: string; text: string }[] = [];
  contracts.forEach((c) => {
    if (c.notes && /water|vand|drain|afløb|sink|hose|hane/i.test(c.notes)) {
      productionNotes.push({ source: `Contract · ${c.concept?.name ?? c.concept_alias ?? ""}`, text: c.notes });
    }
  });
  (powerQ.data ?? []).forEach((p) => {
    const c = contracts.find((x) => x.id === p.festival_contract_id);
    const label = c?.concept?.name ?? c?.concept_alias ?? "Concept";
    if (p.notes) productionNotes.push({ source: `Power notes · ${label}`, text: p.notes });
    if (p.equipment_breakdown && typeof p.equipment_breakdown === "string")
      productionNotes.push({ source: `Equipment breakdown · ${label}`, text: p.equipment_breakdown });
  });

  return (
    <div className="rounded-lg border bg-blue-50/30 dark:bg-blue-950/10 border-blue-200/50 dark:border-blue-900/40 print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-blue-900 dark:text-blue-200 hover:bg-blue-100/40 dark:hover:bg-blue-900/20 rounded-t-lg"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <FileText className="h-3.5 w-3.5" />
          Reference — what this festival actually booked
        </span>
        <span className="text-[10px] font-normal text-blue-700/70 dark:text-blue-300/60">read-only · from contracts, power, cooling</span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 text-[11px]">
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {/* Tents & power per concept */}
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  <Tent className="h-3 w-3" /> Tents & power · per concept
                </div>
                {contracts.length === 0 ? (
                  <div className="italic text-muted-foreground">No active contracts for this festival yet.</div>
                ) : (
                  <div className="rounded-md border bg-background/60 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="text-left px-2 py-1 font-medium">Concept</th>
                          <th className="text-left px-2 py-1 font-medium">Tent</th>
                          <th className="text-left px-2 py-1 font-medium">Floor</th>
                          <th className="text-left px-2 py-1 font-medium">Provided by</th>
                          <th className="text-left px-2 py-1 font-medium">Power (contract)</th>
                          <th className="text-left px-2 py-1 font-medium">Power booked</th>
                          <th className="text-left px-2 py-1 font-medium">kW</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contracts.map((c) => {
                          const p = powerByContract.get(c.id);
                          return (
                            <tr key={c.id} className="border-t border-border/50 align-top">
                              <td className="px-2 py-1 font-medium">{c.concept?.name ?? c.concept_alias ?? "—"}</td>
                              <td className="px-2 py-1">{c.tent_size ?? "—"}</td>
                              <td className="px-2 py-1">{c.tent_floor ?? "—"}</td>
                              <td className="px-2 py-1">{c.tent_provided_by ?? "—"}</td>
                              <td className="px-2 py-1">{c.power_in_contract ?? "—"}</td>
                              <td className="px-2 py-1">{conn(p) ?? <span className="text-muted-foreground italic">not booked</span>}</td>
                              <td className="px-2 py-1">{p?.total_kw_estimate ?? "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Cooling units */}
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  <Snowflake className="h-3 w-3" /> Cooling units booked
                </div>
                {cooling.length === 0 ? (
                  <div className="italic text-muted-foreground">No cooling units booked.</div>
                ) : (
                  <div className="rounded-md border bg-background/60 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="text-left px-2 py-1 font-medium">Unit</th>
                          <th className="text-left px-2 py-1 font-medium">Power</th>
                          <th className="text-left px-2 py-1 font-medium">Cable (m)</th>
                          <th className="text-left px-2 py-1 font-medium">Delivery</th>
                          <th className="text-left px-2 py-1 font-medium">Pickup</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cooling.map((u) => (
                          <tr key={u.id} className="border-t border-border/50">
                            <td className="px-2 py-1 font-medium">{u.unit_type ?? "—"}</td>
                            <td className="px-2 py-1">{u.power_connection ?? "—"}</td>
                            <td className="px-2 py-1">{u.electrical_cable_length_m ?? "—"}</td>
                            <td className="px-2 py-1">{u.delivery_date ?? "—"}</td>
                            <td className="px-2 py-1">{u.pickup_date ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Gas or no gas */}
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  <Flame className="h-3 w-3" /> Gas appliances
                  <span className={"ml-2 px-1.5 py-0.5 rounded text-[9px] font-semibold " + (hasAnyGas ? "bg-orange-500/15 text-orange-700 dark:text-orange-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300")}>
                    {hasAnyGas ? "GAS ON SITE" : "NO GAS"}
                  </span>
                </div>
                {!hasAnyGas ? (
                  <div className="italic text-muted-foreground">No gas-fuelled equipment detected on the power equipment list.</div>
                ) : (
                  <ul className="space-y-1">
                    {gasItems.map((e: any) => (
                      <li key={e.id} className="rounded border bg-background/60 px-2 py-1 flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground min-w-[80px]">{conceptLabelForPowerId(e.festival_power_id)}</span>
                        <span className="font-medium">{e.equipment_name}</span>
                        {e.quantity ? <span className="text-muted-foreground">× {e.quantity}</span> : null}
                        {e.notes ? <span className="text-muted-foreground italic truncate">— {e.notes}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Tables & scaffolding */}
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  <Table2 className="h-3 w-3" /> Tables & scaffolding (from equipment list)
                </div>
                {tablesScaffolding.length === 0 ? (
                  <div className="italic text-muted-foreground">No tables or scaffolding on the equipment list.</div>
                ) : (
                  <ul className="space-y-1">
                    {tablesScaffolding.map((e: any) => (
                      <li key={e.id} className="rounded border bg-background/60 px-2 py-1 flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground min-w-[80px]">{conceptLabelForPowerId(e.festival_power_id)}</span>
                        <span className={"px-1.5 py-0.5 rounded text-[9px] font-medium " + (e.category === "table" ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "bg-violet-500/15 text-violet-700 dark:text-violet-300")}>
                          {e.category}
                        </span>
                        <span className="font-medium">{e.equipment_name}</span>
                        {e.quantity ? <span className="text-muted-foreground">× {e.quantity}</span> : null}
                        {e.notes ? <span className="text-muted-foreground italic truncate">— {e.notes}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Cars / vehicles load manifest */}
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  <Zap className="h-3 w-3" /> Cars list — load manifests
                </div>
                {vehicles.length === 0 ? (
                  <div className="italic text-muted-foreground">No vehicles assigned for this festival.</div>
                ) : (
                  <ul className="space-y-1">
                    {vehicles.map((v: any) => (
                      <li key={v.id} className="rounded border bg-background/60 px-2 py-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{v.vehicle_name ?? v.vehicle_type ?? "Vehicle"}</span>
                          {v.vehicle_type ? <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{v.vehicle_type}</span> : null}
                        </div>
                        {v.load_manifest && <div className="whitespace-pre-wrap text-muted-foreground mt-0.5">{v.load_manifest}</div>}
                        {v.notes && <div className="whitespace-pre-wrap text-muted-foreground italic mt-0.5">{v.notes}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>


              {/* Water / production notes */}
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  <Droplet className="h-3 w-3" /> Water & production notes
                </div>
                {productionNotes.length === 0 ? (
                  <div className="italic text-muted-foreground">
                    No water / production notes captured yet. Add them in Contract notes, Power notes, or the Equipment breakdown.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {productionNotes.map((n, i) => (
                      <li key={i} className="rounded border bg-background/60 px-2 py-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{n.source}</div>
                        <div className="whitespace-pre-wrap">{n.text}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center gap-1 text-[10px] text-muted-foreground border-t pt-2">
                <Zap className="h-2.5 w-2.5" />
                Reference only — copy what's needed into the build-out rows below. Edits happen on the source pages (Contracts, Power, Cooling).
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
