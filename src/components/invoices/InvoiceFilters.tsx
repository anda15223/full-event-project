import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_PILLS = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due Soon" },
  { value: "due_this_week", label: "Due This Week" },
  { value: "pending", label: "Pending" },
  { value: "credit", label: "Credit Notes" },
  { value: "paid", label: "Paid" },
];

interface Props {
  status: string;
  setStatus: (v: string) => void;
  company: string;
  setCompany: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  supplier: string;
  setSupplier: (v: string) => void;
  sort: string;
  setSort: (v: string) => void;
  companies: string[];
  locations: string[];
  suppliers: string[];
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  dueRange: string;
  setDueRange: (v: string) => void;
}

export default function InvoiceFilters(props: Props) {
  return (
    <div className="space-y-3">
      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_PILLS.map((p) => (
          <button
            key={p.value}
            onClick={() => props.setStatus(p.value)}
            className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-all ${
              props.status === p.value
                ? p.value === "credit"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-sm"
                  : "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border/40 hover:border-border"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Dropdowns row */}
      <div className="flex flex-wrap gap-2">
        <Select value={props.company} onValueChange={props.setCompany}>
          <SelectTrigger className="w-44 rounded-xl bg-card border-border/40 text-xs h-9">
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {props.companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={props.location} onValueChange={props.setLocation}>
          <SelectTrigger className="w-40 rounded-xl bg-card border-border/40 text-xs h-9">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {props.locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Supplier filter */}
        <Select value={props.supplier || "all"} onValueChange={(v) => props.setSupplier(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44 rounded-xl bg-card border-border/40 text-xs h-9">
            <SelectValue placeholder="Supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {props.suppliers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Due date range */}
        <Select value={props.dueRange} onValueChange={props.setDueRange}>
          <SelectTrigger className="w-36 rounded-xl bg-card border-border/40 text-xs h-9">
            <SelectValue placeholder="Due date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Due Dates</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="due_today">Due Today</SelectItem>
            <SelectItem value="due_week">Due This Week</SelectItem>
            <SelectItem value="due_month">Due This Month</SelectItem>
            <SelectItem value="future">Future</SelectItem>
          </SelectContent>
        </Select>

        <Select value={props.sort} onValueChange={props.setSort}>
          <SelectTrigger className="w-36 rounded-xl bg-card border-border/40 text-xs h-9">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="due_date">Due date</SelectItem>
            <SelectItem value="amount">Amount</SelectItem>
            <SelectItem value="supplier_name">Supplier</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="invoice_date">Invoice date</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range inputs */}
        <Input
          type="date"
          value={props.dateFrom}
          onChange={(e) => props.setDateFrom(e.target.value)}
          className="w-36 rounded-xl bg-card border-border/40 text-xs h-9"
          placeholder="From date"
        />
        <Input
          type="date"
          value={props.dateTo}
          onChange={(e) => props.setDateTo(e.target.value)}
          className="w-36 rounded-xl bg-card border-border/40 text-xs h-9"
          placeholder="To date"
        />
      </div>
    </div>
  );
}
