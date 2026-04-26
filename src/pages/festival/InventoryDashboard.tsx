import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, AlertTriangle, CheckCircle2, Package } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  trolley_id: string;
  item_name: string;
  category: string;
  needed_quantity: number | null;
  placed_quantity: number | null;
  counted_quantity: number | null;
  photo_path: string | null;
  concept_id: string | null;
  trolley_number?: number;
  trolley_label?: string;
  concept_name?: string;
  festival_name?: string;
  festival_slug?: string;
};

/**
 * Inventory dashboard.
 * - If used at /festivals/:slug/inventory → scoped to that festival.
 * - If used at /inventory → global, with festival picker.
 */
export default function InventoryDashboard({ scope }: { scope: "global" | "festival" }) {
  const { slug } = useParams<{ slug: string }>();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "missing" | "short" | "matched">("all");
  const [festivalFilter, setFestivalFilter] = useState<string>("__all__");

  const { data, isLoading } = useQuery({
    queryKey: ["inventory_dashboard", scope, slug],
    queryFn: async () => {
      // Resolve festivals in scope
      let festivalsQ = (supabase as any).from("festivals").select("id, name, slug");
      if (scope === "festival" && slug) festivalsQ = festivalsQ.eq("slug", slug);
      const { data: festivals } = await festivalsQ;
      const festivalIds = (festivals || []).map((f: any) => f.id);
      if (festivalIds.length === 0) return { rows: [] as Row[], festivals: [] };

      const { data: concepts } = await (supabase as any)
        .from("festival_concepts").select("id, name, festival_id").in("festival_id", festivalIds);
      const conceptIds = (concepts || []).map((c: any) => c.id);
      if (conceptIds.length === 0) return { rows: [] as Row[], festivals };

      const { data: trolleys } = await (supabase as any)
        .from("festival_bc_trolleys").select("id, trolley_number, label, concept_id").in("concept_id", conceptIds);
      const trolleyIds = (trolleys || []).map((t: any) => t.id);
      if (trolleyIds.length === 0) return { rows: [] as Row[], festivals };

      const { data: items } = await (supabase as any)
        .from("festival_bc_trolley_items")
        .select("*")
        .in("trolley_id", trolleyIds)
        .order("item_name");

      const conceptById = new Map<string, any>((concepts || []).map((c: any) => [c.id, c]));
      const trolleyById = new Map<string, any>((trolleys || []).map((t: any) => [t.id, t]));
      const festivalById = new Map<string, any>((festivals || []).map((f: any) => [f.id, f]));

      const rows: Row[] = (items || []).map((it: any) => {
        const tr = trolleyById.get(it.trolley_id);
        const co = tr ? conceptById.get(tr.concept_id) : null;
        const fe = co ? festivalById.get(co.festival_id) : null;
        return {
          ...it,
          trolley_number: tr?.trolley_number,
          trolley_label: tr?.label,
          concept_name: co?.name,
          festival_name: fe?.name,
          festival_slug: fe?.slug,
        };
      });

      return { rows, festivals: festivals || [] };
    },
  });

  const rows = data?.rows || [];
  const festivals = data?.festivals || [];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (festivalFilter !== "__all__" && r.festival_slug !== festivalFilter) return false;
      if (search && !r.item_name.toLowerCase().includes(search.toLowerCase())) return false;
      const need = r.needed_quantity;
      const counted = r.counted_quantity;
      const missing = need == null || need === 0;
      const short = counted != null && need != null && counted < need;
      const matched = counted != null && need != null && counted === need;
      if (statusFilter === "missing" && !missing) return false;
      if (statusFilter === "short" && !short) return false;
      if (statusFilter === "matched" && !matched) return false;
      return true;
    });
  }, [rows, festivalFilter, search, statusFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const missing = rows.filter((r) => r.needed_quantity == null || r.needed_quantity === 0).length;
    const matched = rows.filter((r) =>
      r.counted_quantity != null && r.needed_quantity != null && r.counted_quantity === r.needed_quantity
    ).length;
    const short = rows.filter((r) =>
      r.counted_quantity != null && r.needed_quantity != null && r.counted_quantity < r.needed_quantity
    ).length;
    return { total, missing, matched, short };
  }, [rows]);

  return (
    <div className="space-y-6 max-w-7xl">
      {scope === "festival" && (
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" />Back to festival</Link>
        </Button>
      )}

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <Package className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-destructive">Inventory</span>
            {scope === "festival" && rows[0]?.festival_name ? ` · ${rows[0].festival_name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            All trolley items across {scope === "global" ? "every festival" : "this festival"}.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total items</div>
          <div className="text-2xl font-bold mt-1">{stats.total}</div>
        </Card>
        <Card className="p-3 border-destructive/30">
          <div className="text-[10px] uppercase tracking-wider text-destructive">Missing need</div>
          <div className="text-2xl font-bold mt-1 text-destructive">{stats.missing}</div>
        </Card>
        <Card className="p-3 border-amber-500/30">
          <div className="text-[10px] uppercase tracking-wider text-amber-600">Short after count</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{stats.short}</div>
        </Card>
        <Card className="p-3 border-emerald-500/30">
          <div className="text-[10px] uppercase tracking-wider text-emerald-600">Matched</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">{stats.matched}</div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item…"
            className="h-8 pl-8 text-[12px]"
          />
        </div>
        {scope === "global" && (
          <Select value={festivalFilter} onValueChange={setFestivalFilter}>
            <SelectTrigger className="h-8 w-[200px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="__all__" className="text-[12px]">All festivals</SelectItem>
              {festivals.map((f: any) => (
                <SelectItem key={f.id} value={f.slug} className="text-[12px]">{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="h-8 w-[180px] text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all" className="text-[12px]">All statuses</SelectItem>
            <SelectItem value="missing" className="text-[12px]">Missing need</SelectItem>
            <SelectItem value="short" className="text-[12px]">Short after count</SelectItem>
            <SelectItem value="matched" className="text-[12px]">Matched</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-[11px] text-muted-foreground ml-auto">
          {filtered.length} of {rows.length}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2 w-12"></th>
                <th className="text-left font-medium px-3 py-2">Item</th>
                {scope === "global" && <th className="text-left font-medium px-3 py-2">Festival</th>}
                <th className="text-left font-medium px-3 py-2">Concept</th>
                <th className="text-left font-medium px-3 py-2">Trolley</th>
                <th className="text-right font-medium px-3 py-2">Need</th>
                <th className="text-right font-medium px-3 py-2">Placed</th>
                <th className="text-right font-medium px-3 py-2">Done</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground italic">No items match</td></tr>
              )}
              {filtered.map((r) => {
                const photoUrl = r.photo_path
                  ? supabase.storage.from("festival-photos").getPublicUrl(r.photo_path).data.publicUrl
                  : null;
                const need = r.needed_quantity;
                const placed = r.placed_quantity;
                const counted = r.counted_quantity;
                const missing = need == null || need === 0;
                const short = counted != null && need != null && counted < need;
                const matched = counted != null && need != null && counted === need;

                return (
                  <tr key={r.id} className="border-t border-border/30 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      {photoUrl ? (
                        <img src={photoUrl} alt={r.item_name} className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted/50" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{r.item_name}</td>
                    {scope === "global" && (
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.festival_slug ? (
                          <Link to={`/festivals/${r.festival_slug}/inventory`} className="hover:text-primary">
                            {r.festival_name}
                          </Link>
                        ) : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-muted-foreground">{r.concept_name || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">#{r.trolley_number}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", missing && "text-destructive font-semibold")}>
                      {need ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{placed ?? "—"}</td>
                    <td className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      short && "text-amber-600",
                      matched && "text-emerald-600"
                    )}>{counted ?? "—"}</td>
                    <td className="px-3 py-2">
                      {missing ? (
                        <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px]">
                          <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Need missing
                        </Badge>
                      ) : matched ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 text-[10px]">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Matched
                        </Badge>
                      ) : short ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600 text-[10px]">
                          <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Short by {(need ?? 0) - (counted ?? 0)}
                        </Badge>
                      ) : counted == null ? (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Not counted</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">OK</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
