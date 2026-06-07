import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ShoppingCart, Plus, Trash2, ChevronDown, Upload, Pencil, Loader2,
} from "lucide-react";

const sb: any = supabase;

type Trolley = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
};
type TrolleyItem = {
  id: string;
  trolley_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  sort_order: number;
};

export function TrolleyLibraryCard() {
  const [trolleys, setTrolleys] = useState<Trolley[]>([]);
  const [items, setItems] = useState<Record<string, TrolleyItem[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // dialogs
  const [newTrolleyOpen, setNewTrolleyOpen] = useState(false);
  const [newTrolleyName, setNewTrolleyName] = useState("");
  const [newTrolleyDesc, setNewTrolleyDesc] = useState("");

  const [bulkFor, setBulkFor] = useState<Trolley | null>(null);
  const [bulkText, setBulkText] = useState("");

  const [editingTrolley, setEditingTrolley] = useState<Trolley | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: ts } = await sb
      .from("trolley_templates")
      .select("*")
      .order("sort_order")
      .order("name");
    const list = (ts ?? []) as Trolley[];
    setTrolleys(list);
    if (list.length > 0) {
      const { data: its } = await sb
        .from("trolley_template_items")
        .select("*")
        .in("trolley_id", list.map((t) => t.id))
        .order("sort_order")
        .order("name");
      const grouped: Record<string, TrolleyItem[]> = {};
      (its ?? []).forEach((it: TrolleyItem) => {
        (grouped[it.trolley_id] ||= []).push(it);
      });
      setItems(grouped);
    } else {
      setItems({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createTrolley = async () => {
    const name = newTrolleyName.trim();
    if (!name) return;
    const { error } = await sb.from("trolley_templates").insert({
      name,
      description: newTrolleyDesc.trim() || null,
      sort_order: trolleys.length,
    });
    if (error) { toast.error(error.message); return; }
    setNewTrolleyName(""); setNewTrolleyDesc(""); setNewTrolleyOpen(false);
    toast.success("Trolley added");
    load();
  };

  const renameTrolley = async () => {
    if (!editingTrolley) return;
    const { error } = await sb.from("trolley_templates").update({
      name: editName.trim(),
      description: editDesc.trim() || null,
    }).eq("id", editingTrolley.id);
    if (error) { toast.error(error.message); return; }
    setEditingTrolley(null);
    toast.success("Trolley updated");
    load();
  };

  const deleteTrolley = async (t: Trolley) => {
    if (!confirm(`Delete trolley "${t.name}" and all its items?`)) return;
    const { error } = await sb.from("trolley_templates").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  const addItem = async (trolleyId: string) => {
    const { error } = await sb.from("trolley_template_items").insert({
      trolley_id: trolleyId,
      name: "New item",
      quantity: 1,
      sort_order: (items[trolleyId]?.length ?? 0),
    });
    if (error) { toast.error(error.message); return; }
    load();
  };

  const updateItem = async (id: string, patch: Partial<TrolleyItem>) => {
    const { error } = await sb.from("trolley_template_items").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const deleteItem = async (id: string) => {
    const { error } = await sb.from("trolley_template_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const bulkAdd = async () => {
    if (!bulkFor) return;
    const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const startOrder = items[bulkFor.id]?.length ?? 0;
    // Accept: "qty name", "qty x name", "qty,name,unit,notes" or "name"
    const rows = lines.map((line, idx) => {
      const csv = line.split(",").map((s) => s.trim());
      if (csv.length >= 2) {
        const [q, n, u, notes] = csv;
        const qty = parseFloat(q.replace(",", "."));
        return {
          trolley_id: bulkFor.id,
          quantity: isNaN(qty) ? null : qty,
          name: n || q,
          unit: u || null,
          notes: notes || null,
          sort_order: startOrder + idx,
        };
      }
      const m = line.match(/^(\d+(?:[.,]\d+)?)\s*[x×]?\s+(.+)$/i);
      if (m) {
        return {
          trolley_id: bulkFor.id,
          quantity: parseFloat(m[1].replace(",", ".")),
          name: m[2].trim(),
          unit: null, notes: null,
          sort_order: startOrder + idx,
        };
      }
      return {
        trolley_id: bulkFor.id,
        quantity: null,
        name: line,
        unit: null, notes: null,
        sort_order: startOrder + idx,
      };
    });
    const { error } = await sb.from("trolley_template_items").insert(rows);
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
          <span>Trolleys</span>
          <span className="text-sm font-normal text-muted-foreground">
            reusable library · used for every festival
          </span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setNewTrolleyOpen(true)}>
            <Plus className="h-4 w-4" /> New trolley
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : trolleys.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No trolleys yet. Create your first trolley (e.g. "Equipment", "Small kitchen tools", "Consumables", "Tables", "Electric").
          </div>
        ) : (
          trolleys.map((t) => {
            const isOpen = open[t.id] ?? false;
            const list = items[t.id] ?? [];
            return (
              <div key={t.id} className="border rounded-lg">
                <div className="flex items-center gap-2 p-3">
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [t.id]: !isOpen }))}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                    />
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground">({list.length} items)</span>
                    {t.description && (
                      <span className="text-xs text-muted-foreground italic ml-2 truncate">
                        — {t.description}
                      </span>
                    )}
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setBulkFor(t); setBulkText("");
                  }} title="Bulk upload items">
                    <Upload className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingTrolley(t); setEditName(t.name); setEditDesc(t.description ?? "");
                  }} title="Rename">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteTrolley(t)} title="Delete trolley">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-1.5 border-t pt-3">
                    {list.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">No items yet.</div>
                    ) : (
                      list.map((it) => (
                        <div key={it.id} className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            step="any"
                            defaultValue={it.quantity ?? ""}
                            onBlur={(e) => updateItem(it.id, {
                              quantity: e.target.value === "" ? null : parseFloat(e.target.value),
                            })}
                            className="h-8 w-20 text-sm tabular-nums"
                            placeholder="qty"
                          />
                          <Input
                            defaultValue={it.unit ?? ""}
                            onBlur={(e) => updateItem(it.id, { unit: e.target.value || null })}
                            className="h-8 w-20 text-sm"
                            placeholder="unit"
                          />
                          <Input
                            defaultValue={it.name}
                            onBlur={(e) => updateItem(it.id, { name: e.target.value })}
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
                      ))
                    )}
                    <Button size="sm" variant="outline" onClick={() => addItem(t.id)} className="mt-2">
                      <Plus className="h-3.5 w-3.5" /> Add item
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      {/* New trolley dialog */}
      <Dialog open={newTrolleyOpen} onOpenChange={setNewTrolleyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New trolley</DialogTitle>
            <DialogDescription>e.g. Equipment, Small kitchen tools, Consumables, Tables, Electric.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Trolley name" value={newTrolleyName}
              onChange={(e) => setNewTrolleyName(e.target.value)} autoFocus />
            <Textarea placeholder="Description (optional)" value={newTrolleyDesc}
              onChange={(e) => setNewTrolleyDesc(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTrolleyOpen(false)}>Cancel</Button>
            <Button onClick={createTrolley}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename trolley */}
      <Dialog open={!!editingTrolley} onOpenChange={(v) => !v && setEditingTrolley(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit trolley</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTrolley(null)}>Cancel</Button>
            <Button onClick={renameTrolley}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk upload */}
      <Dialog open={!!bulkFor} onOpenChange={(v) => { if (!v) { setBulkFor(null); setBulkText(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload items to "{bulkFor?.name}"</DialogTitle>
            <DialogDescription>
              One item per line. Accepted formats:
              <br />• <code>2 Chef knife</code>
              <br />• <code>10 x Cutting board</code>
              <br />• <code>quantity, name, unit, notes</code> (CSV)
              <br />• Or just <code>name</code>
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={14}
            placeholder={"2 Chef knife\n10 x Cutting board\n5, Tongs, pcs, stainless"}
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
