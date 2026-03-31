import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_PILLS = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "due_this_week", label: "Due This Week" },
  { value: "pending", label: "Pending" },
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
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
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

        <Select value={props.sort} onValueChange={props.setSort}>
          <SelectTrigger className="w-36 rounded-xl bg-card border-border/40 text-xs h-9">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="due_date">Due date</SelectItem>
            <SelectItem value="amount">Amount</SelectItem>
            <SelectItem value="supplier_name">Supplier</SelectItem>
            <SelectItem value="company">Company</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search supplier..."
            value={props.supplier}
            onChange={(e) => props.setSupplier(e.target.value)}
            className="pl-9 rounded-xl bg-card border-border/40 text-xs h-9"
          />
        </div>
      </div>
    </div>
  );
}
