import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, ChevronDown, Sparkles, Package, Wrench, Receipt, CreditCard, AlertTriangle } from "lucide-react";
import { useInvoices } from "@/hooks/useInvoices";
import InvoiceMetrics from "@/components/invoices/InvoiceMetrics";
import InvoiceFilters from "@/components/invoices/InvoiceFilters";
import InvoiceCard from "@/components/invoices/InvoiceCard";
import SyncPanel from "@/components/invoices/SyncPanel";
import type { Invoice } from "@/hooks/useInvoices";

const CATEGORY_SECTIONS = [
  {
    key: "overdue",
    label: "🔴 Overdue",
    icon: AlertTriangle,
    filter: (i: Invoice) => i.status === "overdue" || !!i.overdue_flag,
  },
  {
    key: "due_week",
    label: "🟡 Due This Week",
    icon: CreditCard,
    filter: (i: Invoice) => {
      if (!i.due_date || i.status === "paid" || i.status === "overdue" || i.overdue_flag) return false;
      const d = new Date(i.due_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const week = new Date(today); week.setDate(week.getDate() + 7);
      return d >= today && d <= week;
    },
  },
  {
    key: "supplier_invoice",
    label: "📦 Supplier Invoices",
    icon: Package,
    filter: (i: Invoice) => {
      if (i.status === "paid" || i.status === "overdue" || i.overdue_flag) return false;
      const d = i.due_date ? new Date(i.due_date) : null;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const week = new Date(today); week.setDate(week.getDate() + 7);
      if (d && d >= today && d <= week) return false;
      return !i.category || i.category === "supplier_invoice";
    },
  },
  {
    key: "equipment",
    label: "🔧 Equipment",
    icon: Wrench,
    filter: (i: Invoice) => {
      if (i.status === "paid" || i.status === "overdue" || i.overdue_flag) return false;
      return i.category === "equipment";
    },
  },
  {
    key: "operating_expense",
    label: "📱 Bills & Operating Expenses",
    icon: Receipt,
    filter: (i: Invoice) => {
      if (i.status === "paid" || i.status === "overdue" || i.overdue_flag) return false;
      return i.category === "operating_expense";
    },
  },
  {
    key: "cashflow_pbs",
    label: "🏦 PBS / Direct Debits",
    icon: CreditCard,
    filter: (i: Invoice) => {
      if (i.status === "paid" || i.status === "overdue" || i.overdue_flag) return false;
      return i.category === "cashflow_pbs";
    },
  },
  {
    key: "rykker",
    label: "⚠ Payment Reminders (Rykker)",
    icon: AlertTriangle,
    filter: (i: Invoice) => {
      if (i.status === "paid" || i.status === "overdue" || i.overdue_flag) return false;
      return i.category === "rykker";
    },
  },
  {
    key: "paid",
    label: "✅ Paid",
    icon: CreditCard,
    filter: (i: Invoice) => i.status === "paid",
  },
];

export default function AgentInvoices() {
  const [status, setStatus] = useState("all");
  const [company, setCompany] = useState("all");
  const [location, setLocation] = useState("all");
  const [supplier, setSupplier] = useState("");
  const [sort, setSort] = useState("due_date");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ paid: true });

  const { data: invoices, isLoading } = useInvoices({
    status: status !== "all" ? status : undefined,
    company: company !== "all" ? company : undefined,
    location: location !== "all" ? location : undefined,
    supplier: supplier || undefined,
    sort,
  });

  const allInvoices = invoices || [];

  const companies = useMemo(() => [...new Set(allInvoices.map((i) => i.company).filter(Boolean))] as string[], [allInvoices]);
  const locations = useMemo(() => [...new Set(allInvoices.map((i) => i.location).filter(Boolean))] as string[], [allInvoices]);

  const { data: allData } = useInvoices({});
  const metricsData = allData || [];

  const sections = CATEGORY_SECTIONS.map((s) => ({
    ...s,
    invoices: allInvoices.filter(s.filter),
  })).filter((s) => s.invoices.length > 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-agent-green/10 via-success/5 to-transparent border border-agent-green/15 p-6 md:p-8">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-5 w-5 text-agent-green" />
          <span className="text-xs font-semibold tracking-wider uppercase text-agent-green">Cash Control Center</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tight text-foreground">
          Invoice Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Payment control for all companies — track, pay, and reconcile
        </p>
      </div>

      <SyncPanel />
      <InvoiceMetrics invoices={metricsData} />

      <InvoiceFilters
        status={status} setStatus={setStatus}
        company={company} setCompany={setCompany}
        location={location} setLocation={setLocation}
        supplier={supplier} setSupplier={setSupplier}
        sort={sort} setSort={setSort}
        companies={companies}
        locations={locations}
      />

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading invoices...</div>
      ) : allInvoices.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/40 p-12 text-center shadow-sm">
          <Sparkles className="h-12 w-12 text-agent-green/30 mx-auto mb-4" />
          <h3 className="text-lg font-heading font-semibold text-foreground mb-1">No invoices match</h3>
          <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const isCollapsed = collapsed[section.key];
            const total = section.invoices.reduce((s, i) => s + (i.total_with_vat || i.amount || 0), 0);
            return (
              <div key={section.key}>
                <button
                  onClick={() => setCollapsed((p) => ({ ...p, [section.key]: !p[section.key] }))}
                  className="w-full flex items-center justify-between px-1 py-2 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{section.label}</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">
                      {section.invoices.length}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {total.toLocaleString("da-DK")} DKK
                    </span>
                  </div>
                  <motion.div animate={{ rotate: isCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 pb-2">
                        {section.invoices.map((inv) => (
                          <InvoiceCard key={inv.id} invoice={inv} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}