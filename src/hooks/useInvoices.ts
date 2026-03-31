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
  category: string | null;
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
  category?: string;
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
      if (filters?.category && filters.category !== "all") q = q.eq("category", filters.category);

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
      const paidDate = new Date().toISOString().split("T")[0];

      // 1. Update invoice status
      const { error: updateErr } = await (supabase as any)
        .from("invoices")
        .update({ status: "paid", overdue_flag: false })
        .eq("id", invoice.id);
      if (updateErr) throw updateErr;

      // 2. Create cashflow entry
      await (supabase as any).from("cashflow_entries").insert({
        relates_to_invoice_id: invoice.id,
        supplier_name: invoice.supplier_name,
        amount: invoice.total_with_vat || invoice.amount,
        currency: invoice.currency || "DKK",
        company: invoice.company,
        location: invoice.location,
        description: invoice.what_was_bought,
        reference: invoice.payment_reference,
        direction: "out",
        entry_type: invoice.category === "cashflow_pbs" ? "pbs_debit" : "bank_transfer",
        entry_date: paidDate,
        status: "recorded",
      });

      // 3. Create ledger entry
      const { error: ledgerErr } = await (supabase as any).from("ledger").insert({
        invoice_id: invoice.id,
        supplier_name: invoice.supplier_name,
        amount: invoice.amount,
        vat_amount: invoice.vat_amount,
        total_with_vat: invoice.total_with_vat,
        company: invoice.company,
        location: invoice.location,
        what_was_bought: invoice.what_was_bought,
        paid_date: paidDate,
        payment_reference: invoice.payment_reference,
        invoice_number: invoice.invoice_number,
      });
      if (ledgerErr) throw ledgerErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["cashflow-entries"] });
      toast.success("Invoice marked as paid → cashflow + ledger updated");
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
      const { error } = await (supabase as any)
        .from("invoices")
        .update({ [field]: value })
        .eq("id", invoiceId);
      if (error) throw error;

      await (supabase as any).from("supplier_corrections").insert({
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
