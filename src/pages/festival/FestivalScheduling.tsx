import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateRange } from "@/lib/dateFormat";
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
        <TabsList>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="grid">Grid</TabsTrigger>
        </TabsList>
        <TabsContent value="positions" className="mt-6">
          <PositionManager festivalId={festival.id} />
        </TabsContent>
        <TabsContent value="grid" className="mt-6">
          <div className="p-8 text-muted-foreground">Grid coming in next step</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
