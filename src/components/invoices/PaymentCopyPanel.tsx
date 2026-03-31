import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Invoice } from "@/hooks/useInvoices";
import { toast } from "sonner";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-xs font-mono text-foreground flex-1">{value}</span>
      <button onClick={copy} className="ml-2 p-1 rounded hover:bg-secondary/60 transition-colors">
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
      </button>
    </div>
  );
}

export default function PaymentCopyPanel({ invoice }: { invoice: Invoice }) {
  const fields = [
    { label: "Account number:", value: invoice.payment_account || "—" },
    { label: "Amount:", value: `${invoice.currency || "DKK"} ${invoice.total_with_vat?.toLocaleString("da-DK") || invoice.amount?.toLocaleString("da-DK") || "—"}` },
    { label: "Due date:", value: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("da-DK") : "—" },
    { label: "Invoice reference:", value: invoice.payment_reference || invoice.invoice_number || "—" },
    { label: "Supplier:", value: invoice.supplier_name || "—" },
  ];

  const copyAll = () => {
    const block = fields.map((f) => `${f.label.padEnd(20)} ${f.value}`).join("\n");
    navigator.clipboard.writeText(block);
    toast.success("Payment details copied");
  };

  return (
    <div className="mx-5 mb-5 p-4 rounded-xl bg-secondary/40 border border-border/30">
      <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-2">
        Payment details — ready to paste into Nordea
      </div>
      <div className="divide-y divide-border/20">
        {fields.map((f) => (
          <CopyField key={f.label} label={f.label} value={f.value} />
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="mt-3 rounded-xl text-xs gap-1.5 w-full"
        onClick={copyAll}
      >
        <Copy className="h-3 w-3" /> Copy all
      </Button>
    </div>
  );
}
