import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FileSignature, Search, AlertTriangle, Clock, FileCheck } from "lucide-react";
import {
  ContractStatus, STATUS_META, formatDKK, daysBetween,
} from "@/lib/contracts";

interface Row {
  id: string;
  festival_id: string;
  concept_id: string;
  contract_status: ContractStatus;
  operating_entity: string | null;
  contract_value_dkk: number | null;
  contract_signed_date: string | null;
  signing_platform: string | null;
  contract_file_path: string | null;
  counterparty_name: string | null;
  counterparty: string | null;
  concept_alias: string | null;
  sent_to_counterparty_at: string | null;
  stalled_since: string | null;
  stalled_reason: string | null;
  expected_signing_by: string | null;
}

export default function ContractsOverview() {
  const contractsQ = useQuery({
    queryKey: ["contracts-overview"],
    queryFn: async () => {
      const { data } = await supabase.from("festival_contracts").select(
        "id, festival_id, concept_id, contract_status, operating_entity, contract_value_dkk, contract_signed_date, signing_platform, contract_file_path, counterparty_name, counterparty, concept_alias, sent_to_counterparty_at, stalled_since, stalled_reason, expected_signing_by"
      );
      return (data ?? []) as Row[];
    },
  });

  const festivalsQ = useQuery({
    queryKey: ["festivals-min"],
    queryFn: async () => {
      const { data } = await supabase.from("festivals").select("id, name, slug, start_date, end_date").order("start_date");
      return data ?? [];
    },
  });
  const fById = useMemo(() => new Map((festivalsQ.data ?? []).map((f: any) => [f.id, f])), [festivalsQ.data]);

  const conceptsQ = useQuery({
    queryKey: ["concepts-all"],
    queryFn: async () => {
      const { data } = await supabase.from("concepts").select("id, name, slug, color_hex");
      return data ?? [];
    },
  });
  const cById = useMemo(() => new Map((conceptsQ.data ?? []).map((c: any) => [c.id, c])), [conceptsQ.data]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [filterFestival, setFilterFestival] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"festival" | "entity" | "status" | "platform">("festival");

  const rows = contractsQ.data ?? [];

  const today = new Date();
  const tiles = useMemo(() => {
    const signed = rows.filter(r => r.contract_status === "signed");
    const pending = rows.filter(r => r.contract_status === "pending_signature");
    const negot = rows.filter(r => r.contract_status === "in_negotiation");
    const stalled = rows.filter(r => r.contract_status === "stalled");
    const notStarted = rows.filter(r => r.contract_status === "not_started");
    const pendingDays = pending.map(p => p.sent_to_counterparty_at ? daysBetween(p.sent_to_counterparty_at, today) ?? 0 : 0);
    const avgPending = pendingDays.length ? Math.round(pendingDays.reduce((a, b) => a + b, 0) / pendingDays.length) : 0;
    const totalSigned = signed.reduce((s, r) => s + (Number(r.contract_value_dkk) || 0), 0);
    const stalledFestivals = new Set(stalled.map(s => s.festival_id)).size;
    const notStartedFestivals = new Set(notStarted.map(s => s.festival_id)).size;
    return { signed, pending, negot, stalled, notStarted, avgPending, totalSigned, stalledFestivals, notStartedFestivals };
  }, [rows]);

  const allEntities = useMemo(() => {
    const s = new Set<string>(); rows.forEach(r => r.operating_entity && s.add(r.operating_entity));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filterStatus !== "all" && r.contract_status !== filterStatus) return false;
      if (filterEntity !== "all" && r.operating_entity !== filterEntity) return false;
      if (filterFestival !== "all" && r.festival_id !== filterFestival) return false;
      if (q) {
        const f: any = fById.get(r.festival_id);
        const c: any = cById.get(r.concept_id);
        const hay = [f?.name, c?.name, r.operating_entity, r.counterparty_name, r.counterparty, r.concept_alias].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, fById, cById, search, filterStatus, filterEntity, filterFestival]);

  // By entity table
  const byEntity = useMemo(() => {
    const map = new Map<string, { count: number; total: number; festivals: Set<string>; cvr: string | null }>();
    rows.filter(r => r.contract_status !== "cancelled").forEach(r => {
      const k = r.operating_entity ?? "Unknown";
      if (!map.has(k)) map.set(k, { count: 0, total: 0, festivals: new Set(), cvr: null });
      const e = map.get(k)!;
      e.count++; e.total += Number(r.contract_value_dkk) || 0;
      e.festivals.add(r.festival_id);
    });
    return Array.from(map.entries()).map(([entity, v]) => ({ entity, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const byPlatform = useMemo(() => {
    const map: Record<string, number> = {};
    rows.filter(r => r.contract_status === "signed").forEach(r => {
      const k = r.signing_platform ?? "(unspecified)";
      map[k] = (map[k] ?? 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // Group rows
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    filtered.forEach(r => {
      let key: string;
      if (groupBy === "festival") {
        const f: any = fById.get(r.festival_id);
        key = f ? `${f.start_date}|${f.name}` : "?";
      } else if (groupBy === "entity") key = r.operating_entity ?? "Unknown";
      else if (groupBy === "status") key = r.contract_status;
      else key = r.signing_platform ?? "(unspecified)";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, groupBy, fById]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <FileSignature className="h-6 w-6 text-primary" /> Contracts overview
          </h1>
          <p className="text-sm text-muted-foreground">Cross-festival legal status — {rows.length} contracts</p>
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="✅ Signed" value={tiles.signed.length} sub={formatDKK(tiles.totalSigned)} onClick={() => setFilterStatus("signed")} active={filterStatus === "signed"} />
        <Tile label="⏳ Pending" value={tiles.pending.length} sub={`avg ${tiles.avgPending}d wait`} onClick={() => setFilterStatus("pending_signature")} active={filterStatus === "pending_signature"} />
        <Tile label="🔄 Negotiation" value={tiles.negot.length} sub="" onClick={() => setFilterStatus("in_negotiation")} active={filterStatus === "in_negotiation"} />
        <Tile label="🚨 Stalled" value={tiles.stalled.length} sub={`${tiles.stalledFestivals} festival(s)`} onClick={() => setFilterStatus("stalled")} active={filterStatus === "stalled"} tone="red" />
        <Tile label="🆕 Not started" value={tiles.notStarted.length} sub={`${tiles.notStartedFestivals} festival(s)`} onClick={() => setFilterStatus("not_started")} active={filterStatus === "not_started"} />
      </div>

      {/* Stalled spotlight */}
      {tiles.stalled.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Stalled spotlight</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {tiles.stalled.map(c => {
              const f: any = fById.get(c.festival_id);
              const con: any = cById.get(c.concept_id);
              const days = c.stalled_since ? daysBetween(c.stalled_since, today) : null;
              return (
                <Link key={c.id} to={`/festivals/${f?.slug}/contracts?contract=${c.id}`}
                  className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 hover:border-red-500/60 transition-all">
                  <div className="text-[11px] text-red-700 dark:text-red-300 font-medium">{f?.name}</div>
                  <div className="font-semibold">{con?.name} {c.concept_alias && <span className="text-muted-foreground font-normal">· {c.concept_alias}</span>}</div>
                  <div className="text-[12px] text-muted-foreground mt-1">{c.stalled_reason ?? "No reason given"}{days != null && ` · ${days}d stalled`}</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Pending spotlight */}
      {tiles.pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-2"><Clock className="h-4 w-4 text-amber-600" /> Awaiting signature</h2>
          <div className="grid md:grid-cols-3 gap-3">
            {tiles.pending.map(c => {
              const f: any = fById.get(c.festival_id);
              const con: any = cById.get(c.concept_id);
              const days = c.sent_to_counterparty_at ? daysBetween(c.sent_to_counterparty_at, today) : null;
              return (
                <Link key={c.id} to={`/festivals/${f?.slug}/contracts?contract=${c.id}`}
                  className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 hover:border-amber-500/60 transition-all">
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">{f?.name}</div>
                  <div className="font-semibold">{con?.name}</div>
                  <div className="text-[12px] text-muted-foreground mt-1">{days != null ? `${days}d waiting` : "Sent date unknown"}</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* By entity table */}
      <section>
        <h2 className="text-sm font-semibold mb-2">By operating entity</h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-2">Entity</th><th className="text-right p-2">Active contracts</th><th className="text-right p-2">Total value</th><th className="text-left p-2">Festivals</th></tr>
            </thead>
            <tbody>
              {byEntity.map(e => (
                <tr key={e.entity} className="border-t">
                  <td className="p-2 font-medium">{e.entity}</td>
                  <td className="p-2 text-right tabular-nums">{e.count}</td>
                  <td className="p-2 text-right tabular-nums">{formatDKK(e.total)}</td>
                  <td className="p-2 text-[11px] text-muted-foreground">{e.festivals.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* By signing platform */}
      <section>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><FileCheck className="h-4 w-4" /> Signed by platform</h2>
        <div className="flex flex-wrap gap-2">
          {byPlatform.map(([k, v]) => (
            <span key={k} className="px-2.5 py-1 rounded-full bg-muted text-[12px]"><b>{v}</b> · {k}</span>
          ))}
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 sticky top-12 bg-background/80 backdrop-blur z-10 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 w-[260px] h-9" placeholder="Search counterparty / concept…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_META) as ContractStatus[]).map(s => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Entity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {allEntities.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterFestival} onValueChange={setFilterFestival}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Festival" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All festivals</SelectItem>
            {(festivalsQ.data ?? []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="festival">Group by festival</SelectItem>
            <SelectItem value="entity">Group by entity</SelectItem>
            <SelectItem value="status">Group by status</SelectItem>
            <SelectItem value="platform">Group by platform</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-auto">{filtered.length} of {rows.length}</span>
      </div>

      {/* Rows */}
      {contractsQ.isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="space-y-4">
          {groups.map(([key, items]) => (
            <div key={key}>
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                {groupBy === "festival" ? key.split("|")[1] : key} <span className="text-muted-foreground/60">· {items.length}</span>
              </h3>
              <div className="rounded-xl border overflow-hidden divide-y">
                {items.map(r => {
                  const f: any = fById.get(r.festival_id);
                  const c: any = cById.get(r.concept_id);
                  return (
                    <Link key={r.id} to={f ? `/festivals/${f.slug}/contracts?contract=${r.id}` : "#"}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 text-sm">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c?.color_hex ?? "hsl(var(--muted-foreground))" }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate"><b>{c?.name ?? "?"}</b>{r.concept_alias && <span className="text-muted-foreground"> · {r.concept_alias}</span>} <span className="text-muted-foreground">@ {f?.name}</span></div>
                        <div className="text-[11px] text-muted-foreground truncate">{r.operating_entity ?? "—"} · {r.counterparty_name ?? r.counterparty ?? "—"}</div>
                      </div>
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border", STATUS_META[r.contract_status].chipClass)}>
                        {STATUS_META[r.contract_status].emoji}{STATUS_META[r.contract_status].label}
                      </span>
                      <span className="hidden md:inline text-[11px] tabular-nums w-24 text-right">{formatDKK(r.contract_value_dkk)}</span>
                      {r.contract_file_path && <span className="text-[10px]" title="Has file">📎</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, onClick, active, tone }: { label: string; value: number; sub: string; onClick: () => void; active: boolean; tone?: "red" }) {
  return (
    <button onClick={onClick} className={cn(
      "rounded-xl border p-3 text-left transition-all hover:border-primary/50",
      active && "border-primary ring-1 ring-primary/30",
      tone === "red" && value > 0 && "border-red-500/40 bg-red-500/5",
    )}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </button>
  );
}
