import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown, ChevronRight, Truck, Flame, FileText, ListOrdered, Snowflake,
} from "lucide-react";
import {
  getSoborgLoadingManifest, sortedCategories, categoryLabel,
  type SoborgLoadingManifest, type LoadingItem,
} from "@/lib/soborgLoading";

/**
 * Read-only reference panel for the Fidibus build-out brief.
 *
 * Single source of truth = the Søborg loading manifest (per vehicle → per concept
 * → per category: tables, scaffolding, trolleys, cooking equipment, …).
 *
 * Also surfaces:
 *  - the festival's "order list" rows from the Power & Order card
 *  - a derived "gas / no gas" indicator from the manifest item names
 *  - cooling units not loaded from Søborg
 */
export default function BuildOutReferencePanel({ festivalId }: { festivalId: string }) {
  const [open, setOpen] = useState(true);

  // Resolve slug for the manifest fetcher.
  const slugQ = useQuery({
    queryKey: ["buildout-ref-slug", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data } = await supabase.from("festivals").select("slug").eq("id", festivalId).maybeSingle();
      return (data?.slug as string | undefined) ?? null;
    },
  });
  const slug = slugQ.data ?? null;

  const manifestQ = useQuery({
    queryKey: ["buildout-ref-manifest", slug],
    enabled: !!slug,
    queryFn: async (): Promise<SoborgLoadingManifest | null> =>
      slug ? await getSoborgLoadingManifest(slug) : null,
  });

  const orderListQ = useQuery({
    queryKey: ["buildout-ref-orderlist", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: powers } = await supabase
        .from("festival_power").select("id, festival_contract_id, festival_contract:festival_contracts!festival_contract_id(concept_alias, concept:concepts!concept_id(name))")
        .eq("festival_contract.festival_id" as any, festivalId);
      // RLS may not let us filter by joined column — fall back: fetch by contract ids
      let powerIds: string[] = (powers ?? []).map((p: any) => p.id);
      if (powerIds.length === 0) {
        const { data: contracts } = await supabase
          .from("festival_contracts").select("id, concept_alias, concept:concepts!concept_id(name)")
          .eq("festival_id", festivalId).eq("is_active", true);
        const cids = (contracts ?? []).map((c: any) => c.id);
        if (cids.length === 0) return [];
        const { data: ps } = await supabase
          .from("festival_power").select("id, festival_contract_id").in("festival_contract_id", cids);
        powerIds = (ps ?? []).map((p: any) => p.id);
        const contractById = new Map((contracts ?? []).map((c: any) => [c.id, c]));
        const powerToContract = new Map((ps ?? []).map((p: any) => [p.id, p.festival_contract_id]));
        if (powerIds.length === 0) return [];
        const { data: items } = await supabase
          .from("festival_power_order_items")
          .select("id, festival_power_id, category, item_name, quantity, unit, notes")
          .in("festival_power_id", powerIds)
          .order("category").order("position");
        return (items ?? []).map((it: any) => {
          const cid = powerToContract.get(it.festival_power_id);
          const c = contractById.get(cid);
          return { ...it, concept_name: c?.concept?.name ?? c?.concept_alias ?? "—" };
        });
      }
      return [];
    },
  });

  const manifest = manifestQ.data ?? null;
  const orderList = orderListQ.data ?? [];

  // Gas detection over every manifest item
  const gasItems = useMemo(() => {
    if (!manifest) return [] as Array<{ vehicle: string; concept: string; item: LoadingItem }>;
    const out: Array<{ vehicle: string; concept: string; item: LoadingItem }> = [];
    const scan = (vehicleLabel: string, groups: any[]) => {
      groups.forEach((g) => {
        Object.values(g.items_by_category as Record<string, LoadingItem[]>).forEach((arr) => {
          arr.forEach((it) => {
            if (/\bgas\b|gasblus|gasovn|gasflaske|propane|propan/i.test(it.name)) {
              out.push({ vehicle: vehicleLabel, concept: g.concept_name, item: it });
            }
          });
        });
      });
    };
    manifest.vehicles.forEach((v) => scan(v.license_plate || v.vehicle_type, v.concepts));
    scan("Unassigned", manifest.unassigned.concepts);
    return out;
  }, [manifest]);

  const hasAnyGas = gasItems.length > 0;
  const loading = slugQ.isLoading || manifestQ.isLoading || orderListQ.isLoading;

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
        <span className="text-[10px] font-normal text-blue-700/70 dark:text-blue-300/60">
          read-only · from Søborg loading + Power & Order
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-4 text-[11px]">
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {/* Gas / no gas */}
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  <Flame className="h-3 w-3" /> Gas appliances
                  <span className={"px-1.5 py-0.5 rounded text-[9px] font-semibold " + (hasAnyGas ? "bg-orange-500/15 text-orange-700 dark:text-orange-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300")}>
                    {hasAnyGas ? "GAS ON SITE" : "NO GAS"}
                  </span>
                </div>
                {hasAnyGas ? (
                  <ul className="space-y-1">
                    {gasItems.map((g, i) => (
                      <li key={i} className="rounded border bg-background/60 px-2 py-1 flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground min-w-[80px]">{g.vehicle}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.concept}</span>
                        <span className="font-medium">{g.item.quantity}× {g.item.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="italic text-muted-foreground">No gas-fuelled equipment on any car.</div>
                )}
              </div>

              {/* Full car list from Søborg loading */}
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  <Truck className="h-3 w-3" /> Car list (Søborg loading) — tables, scaffolding, trolleys, equipment
                </div>
                {!manifest || (manifest.vehicles.length === 0 && manifest.unassigned.concepts.length === 0) ? (
                  <div className="italic text-muted-foreground">No items loaded from Søborg yet.</div>
                ) : (
                  <div className="space-y-2">
                    {manifest.vehicles.map((v) => (
                      <VehicleBlock
                        key={v.vehicle_id}
                        title={`${v.vehicle_type}${v.license_plate ? ` · ${v.license_plate}` : ""}${v.loading_date ? ` · load ${v.loading_date}` : ""}`}
                        groups={v.concepts}
                      />
                    ))}
                    {manifest.unassigned.concepts.length > 0 && (
                      <VehicleBlock title="Unassigned to a vehicle" groups={manifest.unassigned.concepts} tone="amber" />
                    )}
                  </div>
                )}
              </div>

              {/* Cooling not loaded from Søborg */}
              {manifest && manifest.not_loaded_from_soborg.items.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    <Snowflake className="h-3 w-3" /> Cooling (delivered to site, not on a car)
                  </div>
                  <ul className="space-y-1">
                    {manifest.not_loaded_from_soborg.items.map((u) => (
                      <li key={u.id} className="rounded border bg-background/60 px-2 py-1">
                        <span className="font-medium">{u.quantity}× {u.unit_label}</span>
                        {u.supplier ? <span className="text-muted-foreground"> — {u.supplier}</span> : null}
                        {u.delivery_date ? <span className="text-muted-foreground"> · delivery {u.delivery_date}</span> : null}
                        {u.pickup_date ? <span className="text-muted-foreground"> · pickup {u.pickup_date}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Order list from Power & Order */}
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  <ListOrdered className="h-3 w-3" /> Festival order list (from Power & Order card)
                </div>
                {orderList.length === 0 ? (
                  <div className="italic text-muted-foreground">No order-list items captured.</div>
                ) : (
                  <ul className="space-y-1">
                    {orderList.map((it: any) => (
                      <li key={it.id} className="rounded border bg-background/60 px-2 py-1 flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground min-w-[80px]">{it.concept_name}</span>
                        {it.category ? <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted">{it.category}</span> : null}
                        <span className="font-medium">{it.item_name}</span>
                        {it.quantity ? <span className="text-muted-foreground">× {it.quantity}{it.unit ? ` ${it.unit}` : ""}</span> : null}
                        {it.notes ? <span className="text-muted-foreground italic truncate">— {it.notes}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="text-[10px] text-muted-foreground border-t pt-2">
                Reference only — edit on the source pages (Søborg loading, Power & Order, Equipment).
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function VehicleBlock({
  title, groups, tone = "default",
}: { title: string; groups: any[]; tone?: "default" | "amber" }) {
  const cls = tone === "amber"
    ? "border-amber-300/60 bg-amber-50/40 dark:bg-amber-500/5"
    : "border-border bg-background/60";
  return (
    <div className={"rounded-md border " + cls + " overflow-hidden"}>
      <div className="px-2 py-1 text-[11px] font-semibold bg-muted/40 border-b border-border/50 flex items-center gap-1.5">
        <Truck className="h-3 w-3" /> {title}
      </div>
      <div className="p-2 space-y-2">
        {groups.length === 0 ? (
          <div className="italic text-muted-foreground">No concepts on this car.</div>
        ) : groups.map((g) => (
          <div key={g.contract_id} className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
              {g.concept_name}{g.concept_alias ? ` · ${g.concept_alias}` : ""}
            </div>
            {sortedCategories(g.items_by_category).map((cat) => (
              <div key={cat} className="pl-2">
                <div className="text-[10px] font-semibold text-muted-foreground">{categoryLabel(cat)}</div>
                <ul className="pl-2">
                  {(g.items_by_category[cat] as LoadingItem[]).map((it) => (
                    <li key={it.id} className="flex items-baseline gap-2">
                      <span className="tabular-nums font-medium">{it.quantity}×</span>
                      <span>{it.name}</span>
                      {it.power_type ? <span className="text-muted-foreground">({it.power_type}{it.power_kw ? `, ${Number(it.power_kw).toFixed(1)} kW` : ""})</span> : null}
                      {it.notes ? <span className="text-muted-foreground italic truncate">— {it.notes}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
