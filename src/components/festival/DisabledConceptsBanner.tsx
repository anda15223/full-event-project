import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DisabledConceptsBannerProps {
  festivalId: string;
  festivalSlug: string;
}

export function DisabledConceptsBanner({ festivalId, festivalSlug }: DisabledConceptsBannerProps) {
  const { data } = useQuery({
    queryKey: ["disabled-concepts", festivalSlug],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select("concept:concepts!concept_id(slug, name)")
        .eq("festival_id", festivalId)
        .eq("is_active", false);
      if (error) throw error;
      const rows = (data ?? [])
        .map((r: any) => r.concept)
        .filter((c: any) => c)
        .sort((a: any, b: any) => a.slug.localeCompare(b.slug));
      return rows as { slug: string; name: string }[];
    },
  });

  const disabled = data ?? [];
  if (disabled.length === 0) return null;

  const n = disabled.length;
  const names = disabled.map((c) => c.name);
  let nameList: string;
  if (names.length <= 3) {
    nameList = names.join(", ");
  } else {
    nameList = `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  }

  return (
    <div className="rounded-2xl border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 p-4 my-6 flex items-start gap-3">
      <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
      <div className="flex-1">
        <div className="font-semibold text-amber-900 dark:text-amber-200">
          {n} concept{n === 1 ? "" : "s"} disabled at this festival
        </div>
        <div className="text-sm text-amber-800 dark:text-amber-300 mt-1">
          {nameList}. Their data is hidden from binder exports, Søborg loading manifest, reports, and AI context. Re-enable them from Add concept in the Concept lineup.
        </div>
      </div>
    </div>
  );
}
