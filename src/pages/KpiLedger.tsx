import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { BarChart3, Download, Check, FileText, Loader2, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";

type KpiEntry = {
  id: string;
  created_at: string;
  email_id: string | null;
  platform: string;
  date: string | null;
  total_amount: number | null;
  currency: string;
  location: string | null;
  company: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  period_from: string | null;
  period_to: string | null;
  source_type: string | null;
  notes: string | null;
  confidence: number | null;
  verified: boolean;
};

export default function KpiLedger() {
  const [platform, setPlatform] = useState<string>("all");
  const [company, setCompany] = useState<string>("all");
  const [location, setLocation] = useState<string>("all");
  const qc = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["kpi-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_ledger")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []) as KpiEntry[];
    },
  });

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (platform !== "all" && e.platform !== platform) return false;
      if (company !== "all" && e.company !== company) return false;
      if (location !== "all" && e.location !== location) return false;
      return true;
    });
  }, [entries, platform, company, location]);

  const companies = useMemo(() => [...new Set(entries.map(e => e.company).filter(Boolean))].sort(), [entries]);
  const locations = useMemo(() => [...new Set(entries.map(e => e.location).filter(Boolean))].sort(), [entries]);

  const woltEntries = filtered.filter(e => e.platform === "wolt");
  const livetEntries = filtered.filter(e => e.platform === "livet_paa_oen");

  const woltTotal = woltEntries.reduce((s, e) => s + (e.total_amount || 0), 0);
  const livetTotal = livetEntries.reduce((s, e) => s + (e.total_amount || 0), 0);
  const combinedTotal = woltTotal + livetTotal;

  const toggleVerified = async (id: string, current: boolean) => {
    await supabase.from("kpi_ledger").update({ verified: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["kpi-ledger"] });
  };

  const exportCsv = () => {
    const headers = ["Date", "Platform", "Location", "Company", "Amount", "Currency", "Invoice #", "Period From", "Period To", "Verified"];
    const rows = filtered.map(e => [
      e.date || "", e.platform, e.location || "", e.company || "",
      e.total_amount?.toString() || "", e.currency, e.invoice_number || "",
      e.period_from || "", e.period_to || "", e.verified ? "Yes" : "No",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kpi-ledger-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            KPI Ledger
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform costs — already paid, tracked for KPI analysis only
          </p>
        </div>
        <Button onClick={exportCsv} variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="wolt">Wolt</SelectItem>
            <SelectItem value="livet_paa_oen">Livet på Øen</SelectItem>
          </SelectContent>
        </Select>
        <Select value={company} onValueChange={setCompany}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Company" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies.map(c => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Location" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map(l => <SelectItem key={l} value={l!}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="glass-panel">
          <CardContent className="py-16 text-center">
            <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">No KPI entries yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Wolt and Livet på Øen invoices will appear here after processing</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="glass-panel border-purple-500/20">
              <CardContent className="pt-5 pb-4 text-center">
                <div className="text-2xl font-bold">DKK {woltTotal.toLocaleString("da-DK")}</div>
                <div className="text-xs text-muted-foreground mt-1">Wolt · {woltEntries.length} entries</div>
              </CardContent>
            </Card>
            <Card className="glass-panel border-blue-500/20">
              <CardContent className="pt-5 pb-4 text-center">
                <div className="text-2xl font-bold">DKK {livetTotal.toLocaleString("da-DK")}</div>
                <div className="text-xs text-muted-foreground mt-1">Livet på Øen · {livetEntries.length} entries</div>
              </CardContent>
            </Card>
            <Card className="glass-panel border-primary/20">
              <CardContent className="pt-5 pb-4 text-center">
                <div className="text-2xl font-bold font-heading">DKK {combinedTotal.toLocaleString("da-DK")}</div>
                <div className="text-xs text-muted-foreground mt-1">Combined total</div>
              </CardContent>
            </Card>
          </div>

          {/* Platform sections */}
          {(platform === "all" || platform === "wolt") && woltEntries.length > 0 && (
            <PlatformSection
              title="Wolt"
              color="purple"
              entries={woltEntries}
              total={woltTotal}
              onToggleVerified={toggleVerified}
            />
          )}

          {(platform === "all" || platform === "livet_paa_oen") && livetEntries.length > 0 && (
            <PlatformSection
              title="Livet på Øen"
              color="blue"
              entries={livetEntries}
              total={livetTotal}
              onToggleVerified={toggleVerified}
            />
          )}
        </div>
      )}
    </div>
  );
}

function PlatformSection({
  title, color, entries, total, onToggleVerified,
}: {
  title: string;
  color: string;
  entries: KpiEntry[];
  total: number;
  onToggleVerified: (id: string, current: boolean) => void;
}) {
  return (
    <Card className={`glass-panel border-${color}-500/20`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-heading flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Badge variant="outline" className={`text-${color}-600 border-${color}-300`}>{title}</Badge>
            <span className="text-xs text-muted-foreground">{entries.length} entries</span>
          </span>
          <span className="font-mono text-sm">DKK {total.toLocaleString("da-DK")}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                <th className="text-left py-2 px-2 font-semibold">Date</th>
                <th className="text-left py-2 px-2 font-semibold">Location</th>
                <th className="text-left py-2 px-2 font-semibold">Company</th>
                <th className="text-right py-2 px-2 font-semibold">Amount</th>
                <th className="text-left py-2 px-2 font-semibold">Invoice #</th>
                <th className="text-left py-2 px-2 font-semibold">Period</th>
                <th className="text-center py-2 px-2 font-semibold">Verified</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {entries.map((e, i) => (
                  <motion.tr
                    key={e.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-2 px-2 font-mono text-xs">{e.date || "—"}</td>
                    <td className="py-2 px-2">{e.location || "—"}</td>
                    <td className="py-2 px-2 text-muted-foreground">{e.company || "—"}</td>
                    <td className="py-2 px-2 text-right font-mono font-semibold">
                      {e.currency} {(e.total_amount || 0).toLocaleString("da-DK")}
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">{e.invoice_number || "—"}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {e.period_from && e.period_to
                        ? `${e.period_from} → ${e.period_to}`
                        : "—"}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <Checkbox
                        checked={e.verified}
                        onCheckedChange={() => onToggleVerified(e.id, e.verified)}
                        className="mx-auto"
                      />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
