import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFestival, useTrolleys } from "@/hooks/useFestival";

const CATEGORIES = ["Cooking/small gear", "Serving/packaging", "Cleaning/chemicals", "Stationery/signage"];

export default function TrolleysEditor() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const { data: festival } = useFestival(slug);
  const trolleysQ = useTrolleys(festival?.id);
  const [newItem, setNewItem] = useState<Record<string, { name: string; qty: string; cat: string }>>({});

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const { trolleys = [], items = [], concepts = [] } = trolleysQ.data || {};

  const conceptName = (cid: string) => concepts.find(c => c.id === cid)?.name || "?";

  const addItem = async (trolleyId: string) => {
    const draft = newItem[trolleyId];
    if (!draft?.name || !draft?.cat) { toast.error("Name and category required"); return; }
    const existing = items.filter(i => i.trolley_id === trolleyId);
    const orderIndex = existing.length;
    const { error } = await supabase.from("festival_bc_trolley_items").insert({
      trolley_id: trolleyId,
      category: draft.cat,
      item_name: draft.name,
      quantity: draft.qty || null,
      order_index: orderIndex,
    });
    if (error) { toast.error("Failed to add"); return; }
    setNewItem(s => ({ ...s, [trolleyId]: { name: "", qty: "", cat: draft.cat } }));
    qc.invalidateQueries({ queryKey: ["festival_trolleys", festival.id] });
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from("festival_bc_trolley_items").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    qc.invalidateQueries({ queryKey: ["festival_trolleys", festival.id] });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">BC Trolley Checklists</h1>
        <p className="text-sm text-muted-foreground mt-1">{trolleys.length} trolleys · {items.length} items</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {trolleys.map(t => {
          const tItems = items.filter(i => i.trolley_id === t.id);
          const draft = newItem[t.id] || { name: "", qty: "", cat: CATEGORIES[0] };
          return (
            <Card key={t.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-[13px]">{conceptName(t.concept_id)}</h3>
                  <p className="text-[11px] text-muted-foreground">Trolley #{t.trolley_number} · {t.label}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{tItems.length} items</Badge>
              </div>
              <div className="space-y-1">
                {tItems.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic">No items yet</p>
                )}
                {tItems.map(i => (
                  <div key={i.id} className="flex items-center justify-between text-[12px] py-1 px-2 rounded hover:bg-secondary/40">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{i.category}</Badge>
                      <span>{i.item_name}</span>
                      {i.quantity && <span className="text-muted-foreground">× {i.quantity}</span>}
                    </div>
                    <button onClick={() => removeItem(i.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/30 pt-3 grid grid-cols-12 gap-1.5">
                <Select value={draft.cat} onValueChange={(v) => setNewItem(s => ({ ...s, [t.id]: { ...draft, cat: v } }))}>
                  <SelectTrigger className="col-span-4 h-8 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Item"
                  value={draft.name}
                  className="col-span-5 h-8 text-[12px]"
                  onChange={(e) => setNewItem(s => ({ ...s, [t.id]: { ...draft, name: e.target.value } }))}
                />
                <Input
                  placeholder="Qty"
                  value={draft.qty}
                  className="col-span-2 h-8 text-[12px]"
                  onChange={(e) => setNewItem(s => ({ ...s, [t.id]: { ...draft, qty: e.target.value } }))}
                />
                <Button size="sm" variant="outline" className="col-span-1 h-8 px-0" onClick={() => addItem(t.id)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
