import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Wrench } from "lucide-react";
import { EquipmentConceptCard } from "@/components/festival/cards/EquipmentConceptCard";
import { computeConceptEquipmentStatus, summarizeConceptEquipment, EquipmentRow } from "@/lib/equipmentStatus";
import type { ConceptSlug } from "@/components/concept/types";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";

const SLUG_ORDER: ConceptSlug[] = ["fish-chips", "gyros", "creperie", "chicks"];

type Festival = { id: string; slug: string; name: string };

export default function FestivalEquipment() {
  const { slug = "" } = useParams();

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals")
        .select("id,slug,name").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });
  const festival = festivalQ.data;
  const festivalId = festival?.id ?? "";

  const pageQ = useQuery({
    queryKey: ["equipment-page", slug],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: contracts, error: cErr } = await supabase
        .from("festival_contracts")
        .select("id, concept_id, assigned_vehicle_id, tent_primary_contract_id, concepts!concept_id(id, slug, name)")
        .eq("festival_id", festivalId).eq("is_active", true);
      if (cErr) throw cErr;
      const list = (contracts ?? []) as any[];
      const cIds = list.map((c) => c.id);
      if (cIds.length === 0) return { items: [] as any[], rowsByPower: new Map<string, EquipmentRow[]>(), childrenByPrimary: new Map<string, any[]>(), powerByContract: new Map<string, string>() };

      const { data: powers, error: pErr } = await supabase
        .from("festival_power").select("id, festival_contract_id").in("festival_contract_id", cIds);
      if (pErr) throw pErr;
      const powerByContract = new Map<string, string>();
      (powers ?? []).forEach((p: any) => powerByContract.set(p.festival_contract_id, p.id));

      // Auto-create festival_power rows for active contracts that don't have one yet,
      // so the Equipment page is usable even before the user visits Power.
      const missing = cIds.filter((id) => !powerByContract.has(id));
      if (missing.length > 0) {
        const { data: created, error: cpErr } = await supabase
          .from("festival_power")
          .insert(missing.map((id) => ({ festival_contract_id: id })))
          .select("id, festival_contract_id");
        if (cpErr) throw cpErr;
        (created ?? []).forEach((p: any) => powerByContract.set(p.festival_contract_id, p.id));
      }
      const powerIds = Array.from(powerByContract.values());

      const rowsByPower = new Map<string, EquipmentRow[]>();
      if (powerIds.length > 0) {
        const { data: eq, error: eErr } = await supabase
          .from("festival_power_equipment").select("*")
          .in("festival_power_id", powerIds)
          .order("category").order("position");
        if (eErr) throw eErr;
        (eq ?? []).forEach((r: any) => {
          const arr = rowsByPower.get(r.festival_power_id) ?? [];
          arr.push(r as EquipmentRow);
          rowsByPower.set(r.festival_power_id, arr);
        });
      }

      const childrenByPrimary = new Map<string, any[]>();
      list.forEach((c) => {
        const pid = c.tent_primary_contract_id as string | null;
        if (pid && c.concepts) {
          const arr = childrenByPrimary.get(pid) ?? [];
          arr.push({ contractId: c.id, conceptName: c.concepts.name, conceptSlug: c.concepts.slug, mergedInto: pid });
          childrenByPrimary.set(pid, arr);
        }
      });

      const items = list
        .filter((c) => c.concepts && powerByContract.has(c.id))
        .map((c) => {
          return {
            contractId: c.id as string,
            assignedVehicleId: (c.assigned_vehicle_id ?? null) as string | null,
            concept: c.concepts,
            powerId: powerByContract.get(c.id)!,
            mergedChildren: [] as any[],
            mergeTargets: [] as any[],
          };
        })
        .sort((a, b) => {
          const ai = SLUG_ORDER.indexOf(a.concept.slug);
          const bi = SLUG_ORDER.indexOf(b.concept.slug);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

      return { items, rowsByPower, childrenByPrimary, powerByContract };
    },
  });

  const items = pageQ.data?.items ?? [];
  const rowsByPower = pageQ.data?.rowsByPower ?? new Map();
  const powerByContract = pageQ.data?.powerByContract ?? new Map<string, string>();

  /** Combine equipment rows from a primary + any merged children. */
  const combinedRowsFor = (powerId: string, mergedChildren: any[]): EquipmentRow[] => {
    const base = rowsByPower.get(powerId) ?? [];
    if (!mergedChildren?.length) return base;
    const extras: EquipmentRow[] = [];
    mergedChildren.forEach((ch: any) => {
      const cpId = powerByContract.get(ch.contractId);
      if (cpId) extras.push(...(rowsByPower.get(cpId) ?? []));
    });
    return [...base, ...extras];
  };

  const summary = useMemo(() => {
    let totalItems = 0, totalPowered = 0, totalKw = 0, unassigned = 0;
    items.forEach((it: any) => {
      const rows = combinedRowsFor(it.powerId, it.mergedChildren);
      const s = summarizeConceptEquipment(rows);
      totalItems += s.items;
      totalPowered += s.powered;
      totalKw += s.kw;
      if (!it.assignedVehicleId && rows.length > 0) unassigned++;
    });
    return { concepts: items.length, items: totalItems, powered: totalPowered, kw: Math.round(totalKw * 10) / 10, unassigned };
  }, [items, rowsByPower, powerByContract]);

  if (festivalQ.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <FestivalBackBar />
      <div>
        <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> {festival.name}
        </Link>
        <div className="flex items-center justify-between gap-3 mt-2">
          <div className="flex items-center gap-3">
            <Wrench className="h-7 w-7 text-slate-500" />
            <h1 className="text-3xl font-bold tracking-tight">Equipment & Trolleys</h1>
          </div>
          <a href={`/festivals/${slug}/equipment/export`} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-muted">
            Export PDF
          </a>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Per-concept inventory grouped by category. Powered items contribute to electricity demand.
          Items marked Søborg load from the warehouse; on-site items are delivered to the festival.
        </p>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill>{summary.concepts} concept{summary.concepts === 1 ? "" : "s"}</Pill>
          <Pill>{summary.items} item{summary.items === 1 ? "" : "s"}</Pill>
          <Pill tone="amber">⚡ {summary.powered} powered</Pill>
          <Pill tone="amber">🔌 {summary.kw.toFixed(1)} kW demand</Pill>
          <Pill tone={summary.unassigned > 0 ? "rose" : "muted"}>
            🚛 {summary.unassigned} unassigned
          </Pill>
        </div>
      )}

      {pageQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No active concepts at this festival.
        </div>
      ) : (
        <div className={items.length === 1 ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>

          {items.map((it: any) => (
            <EquipmentConceptCard
              key={it.contractId}
              festivalId={festivalId}
              festivalSlug={slug}
              conceptId={it.concept.id}
              conceptSlug={it.concept.slug}
              conceptName={it.concept.name}
              contractId={it.contractId}
              powerId={it.powerId}
              assignedVehicleId={it.assignedVehicleId}
              rows={combinedRowsFor(it.powerId, it.mergedChildren)}
              mergedChildren={it.mergedChildren}
              mergeTargets={it.mergeTargets}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "amber" | "rose" }) {
  const cls =
    tone === "amber" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
    tone === "rose"  ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" :
                       "bg-muted text-muted-foreground border";
  return <span className={`px-2.5 py-1 rounded-full border ${cls}`}>{children}</span>;
}
