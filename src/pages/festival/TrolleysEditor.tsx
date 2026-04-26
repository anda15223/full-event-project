import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Camera, AlertTriangle, ChevronDown, ChevronRight, Download, Package } from "lucide-react";
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
  placed_quantity: number | null;
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
  const placed = item.placed_quantity;
  const counted = item.counted_quantity;
  const missingNeeded = needed == null || needed === 0;
  const notPlaced = needed != null && needed > 0 && (placed == null || placed < needed);
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
        !missingNeeded && shortAfterCount && "border-amber-500/60 bg-amber-500/5",
        matched && "border-emerald-500/40"
      )}
    >
      <button
        onClick={() => onDelete(item.id)}
        className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
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

      <div className="grid grid-cols-3 gap-1">
        <div>
          <label className="text-[9px] text-muted-foreground uppercase block leading-none mb-0.5">Need</label>
          <Input
            type="number"
            value={needed ?? ""}
            placeholder="0"
            onChange={(e) => onUpdate(item.id, { needed_quantity: e.target.value === "" ? null : Number(e.target.value) })}
            className={cn("h-6 text-[11px] px-1", missingNeeded && "border-destructive text-destructive")}
          />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground uppercase block leading-none mb-0.5">Placed</label>
          <Input
            type="number"
            value={placed ?? ""}
            placeholder="–"
            onChange={(e) => onUpdate(item.id, { placed_quantity: e.target.value === "" ? null : Number(e.target.value) })}
            className={cn("h-6 text-[11px] px-1", notPlaced && "border-amber-500 text-amber-600")}
          />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground uppercase block leading-none mb-0.5">Done</label>
          <Input
            type="number"
            value={counted ?? ""}
            placeholder="–"
            onChange={(e) => onUpdate(item.id, { counted_quantity: e.target.value === "" ? null : Number(e.target.value) })}
            className={cn(
              "h-6 text-[11px] px-1",
              shortAfterCount && "border-amber-500 text-amber-600",
              matched && "border-emerald-500 text-emerald-600"
            )}
          />
        </div>
      </div>

      {(missingNeeded || shortAfterCount || notPlaced) && (
        <div className={cn(
          "flex items-center gap-1 text-[10px] font-medium",
          missingNeeded ? "text-destructive" : "text-amber-600"
        )}>
          <AlertTriangle className="h-2.5 w-2.5" />
          {missingNeeded
            ? "Need missing"
            : shortAfterCount
              ? `Short by ${(needed ?? 0) - (counted ?? 0)}`
              : `Not placed (${(needed ?? 0) - (placed ?? 0)} left)`}
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

function AddItemCard({
  trolleyId,
  defaultConceptId,
  defaultCategory,
  concepts,
  onAdd,
}: {
  trolleyId: string;
  defaultConceptId: string | null;
  defaultCategory: string;
  concepts: { id: string; name: string }[];
  onAdd: (data: { name: string; needed: number | null; placed: number | null; counted: number | null; conceptId: string | null; category: string; photoFile: File | null }) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [needed, setNeeded] = useState<string>("");
  const [placed, setPlaced] = useState<string>("");
  const [counted, setCounted] = useState<string>("");
  const [conceptId, setConceptId] = useState<string>(defaultConceptId ?? "__none__");
  const [category, setCategory] = useState<string>(defaultCategory);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const photoPreview = photoFile ? URL.createObjectURL(photoFile) : null;

  const submit = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSubmitting(true);
    await onAdd({
      name: name.trim(),
      needed: needed === "" ? null : Number(needed),
      placed: placed === "" ? null : Number(placed),
      counted: counted === "" ? null : Number(counted),
      conceptId: conceptId === "__none__" ? null : conceptId,
      category,
      photoFile,
    });
    setName(""); setNeeded(""); setPlaced(""); setCounted(""); setPhotoFile(null);
    setSubmitting(false);
  };

  return (
    <Card className="p-2 space-y-1.5 border-dashed border-primary/40 bg-primary/[0.02]">
      <div
        onClick={() => fileRef.current?.click()}
        className="aspect-square w-full rounded bg-muted/40 border border-dashed border-border/50 overflow-hidden cursor-pointer flex items-center justify-center"
      >
        {photoPreview ? (
          <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <Camera className="h-5 w-5 text-muted-foreground" />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setPhotoFile(e.target.files[0])}
        />
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New item" className="h-6 text-[11px] font-medium px-1.5" />
      <div className="grid grid-cols-3 gap-1">
        <div>
          <label className="text-[9px] text-muted-foreground uppercase block leading-none mb-0.5">Need</label>
          <Input type="number" value={needed} onChange={(e) => setNeeded(e.target.value)} placeholder="0" className="h-6 text-[11px] px-1" />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground uppercase block leading-none mb-0.5">Placed</label>
          <Input type="number" value={placed} onChange={(e) => setPlaced(e.target.value)} placeholder="–" className="h-6 text-[11px] px-1" />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground uppercase block leading-none mb-0.5">Done</label>
          <Input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="–" className="h-6 text-[11px] px-1" />
        </div>
      </div>
      <Select value={conceptId} onValueChange={setConceptId}>
        <SelectTrigger className="h-6 text-[10px] px-1.5"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="__none__" className="text-[11px]">Unassigned</SelectItem>
          {concepts.map(c => <SelectItem key={c.id} value={c.id} className="text-[11px]">{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="h-6 text-[10px] px-1.5"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-popover">
          {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-[11px]">{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="w-full h-7 text-[11px]" onClick={submit} disabled={submitting}>
        <Plus className="h-3 w-3 mr-1" /> Add to trolley
      </Button>
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
  const [collapsedBrain, setCollapsedBrain] = useState<Record<string, boolean>>({});
  const [collapsedChecklist, setCollapsedChecklist] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState<Record<string, boolean>>({});

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const { trolleys = [], items = [], concepts = [] } = trolleysQ.data || {};

  const conceptName = (cid: string | null | undefined) =>
    concepts.find(c => c.id === cid)?.name || "Unassigned";

  const importFromBrain = async (trolley: any) => {
    setImporting(prev => ({ ...prev, [trolley.id]: true }));
    try {
      const cardKey = `trolley_${trolley.id}`;
      const { data: card } = await (supabase as any)
        .from("smart_cards")
        .select("id")
        .eq("festival_id", festival.id)
        .eq("card_key", cardKey)
        .maybeSingle();
      if (!card) { toast.error("No Upload & Brain card found yet"); return; }
      const { data: sections } = await (supabase as any)
        .from("smart_sections").select("id, title").eq("card_id", card.id);
      const secIds = (sections || []).map((s: any) => s.id);
      if (secIds.length === 0) { toast.error("Brain panel is empty"); return; }
      const { data: lines } = await (supabase as any)
        .from("smart_lines").select("label, quantity, notes, section_id").in("section_id", secIds);
      if (!lines || lines.length === 0) { toast.error("No lines in Brain panel"); return; }

      const existingNames = new Set(
        items.filter(i => i.trolley_id === trolley.id).map(i => (i.item_name || "").trim().toLowerCase())
      );
      const baseOrder = items.filter(i => i.trolley_id === trolley.id).length;
      const rows = lines
        .filter((l: any) => l.label && !existingNames.has(l.label.trim().toLowerCase()))
        .map((l: any, idx: number) => {
          const qStr = (l.quantity ?? "").toString().trim();
          const qNum = qStr ? Number(qStr.replace(/[^\d.]/g, "")) : null;
          return {
            trolley_id: trolley.id,
            category: CATEGORIES[0],
            item_name: l.label.trim(),
            quantity: qStr || null,
            needed_quantity: Number.isFinite(qNum as number) ? qNum : null,
            placed_quantity: null,
            counted_quantity: null,
            order_index: baseOrder + idx,
            concept_id: trolley.concept_id,
            photo_path: null,
          };
        });
      if (rows.length === 0) { toast.info("All Brain items already in inventory"); return; }
      const { error } = await (supabase as any).from("festival_bc_trolley_items").insert(rows);
      if (error) { toast.error("Import failed"); return; }
      toast.success(`Imported ${rows.length} items to inventory`);
      qc.invalidateQueries({ queryKey: ["festival_trolleys", festival.id] });
    } finally {
      setImporting(prev => ({ ...prev, [trolley.id]: false }));
    }
  };

  const addItemFromCard = async (
    trolleyId: string,
    data: { name: string; needed: number | null; placed: number | null; counted: number | null; conceptId: string | null; category: string; photoFile: File | null }
  ) => {
    const existing = items.filter(i => i.trolley_id === trolleyId);
    const orderIndex = existing.length;
    let photo_path: string | null = null;
    if (data.photoFile) {
      const path = `trolley-items/${trolleyId}-${Date.now()}-${data.photoFile.name}`;
      const { error: upErr } = await supabase.storage.from("festival-photos").upload(path, data.photoFile, { upsert: true });
      if (upErr) { toast.error("Photo upload failed"); }
      else photo_path = path;
    }
    const { error } = await supabase.from("festival_bc_trolley_items").insert({
      trolley_id: trolleyId,
      category: data.category,
      item_name: data.name,
      quantity: data.needed != null ? String(data.needed) : null,
      needed_quantity: data.needed,
      placed_quantity: data.placed,
      counted_quantity: data.counted,
      order_index: orderIndex,
      concept_id: data.conceptId,
      photo_path,
    } as any);
    if (error) { toast.error("Failed to add"); return; }
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">BC Trolley Checklists</h1>
          <p className="text-sm text-muted-foreground mt-1">{trolleys.length} trolleys · {items.length} items</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/festivals/${slug}/inventory`}>
            <Package className="h-4 w-4 mr-1.5 text-destructive" />
            <span className="text-destructive font-semibold">Inventory</span>
          </Link>
        </Button>
      </div>

      <div className="space-y-8">
        {trolleys.map(t => {
          const tItems = items.filter(i => i.trolley_id === t.id);
          

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
              {/* Upload + Brain panel — collapsible. "Import to inventory" creates one box per row */}
              <Card className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setCollapsedBrain(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                    className="flex items-center gap-1.5 text-[12px] font-medium hover:text-primary transition"
                  >
                    {collapsedBrain[t.id] ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {conceptName(t.concept_id)} · Trolley #{t.trolley_number} — Upload & Brain
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => importFromBrain(t)}
                    disabled={importing[t.id]}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    {importing[t.id] ? "Importing…" : "Import to inventory"}
                  </Button>
                </div>
                {!collapsedBrain[t.id] && (
                  <SmartCard
                    cardKey={`trolley_${t.id}`}
                    festivalId={festival.id}
                    conceptId={t.concept_id}
                    title={`${conceptName(t.concept_id)} · Trolley #${t.trolley_number} — Upload & Brain`}
                    subtitle="Upload packing lists or photos, or grab from Brain. Use the per-row Allocate + Inventory dropdowns to organize each item."
                    siblingConcepts={concepts.map(c => ({ id: c.id, name: c.name }))}
                    inventoryCategories={CATEGORIES}
                  />
                )}
              </Card>
              {/* Official trolley checklist (writes to festival_bc_trolley_items) */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-[13px]">{conceptName(t.concept_id)} — Official checklist</h3>
                    <p className="text-[11px] text-muted-foreground">Trolley #{t.trolley_number} · {t.label}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => importFromBrain(t)}
                      disabled={importing[t.id]}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {importing[t.id] ? "Importing…" : "Import from Brain"}
                    </Button>
                    <Badge variant="outline" className="text-[10px]">{tItems.length} items</Badge>
                  </div>
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

                <div className="border-t border-border/30 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Add new item</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    <AddItemCard
                      trolleyId={t.id}
                      defaultConceptId={t.concept_id}
                      defaultCategory={CATEGORIES[0]}
                      concepts={concepts}
                      onAdd={(data) => addItemFromCard(t.id, data)}
                    />
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
