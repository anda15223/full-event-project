import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useConceptIsActive(
  conceptSlug: string | undefined,
  festivalSlug: string,
): { isActive: boolean; isLoading: boolean } {
  const enabled = !!conceptSlug;
  const { data, isLoading } = useQuery({
    queryKey: ["concept-active", festivalSlug, conceptSlug],
    enabled,
    queryFn: async () => {
      const { data: fest } = await supabase
        .from("festivals")
        .select("id")
        .eq("slug", festivalSlug)
        .maybeSingle();
      const { data: concept } = await supabase
        .from("concepts")
        .select("id")
        .eq("slug", conceptSlug!)
        .maybeSingle();
      if (!fest?.id || !concept?.id) return { is_active: true };
      const { data: row } = await supabase
        .from("festival_contracts")
        .select("is_active")
        .eq("festival_id", fest.id)
        .eq("concept_id", concept.id)
        .limit(1)
        .maybeSingle();
      return { is_active: row?.is_active ?? true };
    },
  });

  if (!enabled) return { isActive: true, isLoading: false };
  return { isActive: data?.is_active ?? true, isLoading };
}
