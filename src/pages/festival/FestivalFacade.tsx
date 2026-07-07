import { useMemo, useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Image as ImageIcon, Download, Loader2, Download as DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  FacadeConceptCard, type FacadeRow, type FacadePhotoRow,
} from "@/components/festival/cards/FacadeConceptCard";
import { computeFacadeStatus } from "@/lib/facadeStatus";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";

const SLUG_ORDER = ["fish-chips", "gyros", "creperie", "chicks"];

type Festival = { id: string; slug: string; name: string; start_date: string; end_date: string };
type Concept = { id: string; slug: string; name: string };
type Contract = { id: string; concept_id: string };

export default function FestivalFacade() {
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
    queryKey: ["facade-page", slug],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: contracts, error: cErr } = await supabase
        .from("festival_contracts")
        .select("id, concept_id, concepts!concept_id(id, slug, name)")
        .eq("festival_id", festivalId)
        .eq("is_active", true);
      if (cErr) throw cErr;
      const list = (contracts ?? []) as any[];
      const contractIds = list.map((c) => c.id);
      if (contractIds.length === 0) return { items: [] as Array<{ contract: Contract; concept: Concept; facade: FacadeRow }> };

      const { data: facades, error: fErr } = await supabase
        .from("festival_facade").select("*").in("festival_contract_id", contractIds);
      if (fErr) throw fErr;
      const fmap = new Map<string, FacadeRow>();
      (facades ?? []).forEach((f: any) => fmap.set(f.festival_contract_id, f as FacadeRow));

      const items = list
        .filter((c) => c.concepts && fmap.has(c.id))
        .map((c) => ({
          contract: { id: c.id, concept_id: c.concept_id } as Contract,
          concept: c.concepts as Concept,
          facade: fmap.get(c.id)!,
        }))
        .sort((a, b) => {
          const ai = SLUG_ORDER.indexOf(a.concept.slug);
          const bi = SLUG_ORDER.indexOf(b.concept.slug);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
      return { items };
    },
  });

  const facadeIds = useMemo(
    () => (pageQ.data?.items ?? []).map((i) => i.facade.id),
    [pageQ.data]
  );

  const photosQ = useQuery({
    queryKey: ["facade-photos", slug, facadeIds.join(",")],
    enabled: facadeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("festival_facade_photos")
        .select("*").in("festival_facade_id", facadeIds)
        .order("display_order", { ascending: true });
      if (error) throw error;
      const map = new Map<string, FacadePhotoRow[]>();
      (data ?? []).forEach((p: any) => {
        const arr = map.get(p.festival_facade_id) ?? [];
        arr.push(p as FacadePhotoRow);
        map.set(p.festival_facade_id, arr);
      });
      return map;
    },
  });

  const items = pageQ.data?.items ?? [];
  const summary = useMemo(() => {
    let printed = 0, inDesign = 0, damaged = 0;
    items.forEach(({ facade }) => {
      const s = computeFacadeStatus(facade);
      if (s.status === "green") printed++;
      else if (s.status === "amber") inDesign++;
      else if (s.status === "red") damaged++;
    });
    return { total: items.length, printed, inDesign, damaged };
  }, [items]);

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
              <ImageIcon className="h-7 w-7 text-rose-600" />
              <h1 className="text-3xl font-bold tracking-tight">Facade</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Per-concept facade sets, AI-parsed from uploads. Sets are reusable season inventory —
              they travel with the concept across festivals.
            </p>
          </div>
          <Button asChild variant="default" size="sm" className="shrink-0">
            <a href={`/festivals/${slug}/facade/export`} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-1.5" />
              Export full report
            </a>
          </Button>
        </div>
      </div>

      <FacadeImportBar
        festivalId={festivalId}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ["facade-page", slug] });
          qc.invalidateQueries({ queryKey: ["facade-photos", slug] });
        }}
      />

      {/* Summary pills */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
            {summary.total} concept{summary.total === 1 ? "" : "s"}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            🖨 {summary.printed} printed
          </span>
          <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            ✏️ {summary.inDesign} in design
          </span>
          {summary.damaged > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/30">
              🚨 {summary.damaged} damaged
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {pageQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-full" />)}
        </div>
      ) : pageQ.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load facades.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No active concepts at this festival.
        </div>
      ) : (
        <div className={items.length === 1 ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>

          {items.map(({ concept, facade }) => (
            <FacadeConceptCard
              key={facade.id}
              festivalId={festivalId}
              festivalSlug={slug}
              conceptSlug={concept.slug}
              conceptName={concept.name}
              facade={facade}
              photos={photosQ.data?.get(facade.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
