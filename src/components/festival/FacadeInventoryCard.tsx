import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ImageOff, ExternalLink, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FACADE_TROLLEY_LABEL = "Façade";
const FACADE_CATEGORIES = ["Vinyl/print", "Signage", "Frames/structure", "Lighting", "Other"];
const NO_CONCEPT = "__none__";

type Item = {
  id: string;
  trolley_id: string;
  item_name: string;
  category: string;
  needed_quantity: number | null;
  placed_quantity: number | null;
  counted_quantity: number | null;
  photo_path: string | null;
  concept_id: string | null;
  notes: string | null;
};

type Concept = { id: string; name: string };

export function FacadeInventoryCard({ festivalId, festivalSlug }: { festivalId: string; festivalSlug: string }) {
  const qc = useQueryClient();
  const [conceptFilter, setConceptFilter] = useState<string>("__all__");

  const { data, isLoading } = useQuery({
    queryKey: ["facade_inventory", festivalId],
    queryFn: async () => {
      const { data: concepts } = await supabase
        .from("festival_concepts")
        .select("id, name")
        .eq("festival_id", festivalId)
        .order("order_index");
      const conceptList = (concepts || []) as Concept[];
      if (conceptList.length === 0) return { concepts: [], trolleys: [], items: [] as Item[] };

      // Find/create one "Façade" trolley per concept
      const { data: existing } = await supabase
        .from("festival_bc_trolleys")
        .select("*")
        .in("concept_id", conceptList.map(c => c.id))
        .ilike("label", FACADE_TROLLEY_LABEL);

      const byConcept = new Map<string, any>((existing || []).map((t: any) => [t.concept_id, t]));
      const toCreate = conceptList.filter(c => !byConcept.has(c.id));
      if (toCreate.length > 0) {
        const rows = toCreate.map((c, i) => ({
          concept_id: c.id,
          label: FACADE_TROLLEY_LABEL,
          trolley_number: 900 + i, // high number to keep separate from BC trolleys
          currency: "DKK",
        }));
        const { data: created } = await supabase.from("festival_bc_trolleys").insert(rows).select("*");
        (created || []).forEach((t: any) => byConcept.set(t.concept_id, t));
      }

      const trolleys = Array.from(byConcept.values());
      const tIds = trolleys.map((t: any) => t.id);
      const { data: items } = tIds.length
        ? await supabase
            .from("festival_bc_trolley_items")
            .select("*")
            .in("trolley_id", tIds)
            .order("order_index")
        : { data: [] };

      return { concepts: conceptList, trolleys, items: (items || []) as Item[] };
    },
  });

  const concepts = data?.concepts || [];
  const trolleys = data?.trolleys || [];
  const items = data?.items || [];

  const trolleyByConcept = useMemo(() => {
    const m = new Map<string, any>();
    trolleys.forEach((t: any) => m.set(t.concept_id, t));
    return m;
  }, [trolleys]);

  const conceptIdByTrolley = useMemo(() => {
    const m = new Map<string, string>();
    trolleys.forEach((t: any) => m.set(t.id, t.concept_id));
    return m;
  }, [trolleys]);

  const filtered = useMemo(() => {
    if (conceptFilter === "__all__") return items;
    return items.filter(it => conceptIdByTrolley.get(it.trolley_id) === conceptFilter);
  }, [items, conceptFilter, conceptIdByTrolley]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    filtered.forEach(it => {
      const cid = conceptIdByTrolley.get(it.trolley_id) || "";
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(it);
    });
    return Array.from(map.entries());
  }, [filtered, conceptIdByTrolley]);

  const photoUrl = (path: string | null) =>
    path ? supabase.storage.from("festival-photos").getPublicUrl(path).data.publicUrl : null;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["facade_inventory", festivalId] });

  const addItem = async (conceptId: string, payload: { name: string; needed: number | null; category: string }) => {
    const trolley = trolleyByConcept.get(conceptId);
    if (!trolley) return;
    const conceptItems = items.filter(i => i.trolley_id === trolley.id);
    const { error } = await supabase.from("festival_bc_trolley_items").insert({
      trolley_id: trolley.id,
      concept_id: conceptId,
      item_name: payload.name,
      category: payload.category,
      needed_quantity: payload.needed,
      order_index: conceptItems.length,
      status: "pending",
    });
    if (error) { toast.error("Failed to add item"); return; }
    invalidate();
  };

  const updateItem = async (id: string, patch: Partial<Item>) => {
    const { error } = await supabase.from("festival_bc_trolley_items").update(patch).eq("id", id);
    if (error) { toast.error("Update failed"); return; }
    invalidate();
  };

  const reassignConcept = async (item: Item, newConceptId: string) => {
    const newTrolley = trolleyByConcept.get(newConceptId);
    if (!newTrolley) return;
    await updateItem(item.id, { trolley_id: newTrolley.id, concept_id: newConceptId });
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("festival_bc_trolley_items").delete().eq("id", id);
    if (error) { toast.error("Delete failed"); return; }
    invalidate();
  };

  const uploadPhoto = async (item: Item, file: File) => {
    const path = `facade/${festivalId}/${item.id}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("festival-photos").upload(path, file, { upsert: true });
    if (upErr) { toast.error("Upload failed"); return; }
    await updateItem(item.id, { photo_path: path });
  };

  if (isLoading) return <Card className="p-6 text-sm text-muted-foreground">Loading façade inventory…</Card>;

  if (concepts.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Add concepts first to track façade inventory per concept.
      </Card>
    );
  }

  const totals = {
    items: items.length,
    missing: items.filter(i => i.needed_quantity == null || i.needed_quantity === 0).length,
    matched: items.filter(i => i.counted_quantity != null && i.needed_quantity != null && i.counted_quantity === i.needed_quantity).length,
  };

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold">Façade inventory</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totals.items} items · {totals.matched} matched · {totals.missing} missing need
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={conceptFilter} onValueChange={setConceptFilter}>
            <SelectTrigger className="h-8 w-[180px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="__all__" className="text-[12px]">All concepts</SelectItem>
              {concepts.map(c => (
                <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm" className="h-8 text-[12px]">
            <Link to={`/festivals/${festivalSlug}/inventory`}>
              Open Inventory <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {(conceptFilter === "__all__" ? concepts : concepts.filter(c => c.id === conceptFilter)).map(concept => {
          const list = items.filter(it => conceptIdByTrolley.get(it.trolley_id) === concept.id);
          return (
            <ConceptBlock
              key={concept.id}
              concept={concept}
              concepts={concepts}
              items={list}
              photoUrl={photoUrl}
              onAdd={(payload) => addItem(concept.id, payload)}
              onUpdate={updateItem}
              onReassign={reassignConcept}
              onDelete={deleteItem}
              onUploadPhoto={uploadPhoto}
            />
          );
        })}
      </div>
    </Card>
  );
}

function ConceptBlock({
  concept, concepts, items, photoUrl, onAdd, onUpdate, onReassign, onDelete, onUploadPhoto,
}: {
  concept: Concept;
  concepts: Concept[];
  items: Item[];
  photoUrl: (p: string | null) => string | null;
  onAdd: (p: { name: string; needed: number | null; category: string }) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Item>) => Promise<void>;
  onReassign: (item: Item, newConceptId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUploadPhoto: (item: Item, file: File) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [needed, setNeeded] = useState("");
  const [category, setCategory] = useState(FACADE_CATEGORIES[0]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await onAdd({
      name: name.trim(),
      needed: needed ? Number(needed) : null,
      category,
    });
    setName(""); setNeeded("");
    setBusy(false);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <h4 className="text-sm font-semibold">{concept.name}</h4>
        <Badge variant="outline" className="text-[10px]">{items.length} items</Badge>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No façade items yet for {concept.name}.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {items.map(it => {
            const url = photoUrl(it.photo_path);
            const need = it.needed_quantity;
            const counted = it.counted_quantity;
            const missing = need == null || need === 0;
            const matched = counted != null && need != null && counted === need;
            const short = counted != null && need != null && counted < need;
            return (
              <Card key={it.id} className={cn(
                "overflow-hidden",
                missing && "border-destructive/40",
                short && "border-amber-500/40",
                matched && "border-emerald-500/40",
              )}>
                <div className="aspect-video bg-muted/40 relative">
                  {url ? (
                    <img src={url} alt={it.item_name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center text-muted-foreground cursor-pointer hover:bg-muted/60">
                      <Upload className="h-5 w-5 mb-1" />
                      <span className="text-[10px]">Add photo</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => e.target.files?.[0] && onUploadPhoto(it, e.target.files[0])} />
                    </label>
                  )}
                  <div className="absolute top-1 right-1">
                    {missing ? (
                      <Badge variant="outline" className="bg-background/95 border-destructive/50 text-destructive text-[9px] px-1.5 py-0">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Need
                      </Badge>
                    ) : matched ? (
                      <Badge variant="outline" className="bg-background/95 border-emerald-500/50 text-emerald-600 text-[9px] px-1.5 py-0">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />OK
                      </Badge>
                    ) : short ? (
                      <Badge variant="outline" className="bg-background/95 border-amber-500/50 text-amber-600 text-[9px] px-1.5 py-0">
                        Short
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="p-2 space-y-1.5">
                  <Input
                    value={it.item_name}
                    onChange={(e) => onUpdate(it.id, { item_name: e.target.value })}
                    className="h-7 text-[12px] font-medium"
                  />
                  <div className="grid grid-cols-3 gap-1">
                    <Input type="number" placeholder="Need" value={it.needed_quantity ?? ""} onChange={(e) => onUpdate(it.id, { needed_quantity: e.target.value ? Number(e.target.value) : null })} className="h-6 text-[10px] px-1.5" />
                    <Input type="number" placeholder="Placed" value={it.placed_quantity ?? ""} onChange={(e) => onUpdate(it.id, { placed_quantity: e.target.value ? Number(e.target.value) : null })} className="h-6 text-[10px] px-1.5" />
                    <Input type="number" placeholder="Done" value={it.counted_quantity ?? ""} onChange={(e) => onUpdate(it.id, { counted_quantity: e.target.value ? Number(e.target.value) : null })} className="h-6 text-[10px] px-1.5" />
                  </div>
                  <div className="flex gap-1">
                    <Select value={it.category || FACADE_CATEGORIES[0]} onValueChange={(v) => onUpdate(it.id, { category: v })}>
                      <SelectTrigger className="h-6 text-[10px] px-1.5 flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        {FACADE_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-[11px]">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-1 items-center">
                    <Select value={concept.id} onValueChange={(v) => v !== concept.id && onReassign(it, v)}>
                      <SelectTrigger className="h-6 text-[10px] px-1.5 flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        {concepts.map(c => <SelectItem key={c.id} value={c.id} className="text-[11px]">{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(it.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add new item */}
      <div className="grid grid-cols-12 gap-1.5 items-center pt-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New façade item…" className="h-7 text-[11px] col-span-5" />
        <Input type="number" value={needed} onChange={(e) => setNeeded(e.target.value)} placeholder="Need" className="h-7 text-[11px] col-span-2" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-7 text-[11px] col-span-3"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover">
            {FACADE_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-[11px]">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 text-[11px] col-span-2" onClick={submit} disabled={busy || !name.trim()}>
          <Plus className="h-3 w-3 mr-1" />Add
        </Button>
      </div>
    </section>
  );
}
