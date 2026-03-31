import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Invoice = {
  id: string;
  created_at: string;
  email_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number | null;
  currency: string | null;
  vat_amount: number | null;
  total_with_vat: number | null;
  company: string | null;
  location: string | null;
  status: string | null;
  overdue_flag: boolean | null;
  pdf_url: string | null;
  payment_account: string | null;
  payment_reference: string | null;
  what_was_bought: string | null;
  confidence: number | null;
  source_type: string | null;
  notes: string | null;
};

export type Supplier = {
  id: string;
  name: string;
  email_domain: string | null;
  known_locations: string[] | null;
  known_companies: string[] | null;
  payment_account: string | null;
  payment_terms: string | null;
  vat_included: boolean | null;
  is_web_order_supplier: boolean | null;
  reconcile_with: string | null;
  correction_count: number | null;
};

export type LedgerEntry = {
  id: string;
  created_at: string;
  invoice_id: string | null;
  supplier_name: string | null;
  amount: number | null;
  vat_amount: number | null;
  total_with_vat: number | null;
  company: string | null;
  location: string | null;
  what_was_bought: string | null;
  paid_date: string | null;
  payment_reference: string | null;
  invoice_number: string | null;
};

export function useInvoices(filters?: {
  status?: string;
  company?: string;
  location?: string;
  supplier?: string;
  sort?: string;
}) {
  return useQuery({
    queryKey: ["invoices", filters],
    queryFn: async () => {
      let q = (supabase as any).from("invoices").select("*");
      if (filters?.status && filters.status !== "all") {
        if (filters.status === "due_this_week") {
          const today = new Date().toISOString().split("T")[0];
          const week = new Date();
          week.setDate(week.getDate() + 7);
          q = q.gte("due_date", today).lte("due_date", week.toISOString().split("T")[0]).neq("status", "paid");
        } else {
          q = q.eq("status", filters.status);
        }
      }
      if (filters?.company && filters.company !== "all") q = q.eq("company", filters.company);
      if (filters?.location && filters.location !== "all") q = q.eq("location", filters.location);
      if (filters?.supplier) q = q.ilike("supplier_name", `%${filters.supplier}%`);

      const sortField = filters?.sort || "due_date";
      q = q.order(sortField, { ascending: sortField === "due_date", nullsFirst: false });

      const { data, error } = await q;
      if (error) throw error;
      return data as Invoice[];
    },
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("suppliers").select("*");
      if (error) throw error;
      return data as Supplier[];
    },
  });
}

export function useLedger(filters?: { supplier?: string; company?: string; location?: string }) {
  return useQuery({
    queryKey: ["ledger", filters],
    queryFn: async () => {
      let q = (supabase as any).from("ledger").select("*").order("paid_date", { ascending: false });
      if (filters?.supplier) q = q.ilike("supplier_name", `%${filters.supplier}%`);
      if (filters?.company && filters.company !== "all") q = q.eq("company", filters.company);
      if (filters?.location && filters.location !== "all") q = q.eq("location", filters.location);
      const { data, error } = await q;
      if (error) throw error;
      return data as LedgerEntry[];
    },
  });
}

export function useMarkAsPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoice: Invoice) => {
      // Update invoice status
      const { error: updateErr } = await supabase
        .from("invoices")
        .update({ status: "paid", overdue_flag: false })
        .eq("id", invoice.id);
      if (updateErr) throw updateErr;

      // Create ledger entry
      const { error: ledgerErr } = await supabase.from("ledger").insert({
        invoice_id: invoice.id,
        supplier_name: invoice.supplier_name,
        amount: invoice.amount,
        vat_amount: invoice.vat_amount,
        total_with_vat: invoice.total_with_vat,
        company: invoice.company,
        location: invoice.location,
        what_was_bought: invoice.what_was_bought,
        paid_date: new Date().toISOString().split("T")[0],
        payment_reference: invoice.payment_reference,
        invoice_number: invoice.invoice_number,
      });
      if (ledgerErr) throw ledgerErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success("Invoice moved to ledger");
    },
    onError: () => toast.error("Failed to mark as paid"),
  });
}

export function useUpdateInvoiceField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      field,
      value,
      oldValue,
      supplierName,
    }: {
      invoiceId: string;
      field: string;
      value: string;
      oldValue: string;
      supplierName: string;
    }) => {
      // Update the invoice
      const { error } = await supabase
        .from("invoices")
        .update({ [field]: value })
        .eq("id", invoiceId);
      if (error) throw error;

      // Record correction
      await supabase.from("supplier_corrections").insert({
        supplier_name: supplierName,
        field_corrected: field,
        old_value: oldValue,
        new_value: value,
        invoice_id: invoiceId,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`Got it — I'll remember this for ${vars.supplierName} next time`);
    },
    onError: () => toast.error("Failed to update"),
  });
}
