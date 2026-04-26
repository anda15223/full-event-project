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
import { SmartCard } from "@/components/festival/SmartCard";

const CATEGORIES = ["Cooking/small gear", "Serving/packaging", "Cleaning/chemicals", "Stationery/signage"];
const NO_CONCEPT = "__none__";

export default function TrolleysEditor() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const { data: festival } = useFestival(slug);
  const trolleysQ = useTrolleys(festival?.id);
  const [newItem, setNewItem] = useState<Record<string, { name: string; qty: string; cat: string; concept_id: string }>>({});

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const { trolleys = [], items = [], concepts = [] } = trolleysQ.data || {};

  const conceptName = (cid: string | null | undefined) =>
    concepts.find(c => c.id === cid)?.name || "Unassigned";

  const addItem = async (trolleyId: string, defaultConceptId: string | null) => {
    const draft = newItem[trolleyId];
    if (!draft?.name || !draft?.cat) { toast.error("Name and category required"); return; }
    const existing = items.filter(i => i.trolley_id === trolleyId);
    const orderIndex = existing.length;
    const conceptId =
      draft.concept_id && draft.concept_id !== NO_CONCEPT
        ? draft.concept_id
        : defaultConceptId;
    const { error } = await supabase.from("festival_bc_trolley_items").insert({
      trolley_id: trolleyId,
      category: draft.cat,
      item_name: draft.name,
      quantity: draft.qty || null,
      order_index: orderIndex,
      concept_id: conceptId,
    });
    if (error) { toast.error("Failed to add"); return; }
    setNewItem(s => ({ ...s, [trolleyId]: { name: "", qty: "", cat: draft.cat, concept_id: draft.concept_id } }));
    qc.invalidateQueries({ queryKey: ["festival_trolleys", festival.id] });
  };

  const updateItemConcept = async (id: string, value: string) => {
    const concept_id = value === NO_CONCEPT ? null : value;
    const { error } = await supabase
      .from("festival_bc_trolley_items")
      .update({ concept_id })
      .eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    qc.invalidateQueries({ queryKey: ["festival_trolleys", festival.id] });
  };

  const updateItemCategory = async (id: string, category: string) => {
    const { error } = await supabase
      .from("festival_bc_trolley_items")
      .update({ category })
      .eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
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

      <div className="space-y-8">
        {trolleys.map(t => {
          const tItems = items.filter(i => i.trolley_id === t.id);
          const draft = newItem[t.id] || { name: "", qty: "", cat: CATEGORIES[0], concept_id: t.concept_id ?? NO_CONCEPT };

          // Group items by concept for easier navigation
          const grouped = tItems.reduce<Record<string, typeof tItems>>((acc, it) => {
            const key = (it as any).concept_id ?? NO_CONCEPT;
            (acc[key] ||= []).push(it);
            return acc;
          }, {});
          const groupKeys = Object.keys(grouped).sort((a, b) =>
            conceptName(a === NO_CONCEPT ? null : a).localeCompare(conceptName(b === NO_CONCEPT ? null : b))
          );

          return (
            <div key={t.id} className="space-y-3">
              {/* Upload + Brain panel (AI extract / brain grab) — items land in smart_lines for review */}
              <SmartCard
                cardKey={`trolley_${t.id}`}
                festivalId={festival.id}
                conceptId={t.concept_id}
                title={`${conceptName(t.concept_id)} · Trolley #${t.trolley_number} — Upload & Brain`}
                subtitle="Upload packing lists or photos, or grab from Brain. Use the per-row Allocate + Inventory dropdowns to organize each item."
                siblingConcepts={concepts.map(c => ({ id: c.id, name: c.name }))}
                inventoryCategories={CATEGORIES}
              />

              {/* Official trolley checklist (writes to festival_bc_trolley_items) */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-[13px]">{conceptName(t.concept_id)} — Official checklist</h3>
                    <p className="text-[11px] text-muted-foreground">Trolley #{t.trolley_number} · {t.label}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{tItems.length} items</Badge>
                </div>

                <div className="space-y-3">
                  {tItems.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">No items yet</p>
                  )}
                  {groupKeys.map(gk => (
                    <div key={gk} className="space-y-1">
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {conceptName(gk === NO_CONCEPT ? null : gk)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">· {grouped[gk].length}</span>
                      </div>
                      {grouped[gk].map(i => (
                        <div key={i.id} className="flex items-center justify-between gap-2 text-[12px] py-1 px-2 rounded hover:bg-secondary/40">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="truncate">{i.item_name}</span>
                            {i.quantity && <span className="text-muted-foreground shrink-0">× {i.quantity}</span>}
                          </div>
                          <Select
                            value={i.category}
                            onValueChange={(v) => updateItemCategory(i.id, v)}
                          >
                            <SelectTrigger className="h-7 w-[150px] text-[11px]">
                              <SelectValue placeholder="Inventory" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover">
                              {CATEGORIES.map(c => (
                                <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={(i as any).concept_id ?? NO_CONCEPT}
                            onValueChange={(v) => updateItemConcept(i.id, v)}
                          >
                            <SelectTrigger className="h-7 w-[140px] text-[11px]">
                              <SelectValue placeholder="Concept" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover">
                              <SelectItem value={NO_CONCEPT} className="text-[12px]">Unassigned</SelectItem>
                              {concepts.map(c => (
                                <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button onClick={() => removeItem(i.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="border-t border-border/30 pt-3 grid grid-cols-12 gap-1.5">
                  <Select value={draft.cat} onValueChange={(v) => setNewItem(s => ({ ...s, [t.id]: { ...draft, cat: v } }))}>
                    <SelectTrigger className="col-span-3 h-8 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select
                    value={draft.concept_id || (t.concept_id ?? NO_CONCEPT)}
                    onValueChange={(v) => setNewItem(s => ({ ...s, [t.id]: { ...draft, concept_id: v } }))}
                  >
                    <SelectTrigger className="col-span-3 h-8 text-[11px]">
                      <SelectValue placeholder="Affiliate" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value={NO_CONCEPT} className="text-[12px]">Unassigned</SelectItem>
                      {concepts.map(c => (
                        <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Item"
                    value={draft.name}
                    className="col-span-3 h-8 text-[12px]"
                    onChange={(e) => setNewItem(s => ({ ...s, [t.id]: { ...draft, name: e.target.value } }))}
                  />
                  <Input
                    placeholder="Qty"
                    value={draft.qty}
                    className="col-span-2 h-8 text-[12px]"
                    onChange={(e) => setNewItem(s => ({ ...s, [t.id]: { ...draft, qty: e.target.value } }))}
                  />
                  <Button size="sm" variant="outline" className="col-span-1 h-8 px-0" onClick={() => addItem(t.id, t.concept_id)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
