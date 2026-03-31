import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Email = {
  id: string;
  message_id: string | null;
  subject: string | null;
  sender: string | null;
  body_text: string | null;
  received_at: string | null;
  classification: string | null;
  company: string | null;
  summary: string | null;
  action_required: boolean | null;
  confidence: number | null;
  needs_review: boolean | null;
  review_reason: string | null;
  processed: boolean | null;
  created_at: string;
};

export type EmailTask = {
  id: string;
  email_id: string | null;
  title: string;
  company: string | null;
  priority: string | null;
  status: string | null;
  due_date: string | null;
  owner: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailInvoice = {
  id: string;
  email_id: string | null;
  company: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number | null;
  currency: string | null;
  vat: number | null;
  attachment_present: boolean | null;
  created_at: string;
};

export type Company = {
  id: string;
  name: string;
  country_group: string;
  active: boolean;
};

export function useEmails(filters?: {
  classification?: string;
  company?: string;
  needs_review?: boolean;
}) {
  return useQuery({
    queryKey: ["emails", filters],
    queryFn: async () => {
      let query = supabase
        .from("emails")
        .select("*")
        .order("received_at", { ascending: false });

      if (filters?.classification) query = query.eq("classification", filters.classification);
      if (filters?.company) query = query.eq("company", filters.company);
      if (filters?.needs_review !== undefined) query = query.eq("needs_review", filters.needs_review);

      query = query.range(0, 4999);

      const { data, error } = await query;
      if (error) throw error;
      return data as Email[];
    },
  });
}

export function useEmailTasks(filters?: {
  company?: string;
  status?: string;
  priority?: string;
}) {
  return useQuery({
    queryKey: ["email_tasks", filters],
    queryFn: async () => {
      let query = supabase
        .from("email_tasks")
        .select("*, emails(subject, sender)")
        .order("created_at", { ascending: false });
      
      if (filters?.company) query = query.eq("company", filters.company);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.priority) query = query.eq("priority", filters.priority);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useEmailInvoices(filters?: {
  company?: string;
}) {
  return useQuery({
    queryKey: ["email_invoices", filters],
    queryFn: async () => {
      let query = supabase
        .from("email_invoices")
        .select("*, emails(subject, sender)")
        .order("created_at", { ascending: false });
      
      if (filters?.company) query = query.eq("company", filters.company);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Company[];
    },
  });
}

export function useFetchEmails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sinceDate?: string) => {
      const limit = 10; // Header-only fetch is lightweight, 10 per batch is safe
      let offset = 0;
      let totalFound = 0;
      let totalFetched = 0;
      let totalInserted = 0;
      let hasMore = true;
      let consecutiveErrors = 0;

      while (hasMore) {
        try {
          const { data, error } = await supabase.functions.invoke("fetch-emails", {
            body: { since_date: sinceDate, limit, offset },
          });
          if (error) throw error;

          consecutiveErrors = 0;
          const fetched = data?.fetched || 0;
          totalFound = data?.total_found || totalFound;
          totalFetched += fetched;
          totalInserted += data?.inserted || 0;
          offset = data?.next_offset ?? offset + fetched;
          hasMore = Boolean(data?.has_more) && fetched > 0;

          if (fetched === 0) hasMore = false;

          // Invalidate after each batch so UI updates
          queryClient.invalidateQueries({ queryKey: ["emails"] });

          // Small delay between batches to let the worker cool down
          if (hasMore) {
            await new Promise(r => setTimeout(r, 1500));
          }
        } catch (err: any) {
          consecutiveErrors++;
          console.warn(`Fetch batch error (attempt ${consecutiveErrors}):`, err);
          if (consecutiveErrors >= 2) {
            // Stop after 2 consecutive errors but return partial results
            break;
          }
          // Wait before retry
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      return {
        total_found: totalFound,
        fetched: totalFetched,
        inserted: totalInserted,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success(`Fetched ${data.fetched || 0} emails, ${data.inserted || 0} stored`);
    },
    onError: (err: Error) => {
      toast.error("Failed to fetch emails: " + err.message);
    },
  });
}

export function useClassifyEmails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (emailIds?: string[]) => {
      const { data, error } = await supabase.functions.invoke("classify-emails", {
        body: { email_ids: emailIds, batch_size: 20 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["email_invoices"] });
      toast.success(`Classified ${data.processed || 0} emails`);
    },
    onError: (err: Error) => {
      toast.error("Classification failed: " + err.message);
    },
  });
}

export function useClassifyAllEmails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      let totalProcessed = 0;
      let totalErrors = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("classify-emails", {
          body: { batch_size: 20 },
        });
        if (error) throw error;
        
        totalProcessed += data.processed || 0;
        totalErrors += data.errors || 0;
        
        if ((data.processed || 0) === 0) {
          hasMore = false;
        }
        
        queryClient.invalidateQueries({ queryKey: ["emails"] });
        queryClient.invalidateQueries({ queryKey: ["email_tasks"] });
        queryClient.invalidateQueries({ queryKey: ["email_invoices"] });
      }
      
      return { processed: totalProcessed, errors: totalErrors };
    },
    onSuccess: (data) => {
      toast.success(`Classified all: ${data.processed} emails processed, ${data.errors} errors`);
    },
    onError: (err: Error) => {
      toast.error("Classify all failed: " + err.message);
    },
  });
}

export function useUpdateEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Email> }) => {
      const { error } = await supabase.from("emails").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success("Email updated");
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<EmailTask> }) => {
      const { error } = await supabase.from("email_tasks").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_tasks"] });
      toast.success("Task updated");
    },
  });
}
