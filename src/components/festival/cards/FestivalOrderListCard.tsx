import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileText, Loader2, Plus, Trash2, Save, Sparkles, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderItem {
  id: string;
  festival_power_id: string;
  category: string | null;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
  notes: string | null;
  position: number;
}

const CATEGORIES = [
  "tent", "electricity", "water", "waste", "furniture", "lighting",
  "decor", "signage", "kitchen", "cleaning", "security", "internet", "other",
];

interface Props {
  festivalId: string;
  conceptSlug: string;
  conceptName: string;
  powerId: string;
  orderListFilePath: string | null;
  orderListParsedAt: string | null;
}

export function FestivalOrderListCard({
  festivalId, conceptSlug, conceptName, powerId, orderListFilePath, orderListParsedAt,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("festival_power_order_items")
      .select("*")
      .eq("festival_power_id", powerId)
      .order("position", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data as OrderItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [powerId]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${festivalId}/${conceptSlug}/order-list/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from("power-drawings").upload(path, file);
      if (error) throw error;
      await supabase.from("festival_power")
        .update({ order_list_file_path: path } as any)
        .eq("id", powerId);
      toast.success("Uploaded — parsing with AI…");

      setParsing(true);
      const { data: signed } = await supabase.storage.from("power-drawings").createSignedUrl(path, 600);
      if (!signed?.signedUrl) throw new Error("Could not sign upload");

      const { data: parsed, error: pErr } = await supabase.functions.invoke("parse-document", {
        body: {
          fileUrl: signed.signedUrl,
          documentType: "festival_order",
          context: { concept_name: conceptName, concept_slug: conceptSlug },
        },
      });
      if (pErr) throw pErr;
      if (!parsed?.ok) throw new Error(parsed?.message ?? "Parse failed");

      const rawItems = (parsed.parsed?.items ?? []) as any[];
      if (rawItems.length === 0) {
        toast.message("AI parsed but found no items — add manually");
      } else {
        const filteredItems = rawItems.filter((it) => Number(it.quantity ?? 1) > 0);
        const nextPos = items.length;
        const rows = filteredItems.map((it, i) => ({
          festival_power_id: powerId,
          category: typeof it.category === "string" ? it.category.toLowerCase().slice(0, 40) : "other",
          item_name: String(it.item_name ?? "Unnamed").slice(0, 200),
          quantity: it.quantity != null ? Number(it.quantity) : 1,
          unit: it.unit ? String(it.unit).slice(0, 20) : null,
          unit_price: it.unit_price != null ? Number(it.unit_price) : null,
          total_price: it.total_price != null ? Number(it.total_price) : null,
          currency: it.currency ? String(it.currency).slice(0, 8) : null,
          notes: it.notes ? String(it.notes).slice(0, 400) : null,
          source_file_path: path,
          position: nextPos + i,
        }));
        const { error: insErr } = await supabase.from("festival_power_order_items").insert(rows as any);
        if (insErr) throw insErr;
        toast.success(`Imported ${rows.length} items — please review`);
      }
      await supabase.from("festival_power")
        .update({ order_list_parsed_at: new Date().toISOString() } as any)
        .eq("id", powerId);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload/parse failed");
    } finally {
      setUploading(false);
      setParsing(false);
    }
  };

  const openFile = async () => {
    if (!orderListFilePath) return;
    const { data } = await supabase.storage.from("power-drawings")
      .createSignedUrl(orderListFilePath, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const addRow = async () => {
    const nextPos = items.reduce((m, x) => Math.max(m, x.position), -1) + 1;
    const { error } = await supabase.from("festival_power_order_items").insert({
      festival_power_id: powerId,
      item_name: "New item",
      category: "other",
      quantity: 1,
      position: nextPos,
    } as any);
    if (error) toast.error(error.message); else load();
  };

  const totalAll = items.reduce((s, it) => s + Number(it.total_price ?? 0), 0);
  const currency = items.find((i) => i.currency)?.currency ?? "DKK";

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-bold">Festival order list</h3>
          {orderListParsedAt && (
            <span className="text-[11px] text-muted-foreground italic">
              AI parsed {new Date(orderListParsedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {orderListFilePath && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openFile}>
              <Download className="h-3.5 w-3.5" /> Source
            </Button>
          )}
          <input
            ref={fileRef} type="file" className="hidden"
            accept=".pdf,.xlsx,.xls,.csv,.docx,.eml,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <Button
            size="sm" className="h-7 text-xs gap-1"
            disabled={uploading || parsing}
            onClick={() => fileRef.current?.click()}
          >
            {uploading || parsing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Upload className="h-3.5 w-3.5" />}
            {parsing ? "Parsing…" : uploading ? "Uploading…" : "Upload order list"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Upload the festival's order document (PDF, Excel, Word, email). AI extracts every line — tent, electricity, water, etc. — and you can edit before saving.
      </p>

      {loading ? (
        <div className="text-sm text-muted-foreground italic">Loading…</div>
      ) : (
        <>
          <div className="rounded-lg border divide-y text-xs">
            <div className="grid grid-cols-12 gap-2 p-2 items-center bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <div className="col-span-2">Category</div>
              <div className="col-span-3">Item</div>
              <div className="col-span-1 text-right">Qty</div>
              <div className="col-span-1">Unit</div>
              <div className="col-span-1 text-right">Unit price</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-2">Notes</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>
            {items.length === 0 ? (
              <div className="p-3 text-muted-foreground italic">
                No items yet — upload an order list above or add rows manually.
              </div>
            ) : (
              items.map((it) => (
                <ItemRow key={it.id} row={it} onChanged={load} />
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </Button>
            {totalAll > 0 && (
              <div className="text-sm font-semibold tabular-nums">
                Total: {totalAll.toLocaleString()} {currency}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ItemRow({ row, onChanged }: { row: OrderItem; onChanged: () => void }) {
  const [r, setR] = useState(row);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setR(row); }, [row.id]);

  const dirty =
    r.category !== row.category ||
    r.item_name !== row.item_name ||
    r.quantity !== row.quantity ||
    r.unit !== row.unit ||
    r.unit_price !== row.unit_price ||
    r.total_price !== row.total_price ||
    r.notes !== row.notes;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("festival_power_order_items").update({
      category: r.category,
      item_name: r.item_name,
      quantity: r.quantity,
      unit: r.unit,
      unit_price: r.unit_price,
      total_price: r.total_price,
      notes: r.notes,
    } as any).eq("id", r.id);
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Saved"); onChanged(); }
  };

  const remove = async () => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("festival_power_order_items").delete().eq("id", r.id);
    if (error) toast.error(error.message); else onChanged();
  };

  return (
    <div className={cn("grid grid-cols-12 gap-2 p-2 items-center", dirty && "bg-amber-500/5")}>
      <div className="col-span-2">
        <Select value={r.category ?? "other"} onValueChange={(v) => setR({ ...r, category: v })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Input className="col-span-3 h-7 text-xs" value={r.item_name}
        onChange={(e) => setR({ ...r, item_name: e.target.value })} />
      <Input className="col-span-1 h-7 text-xs text-right tabular-nums" type="number"
        value={r.quantity ?? ""} onChange={(e) => setR({ ...r, quantity: e.target.value === "" ? null : Number(e.target.value) })} />
      <Input className="col-span-1 h-7 text-xs" value={r.unit ?? ""}
        onChange={(e) => setR({ ...r, unit: e.target.value || null })} />
      <Input className="col-span-1 h-7 text-xs text-right tabular-nums" type="number"
        value={r.unit_price ?? ""} onChange={(e) => setR({ ...r, unit_price: e.target.value === "" ? null : Number(e.target.value) })} />
      <Input className="col-span-1 h-7 text-xs text-right tabular-nums" type="number"
        value={r.total_price ?? ""} onChange={(e) => setR({ ...r, total_price: e.target.value === "" ? null : Number(e.target.value) })} />
      <Input className="col-span-2 h-7 text-xs" value={r.notes ?? ""}
        onChange={(e) => setR({ ...r, notes: e.target.value || null })} />
      <div className="col-span-1 flex items-center justify-end gap-1">
        <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={!dirty || saving} onClick={save} title="Save">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={remove} title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
