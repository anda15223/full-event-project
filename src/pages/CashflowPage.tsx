import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDownLeft, ArrowUpRight, Building2, MapPin, TrendingDown } from "lucide-react";
import { useMemo } from "react";

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

  const grouped = useMemo(() => {
    const byBranch: Record<string, CashflowEntry[]> = {};
    for (const e of entries) {
      const key = e.supplier_name || "Other";
      if (!byBranch[key]) byBranch[key] = [];
      byBranch[key].push(e);
    }
    return byBranch;
  }, [entries]);

  const totalOut = useMemo(
    () => entries.filter(e => e.direction === "out").reduce((s, e) => s + (e.amount || 0), 0),
    [entries]
  );
  const totalIn = useMemo(
    () => entries.filter(e => e.direction === "in").reduce((s, e) => s + (e.amount || 0), 0),
    [entries]
  );

  // Group by company for location breakdown
  const byCompanyLocation = useMemo(() => {
    const map: Record<string, { company: string; location: string; total: number; count: number; branch: string }> = {};
    for (const e of entries) {
      if (e.direction !== "out") continue;
      const key = `${e.company}||${e.location}`;
      if (!map[key]) {
        map[key] = { company: e.company || "Unknown", location: e.location || "Unknown", total: 0, count: 0, branch: e.bc_catering_branch || "" };
      }
      map[key].total += e.amount || 0;
      map[key].count++;
    }
    return Object.values(map);
  }, [entries]);

  // Group location breakdown by branch
  const branchGroups = useMemo(() => {
    const groups: Record<string, typeof byCompanyLocation> = {};
    for (const item of byCompanyLocation) {
      const branch = item.branch || "other";
      if (!groups[branch]) groups[branch] = [];
      groups[branch].push(item);
    }
    return groups;
  }, [byCompanyLocation]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <TrendingDown className="h-6 w-6 text-primary" /> Cashflow Tracker
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          PBS direct debits and automated payments — grouped by company
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

      {/* PBS Direct Debits — Money OUT grouped by branch */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-heading">PBS Direct Debits — Money OUT</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : byCompanyLocation.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cashflow entries yet. Run email sync to detect PBS debits.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(branchGroups).map(([branch, items]) => (
                <div key={branch}>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    BC Catering {branch === "roskilde" ? "Roskilde" : branch === "skanderborg" ? "Skanderborg" : branch}
                  </h3>
                  <div className="space-y-2">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 border border-border/40">
                        <div className="flex items-center gap-3">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="text-sm font-medium">{item.location}</span>
                            <span className="text-xs text-muted-foreground ml-2">{item.company}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">{item.count} debits</Badge>
                          <span className="text-sm font-semibold text-destructive">
                            DKK {item.total.toLocaleString("da-DK", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex justify-end pt-3 border-t border-border/40">
                <span className="text-sm font-bold">
                  Monthly total outgoing: DKK {totalOut.toLocaleString("da-DK", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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