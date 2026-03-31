import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { FileText, Building2, DollarSign, Calendar, Hash, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmailInvoices, useCompanies } from "@/hooks/useEmailAgent";

export default function AgentInvoices() {
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const { data: companies } = useCompanies();
  const { data: invoices, isLoading } = useEmailInvoices({
    company: filterCompany !== "all" ? filterCompany : undefined,
  });
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);

  const grouped = useMemo(() => {
    if (!invoices) return {};
    const map: Record<string, typeof invoices> = {};
    for (const inv of invoices) {
      const key = inv.company || "Unknown";
      if (!map[key]) map[key] = [];
      map[key].push(inv);
    }
    return map;
  }, [invoices]);

  const companyTotals = useMemo(() => {
    const totals: Record<string, { count: number; total: number; currency: string }> = {};
    for (const [company, invs] of Object.entries(grouped)) {
      totals[company] = {
        count: invs.length,
        total: invs.reduce((sum, i) => sum + (i.amount || 0), 0),
        currency: invs[0]?.currency || "DKK",
      };
    }
    return totals;
  }, [grouped]);

  // Separate Danish vs Romania
  const danishCompanies = Object.keys(grouped).filter(
    (c) => c !== "Romania" && c !== "Unknown"
  );
  const hasRomania = !!grouped["Romania"];
  const hasUnknown = !!grouped["Unknown"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Extracted Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invoices extracted from classified emails, grouped by company
          </p>
        </div>
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-48 bg-card border-border">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies?.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-lg border border-border bg-card">
          <p className="text-xs text-muted-foreground">Total Invoices</p>
          <p className="text-2xl font-bold text-foreground">{(invoices || []).length}</p>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <p className="text-xs text-muted-foreground">Companies</p>
          <p className="text-2xl font-bold text-foreground">{Object.keys(grouped).length}</p>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <p className="text-xs text-muted-foreground">Total Amount</p>
          <p className="text-2xl font-bold text-primary">
            {(invoices || []).reduce((s, i) => s + (i.amount || 0), 0).toLocaleString("da-DK")} DKK
          </p>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <p className="text-xs text-muted-foreground">With Attachments</p>
          <p className="text-2xl font-bold text-accent">
            {(invoices || []).filter((i) => i.attachment_present).length}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading invoices...</div>
      ) : (invoices || []).length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No invoices extracted yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Danish companies */}
          {danishCompanies.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                🇩🇰 Danish Companies
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {danishCompanies.map((company) => (
                  <CompanyInvoiceCard
                    key={company}
                    company={company}
                    invoices={grouped[company]}
                    totals={companyTotals[company]}
                    expanded={expandedCompany === company}
                    onToggle={() =>
                      setExpandedCompany(expandedCompany === company ? null : company)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Romania */}
          {hasRomania && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                🇷🇴 Romania (Grouped)
              </h2>
              <CompanyInvoiceCard
                company="Romania"
                invoices={grouped["Romania"]}
                totals={companyTotals["Romania"]}
                expanded={expandedCompany === "Romania"}
                onToggle={() =>
                  setExpandedCompany(expandedCompany === "Romania" ? null : "Romania")
                }
              />
            </div>
          )}

          {/* Unknown */}
          {hasUnknown && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                ⚠️ Unknown Company
              </h2>
              <CompanyInvoiceCard
                company="Unknown"
                invoices={grouped["Unknown"]}
                totals={companyTotals["Unknown"]}
                expanded={expandedCompany === "Unknown"}
                onToggle={() =>
                  setExpandedCompany(expandedCompany === "Unknown" ? null : "Unknown")
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompanyInvoiceCard({
  company,
  invoices,
  totals,
  expanded,
  onToggle,
}: {
  company: string;
  invoices: any[];
  totals: { count: number; total: number; currency: string };
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      className="border border-border rounded-lg bg-card overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors"
      >
        <div className="text-left">
          <p className="font-medium text-foreground">{company}</p>
          <p className="text-xs text-muted-foreground">
            {totals.count} invoice{totals.count !== 1 ? "s" : ""} ·{" "}
            <span className="text-primary font-medium">
              {totals.total.toLocaleString("da-DK")} {totals.currency}
            </span>
          </p>
        </div>
        <motion.div animate={{ rotate: expanded ? 90 : 0 }}>
          <Package className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {invoices.map((inv) => (
            <div key={inv.id} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  {inv.supplier_name || "Unknown supplier"}
                </span>
                {inv.amount !== null && (
                  <span className="text-primary font-medium">
                    {inv.amount.toLocaleString("da-DK")} {inv.currency || "DKK"}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-muted-foreground">
                {inv.invoice_number && (
                  <span><Hash className="h-3 w-3 inline" /> {inv.invoice_number}</span>
                )}
                {inv.invoice_date && (
                  <span><Calendar className="h-3 w-3 inline" /> {new Date(inv.invoice_date).toLocaleDateString()}</span>
                )}
                {inv.due_date && (
                  <span className="text-primary">Due: {new Date(inv.due_date).toLocaleDateString()}</span>
                )}
                {inv.vat !== null && (
                  <span>VAT: {inv.vat.toLocaleString("da-DK")}</span>
                )}
                {inv.attachment_present && (
                  <Badge variant="outline" className="text-[9px] h-4">📎 Attachment</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
