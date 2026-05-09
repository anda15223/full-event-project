import { useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Inbox } from "lucide-react";

function statusPill(status: string) {
  const map: Record<string,string> = {
    uploaded: "bg-slate-100 text-slate-700",
    parsing: "bg-blue-100 text-blue-700 animate-pulse",
    parsed: "bg-amber-100 text-amber-700",
    applied: "bg-emerald-100 text-emerald-700",
    rejected: "bg-zinc-100 text-zinc-600",
    failed: "bg-red-100 text-red-700",
  };
  return map[status] || "bg-slate-100 text-slate-700";
}

export default function IngestInbox() {
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["ingest-inbox"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("intelligence_ingestion")
        .select("id, source_type, source_subject, source_filename, source_sender, ai_summary, status, created_at, parse_confidence, hint_festival_id")
        .order("created_at", { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("ingest-inbox-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "intelligence_ingestion" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const today = new Date().toISOString().slice(0,10);
  const todayCount = rows.filter((r: any) => r.created_at?.slice(0,10) === today).length;
  const appliedCount = rows.filter((r: any) => r.status === "applied").length;
  const successRate = rows.length ? Math.round((appliedCount / rows.length) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2"><Inbox className="h-6 w-6" /> Ingest inbox</h1>
        <Link to="/ingest" className="text-xs text-primary hover:underline">← Back to drop zone</Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Today</div><div className="text-2xl font-mono">{todayCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-mono">{rows.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Success rate</div><div className="text-2xl font-mono">{successRate}%</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="text-left p-3">When</th>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">Summary</th>
                <th className="text-left p-3">Conf.</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No ingestions yet.</td></tr>
              )}
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-muted/30 cursor-pointer">
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                    <Link to={`/ingest/${r.id}`} className="block">{new Date(r.created_at).toLocaleString()}</Link>
                  </td>
                  <td className="p-3">
                    <Link to={`/ingest/${r.id}`} className="block">
                      <div className="font-medium truncate max-w-[260px]">{r.source_subject || r.source_filename || "—"}</div>
                      {r.source_sender && <div className="text-xs text-muted-foreground truncate max-w-[260px]">{r.source_sender}</div>}
                    </Link>
                  </td>
                  <td className="p-3">
                    <Link to={`/ingest/${r.id}`} className="block text-xs text-muted-foreground truncate max-w-[400px]">{r.ai_summary || "—"}</Link>
                  </td>
                  <td className="p-3 font-mono text-xs">{r.parse_confidence != null ? `${Math.round(r.parse_confidence*100)}%` : "—"}</td>
                  <td className="p-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusPill(r.status)}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
