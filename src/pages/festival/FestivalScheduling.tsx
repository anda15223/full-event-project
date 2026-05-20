import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDateRange } from "@/lib/dateFormat";
import { copyTextToClipboard } from "@/lib/clipboard";
import PositionManager from "@/components/scheduling/PositionManager";
import SchedulingGrid from "@/components/scheduling/SchedulingGrid";

export default function FestivalScheduling() {
  const { slug = "" } = useParams();
  const [tab, setTab] = useState("positions");

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, slug, name, start_date, end_date")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (festivalQ.isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-64 mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const festival = festivalQ.data;
  if (!festival) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          Festival not found.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="space-y-2">
        <Link
          to={`/festivals/${slug}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to {festival.name}
        </Link>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h1 className="font-heading text-2xl font-semibold">Scheduling</h1>
          <div className="text-sm text-muted-foreground">
            {festival.name} · {formatDateRange(festival.start_date, festival.end_date)}
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="grid">Grid</TabsTrigger>
          </TabsList>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                const { data: positions, error: pErr } = await supabase
                  .from("festival_schedule_position")
                  .select("id, concept_id")
                  .eq("festival_id", festival.id);
                if (pErr) throw pErr;
                const posIds = (positions ?? []).map((p) => p.id);
                if (posIds.length === 0) {
                  await navigator.clipboard.writeText("");
                  toast("No staff with shifts to export yet");
                  return;
                }
                const posToConcept = new Map(
                  (positions ?? []).map((p) => [p.id, p.concept_id]),
                );
                const { data: shifts, error: sErr } = await supabase
                  .from("festival_schedule_shift")
                  .select("festival_staff_id, schedule_position_id, shift_date, start_time")
                  .in("schedule_position_id", posIds)
                  .order("shift_date", { ascending: true })
                  .order("start_time", { ascending: true });
                if (sErr) throw sErr;
                const firstByStaff = new Map<string, { concept_id: string | null }>();
                for (const s of shifts ?? []) {
                  if (!firstByStaff.has(s.festival_staff_id)) {
                    firstByStaff.set(s.festival_staff_id, {
                      concept_id: posToConcept.get(s.schedule_position_id) ?? null,
                    });
                  }
                }
                const staffIds = Array.from(firstByStaff.keys());
                if (staffIds.length === 0) {
                  await navigator.clipboard.writeText("");
                  toast("No staff with shifts to export yet");
                  return;
                }
                const conceptIds = Array.from(
                  new Set(
                    Array.from(firstByStaff.values())
                      .map((v) => v.concept_id)
                      .filter((x): x is string => !!x),
                  ),
                );
                const [{ data: staff, error: stErr }, { data: concepts, error: cErr }] =
                  await Promise.all([
                    supabase.from("festival_staff").select("id, name").in("id", staffIds),
                    conceptIds.length
                      ? supabase.from("concepts").select("id, name").in("id", conceptIds)
                      : Promise.resolve({ data: [], error: null } as any),
                  ]);
                if (stErr) throw stErr;
                if (cErr) throw cErr;
                const conceptName = new Map(
                  (concepts ?? []).map((c: any) => [c.id, c.name]),
                );
                const rows = (staff ?? [])
                  .map((p: any) => {
                    const cid = firstByStaff.get(p.id)?.concept_id;
                    const cn = (cid && conceptName.get(cid)) || "(no concept)";
                    return { name: p.name ?? "", concept: cn };
                  })
                  .sort((a, b) => a.name.localeCompare(b.name));
                const text = rows.map((r) => `${r.name}, ${r.concept}`).join("\n");
                await navigator.clipboard.writeText(text);
                toast(`Copied ${rows.length} ${rows.length === 1 ? "person" : "people"} to clipboard`);
              } catch (e) {
                console.error(e);
                toast.error("Couldn't copy to clipboard");
              }
            }}
          >
            <Copy className="h-4 w-4" />
            Copy staff list
          </Button>
        </div>
        <TabsContent value="positions" className="mt-6">
          <PositionManager festivalId={festival.id} />
        </TabsContent>
        <TabsContent value="grid" className="mt-6">
          <SchedulingGrid
            festivalId={festival.id}
            onGoToPositions={() => setTab("positions")}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
