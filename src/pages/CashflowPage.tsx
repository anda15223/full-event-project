import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDownLeft, ArrowUpRight, Building2, TrendingDown, BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface CashflowEntry {
  id: string;
  created_at: string;
  entry_date: string | null;
  direction: string;
  entry_type: string;
  amount: number | null;
  currency: string | null;
  supplier_name: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  reference: string | null;
  bc_catering_branch: string | null;
  status: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  pbs_debit: "PBS Direct Debits",
  bank_transfer: "Supplier Invoices",
  operating_expense: "Operating Expenses",
  equipment: "Equipment",
};

export default function CashflowPage() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["cashflow-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cashflow_entries")
        .select("*")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data || []) as CashflowEntry[];
    },
  });

  const totalOut = useMemo(
    () => entries.filter(e => e.direction === "out").reduce((s, e) => s + (e.amount || 0), 0),
    [entries]
  );
  const totalIn = useMemo(
    () => entries.filter(e => e.direction === "in").reduce((s, e) => s + (e.amount || 0), 0),
    [entries]
  );

  // By category (entry_type)
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of entries) {
      if (e.direction !== "out") continue;
      const key = e.entry_type || "other";
      map[key] = (map[key] || 0) + (e.amount || 0);
    }
    return Object.entries(map)
      .map(([cat, total]) => ({ category: CATEGORY_LABELS[cat] || cat, total }))
      .sort((a, b) => b.total - a.total);
  }, [entries]);

  // By company
  const byCompany = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of entries) {
      if (e.direction !== "out") continue;
      const key = e.company || "Unknown";
      map[key] = (map[key] || 0) + (e.amount || 0);
    }
    return Object.entries(map)
      .map(([company, total]) => ({ company, total }))
      .sort((a, b) => b.total - a.total);
  }, [entries]);

  // Weekly timeline (last 90 days)
  const weeklyData = useMemo(() => {
    const now = new Date();
    const start = new Date(now); start.setDate(start.getDate() - 90);
    const weeks: Record<string, number> = {};

    for (const e of entries) {
      if (e.direction !== "out" || !e.entry_date) continue;
      const d = new Date(e.entry_date);
      if (d < start) continue;
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      const key = weekStart.toISOString().split("T")[0];
      weeks[key] = (weeks[key] || 0) + (e.amount || 0);
    }

    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, total]) => ({
        week: new Date(week).toLocaleDateString("da-DK", { month: "short", day: "numeric" }),
        total: Math.round(total),
      }));
  }, [entries]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <TrendingDown className="h-6 w-6 text-primary" /> Cashflow Tracker
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          All money out — supplier payments, PBS debits, bills, equipment
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-panel">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ArrowDownLeft className="h-4 w-4 text-destructive" /> Money OUT
            </div>
            <div className="text-xl font-bold text-destructive">
              DKK {totalOut.toLocaleString("da-DK", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ArrowUpRight className="h-4 w-4 text-accent" /> Money IN
            </div>
            <div className="text-xl font-bold text-accent">
              DKK {totalIn.toLocaleString("da-DK", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground mb-1">Total entries</div>
            <div className="text-xl font-bold">{entries.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* By Category */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> By Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cashflow entries yet.</p>
          ) : (
            <div className="space-y-3">
              {byCategory.map((cat) => {
                const pct = totalOut > 0 ? Math.round((cat.total / totalOut) * 100) : 0;
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{cat.category}</span>
                      <span className="font-mono text-muted-foreground">
                        DKK {cat.total.toLocaleString("da-DK")} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Company */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> By Company
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byCompany.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <div className="space-y-2">
              {byCompany.map((item) => (
                <div key={item.company} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 border border-border/40">
                  <span className="text-sm font-medium">{item.company}</span>
                  <span className="text-sm font-semibold text-destructive">
                    DKK {item.total.toLocaleString("da-DK", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Timeline */}
      {weeklyData.length > 0 && (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base font-heading">Money Out — Last 90 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `DKK ${v.toLocaleString("da-DK")}`} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent entries */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-heading">Recent Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <div className="space-y-2">
              {entries.slice(0, 20).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/20">
                  <div className="flex items-center gap-3">
                    {entry.direction === "out" ? (
                      <ArrowDownLeft className="h-4 w-4 text-destructive" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-accent" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{entry.supplier_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.location} · {entry.company} · {entry.entry_date || "No date"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-semibold ${entry.direction === "out" ? "text-destructive" : "text-accent"}`}>
                      {entry.direction === "out" ? "-" : "+"} DKK {(entry.amount || 0).toLocaleString("da-DK", { minimumFractionDigits: 2 })}
                    </span>
                    <Badge variant="outline" className="ml-2 text-xs">{entry.entry_type}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}