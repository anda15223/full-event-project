import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Utensils, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  CardUploadZone,
  EditableField,
  BySourceDropdown,
  BrainSuggestions,
  type BySource,
  type BrainEntry,
} from "./shared";

interface Props {
  festivalId: string;
}

// Clean concept names — brand affiliation (e.g. "/ The Fish Project")
// is OUT OF SCOPE for Sprint 2.3. See deliverables item #8: a future sprint
// should add a `brand_entity_id` column linking concepts → legal entities.
const DEFAULT_CONCEPTS = [
  "Fish & Chips",
  "Gyros",
  "La Crêperie",
  "Chicks 'n' Buns",
];

type ConceptDetails = {
  menu?: string;
  power_amps?: string;
  power_unit?: string;
  sink_status?: "ordered" | "not_ordered" | "unknown";
  pos_count?: string;
  pos_status?: "ordered" | "not_ordered";
};

type PowerExtra = {
  id: string;
  amps: number;
  count: number;
  phase: 1 | 3;
  label: string;
  voltage?: 230 | 400; // hidden, default 230
};

type Concept = {
  id: string;
  festival_id: string;
  name: string;
  zone: string;
  order_index: number;
  tent_size: string | null;
  power_baseline: string | null;
  power_extras: PowerExtra[] | null;
  gas_required: boolean;
  gas_supplier: string | null;
  wristband_max: number | null;
  wristband_black_partout: number | null;
  wristband_normal_partout: number | null;
  products_sold: string | null;
  sales_hours_thu: string | null;
  sales_hours_fri: string | null;
  sales_hours_sat: string | null;
  sales_hours_sun: string | null;
  details: ConceptDetails | any;
};

/** Equipment items rendered as EquipmentRow under each concept. */
const EQUIPMENT_ITEMS = [
  { key: "fire_kit", label: "Fire kit" },
  { key: "first_aid_kit", label: "First aid kit" },
  { key: "light_bulbs", label: "Light bulbs" },
  { key: "prep_tent", label: "Prep Tent" },
  { key: "floor", label: "Floor" },
] as const;

function cardOriginFor(conceptName: string) {
  return `concepts:${conceptName}`;
}

// ───────────────────────────────────────────────────────────────
// Action-item reconciliation (idempotent — opens missing, closes resolved)
// ───────────────────────────────────────────────────────────────

type DesiredAction = { title: string };

/**
 * Compute the set of action items that SHOULD be open for this concept,
 * based on its current state + the equipment_db rows scoped to it.
 */
function computeDesiredActions(
  concept: Concept,
  equipmentRows: Array<{ item_name: string; source: string | null }>,
): DesiredAction[] {
  const out: DesiredAction[] = [];
  const d: ConceptDetails = concept.details ?? {};

  if (d.sink_status === "not_ordered" || d.sink_status === "unknown" || !d.sink_status) {
    out.push({ title: `Order/confirm sink for ${concept.name}` });
  }
  if (d.pos_status === "not_ordered" || !d.pos_status) {
    out.push({ title: `Order POS for ${concept.name}` });
  }

  // Equipment items where source is NULL (no equipment_db row exists yet).
  const knownItems = new Map(equipmentRows.map((r) => [r.item_name, r.source]));
  for (const item of EQUIPMENT_ITEMS) {
    const src = knownItems.get(item.label);
    if (!src) {
      out.push({ title: `Decide source for ${item.label} — ${concept.name}` });
    }
  }

  if (concept.gas_required && (!concept.gas_supplier || !concept.gas_supplier.trim())) {
    out.push({ title: `Confirm gas supplier for ${concept.name}` });
  }

  if (!concept.wristband_max || concept.wristband_max === 0) {
    out.push({ title: `Confirm wristband count for ${concept.name}` });
  }

  return out;
}

/**
 * Reconcile festival_action_items for one concept.
 * - Opens any desired action that doesn't already exist as an open row (dedup by title).
 * - Closes any existing open `concepts:${conceptName}` row whose title is no longer desired.
 * - Never reopens closed items.
 */
async function reconcileActionItems(
  concept: Concept,
  equipmentRows: Array<{ item_name: string; source: string | null }>,
) {
  const cardOrigin = cardOriginFor(concept.name);
  const desired = computeDesiredActions(concept, equipmentRows);
  const desiredTitles = new Set(desired.map((d) => d.title));

  // Fetch all open items for this card_origin
  const { data: existingOpen, error: selErr } = await supabase
    .from("festival_action_items")
    .select("id, title")
    .eq("festival_id", concept.festival_id)
    .eq("card_origin", cardOrigin)
    .eq("status", "open");
  if (selErr) {
    console.warn("[reconcileActionItems] fetch failed", selErr);
    return;
  }
  const existingOpenTitles = new Set((existingOpen ?? []).map((r) => r.title));

  // INSERT: desired items not currently open
  const toInsert = desired
    .filter((d) => !existingOpenTitles.has(d.title))
    .map((d) => ({
      festival_id: concept.festival_id,
      title: d.title,
      notes: "Auto-generated from Concepts card",
      priority: "high",
      status: "open",
      card_origin: cardOrigin,
    }));
  if (toInsert.length) {
    const { error } = await supabase.from("festival_action_items").insert(toInsert);
    if (error) console.warn("[reconcileActionItems] insert failed", error);
  }

  // CLOSE: open items whose title is no longer desired
  const toClose = (existingOpen ?? [])
    .filter((r) => !desiredTitles.has(r.title))
    .map((r) => r.id);
  if (toClose.length) {
    const { error } = await supabase
      .from("festival_action_items")
      .update({ status: "closed" })
      .in("id", toClose);
    if (error) console.warn("[reconcileActionItems] close failed", error);
  }
}

// ───────────────────────────────────────────────────────────────
// Top-level component
// ───────────────────────────────────────────────────────────────

export function ConceptsCard({ festivalId }: Props) {
  const qc = useQueryClient();

  const { data: concepts, isLoading } = useQuery({
    queryKey: ["festival_concepts", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_concepts")
        .select(
          [
            "id",
            "festival_id",
            "name",
            "zone",
            "order_index",
            "tent_size",
            "power_baseline",
            "power_extras",
            "gas_required",
            "gas_supplier",
            "wristband_max",
            "wristband_black_partout",
            "wristband_normal_partout",
            "products_sold",
            "sales_hours_thu",
            "sales_hours_fri",
            "sales_hours_sat",
            "sales_hours_sun",
            "details",
          ].join(", "),
        )
        .eq("festival_id", festivalId)
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as unknown as Concept[];
    },
  });

  // Seed default concepts if none exist for this festival
  useEffect(() => {
    if (!concepts || concepts.length > 0) return;
    (async () => {
      const rows = DEFAULT_CONCEPTS.map((name, i) => ({
        festival_id: festivalId,
        name,
        zone: "main",
        order_index: i,
        details: {} as ConceptDetails,
      }));
      const { error } = await supabase.from("festival_concepts").insert(rows);
      if (error) {
        toast.error(`Could not seed concepts: ${error.message}`);
        return;
      }
      qc.invalidateQueries({ queryKey: ["festival_concepts", festivalId] });
    })();
  }, [concepts, festivalId, qc]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading concepts…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {(concepts ?? []).map((c) => (
        <ConceptSubCard key={c.id} concept={c} festivalId={festivalId} />
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Per-concept sub-card
// ───────────────────────────────────────────────────────────────

function ConceptSubCard({
  concept,
  festivalId,
}: {
  concept: Concept;
  festivalId: string;
}) {
  const qc = useQueryClient();
  const details: ConceptDetails = concept.details ?? {};
  const cardOrigin = cardOriginFor(concept.name);

  // All equipment rows for this concept (used by reconciler + EquipmentRow)
  const { data: equipmentRows = [] } = useQuery({
    queryKey: ["equipment_db", festivalId, cardOrigin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_db")
        .select("id, item_name, source, status")
        .eq("festival_id", festivalId)
        .eq("card_origin", cardOrigin);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Brain entries scoped to this festival (passed to BrainSuggestions)
  const { data: brainEntries = [] } = useQuery({
    queryKey: ["brain_entries_concepts", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select(
          "id, festival_id, display_name, key_name, content, structured_data, is_active, created_at",
        )
        .eq("festival_id", festivalId)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as BrainEntry[];
    },
  });

  const reconcile = async (next: Concept) => {
    await reconcileActionItems(next, equipmentRows);
    qc.invalidateQueries({ queryKey: ["festival_action_items", festivalId] });
  };

  const update = async (
    patch: Partial<
      Pick<
        Concept,
        | "name"
        | "tent_size"
        | "power_baseline"
        | "power_extras"
        | "gas_required"
        | "gas_supplier"
        | "wristband_max"
        | "wristband_black_partout"
        | "wristband_normal_partout"
      >
    > & {
      details?: ConceptDetails;
    },
  ) => {
    const { error } = await supabase
      .from("festival_concepts")
      .update(patch as any)
      .eq("id", concept.id);
    if (error) {
      toast.error("Save failed");
      return;
    }
    qc.invalidateQueries({ queryKey: ["festival_concepts", festivalId] });
    // Reconcile against the post-update concept shape
    await reconcile({ ...concept, ...patch } as Concept);
  };

  const updateDetails = (patch: Partial<ConceptDetails>) =>
    update({ details: { ...details, ...patch } });

  const powerExtras: PowerExtra[] = Array.isArray(concept.power_extras)
    ? concept.power_extras
    : [];

  const wristbandSum =
    (concept.wristband_black_partout ?? 0) +
    (concept.wristband_normal_partout ?? 0);
  const wristbandWarning =
    concept.wristband_max != null &&
    concept.wristband_max > 0 &&
    wristbandSum !== concept.wristband_max;

  return (
    <Card className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Utensils className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <EditableField
            value={concept.name}
            onChange={(v) => update({ name: v || concept.name })}
            className={`text-sm font-semibold ${
              !concept.name?.trim() ? "border-destructive/60" : ""
            }`}
          />
        </div>
      </div>

      {/* Menu */}
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Menu</Label>
        <Textarea
          value={details.menu ?? ""}
          onChange={(e) => updateDetails({ menu: e.target.value })}
          placeholder="Describe the menu for this concept…"
          className={`min-h-[80px] text-[13px] ${
            !details.menu?.trim() ? "border-destructive/60" : ""
          }`}
        />
      </div>

      {/* Numeric / text fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Ordered electricity
          </Label>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <EditableField
              type="number"
              value={details.power_amps ?? ""}
              onChange={(v) => updateDetails({ power_amps: v })}
              placeholder="Amount"
              className={
                !details.power_amps || details.power_amps === "0"
                  ? "border-destructive/60"
                  : ""
              }
            />
            <EditableField
              value={details.power_unit ?? concept.power_baseline ?? ""}
              onChange={(v) =>
                updateDetails({ power_unit: v }) ||
                update({ power_baseline: v || null })
              }
              placeholder="Unit (A/kW)"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Tent size</Label>
          <EditableField
            value={concept.tent_size ?? ""}
            onChange={(v) => update({ tent_size: v || null })}
            placeholder="e.g. 6x4m"
            className={!concept.tent_size?.trim() ? "border-destructive/60" : ""}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Sink (from contract)
          </Label>
          <Select
            value={details.sink_status ?? "unknown"}
            onValueChange={(v) =>
              updateDetails({ sink_status: v as ConceptDetails["sink_status"] })
            }
          >
            <SelectTrigger
              className={`h-8 text-[13px] ${
                !details.sink_status || details.sink_status === "unknown"
                  ? "border-destructive/60"
                  : ""
              }`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="not_ordered">Not ordered</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">POS</Label>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <EditableField
              type="number"
              value={details.pos_count ?? ""}
              onChange={(v) => updateDetails({ pos_count: v })}
              placeholder="#"
            />
            <Select
              value={details.pos_status ?? "not_ordered"}
              onValueChange={(v) =>
                updateDetails({ pos_status: v as ConceptDetails["pos_status"] })
              }
            >
              <SelectTrigger
                className={`h-8 text-[13px] ${
                  !details.pos_status ? "border-destructive/60" : ""
                }`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="not_ordered">Not ordered</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Wristbands */}
      <div className="space-y-2">
        <Label className="text-[11px] text-muted-foreground">Wristbands</Label>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Max</Label>
            <EditableField
              type="number"
              value={concept.wristband_max?.toString() ?? ""}
              onChange={(v) => update({ wristband_max: v ? Number(v) : null })}
              placeholder="0"
              className={
                !concept.wristband_max || concept.wristband_max === 0
                  ? "border-destructive/60"
                  : ""
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Black partout</Label>
            <EditableField
              type="number"
              value={concept.wristband_black_partout?.toString() ?? ""}
              onChange={(v) =>
                update({ wristband_black_partout: v ? Number(v) : null })
              }
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Normal partout</Label>
            <EditableField
              type="number"
              value={concept.wristband_normal_partout?.toString() ?? ""}
              onChange={(v) =>
                update({ wristband_normal_partout: v ? Number(v) : null })
              }
              placeholder="0"
            />
          </div>
        </div>
        {wristbandWarning && (
          <p className="text-[11px] text-muted-foreground">
            ⚠ Black + Normal ({wristbandSum}) doesn't match Max ({concept.wristband_max}).
          </p>
        )}
      </div>

      {/* Gas */}
      <div className="space-y-2 rounded-lg border border-border/60 p-3">
        <div className="flex items-center justify-between">
          <Label className="text-[12px] font-medium">Gas required</Label>
          <Switch
            checked={concept.gas_required}
            onCheckedChange={(v) => update({ gas_required: v === true })}
          />
        </div>
        {concept.gas_required && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Gas supplier
            </Label>
            <EditableField
              value={concept.gas_supplier ?? ""}
              onChange={(v) => update({ gas_supplier: v || null })}
              placeholder="e.g. Ronny VVS"
              className={
                !concept.gas_supplier?.trim() ? "border-destructive/60" : ""
              }
            />
          </div>
        )}
      </div>

      {/* Power extras */}
      <PowerExtrasEditor
        value={powerExtras}
        onChange={(next) => update({ power_extras: next })}
      />

      {/* Equipment items */}
      <div className="space-y-2">
        <Label className="text-[11px] text-muted-foreground">Equipment</Label>
        <div className="rounded-lg border border-border/60">
          {EQUIPMENT_ITEMS.map((item, i) => (
            <EquipmentRow
              key={item.key}
              festivalId={festivalId}
              conceptName={concept.name}
              itemKey={item.key}
              label={item.label}
              divider={i < EQUIPMENT_ITEMS.length - 1}
              onChanged={() => reconcile(concept)}
            />
          ))}
        </div>
      </div>

      {/* Brain suggestions for this concept */}
      <BrainSuggestions
        entries={brainEntries}
        onPromote={() => {
          /* Concepts card has no add-form yet — promotion is read-only here */
        }}
        title={`Brain suggestions — ${concept.name}`}
        subtitle="Contacts and notes the AI captured for this festival. Cross-reference while planning this concept."
      />

      {/* Uploads */}
      <CardUploadZone
        festivalId={festivalId}
        cardName={cardOriginFor(concept.name)}
        title={`${concept.name} — documents`}
        subtitle="Contracts, menu cards, equipment lists, photos."
      />
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────
// Power Extras editor
// ───────────────────────────────────────────────────────────────

function PowerExtrasEditor({
  value,
  onChange,
}: {
  value: PowerExtra[];
  onChange: (next: PowerExtra[]) => void;
}) {
  const addRow = () => {
    const next: PowerExtra = {
      id: crypto.randomUUID(),
      amps: 0,
      count: 1,
      phase: 1,
      label: "",
      voltage: 230,
    };
    onChange([...(value ?? []), next]);
  };

  const updateRow = (id: string, patch: Partial<PowerExtra>) => {
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    onChange(value.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-muted-foreground" />
        <Label className="text-[11px] text-muted-foreground">Power extras</Label>
      </div>

      {value.length === 0 ? (
        <button
          type="button"
          onClick={addRow}
          className="w-full rounded-lg border border-dashed border-border/60 py-3 text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors"
        >
          <Plus className="h-3.5 w-3.5 inline mr-1" /> No power extras — add one
        </button>
      ) : (
        <div className="space-y-2">
          {value.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[80px_60px_70px_1fr_32px] items-center gap-2 rounded-lg border border-border/60 p-2"
            >
              <EditableField
                type="number"
                value={String(row.amps ?? "")}
                onChange={(v) => updateRow(row.id, { amps: Number(v) || 0 })}
                placeholder="Amps"
                className={
                  !row.amps || row.amps === 0 ? "border-destructive/60" : ""
                }
              />
              <EditableField
                type="number"
                value={String(row.count ?? "")}
                onChange={(v) => updateRow(row.id, { count: Number(v) || 0 })}
                placeholder="Count"
                className={
                  !row.count || row.count === 0 ? "border-destructive/60" : ""
                }
              />
              <Select
                value={String(row.phase ?? 1)}
                onValueChange={(v) =>
                  updateRow(row.id, { phase: (Number(v) as 1 | 3) ?? 1 })
                }
              >
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1-phase</SelectItem>
                  <SelectItem value="3">3-phase</SelectItem>
                </SelectContent>
              </Select>
              <EditableField
                value={row.label ?? ""}
                onChange={(v) => updateRow(row.id, { label: v })}
                placeholder="Label (e.g. Fryer, Lights)"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => removeRow(row.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="w-full rounded-lg border border-dashed border-border/60 py-2 text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 inline mr-1" /> Add extra
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// EquipmentRow — reused for all 5 EQUIPMENT_ITEMS
// ───────────────────────────────────────────────────────────────

function EquipmentRow({
  festivalId,
  conceptName,
  itemKey,
  label,
  divider,
  onChanged,
}: {
  festivalId: string;
  conceptName: string;
  itemKey: string;
  label: string;
  divider: boolean;
  onChanged?: () => void;
}) {
  const cardOrigin = cardOriginFor(conceptName);

  const { data } = useQuery({
    queryKey: ["equipment_db", festivalId, cardOrigin, itemKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_db")
        .select("id, source, status")
        .eq("festival_id", festivalId)
        .eq("card_origin", cardOrigin)
        .eq("item_name", label)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const qc = useQueryClient();
  const source = (data?.source ?? null) as BySource | null;
  const status = data?.status ?? "pending";
  const noSource = !data?.source;

  const updateStatus = async (next: string) => {
    if (!data?.id) {
      const { error } = await supabase.from("equipment_db").insert({
        festival_id: festivalId,
        item_name: label,
        card_origin: cardOrigin,
        source: "by_festival",
        status: next as any,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("equipment_db")
        .update({ status: next as any })
        .eq("id", data.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    qc.invalidateQueries({
      queryKey: ["equipment_db", festivalId, cardOrigin, itemKey],
    });
    qc.invalidateQueries({ queryKey: ["equipment_db", festivalId, cardOrigin] });
    qc.invalidateQueries({ queryKey: ["equipment_db", festivalId] });
    onChanged?.();
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 ${
        divider ? "border-b border-border/60" : ""
      }`}
    >
      <div className="flex-1 text-[13px]">{label}</div>
      <BySourceDropdown
        value={(source ?? "by_festival") as BySource}
        onChange={() => {
          qc.invalidateQueries({
            queryKey: ["equipment_db", festivalId, cardOrigin, itemKey],
          });
          qc.invalidateQueries({
            queryKey: ["equipment_db", festivalId, cardOrigin],
          });
          onChanged?.();
        }}
        festivalId={festivalId}
        itemName={label}
        cardOrigin={cardOrigin}
        className={`h-8 w-[150px] text-xs ${
          noSource ? "border-destructive/60" : ""
        }`}
      />
      <Select value={status} onValueChange={updateStatus}>
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="confirmed">Confirmed</SelectItem>
          <SelectItem value="delivered">Delivered</SelectItem>
          <SelectItem value="returned">Returned</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default ConceptsCard;
