import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Boxes,
  CheckCircle2,
  Download,
  Loader2,
  Search,
  Trash2,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Props {
  festivalId: string;
}

type EquipmentRow = {
  id: string;
  festival_id: string;
  item_name: string;
  quantity: string | null;
  source: "by_us" | "by_festival";
  status: "pending" | "confirmed" | "delivered" | "returned";
  card_origin: string | null;
  notes: string | null;
};

type FilterTab = "all" | "by_us" | "by_festival" | "missing";

// ----- Origin → group label -----
function originGroup(origin: string | null): string {
  if (!origin) return "Other";
  const o = origin.toLowerCase();
  if (o.startsWith("concepts")) return "Concepts";
  if (o.startsWith("facade")) return "Facade";
  if (o.startsWith("cooling_storage")) return "Cooling & Storage";
  if (o.startsWith("cooking_equipment")) return "Cooking Equipment";
  if (o.startsWith("safety")) return "Safety";
  if (o.startsWith("power")) return "Power";
  if (o.startsWith("transport")) return "Transportation";
  if (o.startsWith("bc_trolley") || o.startsWith("trolley")) return "Trolley";
  return "Other";
}

const GROUP_ORDER = [
  "Concepts",
  "Facade",
  "Cooling & Storage",
  "Cooking Equipment",
  "Safety",
  "Power",
  "Transportation",
  "Trolley",
  "Other",
];

function isMissing(r: EquipmentRow): boolean {
  return !r.item_name?.trim() || !r.quantity?.trim();
}

export function EquipmentListCard({ festivalId }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["equipment_db_all", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_db")
        .select("*")
        .eq("festival_id", festivalId)
        .order("card_origin", { ascending: true })
        .order("item_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EquipmentRow[];
    },
  });

  // Filter + search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "by_us" && r.source !== "by_us") return false;
      if (tab === "by_festival" && r.source !== "by_festival") return false;
      if (tab === "missing" && !isMissing(r)) return false;
      if (q) {
        const hay =
          `${r.item_name ?? ""} ${r.quantity ?? ""} ${r.notes ?? ""} ${r.card_origin ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, tab, search]);

  // Group by origin label
  const grouped = useMemo(() => {
    const map = new Map<string, EquipmentRow[]>();
    for (const r of filtered) {
      const g = originGroup(r.card_origin);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g)! }));
  }, [filtered]);

  const counts = useMemo(() => {
    return {
      all: rows.length,
      by_us: rows.filter((r) => r.source === "by_us").length,
      by_festival: rows.filter((r) => r.source === "by_festival").length,
      missing: rows.filter(isMissing).length,
    };
  }, [rows]);

  // Selection helpers
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filtered.forEach((r) => next.delete(r.id));
      } else {
        filtered.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Bulk actions
  const bulkUpdateStatus = async (status: EquipmentRow["status"]) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("equipment_db").update({ status }).in("id", ids);
    if (error) {
      toast.error(`Update failed: ${error.message}`);
      return;
    }
    toast.success(`Marked ${ids.length} as ${status}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["equipment_db_all", festivalId] });
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item(s)?`)) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("equipment_db").delete().in("id", ids);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    toast.success(`Deleted ${ids.length}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["equipment_db_all", festivalId] });
  };

  const updateRow = async (id: string, patch: Partial<EquipmentRow>) => {
    const { error } = await supabase.from("equipment_db").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["equipment_db_all", festivalId] });
  };

  // Export
  const exportExcel = () => {
    const data = rows.map((r) => ({
      Item: r.item_name,
      Category: originGroup(r.card_origin),
      Quantity: r.quantity ?? "",
      Source: r.source,
      Status: r.status,
      "Origin Card": r.card_origin ?? "",
      Notes: r.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Equipment");
    XLSX.writeFile(wb, `equipment-${festivalId.slice(0, 8)}.xlsx`);
    toast.success("Exported equipment list");
  };

  // Upload (Excel or PDF)
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      let parsed: { item_name: string; quantity?: string; notes?: string }[] = [];

      if (ext === "xlsx" || ext === "xls" || ext === "csv") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        parsed = json
          .map((row) => {
            const keys = Object.keys(row);
            const findKey = (...names: string[]) =>
              keys.find((k) => names.some((n) => k.toLowerCase().includes(n)));
            const nameKey = findKey("item", "name", "produkt", "vare");
            const qtyKey = findKey("qty", "quantity", "antal", "mængde", "count");
            const notesKey = findKey("note", "comment", "bemærk");
            return {
              item_name: String(row[nameKey ?? keys[0]] ?? "").trim(),
              quantity: qtyKey ? String(row[qtyKey] ?? "").trim() : "",
              notes: notesKey ? String(row[notesKey] ?? "").trim() : "",
            };
          })
          .filter((r) => r.item_name);
      } else if (ext === "pdf") {
        // Send to AI for extraction via existing edge function
        const base64 = await fileToBase64(file);
        const { data, error } = await supabase.functions.invoke("smart-card-extract", {
          body: {
            mode: "equipment_list",
            context: "Generic equipment list upload (Equipment List card)",
            file: { base64, filename: file.name, mime_type: file.type || "application/pdf" },
          },
        });
        if (error) throw error;
        const items: any[] = data?.items ?? data?.equipment ?? [];
        parsed = items
          .map((it) => ({
            item_name: String(it.item_name ?? it.name ?? "").trim(),
            quantity: it.quantity != null ? String(it.quantity) : "",
            notes: it.notes ? String(it.notes) : "",
          }))
          .filter((r) => r.item_name);
      } else {
        toast.error("Upload Excel (.xlsx/.csv) or PDF only");
        return;
      }

      if (parsed.length === 0) {
        toast.error("No items found in file");
        return;
      }

      const inserts = parsed.map((p) => ({
        festival_id: festivalId,
        item_name: p.item_name,
        quantity: p.quantity || null,
        notes: p.notes || null,
        source: "by_us" as const,
        status: "pending" as const,
        card_origin: "equipment_list_upload",
      }));
      const { error } = await supabase.from("equipment_db").insert(inserts);
      if (error) throw error;
      toast.success(`Imported ${inserts.length} items`);
      qc.invalidateQueries({ queryKey: ["equipment_db_all", festivalId] });
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message ?? e}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Equipment List</h2>
            <Badge variant="secondary">{rows.length} items</Badge>
          </div>
          <div className="flex items-center gap-2">
            <label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
                disabled={uploading}
              />
              <Button size="sm" variant="outline" asChild disabled={uploading}>
                <span className="cursor-pointer">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Upload list
                </span>
              </Button>
            </label>
            <Button size="sm" variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export Excel
            </Button>
          </div>
        </div>

        {/* Tabs + search */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
            <TabsList>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="by_us">By Us ({counts.by_us})</TabsTrigger>
              <TabsTrigger value="by_festival">By Festival ({counts.by_festival})</TabsTrigger>
              <TabsTrigger value="missing">Missing ({counts.missing})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-72">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items, notes…"
              className="h-9 pl-8"
            />
          </div>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-primary/5 border border-primary/20">
            <span className="text-sm font-medium pl-1">{selected.size} selected</span>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("confirmed")}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Mark confirmed
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("pending")}>
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Mark missing
            </Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAllVisible}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-24">Quantity</TableHead>
                <TableHead className="w-32">Source</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                  </TableCell>
                </TableRow>
              ) : grouped.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    No equipment matches the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                grouped.flatMap(({ group, items }) => [
                  <TableRow key={`grp-${group}`} className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={8} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1.5">
                      {group} <span className="text-muted-foreground/60">· {items.length}</span>
                    </TableCell>
                  </TableRow>,
                  ...items.map((r) => {
                    const missing = isMissing(r);
                    return (
                      <TableRow key={r.id} className={missing ? "bg-destructive/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={() => toggleOne(r.id)}
                          />
                        </TableCell>
                        <TableCell className={missing ? "text-destructive" : ""}>
                          {r.item_name || <span className="italic">— missing —</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{group}</TableCell>
                        <TableCell>
                          <Input
                            value={r.quantity ?? ""}
                            onChange={(e) =>
                              qc.setQueryData<EquipmentRow[]>(
                                ["equipment_db_all", festivalId],
                                (old) =>
                                  old?.map((x) =>
                                    x.id === r.id ? { ...x, quantity: e.target.value } : x,
                                  ) ?? old,
                              )
                            }
                            onBlur={(e) => updateRow(r.id, { quantity: e.target.value || null })}
                            className={`h-8 ${!r.quantity?.trim() ? "border-destructive/50" : ""}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.source}
                            onValueChange={(v) =>
                              updateRow(r.id, { source: v as EquipmentRow["source"] })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="by_us">By us</SelectItem>
                              <SelectItem value="by_festival">By festival</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.status}
                            onValueChange={(v) =>
                              updateRow(r.id, { status: v as EquipmentRow["status"] })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                              <SelectItem value="returned">Returned</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {r.card_origin ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={async () => {
                              if (!confirm(`Delete "${r.item_name}"?`)) return;
                              const { error } = await supabase
                                .from("equipment_db")
                                .delete()
                                .eq("id", r.id);
                              if (error) return toast.error(error.message);
                              toast.success("Deleted");
                              qc.invalidateQueries({ queryKey: ["equipment_db_all", festivalId] });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  }),
                ])
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default EquipmentListCard;
