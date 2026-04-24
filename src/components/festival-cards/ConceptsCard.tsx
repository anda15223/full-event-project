import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Utensils } from "lucide-react";
import { toast } from "sonner";
import {
  CardUploadZone,
  EditableField,
  BySourceDropdown,
  type BySource,
} from "./shared";

interface Props {
  festivalId: string;
}

const DEFAULT_CONCEPTS = [
  "Fish & Chips / The Fish Project",
  "Gyros by Gaia",
  "La Creperie",
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

type Concept = {
  id: string;
  festival_id: string;
  name: string;
  zone: string;
  order_index: number;
  tent_size: string | null;
  power_baseline: string | null;
  details: ConceptDetails | any;
};

const EQUIPMENT_ITEMS = [
  { key: "fire_kit", label: "Fire kit" },
  { key: "first_aid_kit", label: "First aid kit" },
  { key: "light_bulbs", label: "Light bulbs" },
] as const;

function cardOriginFor(conceptName: string) {
  return `concepts:${conceptName}`;
}

export function ConceptsCard({ festivalId }: Props) {
  const qc = useQueryClient();

  const { data: concepts, isLoading } = useQuery({
    queryKey: ["festival_concepts", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_concepts")
        .select(
          "id, festival_id, name, zone, order_index, tent_size, power_baseline, details",
        )
        .eq("festival_id", festivalId)
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as Concept[];
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

function ConceptSubCard({
  concept,
  festivalId,
}: {
  concept: Concept;
  festivalId: string;
}) {
  const qc = useQueryClient();
  const details: ConceptDetails = concept.details ?? {};

  const update = async (
    patch: Partial<Pick<Concept, "name" | "tent_size" | "power_baseline">> & {
      details?: ConceptDetails;
    },
  ) => {
    const { error } = await supabase
      .from("festival_concepts")
      .update(patch)
      .eq("id", concept.id);
    if (error) {
      toast.error("Save failed");
      return;
    }
    qc.invalidateQueries({ queryKey: ["festival_concepts", festivalId] });
  };

  const updateDetails = (patch: Partial<ConceptDetails>) =>
    update({ details: { ...details, ...patch } });

  return (
    <Card className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Utensils className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <EditableField
            value={concept.name}
            onChange={(v) => update({ name: v || concept.name })}
            className="text-sm font-semibold"
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
            />
          ))}
        </div>
      </div>

      {/* Uploads */}
      <CardUploadZone
        festivalId={festivalId}
        cardName={`concepts:${concept.name}`}
        title={`${concept.name} — documents`}
        subtitle="Contracts, menu cards, equipment lists, photos."
      />
    </Card>
  );
}

function EquipmentRow({
  festivalId,
  conceptName,
  itemKey,
  label,
  divider,
}: {
  festivalId: string;
  conceptName: string;
  itemKey: string;
  label: string;
  divider: boolean;
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
  const source = (data?.source ?? "by_festival") as BySource;
  const status = data?.status ?? "pending";

  const updateStatus = async (next: string) => {
    if (!data?.id) {
      // create the row first as by_festival with the chosen status
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
    qc.invalidateQueries({ queryKey: ["equipment_db", festivalId] });
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 ${
        divider ? "border-b border-border/60" : ""
      }`}
    >
      <div className="flex-1 text-[13px]">{label}</div>
      <BySourceDropdown
        value={source}
        onChange={() => {
          /* invalidations handled inside the dropdown */
        }}
        festivalId={festivalId}
        itemName={label}
        cardOrigin={cardOrigin}
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
