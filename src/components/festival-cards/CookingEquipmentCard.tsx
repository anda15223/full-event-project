import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BySourceDropdown,
  CardUploadZone,
  MissingFlag,
  type BySource,
} from "@/components/festival-cards/shared";
import { ChefHat, Loader2, Plus, Trash2, FileSpreadsheet, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface Props {
  festivalId: string;
}

const CARD_ORIGIN = "cooking_equipment";
const CATEGORY = "Cooking Equipment";
// `notes` is used elsewhere as a discriminator; we encode `category|notes` so
// equipment_db rows clearly belong to the Cooking Equipment card.
const NOTES_PREFIX = `${CATEGORY}|`;

const CATEGORY_OPTIONS = [
  "Cooking Equipment",
  "Prep Equipment",
  "Serving Equipment",
  "Cleaning",
  "Other",
];

function packNotes(category: string, notes: string) {
  return `${category}|${notes ?? ""}`;
}
function unpackNotes(raw: string | null) {
  if (!raw) return { category: CATEGORY, notes: "" };
  const idx = raw.indexOf("|");
  if (idx === -1) return { category: CATEGORY, notes: raw };
  return { category: raw.slice(0, idx) || CATEGORY, notes: raw.slice(idx + 1) };
}

/* ---------------- Concept sub-card ---------------- */

function ConceptCookingCard({
  festivalId,
  conceptId,
  conceptName,
}: {
  festivalId: string;
  conceptId: string;
  conceptName: string;
}) {
  const qc = useQueryClient();
  const cardOrigin = `${CARD_ORIGIN}:${conceptName}`;
  const [busy, setBusy] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["cooking_equipment_items", festivalId, conceptName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_db")
        .select("*")
        .eq("festival_id", festivalId)
        .eq("card_origin", cardOrigin)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["cooking_equipment_items", festivalId, conceptName] });

  const addItem = useMutation({
    mutationFn: async (input: {
      item_name: string;
      quantity?: string;
      category?: string;
      notes?: string;
      source?: BySource;
    }) => {
      const { error } = await supabase.from("equipment_db").insert({
        festival_id: festivalId,
        card_origin: cardOrigin,
        item_name: input.item_name?.trim() || "Unnamed item",
        quantity: input.quantity ?? null,
        notes: packNotes(input.category ?? CATEGORY, input.notes ?? ""),
        source: input.source ?? "by_us",
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Could not add item"),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("equipment_db").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("equipment_db").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  /* -------- Excel upload -------- */
  const handleExcel = async (file: File) => {
    setBusy("excel");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

      let added = 0;
      for (const row of rows) {
        const keys = Object.keys(row);
        const findKey = (...needles: string[]) =>
          keys.find((k) => needles.some((n) => k.toLowerCase().includes(n)));
        const nameKey = findKey("item", "name", "equipment");
        const qtyKey = findKey("qty", "quantity", "amount");
        const noteKey = findKey("note", "comment", "desc");
        const item_name = String(row[nameKey ?? keys[0]] ?? "").trim();
        if (!item_name) continue;
        const quantity = qtyKey ? String(row[qtyKey] ?? "").trim() : "";
        const notes = noteKey ? String(row[noteKey] ?? "").trim() : "";
        await addItem.mutateAsync({ item_name, quantity, notes, category: CATEGORY });
        added++;
      }
      toast.success(`Imported ${added} item${added === 1 ? "" : "s"} from Excel`);
    } catch (e: any) {
      toast.error(`Excel parse failed: ${e.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  /* -------- Picture upload (preview + storage) -------- */
  const { data: pictures = [] } = useQuery({
    queryKey: ["cooking_equipment_pics", festivalId, conceptName],
    queryFn: async () => {
      const prefix = `cooking_equipment/${festivalId}/${conceptName}`;
      const { data, error } = await supabase.storage.from("festival-photos").list(prefix, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error) return [];
      return (data ?? []).map((f) => {
        const path = `${prefix}/${f.name}`;
        const { data: pub } = supabase.storage.from("festival-photos").getPublicUrl(path);
        return { name: f.name, path, url: pub.publicUrl };
      });
    },
  });

  const handlePicture = async (file: File) => {
    setBusy("picture");
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const path = `cooking_equipment/${festivalId}/${conceptName}/${safeName}`;
      const { error } = await supabase.storage
        .from("festival-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      toast.success("Picture uploaded");
      qc.invalidateQueries({ queryKey: ["cooking_equipment_pics", festivalId, conceptName] });
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  /* -------- PDF upload → Claude extraction -------- */
  const handlePdf = async (file: File) => {
    setBusy("pdf");
    try {
      // Upload to documents bucket first
      const path = `cooking_equipment/${festivalId}/${conceptName}/${Date.now()}-${file.name}`;
      const upload = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;

      // Convert to base64 for Claude
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

      const { data, error } = await supabase.functions.invoke("smart-card-extract", {
        body: {
          mode: "equipment_list",
          context: `Cooking equipment for concept "${conceptName}"`,
          file: { name: file.name, mime_type: file.type, base64: b64 },
        },
      });
      if (error) throw error;

      const list: Array<{ item_name: string; quantity?: string; notes?: string }> =
        (data?.items ?? data?.equipment ?? data?.lines ?? []) as any[];

      let added = 0;
      for (const it of list) {
        const name = String(it.item_name ?? "").trim();
        if (!name) continue;
        await addItem.mutateAsync({
          item_name: name,
          quantity: it.quantity ?? "",
          notes: it.notes ?? "",
          category: CATEGORY,
        });
        added++;
      }
      toast.success(`Extracted ${added} item${added === 1 ? "" : "s"} from PDF`);
    } catch (e: any) {
      toast.error(`PDF extraction failed: ${e.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const missingCount = useMemo(
    () => items.filter((it: any) => !it.item_name?.trim() || !it.quantity?.trim()).length,
    [items],
  );

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-primary" />
            {conceptName}
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"}
            {missingCount > 0 && (
              <span className="ml-2 text-destructive">· {missingCount} missing</span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Upload buttons */}
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleExcel(e.target.files[0])}
            />
            <Button asChild size="sm" variant="outline" disabled={!!busy}>
              <span>
                {busy === "excel" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                )}
                Excel
              </span>
            </Button>
          </label>

          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handlePicture(e.target.files[0])}
            />
            <Button asChild size="sm" variant="outline" disabled={!!busy}>
              <span>
                {busy === "picture" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                )}
                Picture
              </span>
            </Button>
          </label>

          <label className="cursor-pointer">
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handlePdf(e.target.files[0])}
            />
            <Button asChild size="sm" variant="outline" disabled={!!busy}>
              <span>
                {busy === "pdf" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                )}
                PDF (AI extract)
              </span>
            </Button>
          </label>

          <Button
            size="sm"
            variant="secondary"
            disabled={!!busy}
            onClick={() =>
              addItem.mutate({ item_name: "", quantity: "", category: CATEGORY })
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add line
          </Button>
        </div>

        {/* Picture previews */}
        {pictures.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {pictures.map((p) => (
              <a key={p.path} href={p.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={p.url}
                  alt={p.name}
                  className="aspect-square w-full rounded-md border border-border object-cover hover:opacity-80"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}

        {/* Items table */}
        <div className="rounded-md border border-border">
          <div className="grid grid-cols-12 gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-3">Item</div>
            <div className="col-span-1">Qty</div>
            <div className="col-span-3">Notes</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Source</div>
            <div className="col-span-1 text-right">·</div>
          </div>

          {isLoading ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No items yet. Upload a file or add a line above.
            </div>
          ) : (
            items.map((it: any) => {
              const { category, notes } = unpackNotes(it.notes);
              const isMissing = !it.item_name?.trim() || !it.quantity?.trim();
              return (
                <div
                  key={it.id}
                  className="grid grid-cols-12 gap-2 border-b border-border/60 px-3 py-2 text-xs last:border-b-0"
                >
                  <div className="col-span-3">
                    <Input
                      defaultValue={it.item_name ?? ""}
                      placeholder="Item name"
                      className={`h-8 text-xs ${!it.item_name?.trim() ? "border-destructive" : ""}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (it.item_name ?? "")) {
                          updateItem.mutate({ id: it.id, patch: { item_name: v || "Unnamed item" } });
                        }
                      }}
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      defaultValue={it.quantity ?? ""}
                      placeholder="1"
                      className={`h-8 text-xs ${!it.quantity?.trim() ? "border-destructive" : ""}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (it.quantity ?? "")) {
                          updateItem.mutate({ id: it.id, patch: { quantity: v || null } });
                        }
                      }}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      defaultValue={notes}
                      placeholder="Notes"
                      className="h-8 text-xs"
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== notes) {
                          updateItem.mutate({
                            id: it.id,
                            patch: { notes: packNotes(category, v) },
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      value={category}
                      onValueChange={(v) =>
                        updateItem.mutate({
                          id: it.id,
                          patch: { notes: packNotes(v, notes) },
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <BySourceDropdown
                      value={(it.source as BySource) ?? "by_us"}
                      onChange={() => invalidate()}
                      festivalId={festivalId}
                      itemName={it.item_name ?? "Unnamed item"}
                      cardOrigin={cardOrigin}
                      quantity={it.quantity ?? undefined}
                      className="h-8 w-full text-xs"
                    />
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    {isMissing && (
                      <MissingFlag
                        isMissing
                        label={it.item_name?.trim() || "Cooking item"}
                        festivalId={festivalId}
                        cardOrigin={cardOrigin}
                      />
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteItem.mutate(it.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Generic upload zone (PDF/Word/Excel/images saved to SmartCard storage) */}
        <CardUploadZone
          festivalId={festivalId}
          cardName={`cooking_equipment:${conceptName}`}
          title="Cooking equipment documents"
          subtitle="Drop spec sheets, supplier lists, or photos."
        />
      </CardContent>
    </Card>
  );
}

/* ---------------- Top-level card ---------------- */

export function CookingEquipmentCard({ festivalId }: Props) {
  const qc = useQueryClient();

  const { data: concepts = [], isLoading } = useQuery({
    queryKey: ["festival_concepts_for_cooking", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_concepts")
        .select("id, name")
        .eq("festival_id", festivalId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const seedConcepts = useMutation({
    mutationFn: async () => {
      const defaults = [
        "Fish & Chips / The Fish Project",
        "Gyros by Gaia",
        "La Creperie",
        "Chicks 'n' Buns",
      ];
      const rows = defaults.map((name, i) => ({
        festival_id: festivalId,
        name,
        zone: "Main",
        order_index: i,
      }));
      const { error } = await supabase.from("festival_concepts").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["festival_concepts_for_cooking", festivalId] });
      toast.success("Default concepts created");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not seed concepts"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading concepts…
      </div>
    );
  }

  if (concepts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-muted-foreground">No concepts found for this festival.</p>
          <Button size="sm" onClick={() => seedConcepts.mutate()} disabled={seedConcepts.isPending}>
            {seedConcepts.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Create default concepts
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {concepts.map((c) => (
        <ConceptCookingCard
          key={c.id}
          festivalId={festivalId}
          conceptId={c.id}
          conceptName={c.name}
        />
      ))}
    </div>
  );
}

export default CookingEquipmentCard;
