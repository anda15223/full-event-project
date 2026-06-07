import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Plus, Trash2, ChevronDown, Upload, Loader2, Copy } from "lucide-react";

const sb: any = supabase;

type Trolley = { id: string; concept_id: string; name: string; sort_order: number };
type TrolleyItem = {
  id: string; trolley_id: string | null; name: string;
  quantity: string | null; notes: string | null; position: number | null;
};

const DEFAULTS = ["Equipment", "Small kitchen tools", "Consumables", "Tables", "Electric"];

export function ConceptTrolleysSection({ conceptId }: { conceptId: string }) {
  const [trolleys, setTrolleys] = useState<Trolley[]>([]);
  const [items, setItems] = useState<Record<string, TrolleyItem[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [bulkFor, setBulkFor] = useState<Trolley | null>(null);
  const [bulkText, setBulkText] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: ts } = await sb.from("concept_trolleys")
      .select("*").eq("concept_id", conceptId).order("sort_order").order("name");
    const list = (ts ?? []) as Trolley[];
    setTrolleys(list);
    if (list.length) {
      const { data: its } = await sb.from("concept_trolley_items")
        .select("id, trolley_id, item_name, quantity, notes, position")
        .in("trolley_id", list.map((t) => t.id))
        .order("position");
      const g: Record<string, TrolleyItem[]> = {};
      (its ?? []).forEach((i: any) => {
        const it: TrolleyItem = {
          id: i.id, trolley_id: i.trolley_id, name: i.item_name,
          quantity: i.quantity, notes: i.notes, position: i.position,
        };
        (g[it.trolley_id!] ||= []).push(it);
      });
      setItems(g);
    } else setItems({});
    setLoading(false);
  };

  useEffect(() => { if (conceptId) load(); /* eslint-disable-next-line */ }, [conceptId]);

  const addTrolley = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await sb.from("concept_trolleys").insert({
      concept_id: conceptId, name: trimmed, sort_order: trolleys.length,
    });
    if (error) return toast.error(error.message);
    load();
  };

  const seedDefaults = async () => {
    const rows = DEFAULTS.map((n, i) => ({ concept_id: conceptId, name: n, sort_order: i }));
    const { error } = await sb.from("concept_trolleys").insert(rows);
    if (error) return toast.error(error.message);
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
    if (error) return toast.error(error.message);
    load();
  };
  const duplicateTrolley = async (t: Trolley) => {
    const copyName = `${t.name} (Copy)`;
    const sortOrder = trolleys.length;
    const { data: newTrolley, error: tErr } = await sb.from("concept_trolleys")
      .insert({ concept_id: t.concept_id, name: copyName, sort_order: sortOrder })
      .select("id").single();
    if (tErr || !newTrolley) return toast.error(tErr?.message || "Failed to duplicate trolley");
    const sourceItems = items[t.id] ?? [];
    if (sourceItems.length) {
      const rows = sourceItems.map((it, idx) => ({
        concept_id: t.concept_id,
        trolley_id: newTrolley.id,
        item_name: it.name,
        quantity: it.quantity,
        notes: it.notes,
        position: idx,
      }));
      const { error: iErr } = await sb.from("concept_trolley_items").insert(rows);
      if (iErr) return toast.error(iErr.message);
    }
    toast.success(`Duplicated "${t.name}"`);
    load();
  };
  const addItem = async (t: Trolley) => {
    const { error } = await sb.from("concept_trolley_items").insert({
      concept_id: t.concept_id, trolley_id: t.id,
      item_name: "New item", quantity: "1", position: (items[t.id]?.length ?? 0),
    });
    if (error) return toast.error(error.message);
    load();
  };
  const updateItem = async (id: string, patch: any) => {
    const { error } = await sb.from("concept_trolley_items").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };
  const deleteItem = async (id: string) => {
    const { error } = await sb.from("concept_trolley_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
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
        return { concept_id: bulkFor.concept_id, trolley_id: bulkFor.id,
          quantity: q || null, item_name: n || q, notes: notes || null, position: startPos + idx };
      }
      const m = line.match(/^(\d+(?:[.,]\d+)?)\s*[x×]?\s+(.+)$/i);
      if (m) return { concept_id: bulkFor.concept_id, trolley_id: bulkFor.id,
        quantity: m[1], item_name: m[2].trim(), notes: null, position: startPos + idx };
      return { concept_id: bulkFor.concept_id, trolley_id: bulkFor.id,
        quantity: null, item_name: line, notes: null, position: startPos + idx };
    });
    const { error } = await sb.from("concept_trolley_items").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`Added ${rows.length} item(s)`);
    setBulkFor(null); setBulkText("");
    load();
  };

  return (
    <div className="p-3 space-y-2 bg-muted/10 border-t">
      <div className="flex items-center gap-2 flex-wrap">
        <ShoppingCart className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Trolleys</span>
        <span className="text-[11px] text-muted-foreground">reused for every festival · assigned to vehicles in Søborg Loading</span>
        <div className="ml-auto flex gap-1.5">
          {trolleys.length === 0 && !loading && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={seedDefaults}>
              <Plus className="h-3 w-3" /> Add 5 defaults
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setNewOpen(true)}>
            <Plus className="h-3 w-3" /> Trolley
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : trolleys.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No trolleys yet.</div>
      ) : trolleys.map((t) => {
        const isOpen = open[t.id] ?? false;
        const list = items[t.id] ?? [];
        return (
          <div key={t.id} className="border rounded-md bg-background">
            <div className="flex items-center gap-2 p-2">
              <button onClick={() => setOpen((o) => ({ ...o, [t.id]: !isOpen }))} className="flex items-center gap-1.5">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <Input
                defaultValue={t.name}
                onBlur={(e) => renameTrolley(t.id, e.target.value.trim() || t.name)}
                className="h-7 w-44 text-xs font-medium"
              />
              <span className="text-[11px] text-muted-foreground">({list.length} items)</span>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2"
                  onClick={() => { setBulkFor(t); setBulkText(""); }} title="Bulk upload">
                  <Upload className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => deleteTrolley(t)} title="Delete trolley">
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
            {isOpen && (
              <div className="px-2 pb-2 space-y-1.5 border-t pt-2">
                {list.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground italic">No items yet.</div>
                ) : list.map((it) => (
                  <div key={it.id} className="flex items-center gap-1.5">
                    <Input defaultValue={it.quantity ?? ""}
                      onBlur={(e) => updateItem(it.id, { quantity: e.target.value || null })}
                      className="h-7 w-16 text-xs tabular-nums" placeholder="qty" />
                    <Input defaultValue={it.name}
                      onBlur={(e) => updateItem(it.id, { item_name: e.target.value })}
                      className="h-7 flex-1 text-xs" placeholder="name" />
                    <Input defaultValue={it.notes ?? ""}
                      onBlur={(e) => updateItem(it.id, { notes: e.target.value || null })}
                      className="h-7 flex-1 text-xs" placeholder="notes" />
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => deleteItem(it.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addItem(t)}>
                  <Plus className="h-3 w-3" /> Add item
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New trolley</DialogTitle>
            <DialogDescription>e.g. Equipment, Small kitchen tools, Consumables, Tables, Electric.</DialogDescription>
          </DialogHeader>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Trolley name" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (newName.trim()) { addTrolley(newName); setNewName(""); setNewOpen(false); } }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bulkFor} onOpenChange={(v) => { if (!v) { setBulkFor(null); setBulkText(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload items to "{bulkFor?.name}"</DialogTitle>
            <DialogDescription>
              One item per line. Formats: <code>2 Chef knife</code>, <code>10 x Cutting board</code>, <code>qty, name, notes</code> (CSV), or just <code>name</code>.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)}
            rows={14} className="font-mono text-sm"
            placeholder={"2 Chef knife\n10 x Cutting board\n5, Tongs, stainless"} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkFor(null); setBulkText(""); }}>Cancel</Button>
            <Button onClick={bulkAdd}>Add items</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
