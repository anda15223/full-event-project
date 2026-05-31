import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Snowflake, Plus, AlertTriangle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CoolingUnitCard, type CoolingUnitRow, type AssignedConcept,
} from "@/components/festival/cards/CoolingUnitCard";
import { computeFestivalCoolingRollup } from "@/lib/coolingStatus";
import { ImportFromPreviousCard, CARD_TABLES } from "@/components/festival/ImportFromPreviousCard";
import { useDraftMode } from "@/hooks/useDraftMode";

const SLUG_ORDER = ["fish-chips", "gyros", "creperie", "chicks"];

type Festival = { id: string; slug: string; name: string; start_date: string; end_date: string };

export default function FestivalCooling() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();

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
    queryKey: ["cooling-page", slug],
    enabled: !!festivalId,
    queryFn: async () => {
      const [unitsRes, contractsRes] = await Promise.all([
        supabase.from("festival_cooling_unit")
          .select("*").eq("festival_id", festivalId).eq("is_draft", draftMode).order("delivery_date", { ascending: true, nullsFirst: false }),
        supabase.from("festival_contracts")
          .select("id, is_active, concepts!festival_contracts_concept_id_fkey(slug, name)")
          .eq("festival_id", festivalId),
      ]);
      if (unitsRes.error) throw unitsRes.error;
      if (contractsRes.error) throw contractsRes.error;
      const units = (unitsRes.data ?? []) as CoolingUnitRow[];
      const contracts = (contractsRes.data ?? []) as any[];
      const unitIds = units.map((u) => u.id);

      let links: { cooling_unit_id: string; festival_contract_id: string }[] = [];
      if (unitIds.length > 0) {
        const { data, error } = await supabase
          .from("festival_cooling_unit_concepts")
          .select("cooling_unit_id, festival_contract_id")
          .in("cooling_unit_id", unitIds);
        if (error) throw error;
        links = (data ?? []) as any[];
      }
      return { units, contracts, links };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const n = (pageQ.data?.units.length ?? 0) + 1;
      const { error } = await supabase.from("festival_cooling_unit").insert({
        festival_id: festivalId,
        unit_label: `Cooling unit ${n}`,
        cooling_model: "container",
        status: "not_ordered",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cooling unit added");
      qc.invalidateQueries({ queryKey: ["cooling-page", slug] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add"),
  });

  const cards = useMemo(() => {
    const data = pageQ.data;
    if (!data) return [];
    const contractById = new Map<string, { isActive: boolean; slug: string; name: string }>();
    data.contracts.forEach((c) => {
      const cc = c.concepts;
      if (cc) contractById.set(c.id, { isActive: c.is_active !== false, slug: cc.slug, name: cc.name });
    });
    const linksByUnit = new Map<string, string[]>();
    data.links.forEach((l) => {
      const arr = linksByUnit.get(l.cooling_unit_id) ?? [];
      arr.push(l.festival_contract_id);
      linksByUnit.set(l.cooling_unit_id, arr);
    });

    return data.units.map((unit) => {
      const linkedIds = new Set(linksByUnit.get(unit.id) ?? []);
      const assigned: AssignedConcept[] = [];
      const unassigned: { contractId: string; conceptSlug: string; conceptName: string }[] = [];
      data.contracts.forEach((c) => {
        const meta = contractById.get(c.id);
        if (!meta) return;
        if (linkedIds.has(c.id)) {
          assigned.push({ contractId: c.id, conceptSlug: meta.slug, conceptName: meta.name, isActive: meta.isActive });
        } else if (meta.isActive) {
          unassigned.push({ contractId: c.id, conceptSlug: meta.slug, conceptName: meta.name });
        }
      });
      const sortFn = (a: { conceptSlug: string }, b: { conceptSlug: string }) => {
        const ai = SLUG_ORDER.indexOf(a.conceptSlug);
        const bi = SLUG_ORDER.indexOf(b.conceptSlug);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      };
      assigned.sort(sortFn); unassigned.sort(sortFn);
      return { unit, assigned, unassigned };
    });
  }, [pageQ.data]);

  const summary = useMemo(() => {
    const units = pageQ.data?.units ?? [];
    const total = units.length;
    const confirmed = units.filter((u) => ["confirmed", "delivered"].includes((u.status ?? "").toLowerCase())).length;
    const pending = units.filter((u) => ["ordered", "pending", "not_ordered"].includes((u.status ?? "").toLowerCase())).length;
    const totalKw = units.reduce((s, u) => s + Number(u.power_required_kw ?? 0), 0);
    return { total, confirmed, pending, totalKw };
  }, [pageQ.data]);

  const rollup = useMemo(() => computeFestivalCoolingRollup({
    unitCount: summary.total,
    startDate: festival?.start_date ?? null,
    confirmedCount: summary.confirmed,
  }), [summary, festival]);

  if (festivalQ.isLoading) {
    return <div className="p-6 max-w-6xl mx-auto"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">

      <ImportFromPreviousCard
import { useDraftMode } from "@/hooks/useDraftMode";
        cardLabel="cooling"
        tables={CARD_TABLES.cooling}
        currentFestivalId={festivalId ?? ""}
        onCommitted={() => window.location.reload()}
      />
      {/* Header */}
      <div>
        <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> {festival.name}
        </Link>
        <div className="flex items-center justify-between gap-3 mt-2">
          <div className="flex items-center gap-3">
            <Snowflake className="h-7 w-7 text-blue-500" />
            <h1 className="text-3xl font-bold tracking-tight">Cooling</h1>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={`/festivals/${slug}/cooling/export`} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" /> Export PDF
            </a>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Refrigerated containers, trailers, and pallet rentals. Cooling units are festival-level resources shared across concepts. Delivered to site — not loaded from Søborg.
        </p>
      </div>

      {/* Summary pills */}
      {summary.total > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
            {summary.total} unit{summary.total === 1 ? "" : "s"}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            ✓ {summary.confirmed} confirmed
          </span>
          {summary.pending > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              ⏳ {summary.pending} pending
            </span>
          )}
          {summary.totalKw > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30">
              ⚡ {summary.totalKw.toFixed(1)} kW required
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {pageQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map((i) => <Skeleton key={i} className="h-96 w-full" />)}
        </div>
      ) : summary.total === 0 ? (
        <div className={cn(
          "rounded-2xl border p-8 space-y-4",
          rollup.level === "red" && "border-destructive/40 bg-destructive/5",
          rollup.level === "amber" && "border-amber-500/40 bg-amber-500/5",
        )}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={cn(
              "h-6 w-6 shrink-0 mt-0.5",
              rollup.level === "red" ? "text-destructive" : "text-amber-600",
            )} />
            <div className="flex-1">
              <h2 className="text-xl font-bold">{rollup.label}</h2>
              <p className="text-sm text-muted-foreground mt-1">{rollup.detail}</p>
            </div>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending} size="lg">
            <Plus className="h-4 w-4" /> Add cooling unit
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cards.map(({ unit, assigned, unassigned }) => (
              <CoolingUnitCard
                key={unit.id}
                festivalId={festivalId}
                festivalSlug={slug}
                unit={unit}
                assignedConcepts={assigned}
                unassignedContracts={unassigned}
              />
            ))}
          </div>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="w-full rounded-2xl border-2 border-dashed border-border py-4 text-sm text-muted-foreground hover:bg-muted/30 transition flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add cooling unit
          </button>
        </>
      )}
    </div>
  );
}
