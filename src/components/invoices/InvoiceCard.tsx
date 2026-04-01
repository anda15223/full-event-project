import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, CreditCard, ChevronDown, ExternalLink, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Invoice } from "@/hooks/useInvoices";
import { useUpdateInvoiceField, useMarkAsPaid } from "@/hooks/useInvoices";
import PaymentCopyPanel from "./PaymentCopyPanel";
import InlineEdit from "./InlineEdit";
import InvoiceReviewPanel from "./InvoiceReviewPanel";
import PdfUploadButton from "./PdfUploadButton";
import InvoiceChatPanel from "./InvoiceChatPanel";

const LOCATION_COLORS: Record<string, string> = {
  "Fish Bistro": "bg-agent-blue/10 text-agent-blue border-agent-blue/20",
  "Gaia": "bg-success/10 text-success border-success/20",
  "The Fish Project Reffen": "bg-accent/10 text-accent border-accent/20",
};

const STATUS_STYLES: Record<string, string> = {
  overdue: "bg-destructive/10 text-destructive border-destructive/20",
  pending: "bg-secondary text-muted-foreground border-border/40",
  paid: "bg-success/10 text-success border-success/20",
};

function statusLabel(inv: Invoice) {
  if (inv.category === "credit_note" || inv.status === "credit") return "KREDIT";
  if (inv.status === "overdue" || inv.overdue_flag) return "OVERDUE";
  if (inv.status === "due_soon") return "DUE SOON";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const week = new Date(today); week.setDate(week.getDate() + 7);
  if (inv.due_date) {
    const d = new Date(inv.due_date);
    if (d < today) return "OVERDUE";
    if (d <= week) return "DUE SOON";
  }
  if (inv.status === "paid") return "PAID";
  return "PENDING";
}

function statusStyle(label: string) {
  if (label === "KREDIT") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (label === "OVERDUE") return STATUS_STYLES.overdue;
  if (label === "DUE SOON") return "bg-warning/10 text-warning border-warning/20";
  if (label === "PAID") return STATUS_STYLES.paid;
  return STATUS_STYLES.pending;
}

function leftBorder(inv: Invoice) {
  if (inv.category === "credit_note" || inv.status === "credit") return "border-l-4 border-l-emerald-500";
  if (inv.status === "overdue" || inv.overdue_flag) return "border-l-4 border-l-destructive";
  if (inv.status === "due_soon") return "border-l-4 border-l-warning";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const week = new Date(today); week.setDate(week.getDate() + 7);
  if (inv.due_date && new Date(inv.due_date) <= week && new Date(inv.due_date) >= today)
    return "border-l-4 border-l-warning";
  return "";
}

export default function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const [showPayment, setShowPayment] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [localPdfUrl, setLocalPdfUrl] = useState(invoice.pdf_url);
  const updateField = useUpdateInvoiceField();
  const markAsPaid = useMarkAsPaid();
  const sl = statusLabel(invoice);

  const isWebOrder = invoice.source_type === "web_order";

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden ${leftBorder(invoice)}`}
      >
        <div className="p-5">
          {/* Top row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {invoice.notes?.toLowerCase().includes("rykker") && (
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md bg-destructive text-destructive-foreground border border-destructive/40 animate-pulse">
                  ⚠ RYKKER
                </span>
              )}
              <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md border ${statusStyle(sl)}`}>
                {sl}
              </span>
              {isWebOrder && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-warning/10 text-warning border border-warning/20">
                  🔄 Reconcile with Samhandel
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {invoice.confidence ? `${Math.round(invoice.confidence * 100)}% conf` : ""}
            </span>
          </div>

          {/* Main content */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            {/* Left */}
            <div className="flex-1 min-w-0 space-y-2">
              <InlineEdit
                value={invoice.supplier_name || "Unknown"}
                field="supplier_name"
                invoiceId={invoice.id}
                supplierName={invoice.supplier_name || "Unknown"}
                onSave={updateField.mutate}
                className="text-base font-semibold text-foreground"
              />
              <div className="text-xs text-muted-foreground font-mono">{invoice.invoice_number}</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {invoice.location && (
                  <InlineEdit
                    value={invoice.location}
                    field="location"
                    invoiceId={invoice.id}
                    supplierName={invoice.supplier_name || ""}
                    onSave={updateField.mutate}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${LOCATION_COLORS[invoice.location] || "bg-secondary text-muted-foreground border-border/40"}`}
                  />
                )}
                {invoice.company && (
                  <InlineEdit
                    value={invoice.company}
                    field="company"
                    invoiceId={invoice.id}
                    supplierName={invoice.supplier_name || ""}
                    onSave={updateField.mutate}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border/40"
                  />
                )}
              </div>
              {invoice.what_was_bought && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{invoice.what_was_bought}</p>
              )}
            </div>

            {/* Amounts */}
            <div className="text-right space-y-0.5 shrink-0">
              <div className="text-xl font-bold font-heading text-foreground">
                {invoice.amount?.toLocaleString("da-DK")} <span className="text-xs text-muted-foreground">{invoice.currency || "DKK"}</span>
              </div>
              {invoice.vat_amount != null && (
                <div className="text-xs text-muted-foreground">VAT: {invoice.vat_amount.toLocaleString("da-DK")}</div>
              )}
              {invoice.total_with_vat != null && (
                <div className="text-sm font-semibold text-agent-green">
                  Total: {invoice.total_with_vat.toLocaleString("da-DK")}
                </div>
              )}
              {invoice.due_date && (
                <div className={`text-xs font-medium mt-1 ${
                  invoice.status === "overdue" || invoice.overdue_flag
                    ? "text-destructive"
                    : sl === "DUE SOON" ? "text-warning" : "text-muted-foreground"
                }`}>
                  Due: {new Date(invoice.due_date).toLocaleDateString("da-DK")}
                </div>
              )}
            </div>
          </div>

          {/* Category badge */}
          {invoice.category && invoice.category !== "supplier_invoice" && (
            <div className="mt-2">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/40">
                {invoice.category === "operating_expense" ? "📱 Bill" :
                 invoice.category === "equipment" ? "🔧 Equipment" :
                 invoice.category === "cashflow_pbs" ? "🏦 PBS" :
                 invoice.category === "rykker" ? "⚠ Rykker" : invoice.category}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border/30">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl text-xs gap-1.5 h-8"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="h-3 w-3" /> Review Invoice
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl text-xs gap-1.5 h-8"
              onClick={() => setShowPayment(!showPayment)}
            >
              <Copy className="h-3 w-3" /> Payment details
              <ChevronDown className={`h-3 w-3 transition-transform ${showPayment ? "rotate-180" : ""}`} />
            </Button>
            {!localPdfUrl && (
              <PdfUploadButton invoiceId={invoice.id} onUploaded={(url) => setLocalPdfUrl(url)} />
            )}
            {/* Ask AI button */}
            <InvoiceChatPanel invoiceId={invoice.id} />

            {invoice.status !== "paid" && invoice.status !== "credit" && (
              <>
                <Button
                  size="sm"
                  className="rounded-xl text-xs gap-1.5 h-8 bg-success hover:bg-success/90 text-success-foreground"
                  onClick={() => setPreviewOpen(true)}
                >
                  <CreditCard className="h-3 w-3" /> Review & Pay
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl text-xs gap-1.5 h-8 border-success/40 text-success hover:bg-success/10"
                  onClick={() => markAsPaid.mutate(invoice)}
                  disabled={markAsPaid.isPending}
                >
                  <CreditCard className="h-3 w-3" /> Mark as Paid
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Payment copy panel */}
        <AnimatePresence>
          {showPayment && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <PaymentCopyPanel invoice={invoice} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Preview sheet */}
      <InvoiceReviewPanel invoice={invoice} open={previewOpen} onOpenChange={setPreviewOpen} />
    </>
  );
}
