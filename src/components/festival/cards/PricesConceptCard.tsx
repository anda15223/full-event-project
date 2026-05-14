import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Upload, FileText, Download, Loader2, Trash2, Plus, Pencil, Sparkles,
  Leaf, Sprout, WheatOff, ArrowUp, ArrowDown, ChevronDown, ChevronUp,
} from "lucide-react";
import { computePricesStatus, PRICES_STATUS_PILL } from "@/lib/pricesStatus";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";

const sb = supabase as any;
const BUCKET = "festival-prices-docs";
const CURRENCIES = ["DKK", "EUR", "SEK", "NOK"];
const CATEGORIES = ["main", "side", "drink", "dessert", "extra"];

export interface PriceRow {
  id: string;
  festival_id: string;
  concept_id: string;
  currency: string;
  source_pdf_path: string | null;
  source_pdf_uploaded_at: string | null;
  last_parsed_at: string | null;
  parse_summary: string | null;
  notes: string | null;
}

export interface PriceItemRow {
  id: string;
  concept_prices_id: string;
  product_name: string;
  price: number;
  category: string | null;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  display_order: number;
  notes: string | null;
}

interface Props {
  festivalId: string;
  festivalSlug: string;
  conceptId: string;
  conceptSlug: ConceptSlug | string;
  conceptName: string;
  prices: PriceRow | null;
  items: PriceItemRow[];
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function PricesConceptCard({
  festivalId, festivalSlug, conceptId, conceptSlug, conceptName, prices, items,
}: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItems, setPreviewItems] = useState<{ product_name: string; price: number; notes: string | null; checked: boolean }[]>([]);
  const [previewCurrency, setPreviewCurrency] = useState<string>("DKK");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const currency = prices?.currency ?? "DKK";
  const status = computePricesStatus({
    itemCount: items.length,
    source_pdf_path: prices?.source_pdf_path ?? null,
  });

  const stats = useMemo(() => {
    if (items.length === 0) return { avg: null, hi: null, lo: null };
    const ps = items.map((i) => Number(i.price) || 0);
    return {
      avg: ps.reduce((s, n) => s + n, 0) / ps.length,
      hi: Math.max(...ps),
      lo: Math.min(...ps),
    };
  }, [items]);

  const hasVeg = items.some((i) => i.is_vegetarian || i.is_vegan);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["prices-page", festivalSlug] });
  };

  const ensurePricesRow = async (): Promise<string> => {
    if (prices?.id) return prices.id;
    const { data, error } = await sb.from("festival_concept_prices")
      .insert({ festival_id: festivalId, concept_id: conceptId, currency: "DKK" })
      .select("id").single();
    if (error) throw error;
    return data.id as string;
  };

  const updatePrices = useMutation({
    mutationFn: async (patch: Partial<PriceRow>) => {
      const id = await ensurePricesRow();
      const { error } = await sb.from("festival_concept_prices").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const addItem = useMutation({
    mutationFn: async () => {
      const id = await ensurePricesRow();
      const { error } = await sb.from("festival_concept_price_item").insert({
        concept_prices_id: id,
        product_name: "",
        price: 0,
        display_order: items.length,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PriceItemRow> }) => {
      const { error } = await sb.from("festival_concept_price_item").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("festival_concept_price_item").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const moveItem = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const idx = items.findIndex((i) => i.id === id);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
      const a = items[idx], b = items[swapIdx];
      await sb.from("festival_concept_price_item").update({ display_order: b.display_order }).eq("id", a.id);
      await sb.from("festival_concept_price_item").update({ display_order: a.display_order }).eq("id", b.id);
    },
    onSuccess: invalidate,
  });

  const deleteUpload = useMutation({
    mutationFn: async () => {
      if (!prices?.id) return;
      if (prices.source_pdf_path) {
        await supabase.storage.from(BUCKET).remove([prices.source_pdf_path]);
      }
      const { error: delErr } = await sb.from("festival_concept_price_item")
        .delete().eq("concept_prices_id", prices.id);
      if (delErr) throw delErr;
      const { error: updErr } = await sb.from("festival_concept_prices").update({
        source_pdf_path: null,
        source_pdf_uploaded_at: null,
        last_parsed_at: null,
        parse_summary: null,
      }).eq("id", prices.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => { toast.success("Uploaded file and parsed prices removed"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const id = await ensurePricesRow();
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${festivalId}/${conceptSlug}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;
      await sb.from("festival_concept_prices").update({
        source_pdf_path: path,
        source_pdf_uploaded_at: new Date().toISOString(),
      }).eq("id", id);
      invalidate();
      toast.message("Parsing prices…");

      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
      if (!signed?.signedUrl) throw new Error("Could not sign URL");
      const { data: parsed, error: pErr } = await supabase.functions.invoke("parse-document", {
        body: { fileUrl: signed.signedUrl, documentType: "prices" },
      });
      if (pErr) throw pErr;
      const p = parsed?.parsed as any;
      if (!p || !Array.isArray(p.items) || p.items.length === 0) {
        toast.message("Uploaded — AI found no items");
        return;
      }
      setPreviewCurrency((p.currency as string) || currency || "DKK");
      setPreviewItems(p.items.map((it: any) => ({
        product_name: String(it.product_name ?? "").trim(),
        price: Number(it.price) || 0,
        notes: it.notes ?? null,
        checked: true,
      })).filter((it: any) => it.product_name));
      setPreviewOpen(true);
      // store summary
      await sb.from("festival_concept_prices").update({
        last_parsed_at: new Date().toISOString(),
        parse_summary: `Parsed ${p.items.length} items`,
        currency: (p.currency as string) || currency || "DKK",
      }).eq("id", id);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const insertParsed = useMutation({
    mutationFn: async () => {
      const id = await ensurePricesRow();
      const chosen = previewItems.filter((p) => p.checked);
      if (chosen.length === 0) return 0;
      const baseOrder = items.length;
      const inserts = chosen.map((it, i) => ({
        concept_prices_id: id,
        product_name: it.product_name,
        price: it.price,
        notes: it.notes,
        display_order: baseOrder + i,
      }));
      const { error } = await sb.from("festival_concept_price_item").insert(inserts);
      if (error) throw error;
      return chosen.length;
    },
    onSuccess: (n) => {
      toast.success(`Added ${n} price item${n === 1 ? "" : "s"}`);
      setPreviewOpen(false);
      setPreviewItems([]);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Insert failed"),
  });

  const openDoc = async () => {
    if (!prices?.source_pdf_path) return;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(prices.source_pdf_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const sourceFileName = prices?.source_pdf_path?.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") ?? "";
  const emoji = CONCEPT_EMOJI[conceptSlug as ConceptSlug] ?? "🍽";

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-2xl">{emoji}</div>
          <div className="min-w-0">
            <h3 className="text-xl font-bold truncate">{conceptName}</h3>
            <p className="text-xs text-muted-foreground capitalize">POS price list</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn(
            "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border",
            PRICES_STATUS_PILL[status.status],
          )}>
            {status.label}
          </span>
          <Select
            value={currency}
            onValueChange={(v) => updatePrices.mutate({ currency: v })}
          >
            <SelectTrigger className="h-7 w-[78px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 text-sm">
        <Stat label="Items" value={items.length.toString()} />
        <Stat label="Avg" value={stats.avg != null ? stats.avg.toFixed(0) : "—"} suffix={stats.avg != null ? currency : undefined} />
        <Stat label="High / Low" value={stats.hi != null ? `${stats.hi}/${stats.lo}` : "—"} />
        <Stat label="Last parsed" value={prices?.last_parsed_at ? timeAgo(prices.last_parsed_at) : "—"} />
      </div>

      {/* Upload zone */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {prices?.source_pdf_path ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{sourceFileName}</span>
            {prices.last_parsed_at && (
              <span className="text-muted-foreground shrink-0">· AI parsed {timeAgo(prices.last_parsed_at)}</span>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7" onClick={openDoc}>
              <Download className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Replace
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={deleteUpload.isPending}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              {deleteUpload.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full rounded-lg border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300 transition flex items-center justify-center gap-2"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : "Drop Excel / CSV / PDF / photo — AI extracts product names and prices"}
        </button>
      )}

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Menu items ({items.length})</h4>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => addItem.mutate()} disabled={addItem.isPending}>
            <Plus className="h-3 w-3" /> Add item
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No prices yet</p>
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => addItem.mutate()}>
                <Plus className="h-3.5 w-3.5" /> Add item manually
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Upload price list
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {items.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                currency={currency}
                isFirst={idx === 0}
                isLast={idx === items.length - 1}
                expanded={editingItemId === item.id}
                onToggleExpand={() => setEditingItemId(editingItemId === item.id ? null : item.id)}
                onSave={(patch) => updateItem.mutate({ id: item.id, patch })}
                onDelete={() => deleteItem.mutate(item.id)}
                onMove={(dir) => moveItem.mutate({ id: item.id, dir })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Vegetarian compliance pill */}
      {items.length > 0 && (
        <div>
          {hasVeg ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              ✓ Vegetarian option present
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              ⚠️ No vegetarian option
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
        <span>{prices?.last_parsed_at ? `AI parsed ${timeAgo(prices.last_parsed_at)}` : ""}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7" onClick={openDoc} disabled={!prices?.source_pdf_path}>
            <Download className="h-3 w-3" /> Source
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-7">
            <a href={`/festivals/${festivalSlug}/prices/export`} target="_blank" rel="noopener noreferrer">Export menu PDF</a>
          </Button>
        </div>
      </div>

      {/* Preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review parsed items</DialogTitle>
            <DialogDescription>
              AI extracted {previewItems.length} items in {previewCurrency}. Uncheck any to skip.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1 text-sm">
            {previewItems.map((it, i) => (
              <label key={i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer">
                <Checkbox
                  checked={it.checked}
                  onCheckedChange={(v) => {
                    setPreviewItems((arr) => arr.map((x, j) => j === i ? { ...x, checked: !!v } : x));
                  }}
                />
                <span className="flex-1 truncate">{it.product_name}</span>
                <span className="tabular-nums w-16 text-right">{it.price}</span>
                <span className="text-xs text-muted-foreground w-12">{previewCurrency}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>Cancel</Button>
            <Button onClick={() => insertParsed.mutate()} disabled={insertParsed.isPending}>
              {insertParsed.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Insert {previewItems.filter((p) => p.checked).length} items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete uploaded prices?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the uploaded file and all {items.length} parsed price item{items.length === 1 ? "" : "s"} for {conceptName}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmDeleteOpen(false); deleteUpload.mutate(); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm tabular-nums">
        {value}{suffix && <span className="text-xs text-muted-foreground ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

function ItemRow({
  item, currency, isFirst, isLast, expanded, onToggleExpand, onSave, onDelete, onMove,
}: {
  item: PriceItemRow;
  currency: string;
  isFirst: boolean; isLast: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onSave: (patch: Partial<PriceItemRow>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [name, setName] = useState(item.product_name);
  const [price, setPrice] = useState(String(item.price ?? ""));

  const commitName = () => {
    const v = name.trim();
    if (v !== (item.product_name ?? "")) onSave({ product_name: v });
  };
  const commitPrice = () => {
    const n = parseFloat(price);
    if (!isNaN(n) && n !== Number(item.price)) onSave({ price: n });
  };

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-muted/30 group">
        <div className="flex flex-col -my-1 opacity-0 group-hover:opacity-100">
          <button disabled={isFirst} onClick={() => onMove(-1)} className="text-muted-foreground disabled:opacity-30">
            <ArrowUp className="h-2.5 w-2.5" />
          </button>
          <button disabled={isLast} onClick={() => onMove(1)} className="text-muted-foreground disabled:opacity-30">
            <ArrowDown className="h-2.5 w-2.5" />
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="Item name"
          className="flex-1 bg-transparent border-0 outline-none text-sm focus:bg-muted/50 px-2 py-1 rounded"
        />
        <input
          type="number"
          step="any"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={commitPrice}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-20 text-right tabular-nums bg-transparent border-0 outline-none text-sm focus:bg-muted/50 px-2 py-1 rounded"
        />
        <span className="text-xs text-muted-foreground w-10">{currency}</span>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
          {item.is_vegetarian && <Leaf className="h-3 w-3 text-emerald-600" />}
          {item.is_vegan && <Sprout className="h-3 w-3 text-emerald-700" />}
          {item.is_gluten_free && <WheatOff className="h-3 w-3 text-amber-600" />}
          <button onClick={onToggleExpand} className="hover:text-foreground text-muted-foreground" title="Edit details">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
          </button>
          <button onClick={onDelete} className="hover:text-rose-600 text-muted-foreground" title="Delete">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ml-6 mr-2 mb-2 mt-1 p-3 rounded-lg border bg-muted/20 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</label>
              <Select value={item.category ?? "none"} onValueChange={(v) => onSave({ category: v === "none" ? null : v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <Toggle label="Veg" checked={item.is_vegetarian} onChange={(v) => onSave({ is_vegetarian: v })} />
              <Toggle label="Vegan" checked={item.is_vegan} onChange={(v) => onSave({ is_vegan: v })} />
              <Toggle label="GF" checked={item.is_gluten_free} onChange={(v) => onSave({ is_gluten_free: v })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</label>
            <Textarea
              defaultValue={item.notes ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if ((v || null) !== (item.notes ?? null)) onSave({ notes: v || null });
              }}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span>{label}</span>
    </label>
  );
}
