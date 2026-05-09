import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DashboardItem = {
  type: "action_item" | "question" | "timeline_event";
  id: string;
  title: string;
  priority?: string;
  due_date?: string | null;
  deadline?: string | null;
  event_date?: string | null;
  festival_id?: string | null;
  concept_id?: string | null;
  owner?: string | null;
  days_overdue?: number;
  responsible_party?: string | null;
  created_at?: string;
};

export type FestivalGridItem = {
  id: string;
  slug: string;
  name: string;
  start_date: string;
  end_date: string;
  countdown_days: number;
  open_actions: number;
  overdue_count: number;
  critical_count: number;
  concepts_count: number;
  operating_entities: string[] | null;
  stalled_count: number;
};

export type DashboardOverview = {
  overdue_actions: DashboardItem[];
  overdue_questions: DashboardItem[];
  due_today_actions: DashboardItem[];
  due_today_questions: DashboardItem[];
  due_today_events: DashboardItem[];
  critical_actions: DashboardItem[];
  critical_questions: DashboardItem[];
  this_week_actions: DashboardItem[];
  this_week_events: DashboardItem[];
  this_week_questions: DashboardItem[];
  festival_grid: FestivalGridItem[];
  stats: {
    open_actions_total: number;
    open_actions_week: number;
    critical_actions: number;
    open_questions_total: number;
    critical_questions: number;
    contracts_signed: number;
    contracts_total: number;
    active_rules: number;
    total_contacts: number;
    stalled_contracts: number;
  };
};

export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: async (): Promise<DashboardOverview> => {
      const { data, error } = await (supabase as any).rpc("get_dashboard_overview");
      if (error) throw error;
      return data as DashboardOverview;
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useActivityFeed(limit = 10) {
  return useQuery({
    queryKey: ["dashboard-activity", limit],
    queryFn: async () => {
      const [actions, contracts, facade, events, questions] = await Promise.all([
        supabase.from("festival_action_items").select("id,title,status,updated_at,festival_id").order("updated_at", { ascending: false }).limit(limit),
        supabase.from("festival_contracts").select("id,concept_alias,contract_status,updated_at,festival_id").order("updated_at", { ascending: false }).limit(limit),
        (supabase as any).from("festival_facade").select("id,design_status,updated_at,festival_contract_id").order("updated_at", { ascending: false }).limit(limit),
        (supabase as any).from("festival_timeline_event").select("id,title,status,updated_at,festival_id").order("updated_at", { ascending: false }).limit(limit),
        (supabase as any).from("festival_open_questions").select("id,question,status,updated_at,festival_id").eq("visibility", "public").order("updated_at", { ascending: false }).limit(limit),
      ]);
      const rows: { kind: string; label: string; ts: string; festival_id?: string | null; href?: string }[] = [];
      (actions.data ?? []).forEach((r: any) => rows.push({ kind: "Action", label: `${r.status === "closed" ? "Closed" : "Updated"}: ${r.title}`, ts: r.updated_at, festival_id: r.festival_id }));
      (contracts.data ?? []).forEach((r: any) => rows.push({ kind: "Contract", label: `${r.concept_alias ?? "Contract"} → ${r.contract_status}`, ts: r.updated_at, festival_id: r.festival_id }));
      (facade.data ?? []).forEach((r: any) => rows.push({ kind: "Facade", label: `Design status → ${r.design_status}`, ts: r.updated_at }));
      (events.data ?? []).forEach((r: any) => rows.push({ kind: "Timeline", label: `${r.title} (${r.status})`, ts: r.updated_at, festival_id: r.festival_id }));
      (questions.data ?? []).forEach((r: any) => rows.push({ kind: "Question", label: `${r.status === "resolved" ? "Resolved" : "Updated"}: ${r.question?.slice(0, 80)}`, ts: r.updated_at, festival_id: r.festival_id }));
      return rows.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, limit);
    },
    refetchInterval: 60_000,
  });
}
