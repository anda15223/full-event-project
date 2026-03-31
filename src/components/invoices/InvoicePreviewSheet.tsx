import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  FileText, Building2, MapPin, Calendar, Hash, DollarSign,
  CreditCard, AlertTriangle, ExternalLink, Copy, Check, ShieldCheck,
} from "lucide-react";
import type { Invoice } from "@/hooks/useInvoices";
import { useMarkAsPaid } from "@/hooks/useInvoices";
import { toast } from "sonner";
import PdfUploadButton from "./PdfUploadButton";
import { useQueryClient } from "@tanstack/react-query";

function DetailRow({ icon: Icon, label, value, className }: { icon: any; label: string; value: string; className?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className={`text-sm font-medium text-foreground mt-0.5 ${className || ""}`}>{value}</div>
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/10 last:border-0">
      <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="text-xs font-mono text-foreground flex-1">{value}</span>
      <button onClick={copy} className="ml-2 p-1 rounded hover:bg-secondary/60 transition-colors">
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
      </button>
    </div>
  );
}

interface Props {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function InvoicePreviewSheet({ invoice, open, onOpenChange }: Props) {
  const [confirmStep, setConfirmStep] = useState(false);
  const inv = invoice;
  const [localPdfUrl, setLocalPdfUrl] = useState(inv.pdf_url);
  const markPaid = useMarkAsPaid();
  const queryClient = useQueryClient();

  const sl = inv.status === "overdue" || inv.overdue_flag ? "OVERDUE"
    : inv.status === "paid" ? "PAID" : "PENDING";

  const statusColor = sl === "OVERDUE" ? "text-destructive" : sl === "PAID" ? "text-success" : "text-warning";

  const handleMarkPaid = () => {
    markPaid.mutate(inv, {
      onSuccess: () => {
        setConfirmStep(false);
        onOpenChange(false);
      },
    });
  };

  const copyAll = () => {
    const block = [
      `Account: ${inv.payment_account || "—"}`,
      `Amount: ${inv.currency || "DKK"} ${inv.total_with_vat?.toLocaleString("da-DK") || inv.amount?.toLocaleString("da-DK") || "—"}`,
      `Due: ${inv.due_date ? new Date(inv.due_date).toLocaleDateString("da-DK") : "—"}`,
      `Reference: ${inv.payment_reference || inv.invoice_number || "—"}`,
      `Supplier: ${inv.supplier_name || "—"}`,
    ].join("\n");
    navigator.clipboard.writeText(block);
    toast.success("Payment details copied");
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); setConfirmStep(false); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/30">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-4 w-4 text-agent-green" />
            <span className="text-[10px] font-semibold tracking-wider uppercase text-agent-green">Invoice Review</span>
          </div>
          <SheetTitle className="text-xl font-heading">
            {inv.supplier_name || "Unknown Supplier"}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <span className="font-mono text-xs">{inv.invoice_number}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
              sl === "OVERDUE" ? "bg-destructive/10 text-destructive border-destructive/20"
              : sl === "PAID" ? "bg-success/10 text-success border-success/20"
              : "bg-warning/10 text-warning border-warning/20"
            }`}>{sl}</span>
          </SheetDescription>
        </SheetHeader>

        {/* PDF Preview */}
        <div className="mt-4">
          {localPdfUrl ? (
            <div className="rounded-xl border border-border/40 overflow-hidden bg-secondary/20">
              <div className="px-4 py-2 bg-secondary/40 border-b border-border/30 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Document Preview</span>
                <a href={localPdfUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                    <ExternalLink className="h-3 w-3" /> Open full
                  </Button>
                </a>
              </div>
              <iframe
                src={localPdfUrl}
                className="w-full h-[400px] border-0"
                title="Invoice PDF"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-secondary/20 p-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-xs text-muted-foreground font-medium">No PDF attached</p>
              <p className="text-[10px] text-muted-foreground mt-1 mb-3">Upload the source document to verify before paying</p>
              <PdfUploadButton
                invoiceId={inv.id}
                onUploaded={(url) => {
                  setLocalPdfUrl(url);
                  queryClient.invalidateQueries({ queryKey: ["invoices"] });
                }}
              />
            </div>
          )}
        </div>

        {/* Invoice details */}
        <div className="mt-4 rounded-xl border border-border/40 bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Extracted Details</p>
          <DetailRow icon={Building2} label="Supplier" value={inv.supplier_name || "—"} />
          <DetailRow icon={Hash} label="Invoice Number" value={inv.invoice_number || "—"} />
          <DetailRow icon={MapPin} label="Company" value={inv.company || "—"} />
          <DetailRow icon={MapPin} label="Location" value={inv.location || "—"} />
          <DetailRow icon={Calendar} label="Invoice Date" value={inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("da-DK") : "—"} />
          <DetailRow icon={Calendar} label="Due Date" value={inv.due_date ? new Date(inv.due_date).toLocaleDateString("da-DK") : "—"} className={statusColor} />
          <DetailRow icon={DollarSign} label="Amount (excl. VAT)" value={`${inv.amount?.toLocaleString("da-DK") || "—"} ${inv.currency || "DKK"}`} />
          <DetailRow icon={DollarSign} label="VAT" value={`${inv.vat_amount?.toLocaleString("da-DK") || "—"} ${inv.currency || "DKK"}`} />
          <DetailRow icon={DollarSign} label="Total (incl. VAT)" value={`${inv.total_with_vat?.toLocaleString("da-DK") || "—"} ${inv.currency || "DKK"}`} className="text-agent-green font-bold" />
          {inv.what_was_bought && <DetailRow icon={FileText} label="Description" value={inv.what_was_bought} />}
          {inv.confidence != null && (
            <DetailRow icon={ShieldCheck} label="AI Confidence" value={`${Math.round(inv.confidence * 100)}%`} />
          )}
          {inv.source_type && <DetailRow icon={FileText} label="Source" value={inv.source_type} />}
        </div>

        {/* Payment details — copy section */}
        {inv.payment_account && (
          <div className="mt-4 rounded-xl border border-border/40 bg-secondary/20 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Details</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={copyAll}>
                <Copy className="h-3 w-3" /> Copy all
              </Button>
            </div>
            <CopyRow label="Account:" value={inv.payment_account || "—"} />
            <CopyRow label="Amount:" value={`${inv.currency || "DKK"} ${inv.total_with_vat?.toLocaleString("da-DK") || inv.amount?.toLocaleString("da-DK") || "—"}`} />
            <CopyRow label="Due date:" value={inv.due_date ? new Date(inv.due_date).toLocaleDateString("da-DK") : "—"} />
            <CopyRow label="Reference:" value={inv.payment_reference || inv.invoice_number || "—"} />
          </div>
        )}

        {/* Mark as paid — with safety */}
        {inv.status !== "paid" && (
          <div className="mt-6 space-y-3">
            {!confirmStep ? (
              <Button
                className="w-full rounded-xl bg-success hover:bg-success/90 text-success-foreground gap-2 h-11"
                onClick={() => setConfirmStep(true)}
              >
                <CreditCard className="h-4 w-4" /> I've reviewed — Mark as paid
              </Button>
            ) : (
              <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Confirm payment</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      You are marking <span className="font-mono font-bold">{inv.invoice_number}</span> from{" "}
                      <span className="font-semibold">{inv.supplier_name}</span> as paid.
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Amount: <span className="font-mono font-bold text-foreground">{inv.total_with_vat?.toLocaleString("da-DK") || inv.amount?.toLocaleString("da-DK")} {inv.currency || "DKK"}</span>
                    </p>
                    <p className="text-xs text-destructive mt-1 font-medium">This will move the invoice to the ledger.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 rounded-xl bg-success hover:bg-success/90 text-success-foreground gap-2"
                    onClick={handleMarkPaid}
                    disabled={markPaid.isPending}
                  >
                    <Check className="h-4 w-4" /> Yes, mark as paid
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={() => setConfirmStep(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
