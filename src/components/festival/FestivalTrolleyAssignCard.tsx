import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Truck, Loader2, ChevronDown, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useFestivalVehicles } from "@/hooks/useFestivalVehicles";
import { cn } from "@/lib/utils";

const sb: any = supabase;
const NONE = "__none";

type Trolley = { id: string; concept_id: string; name: string; sort_order: number };
type ConceptRow = { concept_id: string; concept_name: string; concept_alias: string | null };
type ItemPreview = { trolley_id: string; item_name: string; quantity: string | null };

export function FestivalTrolleyAssignCard({ festivalId, festivalSlug }: { festivalId: string; festivalSlug: string }) {
  const { vehicles, loading: vehLoading } = useFestivalVehicles(festivalId);
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [trolleys, setTrolleys] = useState<Record<string, Trolley[]>>({});
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [items, setItems] = useState<Record<string, ItemPreview[]>>({});
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [openT, setOpenT] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: cs } = await sb.from("festival_contracts")
      .select("concept_id, concept_alias, concept:concepts(id, name)")
      .eq("festival_id", festivalId).eq("is_active", true);
    const rows: ConceptRow[] = (cs ?? []).map((c: any) => ({
      concept_id: c.concept_id,
      concept_name: c.concept?.name ?? "—",
      concept_alias: c.concept_alias ?? null,
    })).sort((a: ConceptRow, b: ConceptRow) => a.concept_name.localeCompare(b.concept_name));
    setConcepts(rows);

    const conceptIds = Array.from(new Set(rows.map((r) => r.concept_id)));
    if (!conceptIds.length) { setTrolleys({}); setAssignments({}); setItemCounts({}); setLoading(false); return; }

    const { data: ts } = await sb.from("concept_trolleys")
      .select("*").in("concept_id", conceptIds).order("sort_order").order("name");
    const tlist = (ts ?? []) as Trolley[];
    const byConcept: Record<string, Trolley[]> = {};
    tlist.forEach((t) => { (byConcept[t.concept_id] ||= []).push(t); });
    setTrolleys(byConcept);

    const trolleyIds = tlist.map((t) => t.id);
    if (trolleyIds.length) {
      const { data: its } = await sb.from("concept_trolley_items")
        .select("trolley_id, item_name, quantity").in("trolley_id", trolleyIds).order("position");
      const counts: Record<string, number> = {};
      const byT: Record<string, ItemPreview[]> = {};
      (its ?? []).forEach((i: any) => {
        counts[i.trolley_id] = (counts[i.trolley_id] ?? 0) + 1;
        (byT[i.trolley_id] ||= []).push({ trolley_id: i.trolley_id, item_name: i.item_name, quantity: i.quantity });
      });
      setItemCounts(counts);
      setItems(byT);
    } else { setItemCounts({}); setItems({}); }

    const { data: as_ } = await sb.from("festival_trolley_assignments")
      .select("trolley_id, transport_id").eq("festival_id", festivalId);
    const amap: Record<string, string | null> = {};
    (as_ ?? []).forEach((a: any) => { amap[a.trolley_id] = a.transport_id; });
    setAssignments(amap);
    setLoading(false);
  };

  useEffect(() => { if (festivalId) load(); /* eslint-disable-next-line */ }, [festivalId]);

  const setAssignment = async (trolleyId: string, transportId: string | null) => {
    if (transportId === null) {
      const { error } = await sb.from("festival_trolley_assignments")
        .delete().eq("festival_id", festivalId).eq("trolley_id", trolleyId);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await sb.from("festival_trolley_assignments")
        .upsert({ festival_id: festivalId, trolley_id: trolleyId, transport_id: transportId },
          { onConflict: "festival_id,trolley_id" });
      if (error) return toast.error(error.message);
    }
    setAssignments((a) => ({ ...a, [trolleyId]: transportId }));
    toast.success("Vehicle saved");
  };

  const totalTrolleys = Object.values(trolleys).reduce((s, a) => s + a.length, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg flex-wrap">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <span>Pack trolleys into vehicles</span>
          <span className="text-sm font-normal text-muted-foreground">{totalTrolleys} trolleys across {concepts.length} concepts</span>
          <Link to={`/festivals/${festivalSlug}/equipment`} className="ml-auto">
            <Button size="sm" variant="outline">
              <Wrench className="h-3.5 w-3.5" /> Edit trolleys in Equipment
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : concepts.length === 0 ? (
          <div className="text-sm text-muted-foreground">No active concepts on this festival.</div>
        ) : totalTrolleys === 0 ? (
          <div className="text-sm text-muted-foreground">
            No trolleys defined yet. Add trolleys per concept in <Link to={`/festivals/${festivalSlug}/equipment`} className="underline">Equipment & Trolleys</Link>.
          </div>
        ) : concepts.map((c) => {
          const tlist = trolleys[c.concept_id] ?? [];
          if (!tlist.length) return null;
          return (
            <div key={c.concept_id} className="border rounded-lg">
              <div className="px-3 py-2 bg-muted/30 font-medium text-sm">
                {c.concept_alias || c.concept_name}
                <span className="ml-2 text-xs text-muted-foreground">({tlist.length} trolleys)</span>
              </div>
              <div className="p-2 space-y-1.5">
                {tlist.map((t) => {
                  const assigned = assignments[t.id] ?? null;
                  const count = itemCounts[t.id] ?? 0;
                  const tOpen = openT[t.id] ?? false;
                  return (
                    <div key={t.id} className="border rounded-md bg-background">
                      <div className="flex items-center gap-2 p-2 flex-wrap">
                        <button onClick={() => setOpenT((o) => ({ ...o, [t.id]: !tOpen }))}
                          className="flex items-center gap-1.5 text-left">
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${tOpen ? "" : "-rotate-90"}`} />
                          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{t.name}</span>
                          <span className="text-xs text-muted-foreground">({count} items)</span>
                        </button>
                        <div className="ml-auto flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Pack into:</span>
                          <Select value={assigned ?? NONE}
                            onValueChange={(v) => setAssignment(t.id, v === NONE ? null : v)}
                            disabled={vehLoading}>
                            <SelectTrigger className={cn("h-8 text-xs w-48",
                              !assigned && "border-amber-500/60 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200")}>
                              <SelectValue placeholder="— unassigned —" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>— unassigned —</SelectItem>
                              {vehicles.map((v) => (
                                <SelectItem key={v.id} value={v.id}>{v.vehicle_type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {tOpen && (
                        <div className="px-3 pb-2 pt-1 border-t text-xs text-muted-foreground space-y-0.5">
                          {(items[t.id] ?? []).length === 0 ? (
                            <div className="italic">No items</div>
                          ) : (items[t.id] ?? []).map((it, i) => (
                            <div key={i}>
                              <span className="tabular-nums font-medium text-foreground">{it.quantity ?? ""}</span>{" "}
                              {it.item_name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
