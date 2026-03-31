import { useState, useMemo } from "react";
import { FileText, Download } from "lucide-react";
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

  // Group by supplier
  const grouped = useMemo(() => {
    const map = new Map<string, typeof all>();
    all.forEach((e) => {
      const key = e.supplier_name || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);

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
            <p className="text-sm text-muted-foreground mt-1">All paid invoices, grouped by supplier</p>
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

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading ledger...</div>
      ) : all.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/40 p-12 text-center shadow-sm">
          <FileText className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
          <h3 className="text-lg font-heading font-semibold text-foreground mb-1">Ledger is empty</h3>
          <p className="text-sm text-muted-foreground">Paid invoices will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([supplierName, items]) => (
            <div key={supplierName} className="bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-secondary/30 border-b border-border/30 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{supplierName}</span>
                <span className="text-xs text-muted-foreground">
                  {items.length} invoice{items.length > 1 ? "s" : ""} · {items.reduce((s, i) => s + (i.total_with_vat || 0), 0).toLocaleString("da-DK")} DKK
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/20 text-muted-foreground">
                      <th className="text-left px-5 py-2 font-medium">Date Paid</th>
                      <th className="text-left px-3 py-2 font-medium">Invoice #</th>
                      <th className="text-left px-3 py-2 font-medium">Location</th>
                      <th className="text-left px-3 py-2 font-medium">Company</th>
                      <th className="text-left px-3 py-2 font-medium">Bought</th>
                      <th className="text-right px-3 py-2 font-medium">Amount</th>
                      <th className="text-right px-3 py-2 font-medium">VAT</th>
                      <th className="text-right px-5 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => (
                      <tr key={e.id} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-2.5 text-foreground">{e.paid_date ? new Date(e.paid_date).toLocaleDateString("da-DK") : "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground">{e.invoice_number || "—"}</td>
                        <td className="px-3 py-2.5">{e.location || "—"}</td>
                        <td className="px-3 py-2.5">{e.company || "—"}</td>
                        <td className="px-3 py-2.5 max-w-[200px] truncate">{e.what_was_bought || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{e.amount?.toLocaleString("da-DK") || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{e.vat_amount?.toLocaleString("da-DK") || "—"}</td>
                        <td className="px-5 py-2.5 text-right font-mono font-semibold text-agent-green">{e.total_with_vat?.toLocaleString("da-DK") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
