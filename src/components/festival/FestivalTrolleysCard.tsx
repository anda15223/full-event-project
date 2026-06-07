import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Plus, Trash2, ChevronDown, Upload, Loader2, Truck } from "lucide-react";
import { useFestivalVehicles } from "@/hooks/useFestivalVehicles";
import { cn } from "@/lib/utils";

const sb: any = supabase;
const NONE = "__none";

type Trolley = { id: string; concept_id: string; name: string; sort_order: number };
type TrolleyItem = {
  id: string; trolley_id: string | null; name: string;
  quantity: string | null; notes: string | null; position: number | null;
};
type ConceptRow = {
  contract_id: string; concept_id: string; concept_name: string; concept_alias: string | null;
};

const DEFAULT_TROLLEY_NAMES = ["Equipment", "Small kitchen tools", "Consumables", "Tables", "Electric"];

export function FestivalTrolleysCard({ festivalId }: { festivalId: string }) {
  const { vehicles, loading: vehLoading } = useFestivalVehicles(festivalId);
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [trolleys, setTrolleys] = useState<Record<string, Trolley[]>>({}); // by concept_id
  const [items, setItems] = useState<Record<string, TrolleyItem[]>>({}); // by trolley_id
  const [assignments, setAssignments] = useState<Record<string, string | null>>({}); // trolley_id -> transport_id
  const [openTrolley, setOpenTrolley] = useState<Record<string, boolean>>({});
  const [openConcept, setOpenConcept] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const [bulkFor, setBulkFor] = useState<Trolley | null>(null);
  const [bulkText, setBulkText] = useState("");

  const load = async () => {
    setLoading(true);
    // 1) active contracts for this festival -> concepts
    const { data: cs } = await sb
      .from("festival_contracts")
      .select("id, concept_id, concept_alias, concept:concepts(id, name)")
      .eq("festival_id", festivalId)
      .eq("is_active", true);
    const rows: ConceptRow[] = (cs ?? []).map((c: any) => ({
      contract_id: c.id,
      concept_id: c.concept_id,
      concept_name: c.concept?.name ?? "—",
      concept_alias: c.concept_alias ?? null,
    })).sort((a: ConceptRow, b: ConceptRow) => a.concept_name.localeCompare(b.concept_name));
    setConcepts(rows);

    const conceptIds = Array.from(new Set(rows.map((r) => r.concept_id)));
    if (conceptIds.length === 0) {
      setTrolleys({}); setItems({}); setAssignments({}); setLoading(false); return;
    }

    // 2) trolleys for those concepts
    const { data: ts } = await sb
      .from("concept_trolleys")
      .select("*")
      .in("concept_id", conceptIds)
      .order("sort_order").order("name");
    const tlist = (ts ?? []) as Trolley[];
    const byConcept: Record<string, Trolley[]> = {};
    tlist.forEach((t) => { (byConcept[t.concept_id] ||= []).push(t); });
    setTrolleys(byConcept);

    // 3) items for those trolleys
    const trolleyIds = tlist.map((t) => t.id);
    if (trolleyIds.length) {
      const { data: its } = await sb
        .from("concept_trolley_items")
        .select("id, trolley_id, item_name, quantity, notes, position")
        .in("trolley_id", trolleyIds)
        .order("position");
      const grouped: Record<string, TrolleyItem[]> = {};
      (its ?? []).forEach((i: any) => {
        const it: TrolleyItem = {
          id: i.id, trolley_id: i.trolley_id, name: i.item_name,
          quantity: i.quantity, notes: i.notes, position: i.position,
        };
        (grouped[it.trolley_id!] ||= []).push(it);
      });
      setItems(grouped);
    } else {
      setItems({});
    }

    // 4) assignments for this festival
    const { data: as_ } = await sb
      .from("festival_trolley_assignments")
      .select("trolley_id, transport_id")
      .eq("festival_id", festivalId);
    const amap: Record<string, string | null> = {};
    (as_ ?? []).forEach((a: any) => { amap[a.trolley_id] = a.transport_id; });
    setAssignments(amap);

    setLoading(false);
  };

  useEffect(() => { if (festivalId) load(); /* eslint-disable-next-line */ }, [festivalId]);

  const addTrolley = async (conceptId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = trolleys[conceptId] ?? [];
    const { error } = await sb.from("concept_trolleys").insert({
      concept_id: conceptId, name: trimmed, sort_order: existing.length,
    });
    if (error) { toast.error(error.message); return; }
    load();
  };

  const seedDefaults = async (conceptId: string) => {
    const rows = DEFAULT_TROLLEY_NAMES.map((n, i) => ({
      concept_id: conceptId, name: n, sort_order: i,
    }));
    const { error } = await sb.from("concept_trolleys").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success("5 default trolleys added");
    load();
  };

  const renameTrolley = async (id: string, name: string) => {
    const { error } = await sb.from("concept_trolleys").update({ name }).eq("id", id);
    if (error) toast.error(error.message);
  };

  const deleteTrolley = async (t: Trolley) => {
    if (!confirm(`Delete trolley "${t.name}" and all its items?`)) return;
    const { error } = await sb.from("concept_trolleys").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const addItem = async (t: Trolley) => {
    const { error } = await sb.from("concept_trolley_items").insert({
      concept_id: t.concept_id,
      trolley_id: t.id,
      item_name: "New item",
      quantity: "1",
      position: (items[t.id]?.length ?? 0),
    });
    if (error) { toast.error(error.message); return; }
    load();
  };

  const updateItem = async (id: string, patch: Partial<{ item_name: string; quantity: string | null; notes: string | null }>) => {
    const { error } = await sb.from("concept_trolley_items").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const deleteItem = async (id: string) => {
    const { error } = await sb.from("concept_trolley_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const setAssignment = async (trolleyId: string, transportId: string | null) => {
    if (transportId === null) {
      const { error } = await sb.from("festival_trolley_assignments")
        .delete().eq("festival_id", festivalId).eq("trolley_id", trolleyId);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await sb.from("festival_trolley_assignments")
        .upsert({ festival_id: festivalId, trolley_id: trolleyId, transport_id: transportId }, {
          onConflict: "festival_id,trolley_id",
        });
      if (error) { toast.error(error.message); return; }
    }
    setAssignments((a) => ({ ...a, [trolleyId]: transportId }));
    toast.success("Vehicle saved");
  };

  const bulkAdd = async () => {
    if (!bulkFor) return;
    const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const startPos = items[bulkFor.id]?.length ?? 0;
    const rows = lines.map((line, idx) => {
      const csv = line.split(",").map((s) => s.trim());
      if (csv.length >= 2) {
        const [q, n, notes] = csv;
        return {
          concept_id: bulkFor.concept_id, trolley_id: bulkFor.id,
          quantity: q || null, item_name: n || q, notes: notes || null,
          position: startPos + idx,
        };
      }
      const m = line.match(/^(\d+(?:[.,]\d+)?)\s*[x×]?\s+(.+)$/i);
      if (m) {
        return {
          concept_id: bulkFor.concept_id, trolley_id: bulkFor.id,
          quantity: m[1], item_name: m[2].trim(), notes: null,
          position: startPos + idx,
        };
      }
      return {
        concept_id: bulkFor.concept_id, trolley_id: bulkFor.id,
        quantity: null, item_name: line, notes: null,
        position: startPos + idx,
      };
    });
    const { error } = await sb.from("concept_trolley_items").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${rows.length} item(s)`);
    setBulkFor(null); setBulkText("");
    load();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg flex-wrap">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <span>Trolleys per concept</span>
          <span className="text-sm font-normal text-muted-foreground">
            defined once per concept · packed into vehicles per festival
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : concepts.length === 0 ? (
          <div className="text-sm text-muted-foreground">No active concepts on this festival.</div>
        ) : (
          concepts.map((c) => {
            const tlist = trolleys[c.concept_id] ?? [];
            const cOpen = openConcept[c.concept_id] ?? true;
            return (
              <div key={c.concept_id} className="border rounded-lg">
                <div className="flex items-center gap-2 p-3 bg-muted/30">
                  <button
                    className="flex items-center gap-2 flex-1 text-left"
                    onClick={() => setOpenConcept((o) => ({ ...o, [c.concept_id]: !cOpen }))}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${cOpen ? "" : "-rotate-90"}`} />
                    <span className="font-medium">{c.concept_alias || c.concept_name}</span>
                    <span className="text-xs text-muted-foreground">({tlist.length} trolleys)</span>
                  </button>
                  {tlist.length === 0 && (
                    <Button size="sm" variant="outline" onClick={() => seedDefaults(c.concept_id)}>
                      <Plus className="h-3.5 w-3.5" /> Add 5 default trolleys
                    </Button>
                  )}
                  <AddTrolleyButton onAdd={(n) => addTrolley(c.concept_id, n)} />
                </div>

                {cOpen && (
                  <div className="p-3 space-y-2">
                    {tlist.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">No trolleys for this concept yet.</div>
                    ) : tlist.map((t) => {
                      const tOpen = openTrolley[t.id] ?? false;
                      const list = items[t.id] ?? [];
                      const assigned = assignments[t.id] ?? null;
                      return (
                        <div key={t.id} className="border rounded-md">
                          <div className="flex items-center gap-2 p-2 flex-wrap">
                            <button
                              onClick={() => setOpenTrolley((o) => ({ ...o, [t.id]: !tOpen }))}
                              className="flex items-center gap-2 text-left min-w-0"
                            >
                              <ChevronDown className={`h-4 w-4 transition-transform ${tOpen ? "" : "-rotate-90"}`} />
                              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                              <Input
                                defaultValue={t.name}
                                onBlur={(e) => renameTrolley(t.id, e.target.value.trim() || t.name)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-7 w-44 text-sm font-medium"
                              />
                              <span className="text-xs text-muted-foreground">({list.length})</span>
                            </button>

                            <div className="flex items-center gap-1.5 ml-auto">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Truck className="h-3.5 w-3.5" /> Pack into:
                              </span>
                              <Select
                                value={assigned ?? NONE}
                                onValueChange={(v) => setAssignment(t.id, v === NONE ? null : v)}
                                disabled={vehLoading}
                              >
                                <SelectTrigger className={cn(
                                  "h-8 text-xs w-44",
                                  !assigned && "border-amber-500/60 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200",
                                )}>
                                  <SelectValue placeholder="— unassigned —" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE}>— unassigned —</SelectItem>
                                  {vehicles.map((v) => (
                                    <SelectItem key={v.id} value={v.id}>{v.vehicle_type}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="ghost"
                                onClick={() => { setBulkFor(t); setBulkText(""); }}
                                title="Bulk upload items">
                                <Upload className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteTrolley(t)} title="Delete trolley">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>

                          {tOpen && (
                            <div className="px-2 pb-2 space-y-1.5 border-t pt-2">
                              {list.length === 0 ? (
                                <div className="text-xs text-muted-foreground italic">No items yet.</div>
                              ) : list.map((it) => (
                                <div key={it.id} className="flex items-center gap-1.5">
                                  <Input
                                    defaultValue={it.quantity ?? ""}
                                    onBlur={(e) => updateItem(it.id, { quantity: e.target.value || null })}
                                    className="h-8 w-20 text-sm tabular-nums"
                                    placeholder="qty"
                                  />
                                  <Input
                                    defaultValue={it.name}
                                    onBlur={(e) => updateItem(it.id, { item_name: e.target.value })}
                                    className="h-8 flex-1 text-sm"
                                    placeholder="name"
                                  />
                                  <Input
                                    defaultValue={it.notes ?? ""}
                                    onBlur={(e) => updateItem(it.id, { notes: e.target.value || null })}
                                    className="h-8 flex-1 text-sm"
                                    placeholder="notes"
                                  />
                                  <Button size="sm" variant="ghost" onClick={() => deleteItem(it.id)}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </div>
                              ))}
                              <Button size="sm" variant="outline" onClick={() => addItem(t)} className="mt-1">
                                <Plus className="h-3.5 w-3.5" /> Add item
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      {/* Bulk upload */}
      <Dialog open={!!bulkFor} onOpenChange={(v) => { if (!v) { setBulkFor(null); setBulkText(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload items to "{bulkFor?.name}"</DialogTitle>
            <DialogDescription>
              One item per line. Accepted formats:
              <br />• <code>2 Chef knife</code>
              <br />• <code>10 x Cutting board</code>
              <br />• <code>quantity, name, notes</code> (CSV)
              <br />• Or just <code>name</code>
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={14}
            placeholder={"2 Chef knife\n10 x Cutting board\n5, Tongs, stainless"}
            className="font-mono text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkFor(null); setBulkText(""); }}>Cancel</Button>
            <Button onClick={bulkAdd}>Add items</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AddTrolleyButton({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Trolley
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New trolley</DialogTitle>
            <DialogDescription>e.g. Equipment, Small kitchen tools, Consumables, Tables, Electric.</DialogDescription>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Trolley name" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (name.trim()) { onAdd(name); setName(""); setOpen(false); } }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
