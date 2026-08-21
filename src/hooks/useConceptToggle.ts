import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Vars {
  festivalSlug: string;
  conceptSlug: string;
  isActive: boolean;
}

export function useConceptToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ festivalSlug, conceptSlug, isActive }: Vars) => {
      const { data: festival } = await supabase
        .from("festivals")
        .select("id")
        .eq("slug", festivalSlug)
        .single();

      const { data: concept } = await supabase
        .from("concepts")
        .select("id")
        .eq("slug", conceptSlug)
        .single();

      if (!festival || !concept) throw new Error("Festival or concept not found");

      const { error } = await supabase
        .from("festival_contracts")
        .update(isActive ? { is_active: true, is_draft: false } : { is_active: false })
        .eq("festival_id", festival.id)
        .eq("concept_id", concept.id);

      if (error) throw error;
      return { festivalSlug, conceptSlug, isActive };
    },

    onMutate: async ({ festivalSlug, conceptSlug, isActive }) => {
      const queryKey = ["concept-active", festivalSlug, conceptSlug];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, { is_active: isActive });
      return { previous, queryKey };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },

    onSettled: (data) => {
      if (!data) return;
      const { festivalSlug, conceptSlug } = data;
      const keys = [
        ["concept-active", festivalSlug, conceptSlug],
        ["festival", festivalSlug],
        ["binder", festivalSlug],
        ["soborg", festivalSlug],
        ["soborg-loading", festivalSlug],
        ["power", festivalSlug],
        ["facade", festivalSlug],
        ["topskilt", festivalSlug],
        ["cooling", festivalSlug],
        ["contracts", festivalSlug],
        ["dashboard"],
        ["attention-items"],
        ["concept-grid", festivalSlug],
        ["festival-contracts-grid"],
        ["disabled-concepts", festivalSlug],
      ];
      keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    },
  });
}
