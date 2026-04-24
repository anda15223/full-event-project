import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Image as ImageIcon, Plus, QrCode, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTrolleys } from "@/hooks/useFestival";
import { CardUploadZone, MissingFlag } from "./shared";

const CATEGORIES = ["Cleaning products", "Small tools", "Utensils", "Other"] as const;
type Category = (typeof CATEGORIES)[number];
type Filter = "All" | Category;

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "packed_out", label: "Packed out" },
  { value: "returned", label: "Returned" },
];

interface Props {
  festivalId: string;
}

export default function TrolleyCard({ festivalId }: Props) {
  const qc = useQueryClient();
  const trolleysQ = useTrolleys(festivalId);
  const { trolleys = [], items = [], concepts = [] } = trolleysQ.data || {};

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["festival_trolleys", festivalId] });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {concepts.map((c) => {
          const trolley = trolleys.find((t) => t.concept_id === c.id);
          return (
            <ConceptTrolley
              key={c.id}
              festivalId={festivalId}
              conceptId={c.id}
              conceptName={c.name}
              trolley={trolley}
              items={items.filter((i) => trolley && i.trolley_id === trolley.id)}
              onChange={invalidate}
            />
          );
        })}
        {concepts.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground col-span-full">
            Add concepts first to create trolleys.
          </Card>
        )}
      </div>

      <CardUploadZone
        festivalId={festivalId}
        cardName="trolley"
        title="Trolley documents"
        subtitle="Excel checklists, batch photos, packing lists."
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface ConceptTrolleyProps {
  festivalId: string;
  conceptId: string;
  conceptName: string;
  trolley: any | undefined;
  items: any[];
  onChange: () => void;
}

function ConceptTrolley({
  festivalId,
  conceptId,
  conceptName,
  trolley,
  items,
  onChange,
}: ConceptTrolleyProps) {
  const [filter, setFilter] = useState<Filter>("All");
  const [draft, setDraft] = useState({ name: "", qty: "", cat: CATEGORIES[0] as Category });
  const [costDraft, setCostDraft] = useState<string>("");

  const filtered = useMemo(
    () => (filter === "All" ? items : items.filter((i) => i.category === filter)),
    [items, filter],
  );

  const ensureTrolley = async () => {
    if (trolley) return trolley;
    const { data, error } = await supabase
      .from("festival_bc_trolleys")
      .insert({
        concept_id: conceptId,
        trolley_number: 1,
        label: `${conceptName} trolley`,
      })
      .select()
      .single();
    if (error) {
      toast.error("Could not create trolley");
      throw error;
    }
    onChange();
    return data;
  };

  const saveCost = async () => {
    const t = await ensureTrolley();
    const value = costDraft.trim() === "" ? null : Number(costDraft);
    if (value !== null && Number.isNaN(value)) {
      toast.error("Cost must be a number");
      return;
    }
    const { error } = await supabase
      .from("festival_bc_trolleys")
      .update({ cost: value })
      .eq("id", t.id);
    if (error) {
      toast.error("Could not save cost");
      return;
    }
    if (value !== null) {
      // Sync cost_table (single row per trolley).
      const description = `Trolley: ${conceptName}`;
      const { data: existing } = await supabase
        .from("cost_table")
        .select("id")
        .eq("festival_id", festivalId)
        .eq("card_origin", "trolley")
        .eq("description", description)
        .maybeSingle();
      if (existing?.id) {
        await supabase
          .from("cost_table")
          .update({ amount: value, currency: t.currency || "DKK" })
          .eq("id", existing.id);
      } else {
        await supabase.from("cost_table").insert({
          festival_id: festivalId,
          card_origin: "trolley",
          description,
          amount: value,
          currency: t.currency || "DKK",
        });
      }
    }
    toast.success("Trolley cost saved");
    setCostDraft("");
    onChange();
  };

  const addItem = async () => {
    if (!draft.name.trim()) {
      toast.error("Item name required");
      return;
    }
    const t = await ensureTrolley();
    const orderIndex = items.length;
    const { error } = await supabase.from("festival_bc_trolley_items").insert({
      trolley_id: t.id,
      category: draft.cat,
      item_name: draft.name.trim(),
      quantity: draft.qty || null,
      order_index: orderIndex,
      status: "pending",
    });
    if (error) {
      toast.error("Failed to add item");
      return;
    }
    setDraft({ name: "", qty: "", cat: draft.cat });
    onChange();
  };

  const cost = trolley?.cost ?? null;
  const missingCost = cost === null || cost === undefined;

  return (
    <Card className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm">{conceptName}</h3>
          <p className="text-[11px] text-muted-foreground">
            {items.length} items · {items.filter((i) => i.status === "packed_out").length} packed
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled
          className="h-7 px-2 text-[11px] gap-1"
          title="QR inventory system coming soon — will enable scan-out / scan-in tracking"
        >
          <QrCode className="h-3.5 w-3.5" />
          QR (soon)
        </Button>
      </div>

      {/* Cost row */}
      <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
        <span className="text-[11px] text-muted-foreground w-16">Cost</span>
        <Input
          type="number"
          inputMode="decimal"
          placeholder={cost !== null ? String(cost) : "0.00"}
          value={costDraft}
          onChange={(e) => setCostDraft(e.target.value)}
          className="h-7 text-[12px] flex-1"
        />
        <span className="text-[11px] text-muted-foreground">{trolley?.currency || "DKK"}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={saveCost}>
          Save
        </Button>
        {missingCost && (
          <MissingFlag
            isMissing
            label={`Trolley cost: ${conceptName}`}
            festivalId={festivalId}
            cardOrigin="trolley"
            defaultPriority="high"
          />
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1">
        {(["All", ...CATEGORIES] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10.5px] px-2 py-0.5 rounded-full border transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border/60 hover:bg-muted"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="space-y-1">
        {filtered.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic px-1">No items in this view.</p>
        )}
        {filtered.map((item) => (
          <ItemRow key={item.id} item={item} onChange={onChange} />
        ))}
      </div>

      {/* Add item */}
      <div className="grid grid-cols-12 gap-1.5 border-t border-border/30 pt-3">
        <Select
          value={draft.cat}
          onValueChange={(v) => setDraft((s) => ({ ...s, cat: v as Category }))}
        >
          <SelectTrigger className="col-span-4 h-8 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="text-[12px]">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Item"
          value={draft.name}
          onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
          className="col-span-5 h-8 text-[12px]"
        />
        <Input
          placeholder="Qty"
          value={draft.qty}
          onChange={(e) => setDraft((s) => ({ ...s, qty: e.target.value }))}
          className="col-span-2 h-8 text-[12px]"
        />
        <Button size="sm" variant="outline" className="col-span-1 h-8 px-0" onClick={addItem}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function ItemRow({ item, onChange }: { item: any; onChange: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "");
  const [showNotes, setShowNotes] = useState(false);

  const photoUrl = item.photo_path
    ? supabase.storage.from("festival-photos").getPublicUrl(item.photo_path).data.publicUrl
    : null;

  const remove = async () => {
    const { error } = await supabase
      .from("festival_bc_trolley_items")
      .delete()
      .eq("id", item.id);
    if (error) {
      toast.error("Delete failed");
      return;
    }
    onChange();
  };

  const setStatus = async (status: string) => {
    const { error } = await supabase
      .from("festival_bc_trolley_items")
      .update({ status })
      .eq("id", item.id);
    if (error) {
      toast.error("Update failed");
      return;
    }
    onChange();
  };

  const saveNotes = async () => {
    const { error } = await supabase
      .from("festival_bc_trolley_items")
      .update({ notes: notesDraft })
      .eq("id", item.id);
    if (error) {
      toast.error("Save failed");
      return;
    }
    setShowNotes(false);
    onChange();
  };

  const onPickPhoto = () => fileRef.current?.click();

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `trolleys/${item.trolley_id}/${item.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("festival-photos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase
        .from("festival_bc_trolley_items")
        .update({ photo_path: path })
        .eq("id", item.id);
      if (dbErr) throw dbErr;
      toast.success("Photo uploaded");
      onChange();
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message ?? e}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-md border border-border/40 bg-background/60 px-2 py-1.5 space-y-1.5">
      <div className="flex items-center gap-2">
        {/* Photo thumbnail / placeholder */}
        <button
          onClick={onPickPhoto}
          className="h-9 w-9 rounded border border-border/60 bg-muted/40 flex items-center justify-center overflow-hidden shrink-0 hover:bg-muted"
          title={photoUrl ? "Replace photo" : "Add photo"}
        >
          {photoUrl ? (
            <img src={photoUrl} alt={item.item_name} className="h-full w-full object-cover" />
          ) : uploading ? (
            <Camera className="h-3.5 w-3.5 animate-pulse text-muted-foreground" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhoto(f);
            e.target.value = "";
          }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="truncate">{item.item_name}</span>
            {item.quantity && (
              <span className="text-muted-foreground text-[11px]">× {item.quantity}</span>
            )}
            <Badge variant="outline" className="text-[9.5px] py-0 px-1.5">
              {item.category}
            </Badge>
          </div>
          {(item.notes || showNotes) && (
            <p
              className="text-[10.5px] text-muted-foreground truncate cursor-pointer"
              onClick={() => setShowNotes(true)}
            >
              {item.notes || "Add notes…"}
            </p>
          )}
        </div>

        <Select value={item.status || "pending"} onValueChange={setStatus}>
          <SelectTrigger className="h-7 w-[110px] text-[10.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-[11px]">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!showNotes && !item.notes && (
          <button
            onClick={() => setShowNotes(true)}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1"
            title="Add notes"
          >
            +note
          </button>
        )}

        <button
          onClick={remove}
          className="text-muted-foreground hover:text-destructive p-1"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {showNotes && (
        <div className="flex items-center gap-1.5">
          <Input
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Notes…"
            className="h-7 text-[11px]"
          />
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={saveNotes}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              setShowNotes(false);
              setNotesDraft(item.notes ?? "");
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-unused-vars */
const _unused = Upload; // reserved for future batch upload trigger
