import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Shield, Plus, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SafetyZoneCard, type SafetyZoneRow } from "@/components/festival/cards/SafetyZoneCard";
import { FestivalSafetyCard } from "@/components/festival/cards/FestivalSafetyCard";
import { computeZoneSafetyStatus, computeFestivalCertStatus } from "@/lib/safetyStatus";
import { ImportFromPreviousCard, CARD_TABLES } from "@/components/festival/ImportFromPreviousCard";
import { useDraftMode } from "@/hooks/useDraftMode";

const sb = supabase as any;

type Festival = { id: string; slug: string; name: string; start_date: string; end_date: string };

export default function FestivalSafety() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data } = await supabase.from("festivals")
        .select("id,slug,name,start_date,end_date").eq("slug", slug).maybeSingle();
      return data as Festival | null;
    },
  });

  const festival = festivalQ.data;
  const festivalId = festival?.id ?? "";

  const fwQ = useQuery({
    queryKey: ["safety-festival", slug],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data } = await sb.from("festival_safety").select("*").eq("festival_id", festivalId).maybeSingle();
      if (data) return data;
      const { data: created, error } = await sb.from("festival_safety").insert({ festival_id: festivalId }).select().single();
      if (error) throw error;
      return created;
    },
  });

  const zonesQ = useQuery({
    queryKey: ["safety-zones", slug],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await sb.from("festival_safety_zone")
        .select("*").eq("festival_id", festivalId).eq("is_draft", draftMode)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SafetyZoneRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const next = (zonesQ.data?.length ?? 0) + 1;
      const { error } = await sb.from("festival_safety_zone").insert({
        festival_id: festivalId,
        zone_label: `Zone ${next}`,
        zone_type: "tent",
        display_order: next,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zone added");
      qc.invalidateQueries({ queryKey: ["safety-zones", slug] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add"),
  });

  const summary = useMemo(() => {
    const zones = zonesQ.data ?? [];
    let green = 0, amber = 0, red = 0;
    zones.forEach((z) => {
      const s = computeZoneSafetyStatus(z).status;
      if (s === "green") green++; else if (s === "amber") amber++; else if (s === "red") red++;
    });
    return { count: zones.length, green, amber, red };
  }, [zonesQ.data]);

  const certStatus = computeFestivalCertStatus(fwQ.data);

  if (festivalQ.isLoading) {
    return <div className="p-6 max-w-6xl mx-auto"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> {festival.name}
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <Shield className="h-7 w-7 text-emerald-500" />
            <h1 className="text-3xl font-bold tracking-tight">Safety</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Per-zone safety checklists plus festival-wide certifications. Each tent or stall has its own fire safety, first aid, and permits checklist.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={`/festivals/${slug}/safety/export`}><FileDown className="h-4 w-4 mr-1" />Export PDF</Link>
        </Button>
      </div>

      <ImportFromPreviousCard
import { useDraftMode } from "@/hooks/useDraftMode";
        cardLabel="safety"
        tables={CARD_TABLES.safety}
        currentFestivalId={festivalId}
        onCommitted={() => {
          qc.invalidateQueries({ queryKey: ["safety-zones", slug] });
          qc.invalidateQueries({ queryKey: ["festival-safety", slug] });
        }}
      />

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
          {summary.count} zone{summary.count === 1 ? "" : "s"}
        </span>
        {summary.green > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            ✓ {summary.green} all clear
          </span>
        )}
        {summary.amber > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            ⏳ {summary.amber} in progress
          </span>
        )}
        {summary.red > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30">
            ⚠ {summary.red} not started
          </span>
        )}
        <span className={`px-2.5 py-1 rounded-full border ${certStatus.classes}`}>
          Certifications: {certStatus.label}
        </span>
      </div>

      {/* Festival-wide card */}
      {fwQ.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : fwQ.data ? (
        <FestivalSafetyCard festivalId={festivalId} festivalSlug={slug} row={fwQ.data} />
      ) : null}

      {/* Zones */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-xl font-bold tracking-tight">Safety zones</h2>
      </div>

      {zonesQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map((i) => <Skeleton key={i} className="h-96 w-full" />)}
        </div>
      ) : (zonesQ.data?.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center space-y-4">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
          <div>
            <h3 className="text-lg font-bold">No safety zones yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Add a zone for each tent, stall, or common area.</p>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending} size="lg">
            <Plus className="h-4 w-4" /> Add safety zone
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {zonesQ.data!.map((z) => (
              <SafetyZoneCard key={z.id} festivalId={festivalId} festivalSlug={slug} zone={z} />
            ))}
          </div>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="w-full rounded-2xl border-2 border-dashed border-border py-4 text-sm text-muted-foreground hover:bg-muted/30 transition flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add safety zone
          </button>
        </>
      )}
    </div>
  );
}
