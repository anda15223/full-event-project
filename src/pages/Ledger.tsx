import { useState, useMemo } from "react";
import { FileText, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLedger } from "@/hooks/useInvoices";

export default function Ledger() {
  const [company, setCompany] = useState("all");
  const [supplier, setSupplier] = useState("");
  const [location, setLocation] = useState("all");

  const { data: entries, isLoading } = useLedger({
    company: company !== "all" ? company : undefined,
    supplier: supplier || undefined,
    location: location !== "all" ? location : undefined,
  });

  const all = entries || [];

  const companies = useMemo(() => [...new Set(all.map((e) => e.company).filter(Boolean))] as string[], [all]);
  const locations = useMemo(() => [...new Set(all.map((e) => e.location).filter(Boolean))] as string[], [all]);

  const totalAmount = all.reduce((s, e) => s + (e.total_with_vat || 0), 0);

  const exportCSV = () => {
    const headers = ["Date Paid", "Supplier", "Invoice #", "Location", "Company", "What Was Bought", "Amount", "VAT", "Total"];
    const rows = all.map((e) => [
      e.paid_date || "", e.supplier_name || "", e.invoice_number || "", e.location || "",
      e.company || "", e.what_was_bought || "",
      e.amount?.toString() || "", e.vat_amount?.toString() || "", e.total_with_vat?.toString() || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ledger.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-agent-green/10 via-success/5 to-transparent border border-agent-green/15 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-agent-green" />
              <span className="text-xs font-semibold tracking-wider uppercase text-agent-green">Financial Archive</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tight text-foreground">Ledger</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {all.length} paid invoice{all.length !== 1 ? "s" : ""} · Total: {totalAmount.toLocaleString("da-DK")} DKK
            </p>
          </div>
          <Button onClick={exportCSV} className="rounded-xl bg-agent-green hover:bg-agent-green/90 text-white gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={company} onValueChange={setCompany}>
          <SelectTrigger className="w-44 rounded-xl bg-card border-border/40 text-xs h-9">
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger className="w-40 rounded-xl bg-card border-border/40 text-xs h-9">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[160px]">
          <Input
            placeholder="Search supplier..."
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="rounded-xl bg-card border-border/40 text-xs h-9"
          />
        </div>
      </div>

      {/* Table — each invoice is its own row, never merged */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading ledger...</div>
      ) : all.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/40 p-12 text-center shadow-sm">
          <FileText className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
          <h3 className="text-lg font-heading font-semibold text-foreground mb-1">Ledger is empty</h3>
          <p className="text-sm text-muted-foreground">Paid invoices will appear here</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30 bg-secondary/30 text-muted-foreground">
                  <th className="text-left px-5 py-3 font-medium">Date Paid</th>
                  <th className="text-left px-3 py-3 font-medium">Supplier</th>
                  <th className="text-left px-3 py-3 font-medium">Invoice #</th>
                  <th className="text-left px-3 py-3 font-medium">Location</th>
                  <th className="text-left px-3 py-3 font-medium">Company</th>
                  <th className="text-left px-3 py-3 font-medium">Bought</th>
                  <th className="text-right px-3 py-3 font-medium">Amount</th>
                  <th className="text-right px-3 py-3 font-medium">VAT</th>
                  <th className="text-right px-5 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {all.map((e) => (
                  <tr key={e.id} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-3 text-foreground">{e.paid_date ? new Date(e.paid_date).toLocaleDateString("da-DK") : "—"}</td>
                    <td className="px-3 py-3 font-medium text-foreground">{e.supplier_name || "—"}</td>
                    <td className="px-3 py-3 font-mono text-muted-foreground">{e.invoice_number || "—"}</td>
                    <td className="px-3 py-3">{e.location || "—"}</td>
                    <td className="px-3 py-3">{e.company || "—"}</td>
                    <td className="px-3 py-3 max-w-[200px] truncate">{e.what_was_bought || "—"}</td>
                    <td className="px-3 py-3 text-right font-mono">{e.amount?.toLocaleString("da-DK") || "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-muted-foreground">{e.vat_amount?.toLocaleString("da-DK") || "—"}</td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-agent-green">{e.total_with_vat?.toLocaleString("da-DK") || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/40 bg-secondary/20">
                  <td colSpan={6} className="px-5 py-3 text-xs font-semibold text-foreground">Total ({all.length} invoices)</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold">{all.reduce((s, e) => s + (e.amount || 0), 0).toLocaleString("da-DK")}</td>
                  <td className="px-3 py-3 text-right font-mono text-muted-foreground">{all.reduce((s, e) => s + (e.vat_amount || 0), 0).toLocaleString("da-DK")}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-agent-green">{totalAmount.toLocaleString("da-DK")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}