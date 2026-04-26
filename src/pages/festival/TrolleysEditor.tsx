import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Camera, AlertTriangle } from "lucide-react";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFestival, useTrolleys } from "@/hooks/useFestival";
import { SmartCard } from "@/components/festival/SmartCard";
import { cn } from "@/lib/utils";

type TrolleyItem = {
  id: string;
  trolley_id: string;
  item_name: string;
  category: string;
  quantity: string | null;
  needed_quantity: number | null;
  counted_quantity: number | null;
  concept_id: string | null;
  photo_path: string | null;
};

function ItemPhotoCard({
  item,
  concepts,
  onUpdate,
  onDelete,
  conceptName,
}: {
  item: TrolleyItem;
  concepts: { id: string; name: string }[];
  onUpdate: (id: string, patch: Partial<TrolleyItem>) => void;
  onDelete: (id: string) => void;
  conceptName: (cid: string | null) => string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photoUrl = item.photo_path
    ? supabase.storage.from("festival-photos").getPublicUrl(item.photo_path).data.publicUrl
    : null;

  const needed = item.needed_quantity;
  const counted = item.counted_quantity;
  const missingNeeded = needed == null || needed === 0;
  const shortAfterCount = counted != null && needed != null && counted < needed;
  const matched = counted != null && needed != null && counted === needed;

  const handlePhoto = async (file: File) => {
    setUploading(true);
    const path = `trolley-items/${item.id}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("festival-photos").upload(path, file, { upsert: true });
    if (upErr) { toast.error("Upload failed"); setUploading(false); return; }
    onUpdate(item.id, { photo_path: path });
    setUploading(false);
  };

  return (
    <Card
      className={cn(
        "p-2 space-y-1.5 relative group",
        missingNeeded && "border-destructive/60 bg-destructive/5",
        shortAfterCount && "border-amber-500/60 bg-amber-500/5",
        matched && "border-emerald-500/40"
      )}
    >
      <button
        onClick={() => onDelete(item.id)}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
      >
        <Trash2 className="h-3 w-3" />
      </button>

      <div
        onClick={() => fileRef.current?.click()}
        className="aspect-square w-full rounded bg-muted/40 border border-dashed border-border/50 overflow-hidden cursor-pointer flex items-center justify-center"
      >
        {photoUrl ? (
          <img src={photoUrl} alt={item.item_name} className="w-full h-full object-cover" />
        ) : (
          <Camera className="h-5 w-5 text-muted-foreground" />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])}
        />
      </div>

      <Input
        value={item.item_name}
        onChange={(e) => onUpdate(item.id, { item_name: e.target.value })}
        className="h-6 text-[11px] font-medium px-1.5"
      />

      <div className="flex items-center gap-1">
        <div className="flex-1">
          <label className="text-[9px] text-muted-foreground uppercase block leading-none">Need</label>
          <Input
            type="number"
            value={needed ?? ""}
            placeholder="0"
            onChange={(e) => onUpdate(item.id, { needed_quantity: e.target.value === "" ? null : Number(e.target.value) })}
            className={cn("h-6 text-[11px] px-1.5", missingNeeded && "border-destructive text-destructive")}
          />
        </div>
        <div className="flex-1">
          <label className="text-[9px] text-muted-foreground uppercase block leading-none">Count</label>
          <Input
            type="number"
            value={counted ?? ""}
            placeholder="–"
            onChange={(e) => onUpdate(item.id, { counted_quantity: e.target.value === "" ? null : Number(e.target.value) })}
            className={cn(
              "h-6 text-[11px] px-1.5",
              shortAfterCount && "border-amber-500 text-amber-600",
              matched && "border-emerald-500 text-emerald-600"
            )}
          />
        </div>
      </div>

      {(missingNeeded || shortAfterCount) && (
        <div className={cn(
          "flex items-center gap-1 text-[10px] font-medium",
          missingNeeded ? "text-destructive" : "text-amber-600"
        )}>
          <AlertTriangle className="h-2.5 w-2.5" />
          {missingNeeded ? "Qty missing" : `Short by ${(needed ?? 0) - (counted ?? 0)}`}
        </div>
      )}

      <Select value={item.concept_id ?? "__none__"} onValueChange={(v) => onUpdate(item.id, { concept_id: v === "__none__" ? null : v })}>
        <SelectTrigger className="h-6 text-[10px] px-1.5"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="__none__" className="text-[11px]">Unassigned</SelectItem>
          {concepts.map(c => <SelectItem key={c.id} value={c.id} className="text-[11px]">{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </Card>
  );
}

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

  const updateItem = async (id: string, patch: Partial<TrolleyItem>) => {
    const { error } = await supabase
      .from("festival_bc_trolley_items")
      .update(patch as any)
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

                <div className="space-y-4">
                  {tItems.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">No items yet</p>
                  )}
                  {groupKeys.map(gk => (
                    <div key={gk} className="space-y-1.5">
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {conceptName(gk === NO_CONCEPT ? null : gk)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">· {grouped[gk].length}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {grouped[gk].map(i => (
                          <ItemPhotoCard
                            key={i.id}
                            item={i as any}
                            concepts={concepts}
                            conceptName={conceptName}
                            onUpdate={updateItem}
                            onDelete={removeItem}
                          />
                        ))}
                      </div>
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
