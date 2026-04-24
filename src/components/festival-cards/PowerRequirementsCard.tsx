import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CardUploadZone,
  EditableField,
  BySourceDropdown,
  MissingFlag,
  type BySource,
} from "./shared";
import { Plus, Trash2, Zap, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  festivalId: string;
}

type EquipRow = {
  id: string;
  item_name: string;
  quantity: string | null;
  source: BySource;
  status: string;
  card_origin: string | null;
  notes: string | null;
};

const POWER_EQUIP_ORIGIN = "power";
const POWER_ACCESSORY_ORIGIN = "power_accessory";

/** Encode consumption (W per unit) into the notes field as `pwr:<watts>|<note>`. */
const packNotes = (watts: string, note: string) => `pwr:${watts || "0"}|${note ?? ""}`;
const unpackNotes = (raw: string | null) => {
  if (!raw) return { watts: "", note: "" };
  const m = raw.match(/^pwr:([^|]*)\|(.*)$/s);
  if (!m) return { watts: "", note: raw };
  return { watts: m[1] ?? "", note: m[2] ?? "" };
};

const toNumber = (v: string | null | undefined) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function PowerRequirementsCard({ festivalId }: Props) {
  const qc = useQueryClient();
  const [aiNote, setAiNote] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  // ---- Concepts (ordered electricity) ----
  const { data: concepts = [] } = useQuery({
    queryKey: ["festival_concepts_power", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_concepts")
        .select("id,name,power_baseline,power_extras")
        .eq("festival_id", festivalId)
        .order("order_index");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!festivalId,
  });

  // ---- Brain entries (electric category) ----
  const { data: brainElectric = [] } = useQuery({
    queryKey: ["brain_entries_electric", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("id,display_name,content,structured_data")
        .eq("festival_id", festivalId)
        .eq("category", "electric");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!festivalId,
  });

  // ---- Equipment rows: split into "consumers" and "accessories" by card_origin ----
  const { data: equipment = [] } = useQuery<EquipRow[]>({
    queryKey: ["equipment_db_power", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_db")
        .select("id,item_name,quantity,source,status,card_origin,notes")
        .eq("festival_id", festivalId)
        .in("card_origin", [POWER_EQUIP_ORIGIN, POWER_ACCESSORY_ORIGIN])
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as EquipRow[];
    },
    enabled: !!festivalId,
  });

  const consumers = equipment.filter((e) => e.card_origin === POWER_EQUIP_ORIGIN);
  const accessories = equipment.filter((e) => e.card_origin === POWER_ACCESSORY_ORIGIN);

  // ---- Mutations ----
  const addRow = useMutation({
    mutationFn: async (origin: string) => {
      const { error } = await supabase.from("equipment_db").insert({
        festival_id: festivalId,
        item_name: "",
        quantity: "",
        source: "by_us",
        status: "pending",
        card_origin: origin,
        notes: origin === POWER_EQUIP_ORIGIN ? packNotes("", "") : "",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment_db_power", festivalId] }),
    onError: (e: any) => toast.error(e.message ?? "Could not add row"),
  });

  const updateRow = useMutation({
    mutationFn: async (patch: Partial<EquipRow> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("equipment_db").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment_db_power", festivalId] }),
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("equipment_db").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment_db_power", festivalId] }),
  });

  // ---- Totals ----
  const totalConsumptionW = useMemo(() => {
    return consumers.reduce((sum, r) => {
      const { watts } = unpackNotes(r.notes);
      const qty = toNumber(r.quantity) || 1;
      return sum + toNumber(watts) * qty;
    }, 0);
  }, [consumers]);

  const totalOrderedKW = useMemo(() => {
    return concepts.reduce((sum, c: any) => sum + toNumber(c.power_baseline), 0);
  }, [concepts]);

  const totalConsumptionKW = totalConsumptionW / 1000;
  const balanceKW = totalOrderedKW - totalConsumptionKW;
  const isDeficit = balanceKW < 0;

  // ---- AI recommendation ----
  const runAI = async () => {
    setAiLoading(true);
    setAiNote("");
    try {
      const summary = {
        ordered_kw: totalOrderedKW,
        consumption_kw: Number(totalConsumptionKW.toFixed(3)),
        balance_kw: Number(balanceKW.toFixed(3)),
        concepts: concepts.map((c: any) => ({ name: c.name, ordered_kw: toNumber(c.power_baseline) })),
        equipment: consumers.map((r) => {
          const { watts } = unpackNotes(r.notes);
          return {
            item: r.item_name,
            qty: toNumber(r.quantity) || 1,
            watts_per_unit: toNumber(watts),
          };
        }),
      };
      const { data, error } = await supabase.functions.invoke("smart-card-chat", {
        body: {
          mode: "power_recommendation",
          context: summary,
          messages: [
            {
              role: "user",
              content:
                "Analyze this festival power setup. Tell me in 2-3 sentences whether we are over or under capacity, by how many kW, and recommend a concrete action (order more, redistribute, or reduce load).",
            },
          ],
        },
      });
      if (error) throw error;
      const text =
        (data as any)?.reply ||
        (data as any)?.message ||
        (data as any)?.content ||
        "No recommendation returned.";
      setAiNote(text);
    } catch (e: any) {
      toast.error(`AI failed: ${e.message ?? e}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ===== 1. Ordered Electricity per Concept ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Ordered Electricity per Concept
          </CardTitle>
        </CardHeader>
        <CardContent>
          {concepts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No concepts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concept</TableHead>
                  <TableHead className="w-32">Ordered (kW)</TableHead>
                  <TableHead>Brain notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {concepts.map((c: any) => {
                  const brain = brainElectric.find(
                    (b: any) =>
                      (b.display_name ?? "").toLowerCase().includes((c.name ?? "").toLowerCase()) ||
                      (b.structured_data as any)?.concept_name === c.name,
                  );
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <EditableField
                          type="number"
                          value={c.power_baseline}
                          onChange={async (v) => {
                            const { error } = await supabase
                              .from("festival_concepts")
                              .update({ power_baseline: v })
                              .eq("id", c.id);
                            if (error) toast.error(error.message);
                            else qc.invalidateQueries({ queryKey: ["festival_concepts_power", festivalId] });
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {brain?.content ? brain.content.slice(0, 80) + (brain.content.length > 80 ? "…" : "") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ===== 2. Equipment with Consumption ===== */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Equipment with Consumption</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow.mutate(POWER_EQUIP_ORIGIN)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add equipment
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="w-24">Qty</TableHead>
                <TableHead className="w-36">Watts / unit</TableHead>
                <TableHead className="w-32">Total (W)</TableHead>
                <TableHead className="w-40">Source</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consumers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground text-center py-4">
                    No equipment yet. Add items to estimate total consumption.
                  </TableCell>
                </TableRow>
              )}
              {consumers.map((r) => {
                const { watts, note } = unpackNotes(r.notes);
                const qty = toNumber(r.quantity) || 1;
                const total = toNumber(watts) * qty;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <EditableField
                        value={r.item_name}
                        placeholder="Item name"
                        onChange={(v) => updateRow.mutate({ id: r.id, item_name: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <EditableField
                        type="number"
                        value={r.quantity}
                        onChange={(v) => updateRow.mutate({ id: r.id, quantity: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <EditableField
                        type="number"
                        value={watts}
                        onChange={(v) => updateRow.mutate({ id: r.id, notes: packNotes(v, note) })}
                      />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{total.toLocaleString()} W</TableCell>
                    <TableCell>
                      <BySourceDropdown
                        value={r.source}
                        onChange={(next) => updateRow.mutate({ id: r.id, source: next })}
                        festivalId={festivalId}
                        itemName={r.item_name}
                        cardOrigin={POWER_EQUIP_ORIGIN}
                        quantity={r.quantity ?? undefined}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => deleteRow.mutate(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ===== 3. AI Calculation Panel ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Power Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Total ordered</div>
              <div className="text-2xl font-semibold tabular-nums">{totalOrderedKW.toFixed(2)} kW</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Total consumption</div>
              <div className="text-2xl font-semibold tabular-nums">{totalConsumptionKW.toFixed(2)} kW</div>
            </div>
            <div
              className={`rounded-lg border p-3 ${
                isDeficit
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-primary/40 bg-primary/5"
              }`}
            >
              <div className="text-xs text-muted-foreground">{isDeficit ? "Deficit" : "Surplus"}</div>
              <div
                className={`text-2xl font-semibold tabular-nums ${
                  isDeficit ? "text-destructive" : "text-primary"
                }`}
              >
                {balanceKW >= 0 ? "+" : ""}
                {balanceKW.toFixed(2)} kW
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={runAI} disabled={aiLoading}>
              {aiLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              Get AI recommendation
            </Button>
          </div>

          {aiNote && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{aiNote}</div>
          )}
        </CardContent>
      </Card>

      {/* ===== 4. Electrical Accessories ===== */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Electrical Accessories</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow.mutate(POWER_ACCESSORY_ORIGIN)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add accessory
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="w-24">Qty</TableHead>
                <TableHead className="w-40">Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accessories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground text-center py-4">
                    No accessories yet (cables, tavle, extensions, adaptors…).
                  </TableCell>
                </TableRow>
              )}
              {accessories.map((r) => {
                const missing =
                  !r.item_name?.trim() ||
                  !r.quantity?.trim() ||
                  r.status === "pending";
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <EditableField
                        value={r.item_name}
                        placeholder="e.g. 16A cable, tavle, adaptor"
                        onChange={(v) => updateRow.mutate({ id: r.id, item_name: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <EditableField
                        type="number"
                        value={r.quantity}
                        onChange={(v) => updateRow.mutate({ id: r.id, quantity: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <BySourceDropdown
                        value={r.source}
                        onChange={(next) => updateRow.mutate({ id: r.id, source: next })}
                        festivalId={festivalId}
                        itemName={r.item_name}
                        cardOrigin={POWER_ACCESSORY_ORIGIN}
                        quantity={r.quantity ?? undefined}
                      />
                    </TableCell>
                    <TableCell>
                      {missing ? (
                        <MissingFlag
                          isMissing
                          label={r.item_name?.trim() || "Unnamed accessory"}
                          festivalId={festivalId}
                          cardOrigin={POWER_ACCESSORY_ORIGIN}
                          defaultPriority="urgent"
                        />
                      ) : (
                        <Badge variant="secondary" className="text-xs capitalize">
                          {r.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => deleteRow.mutate(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ===== 5. Upload zone ===== */}
      <CardUploadZone
        festivalId={festivalId}
        cardName="power_requirements"
        title="Power Requirements — uploads"
        subtitle="Power plans, electrical drawings, supplier confirmations…"
      />
    </div>
  );
}

export default PowerRequirementsCard;
