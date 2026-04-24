import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Box, Droplet, Info, Plus, Snowflake, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  CardUploadZone,
  BySourceDropdown,
  MissingFlag,
  type BySource,
} from "./shared";

interface Props {
  festivalId: string;
}

const CARD_ORIGIN = "cooling_storage";

type EquipmentRow = {
  id: string;
  festival_id: string;
  item_name: string;
  source: BySource;
  status: "pending" | "confirmed" | "delivered" | "returned";
  quantity: string | null;
  card_origin: string | null;
  notes: string | null; // we use this as a section marker: "cooling" | "storage" | "oil"
};

type SectionKey = "cooling" | "storage" | "oil";

export function CoolingStorageCard({ festivalId }: Props) {
  // Brain context (cooling + storage notes)
  const { data: brain = [] } = useQuery({
    queryKey: ["brain_cooling_storage", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("id, content, category, scope, festival_id")
        .in("category", ["cooling", "storage"])
        .or(`festival_id.eq.${festivalId},scope.eq.global`);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      {brain.length > 0 && (
        <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-primary" />
            <span className="text-[12px] font-medium">
              Cooling & storage notes from Brain
            </span>
          </div>
          <div className="space-y-2">
            {brain.map((b: any) => (
              <div key={b.id} className="text-[12px]">
                <div className="text-[11px] uppercase text-muted-foreground tracking-wide">
                  {b.category}
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {b.content}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <SectionList
        festivalId={festivalId}
        sectionKey="cooling"
        title="Cooling units"
        icon={<Snowflake className="h-4 w-4 text-muted-foreground" />}
        showItemName
      />
      <SectionList
        festivalId={festivalId}
        sectionKey="storage"
        title="Storage containers"
        icon={<Box className="h-4 w-4 text-muted-foreground" />}
        showItemName
      />
      <SectionList
        festivalId={festivalId}
        sectionKey="oil"
        title="Oil barrels"
        icon={<Droplet className="h-4 w-4 text-muted-foreground" />}
        showItemName={false}
        defaultItemName="Oil barrel"
      />

      <CardUploadZone
        festivalId={festivalId}
        cardName="cooling_storage"
        title="Cooling & storage documents"
        subtitle="Delivery notes, rental contracts, photos."
      />
    </div>
  );
}

function SectionList({
  festivalId,
  sectionKey,
  title,
  icon,
  showItemName,
  defaultItemName,
}: {
  festivalId: string;
  sectionKey: SectionKey;
  title: string;
  icon: React.ReactNode;
  showItemName: boolean;
  defaultItemName?: string;
}) {
  const qc = useQueryClient();

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["cooling_storage_lines", festivalId, sectionKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_db")
        .select("*")
        .eq("festival_id", festivalId)
        .eq("card_origin", CARD_ORIGIN)
        .eq("notes", sectionKey)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as EquipmentRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: ["cooling_storage_lines", festivalId, sectionKey],
    });
    qc.invalidateQueries({ queryKey: ["equipment_db", festivalId] });
  };

  const isPlaceholder = (n: string) => n.startsWith(`__${sectionKey}_new_`);

  const addLine = async () => {
    const placeholder = defaultItemName
      ? `${defaultItemName} ${Date.now().toString(36).slice(-4)}`
      : `__${sectionKey}_new_${Date.now().toString(36).slice(-4)}`;
    const { error } = await supabase.from("equipment_db").insert({
      festival_id: festivalId,
      item_name: placeholder,
      card_origin: CARD_ORIGIN,
      notes: sectionKey,
      source: "by_festival",
      status: "pending",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  };

  const updateLine = async (id: string, patch: Partial<EquipmentRow>) => {
    const { error } = await supabase
      .from("equipment_db")
      .update(patch as any)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  };

  const deleteLine = async (id: string) => {
    const { error } = await supabase.from("equipment_db").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-[11px] text-muted-foreground">
            ({lines.length})
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={addLine} className="h-7">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add line
        </Button>
      </div>

      {isLoading ? (
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      ) : lines.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-[12px] text-muted-foreground">
          No items yet. Click <strong>Add line</strong> to start.
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 divide-y divide-border/60">
          {lines.map((line) => {
            const itemEmpty = showItemName
              ? !line.item_name?.trim() || isPlaceholder(line.item_name)
              : false;
            const qtyEmpty = !line.quantity?.trim();
            const missing = itemEmpty || qtyEmpty;
            const displayName = showItemName
              ? isPlaceholder(line.item_name)
                ? ""
                : line.item_name
              : line.item_name;

            return (
              <div key={line.id} className="p-3 space-y-2">
                <div
                  className={`grid gap-2 items-end ${
                    showItemName
                      ? "grid-cols-[1fr_120px_auto_auto]"
                      : "grid-cols-[1fr_auto_auto]"
                  }`}
                >
                  {showItemName && (
                    <CommitInput
                      value={
                        isPlaceholder(line.item_name) ? "" : line.item_name
                      }
                      onCommit={(v) =>
                        updateLine(line.id, {
                          item_name: v.trim() || line.item_name,
                        })
                      }
                      placeholder="Item name"
                      invalid={itemEmpty}
                    />
                  )}
                  <CommitInput
                    value={line.quantity ?? ""}
                    onCommit={(v) =>
                      updateLine(line.id, { quantity: v || null })
                    }
                    placeholder="Qty"
                    invalid={qtyEmpty}
                  />
                  <BySourceDropdown
                    value={line.source}
                    onChange={(next) => updateLine(line.id, { source: next })}
                    festivalId={festivalId}
                    itemName={displayName || ""}
                    cardOrigin={CARD_ORIGIN}
                    quantity={line.quantity ?? undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteLine(line.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {missing && (
                  <MissingFlag
                    isMissing
                    label={
                      displayName?.trim()
                        ? `${displayName} — ${title}`
                        : `${title} — incomplete line`
                    }
                    festivalId={festivalId}
                    cardOrigin={CARD_ORIGIN}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function CommitInput({
  value,
  onCommit,
  placeholder,
  invalid,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={placeholder}
      className={`h-8 text-[13px] ${invalid ? "border-destructive/60" : ""}`}
    />
  );
}

export default CoolingStorageCard;
