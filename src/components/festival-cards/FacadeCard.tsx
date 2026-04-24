import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Info, Loader2, Plus, Trash2 } from "lucide-react";
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

const DEFAULT_CONCEPTS = [
  "Fish & Chips / The Fish Project",
  "Gyros by Gaia",
  "La Creperie",
  "Chicks 'n' Buns",
];

type EquipmentRow = {
  id: string;
  festival_id: string;
  item_name: string;
  source: BySource;
  status: "pending" | "confirmed" | "delivered" | "returned";
  quantity: string | null;
  card_origin: string | null;
  notes: string | null;
};

type Concept = { id: string; name: string; order_index: number };

function cardOriginFor(conceptName: string) {
  return `facade:${conceptName}`;
}

export function FacadeCard({ festivalId }: Props) {
  const qc = useQueryClient();

  // Concepts (re-uses festival_concepts seeded by ConceptsCard, but seeds defaults if empty)
  const { data: concepts, isLoading } = useQuery({
    queryKey: ["festival_concepts_min", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_concepts")
        .select("id, name, order_index")
        .eq("festival_id", festivalId)
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as Concept[];
    },
  });

  useEffect(() => {
    if (!concepts || concepts.length > 0) return;
    (async () => {
      const rows = DEFAULT_CONCEPTS.map((name, i) => ({
        festival_id: festivalId,
        name,
        zone: "main",
        order_index: i,
        details: {},
      }));
      const { error } = await supabase.from("festival_concepts").insert(rows);
      if (error) {
        toast.error(`Could not seed concepts: ${error.message}`);
        return;
      }
      qc.invalidateQueries({ queryKey: ["festival_concepts_min", festivalId] });
      qc.invalidateQueries({ queryKey: ["festival_concepts", festivalId] });
    })();
  }, [concepts, festivalId, qc]);

  // Facade restrictions from brain_entries (festival-scoped first, fall back to global)
  const { data: restrictions } = useQuery({
    queryKey: ["facade_restrictions", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("id, content, scope, festival_id, display_name")
        .eq("category", "facade_restrictions")
        .or(`festival_id.eq.${festivalId},scope.eq.global`)
        .order("scope", { ascending: false }); // 'global' before 'festival' alphabetically — fine either way
      if (error) throw error;
      // Prefer festival-scoped entry if present
      const list = data ?? [];
      const festivalEntry = list.find((r: any) => r.festival_id === festivalId);
      return festivalEntry ?? list[0] ?? null;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading facade data…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {(concepts ?? []).map((c) => (
        <FacadeSubCard
          key={c.id}
          conceptName={c.name}
          festivalId={festivalId}
          restrictions={restrictions}
        />
      ))}
    </div>
  );
}

function FacadeSubCard({
  conceptName,
  festivalId,
  restrictions,
}: {
  conceptName: string;
  festivalId: string;
  restrictions: any;
}) {
  const qc = useQueryClient();
  const cardOrigin = cardOriginFor(conceptName);

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["facade_lines", festivalId, conceptName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_db")
        .select("*")
        .eq("festival_id", festivalId)
        .eq("card_origin", cardOrigin)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as EquipmentRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["facade_lines", festivalId, conceptName] });
    qc.invalidateQueries({ queryKey: ["equipment_db", festivalId] });
  };

  const addLine = async () => {
    // Use a unique placeholder so the UNIQUE (festival_id, item_name, card_origin) doesn't collide
    const placeholder = `New facade item ${Date.now().toString(36).slice(-4)}`;
    const { error } = await supabase.from("equipment_db").insert({
      festival_id: festivalId,
      item_name: placeholder,
      card_origin: cardOrigin,
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

  const isPlaceholder = (name: string) => name.startsWith("New facade item ");

  return (
    <Card className="p-5 space-y-4">
      {/* Header: concept + facade restrictions */}
      <div className="flex items-start gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{conceptName}</h3>
          <p className="text-[11px] text-muted-foreground">Facade equipment</p>
        </div>
      </div>

      {restrictions ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Info className="h-3.5 w-3.5 text-primary" />
            <span className="text-[12px] font-medium">
              Festival facade restrictions
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground whitespace-pre-wrap">
            {restrictions.content}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 p-3 text-[12px] text-muted-foreground">
          No facade restrictions saved to Brain yet (category{" "}
          <code className="text-[11px]">facade_restrictions</code>).
        </div>
      )}

      {/* Lines */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground">
            Facade equipment lines
          </Label>
          <Button size="sm" variant="outline" onClick={addLine} className="h-7">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add line
          </Button>
        </div>

        {isLoading ? (
          <div className="text-[12px] text-muted-foreground">Loading…</div>
        ) : lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-[12px] text-muted-foreground">
            No facade items yet. Click <strong>Add line</strong> to start.
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 divide-y divide-border/60">
            {lines.map((line) => {
              const missing = !line.item_name?.trim() || isPlaceholder(line.item_name);
              return (
                <div key={line.id} className="p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_120px_auto_auto] gap-2 items-end">
                    <FacadeItemInput
                      value={isPlaceholder(line.item_name) ? "" : line.item_name}
                      onCommit={(v) =>
                        updateLine(line.id, {
                          item_name: v.trim() || line.item_name,
                        })
                      }
                    />
                    <FacadeQtyInput
                      value={line.quantity ?? ""}
                      onCommit={(v) =>
                        updateLine(line.id, { quantity: v || null })
                      }
                    />
                    <BySourceDropdown
                      value={line.source}
                      onChange={(next) =>
                        updateLine(line.id, { source: next })
                      }
                      festivalId={festivalId}
                      itemName={
                        isPlaceholder(line.item_name) ? "" : line.item_name
                      }
                      cardOrigin={cardOrigin}
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
                        isPlaceholder(line.item_name)
                          ? `Facade item — ${conceptName}`
                          : line.item_name
                      }
                      festivalId={festivalId}
                      cardOrigin={cardOrigin}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Uploads */}
      <CardUploadZone
        festivalId={festivalId}
        cardName={`facade:${conceptName}`}
        title={`${conceptName} — facade documents`}
        subtitle="Sketches, festival facade rules, photos."
      />
    </Card>
  );
}

function FacadeItemInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const empty = !v.trim();
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder="Item name"
      className={`h-8 text-[13px] ${empty ? "border-destructive/60" : ""}`}
    />
  );
}

function FacadeQtyInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
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
      placeholder="Qty"
      className="h-8 text-[13px]"
    />
  );
}

export default FacadeCard;
