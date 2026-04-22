import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useFestivals() {
  return useQuery({
    queryKey: ["festivals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("*")
        .order("year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useFestival(slug: string | undefined) {
  return useQuery({
    queryKey: ["festival", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("*")
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSections() {
  return useQuery({
    queryKey: ["festival_sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_sections")
        .select("*")
        .order("order_index");
      if (error) throw error;
      return data;
    },
  });
}

export function useSection(sectionKey: string | undefined) {
  return useQuery({
    queryKey: ["festival_section", sectionKey],
    enabled: !!sectionKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_sections")
        .select("*")
        .eq("key", sectionKey!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useQuestions(sectionId: string | undefined) {
  return useQuery({
    queryKey: ["festival_questions", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_questions")
        .select("*")
        .eq("section_id", sectionId!)
        .order("order_index");
      if (error) throw error;
      return data;
    },
  });
}

export function useAllQuestions() {
  return useQuery({
    queryKey: ["festival_questions_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_questions")
        .select("*")
        .order("order_index");
      if (error) throw error;
      return data;
    },
  });
}

export function useAnswers(festivalId: string | undefined) {
  return useQuery({
    queryKey: ["festival_answers", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_answers")
        .select("*")
        .eq("festival_id", festivalId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useConcepts(festivalId: string | undefined) {
  return useQuery({
    queryKey: ["festival_concepts", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_concepts")
        .select("*")
        .eq("festival_id", festivalId!)
        .order("order_index");
      if (error) throw error;
      return data;
    },
  });
}

export function useStaff(festivalId: string | undefined) {
  return useQuery({
    queryKey: ["festival_staff", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_staff")
        .select("*")
        .eq("festival_id", festivalId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useShifts(festivalId: string | undefined) {
  return useQuery({
    queryKey: ["festival_shifts", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: concepts } = await supabase
        .from("festival_concepts")
        .select("id")
        .eq("festival_id", festivalId!);
      const ids = (concepts || []).map(c => c.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("festival_vagtplan_shifts")
        .select("*")
        .in("concept_id", ids)
        .order("day")
        .order("order_index");
      if (error) throw error;
      return data;
    },
  });
}

export function useActionItems(festivalId: string | undefined) {
  return useQuery({
    queryKey: ["festival_action_items", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_action_items")
        .select("*")
        .eq("festival_id", festivalId!)
        .order("deadline", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useVehicles(festivalId: string | undefined) {
  return useQuery({
    queryKey: ["festival_vehicles", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_vehicles")
        .select("*")
        .eq("festival_id", festivalId!)
        .order("travel_date");
      if (error) throw error;
      return data;
    },
  });
}

export function useAccommodation(festivalId: string | undefined) {
  return useQuery({
    queryKey: ["festival_accommodation", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_accommodation")
        .select("*")
        .eq("festival_id", festivalId!)
        .order("check_in");
      if (error) throw error;
      return data;
    },
  });
}

export function useTrolleys(festivalId: string | undefined) {
  return useQuery({
    queryKey: ["festival_trolleys", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: concepts } = await supabase
        .from("festival_concepts")
        .select("id, name")
        .eq("festival_id", festivalId!)
        .order("order_index");
      const ids = (concepts || []).map(c => c.id);
      if (!ids.length) return { trolleys: [], items: [], concepts: concepts || [] };
      const { data: trolleys, error: e1 } = await supabase
        .from("festival_bc_trolleys")
        .select("*")
        .in("concept_id", ids)
        .order("trolley_number");
      if (e1) throw e1;
      const tIds = (trolleys || []).map(t => t.id);
      const { data: items, error: e2 } = tIds.length ? await supabase
        .from("festival_bc_trolley_items")
        .select("*")
        .in("trolley_id", tIds)
        .order("order_index") : { data: [], error: null };
      if (e2) throw e2;
      return { trolleys: trolleys || [], items: items || [], concepts: concepts || [] };
    },
  });
}
