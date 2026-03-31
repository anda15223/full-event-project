import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText, Search, CheckCircle, Clock, Eye, ChevronDown, ChevronUp,
  DollarSign, Building2, Package, Calendar,
} from "lucide-react";
import { useState, useMemo } from "react";
import { mockInvoices, invoiceStats } from "@/data/mockData";

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

export default function Invoices() {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

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

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "all", label: "All", count: invoiceStats.total },
    { key: "faktura", label: "📄 Faktura", count: invoiceStats.faktura },
    { key: "pbs", label: "🔁 PBS", count: invoiceStats.pbs },
    { key: "pending", label: "Pending", count: invoiceStats.pending },
    { key: "paid", label: "Paid", count: invoiceStats.paid },
  ];

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
          { label: "Total", value: invoiceStats.total, icon: FileText, color: "text-foreground" },
          { label: "Faktura", value: invoiceStats.faktura, icon: DollarSign, color: "text-orange-400" },
          { label: "PBS", value: invoiceStats.pbs, icon: Building2, color: "text-accent" },
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

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5 flex-wrap">
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
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card" />
        </div>
      </div>

      {/* Invoice list */}
      <div className="space-y-3">
        {filtered.map((inv) => {
          const statusCfg = STATUS_CONFIG[inv.status];
          const typeCfg = INVOICE_TYPE_CONFIG[inv.invoiceType];
          const isExpanded = expandedRow === inv.id;

          return (
            <Card key={inv.id} className="glass-panel hover:border-primary/30 transition-all">
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
        })}
      </div>
    </div>
  );
}
