import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export type SyncJob = {
  id: string;
  created_at: string;
  status: string;
  sync_from: string | null;
  sync_to: string | null;
  total_emails_found: number;
  total_processed: number;
  total_invoices_extracted: number;
  total_skipped: number;
  current_batch: number;
  total_batches: number;
  last_uid_processed: string | null;
  current_subject: string | null;
  error_log: any;
  started_at: string | null;
  completed_at: string | null;
};

export function useLatestSyncJob() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["sync-job-latest"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("email_sync_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as SyncJob) || null;
    },
    refetchInterval: (query) => {
      const job = query.state.data as SyncJob | null;
      if (job?.status === "running") return 3000;
      return false;
    },
  });

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel("sync-jobs-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "email_sync_jobs",
      }, () => {
        qc.invalidateQueries({ queryKey: ["sync-job-latest"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

export function useStartSync() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { sync_from: string; sync_to: string; batch_size?: number }) => {
      const { data, error } = await supabase.functions.invoke("imap-sync", {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-job-latest"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
