import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Zap } from "lucide-react";
import {
  PowerConceptCard, type PowerRow, type PowerEquipmentRow,
} from "@/components/festival/cards/PowerConceptCard";
import { computeDemandKw, computePowerStatus } from "@/lib/powerStatus";
import type { SiblingConcept } from "@/components/festival/TentMergeControls";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";

const SLUG_ORDER = ["fish-chips", "gyros", "creperie", "chicks"];

type Festival = { id: string; slug: string; name: string; start_date: string; end_date: string };
type Concept = { id: string; slug: string; name: string };

export default function FestivalPower() {
  const { slug = "" } = useParams();

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals")
        .select("id,slug,name,start_date,end_date").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });

  const festival = festivalQ.data;
  const festivalId = festival?.id ?? "";

  const pageQ = useQuery({
    queryKey: ["power-page", slug],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: contracts, error: cErr } = await supabase
        .from("festival_contracts")
        .select("id, concept_id, tent_primary_contract_id, concept_alias, instance_label, concepts!concept_id(id, slug, name)")
        .eq("festival_id", festivalId)
        .eq("is_active", true);
      if (cErr) throw cErr;
      const list = (contracts ?? []) as any[];
      // Match every other card: prefer the aliased/instance name over the raw concept name
      const nameFor = (c: any) => {
        const alias = (c.concept_alias ?? "").trim();
        return alias || (c.instance_label ? `${c.concepts?.name ?? ""} ${c.instance_label}`.trim() : (c.concepts?.name ?? "Concept"));
      };
      const contractIds = list.map((c) => c.id);
      if (contractIds.length === 0) return { items: [] as Array<{ concept: Concept; power: PowerRow; contractId: string; displayName: string; mergedChildren: SiblingConcept[]; mergeTargets: SiblingConcept[] }> };

      const { data: powers, error: pErr } = await supabase
        .from("festival_power").select("*").in("festival_contract_id", contractIds);
      if (pErr) throw pErr;
      const pmap = new Map<string, PowerRow>();
      (powers ?? []).forEach((p: any) => pmap.set(p.festival_contract_id, p as PowerRow));

      // Build merge maps
      const childrenByPrimary = new Map<string, SiblingConcept[]>();
      list.forEach((c) => {
        const pid = c.tent_primary_contract_id as string | null;
        if (pid && c.concepts) {
          const arr = childrenByPrimary.get(pid) ?? [];
          arr.push({ contractId: c.id, conceptName: nameFor(c), conceptSlug: c.concepts.slug, mergedInto: pid });
          childrenByPrimary.set(pid, arr);
        }
      });

      const items = list
        .filter((c) => c.concepts && pmap.has(c.id) && !c.tent_primary_contract_id)
        .map((c) => {
          const targets: SiblingConcept[] = list
            .filter((o) => o.id !== c.id && o.concepts && !o.tent_primary_contract_id && !childrenByPrimary.has(o.id))
            .map((o) => ({ contractId: o.id, conceptName: nameFor(o), conceptSlug: o.concepts.slug, mergedInto: null }));
          return {
            contractId: c.id as string,
            concept: c.concepts as Concept,
            displayName: nameFor(c),
            power: pmap.get(c.id)!,
            mergedChildren: childrenByPrimary.get(c.id) ?? [],
            mergeTargets: childrenByPrimary.has(c.id) ? [] : targets,
          };
        })
        .sort((a, b) => {
          const ai = SLUG_ORDER.indexOf(a.concept.slug);
          const bi = SLUG_ORDER.indexOf(b.concept.slug);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
      // Stash full power map (including children's power rows) for equipment aggregation
      return { items, powerByContract: pmap, childrenByPrimary };
    },
  });

  // All power row IDs at this festival (incl. merged-child power rows, for equipment aggregation)
  const allPowerIds = useMemo(() => {
    const map = pageQ.data?.powerByContract;
    if (!map) return [] as string[];
    return Array.from(map.values()).map((p) => p.id);
  }, [pageQ.data]);

  const equipmentQ = useQuery({
    queryKey: ["power-equipment", slug, allPowerIds.join(",")],
    enabled: allPowerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("festival_power_equipment")
        .select("*").in("festival_power_id", allPowerIds).order("position");
      if (error) throw error;
      const map = new Map<string, PowerEquipmentRow[]>();
      (data ?? []).forEach((e: any) => {
        const arr = map.get(e.festival_power_id) ?? [];
        arr.push(e as PowerEquipmentRow);
        map.set(e.festival_power_id, arr);
      });
      return map;
    },
  });

  const items = pageQ.data?.items ?? [];
  const powerByContract = pageQ.data?.powerByContract;

  /** Combine equipment from a primary + all its merged-children's power rows */
  const combinedEquipmentFor = (primaryPowerId: string, mergedChildren: SiblingConcept[]): PowerEquipmentRow[] => {
    const base = equipmentQ.data?.get(primaryPowerId) ?? [];
    if (!mergedChildren.length || !powerByContract) return base;
    const extras: PowerEquipmentRow[] = [];
    mergedChildren.forEach((ch) => {
      const cp = powerByContract.get(ch.contractId);
      if (cp) extras.push(...(equipmentQ.data?.get(cp.id) ?? []));
    });
    return [...base, ...extras];
  };

  const summary = useMemo(() => {
    let allocated = 0, demand = 0, shortages = 0;
    items.forEach(({ power, mergedChildren }) => {
      const eq = combinedEquipmentFor(power.id, mergedChildren);
      const d = computeDemandKw(eq);
      const a = Number(power.allocated_kw ?? 0);
      allocated += a;
      demand += d;
      const st = computePowerStatus({ status: power.status, allocated_kw: power.allocated_kw, demand_kw: d });
      if (st.status === "red") shortages++;
    });
    return { total: items.length, allocated, demand, shortages };
  }, [items, equipmentQ.data, powerByContract]);

  if (festivalQ.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <FestivalBackBar />
      {/* Header */}
      <div>
        <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> {festival.name}
        </Link>
        <div className="flex items-start justify-between gap-3 mt-2">
          <div>
            <div className="flex items-center gap-3">
              <Zap className="h-7 w-7 text-amber-500" />
              <h1 className="text-3xl font-bold tracking-tight">Power</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Per-concept electricity orders, AI-parsed from uploads. Demand is computed live from equipment kW.
            </p>
          </div>
          <a
            href={`/festivals/${slug}/power/export`}
            target="_blank" rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border bg-card hover:bg-muted px-3 py-2 text-sm font-medium"
          >
            Export PDF
          </a>
        </div>
      </div>

      {/* Summary pills */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
            {summary.total} concept{summary.total === 1 ? "" : "s"}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30">
            ⚡ {summary.allocated.toFixed(1)} kW allocated
          </span>
          <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            🔌 {summary.demand.toFixed(1)} kW demand
          </span>
          {summary.shortages > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/30">
              🚨 {summary.shortages} shortage{summary.shortages === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {pageQ.isLoading ? (
        <div className="grid gap-6 grid-cols-1 [grid-template-columns:repeat(auto-fit,minmax(520px,1fr))]">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-full" />)}
        </div>
      ) : pageQ.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load power data.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No active concepts at this festival.
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 [grid-template-columns:repeat(auto-fit,minmax(520px,1fr))]">
          {items.map(({ concept, power, contractId, mergedChildren, mergeTargets }) => (
            <PowerConceptCard
              key={power.id}
              festivalId={festivalId}
              festivalSlug={slug}
              conceptSlug={concept.slug}
              conceptName={concept.name}
              contractId={contractId}
              power={power}
              equipment={combinedEquipmentFor(power.id, mergedChildren)}
              mergedChildren={mergedChildren}
              mergeTargets={mergeTargets}
            />
          ))}
        </div>
      )}
    </div>
  );
}
