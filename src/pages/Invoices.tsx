import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText, Search, CheckCircle, Clock, Eye, ChevronDown, ChevronUp,
  DollarSign, Building2, Package, LayoutGrid, List,
} from "lucide-react";
import { useState, useMemo } from "react";
import { mockInvoices, invoiceStats, getSupplierStats } from "@/data/mockData";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", color: "bg-primary/10 text-primary border-primary/20", icon: <Clock className="w-3 h-3" /> },
  reviewed: { label: "Reviewed", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: <Eye className="w-3 h-3" /> },
  sent_to_economic: { label: "Sent", color: "bg-accent/10 text-accent border-accent/20", icon: <CheckCircle className="w-3 h-3" /> },
  paid: { label: "Paid", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: <CheckCircle className="w-3 h-3" /> },
  rejected: { label: "Rejected", color: "bg-destructive/10 text-destructive border-destructive/20", icon: <Clock className="w-3 h-3" /> },
};

const INVOICE_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  faktura: { label: "Faktura", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  pbs: { label: "PBS", color: "bg-accent/10 text-accent border-accent/20" },
  unknown: { label: "Unknown", color: "bg-muted text-muted-foreground border-border" },
};

type TabType = "all" | "faktura" | "pbs" | "pending" | "paid";
type ViewMode = "list" | "company";

function InvoiceRow({ inv, expandedRow, setExpandedRow }: { inv: typeof mockInvoices[0]; expandedRow: number | null; setExpandedRow: (id: number | null) => void }) {
  const statusCfg = STATUS_CONFIG[inv.status];
  const typeCfg = INVOICE_TYPE_CONFIG[inv.invoiceType];
  const isExpanded = expandedRow === inv.id;

  return (
    <Card className="glass-panel hover:border-primary/30 transition-all">
      <CardContent className="p-4">
        <div
          className="flex items-center gap-4 cursor-pointer"
          onClick={() => setExpandedRow(isExpanded ? null : inv.id)}
        >
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-medium truncate">{inv.supplier}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeCfg.color}`}>{typeCfg.label}</Badge>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusCfg.color}`}>
                {statusCfg.icon} <span className="ml-1">{statusCfg.label}</span>
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">#{inv.invoiceNumber} · {inv.products}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-bold font-mono">{inv.amount} {inv.currency}</div>
            <div className="text-xs text-muted-foreground">Due {inv.dueDate}</div>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>

        {isExpanded && inv.lineItems && (
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Package className="h-3 w-3" /> Line Items
            </h4>
            <div className="space-y-2">
              {inv.lineItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-muted/30 rounded-md px-3 py-2">
                  <div>
                    <span className="font-medium">{item.description}</span>
                    <span className="text-muted-foreground ml-2">×{item.quantity}</span>
                  </div>
                  <span className="font-mono">{item.total} DKK</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Invoices() {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("company");
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return mockInvoices.filter((inv) => {
      if (activeTab === "faktura" && inv.invoiceType !== "faktura") return false;
      if (activeTab === "pbs" && inv.invoiceType !== "pbs") return false;
      if (activeTab === "pending" && inv.status !== "pending") return false;
      if (activeTab === "paid" && inv.status !== "paid") return false;
      if (search) {
        const q = search.toLowerCase();
        return inv.supplier.toLowerCase().includes(q) || inv.invoiceNumber.toLowerCase().includes(q) || inv.products.toLowerCase().includes(q);
      }
      return true;
    });
  }, [activeTab, search]);

  // Group filtered invoices by supplier
  const groupedByCompany = useMemo(() => {
    const groups: Record<string, { invoices: typeof filtered; total: number; pending: number; paid: number }> = {};
    filtered.forEach(inv => {
      if (!groups[inv.supplier]) groups[inv.supplier] = { invoices: [], total: 0, pending: 0, paid: 0 };
      groups[inv.supplier].invoices.push(inv);
      groups[inv.supplier].total += parseFloat(inv.amount.replace(/,/g, ""));
      if (inv.status === "pending") groups[inv.supplier].pending++;
      if (inv.status === "paid") groups[inv.supplier].paid++;
    });
    // Sort by total descending
    return Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "all", label: "All", count: invoiceStats.total },
    { key: "faktura", label: "📄 Faktura", count: invoiceStats.faktura },
    { key: "pbs", label: "🔁 PBS", count: invoiceStats.pbs },
    { key: "pending", label: "Pending", count: invoiceStats.pending },
    { key: "paid", label: "Paid", count: invoiceStats.paid },
  ];

  const formatAmount = (n: number) => n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary" /> Invoice Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Review, manage, and track invoices</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <FileText className="w-4 h-4 mr-2" /> Extract Invoices
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Invoices", value: invoiceStats.total, icon: FileText, color: "text-foreground" },
          { label: "Companies", value: groupedByCompany.length, icon: Building2, color: "text-primary" },
          { label: "Faktura / PBS", value: `${invoiceStats.faktura} / ${invoiceStats.pbs}`, icon: DollarSign, color: "text-orange-400" },
          { label: "Total Amount", value: `${invoiceStats.totalAmount} DKK`, icon: DollarSign, color: "text-primary" },
        ].map((s) => (
          <Card key={s.label} className="stat-card">
            <CardContent className="p-4">
              <s.icon className={`h-4 w-4 ${s.color} mb-2`} />
              <div className="text-xl font-bold font-heading">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs + Search + View Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {tabs.map(t => (
            <Button
              key={t.key}
              variant={activeTab === t.key ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(t.key)}
              className={activeTab === t.key ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}
            >
              {t.label} ({t.count})
            </Button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card w-48" />
          </div>
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode("company")}
              className={`px-3 py-1.5 text-xs flex items-center gap-1 transition-colors ${viewMode === "company" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> By Company
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs flex items-center gap-1 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <List className="h-3.5 w-3.5" /> All
            </button>
          </div>
        </div>
      </div>

      {/* Company View */}
      {viewMode === "company" ? (
        <div className="space-y-4">
          {groupedByCompany.map(([supplier, data]) => {
            const isOpen = expandedCompany === supplier;
            return (
              <Card key={supplier} className="glass-panel overflow-hidden">
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedCompany(isOpen ? null : supplier)}
                >
                  <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-primary font-heading">
                      {supplier.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-heading font-bold text-base truncate">{supplier}</h3>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border-border">
                        {data.invoices.length} invoice{data.invoices.length !== 1 ? "s" : ""}
                      </Badge>
                      {data.pending > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                          {data.pending} pending
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{data.paid} paid</span>
                      <span>·</span>
                      <span>{data.invoices.filter(i => i.invoiceType === "faktura").length} faktura</span>
                      <span>{data.invoices.filter(i => i.invoiceType === "pbs").length > 0 ? `· ${data.invoices.filter(i => i.invoiceType === "pbs").length} PBS` : ""}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold font-mono text-lg">{formatAmount(data.total)} <span className="text-xs text-muted-foreground">DKK</span></div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                </div>

                {isOpen && (
                  <div className="border-t border-border px-4 pb-4 space-y-2 pt-3">
                    {data.invoices.map(inv => (
                      <InvoiceRow key={inv.id} inv={inv} expandedRow={expandedRow} setExpandedRow={setExpandedRow} />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        /* Flat list view */
        <div className="space-y-3">
          {filtered.map(inv => (
            <InvoiceRow key={inv.id} inv={inv} expandedRow={expandedRow} setExpandedRow={setExpandedRow} />
          ))}
        </div>
      )}
    </div>
  );
}
