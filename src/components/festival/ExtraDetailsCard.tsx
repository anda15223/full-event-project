import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, ListPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Detail = {
  id: string;
  festival_id: string;
  label: string;
  value: string | null;
  notes: string | null;
  order_index: number;
};

function useExtraDetails(festivalId: string) {
  return useQuery({
    queryKey: ["festival_extra_details", festivalId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("festival_extra_details")
        .select("*")
        .eq("festival_id", festivalId)
        .order("order_index");
      if (error) throw error;
      return (data || []) as Detail[];
    },
  });
}

function DetailRow({
  detail,
  onChange,
  onDelete,
}: {
  detail: Detail;
  onChange: (patch: Partial<Detail>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(detail);
  useEffect(() => setLocal(detail), [detail.id]);

  const debounced = (() => {
    let timers: Record<string, ReturnType<typeof setTimeout>> = {};
    return (field: keyof Detail, value: any) => {
      setLocal((p) => ({ ...p, [field]: value }));
      if (timers[field]) clearTimeout(timers[field]);
      timers[field] = setTimeout(() => onChange({ [field]: value }), 400);
    };
  })();

  return (
    <div className="grid grid-cols-[1fr_1.5fr_1fr_28px] gap-1.5 items-center">
      <Input
        value={local.label}
        onChange={(e) => debounced("label", e.target.value)}
        className="h-8 text-[12px] font-medium"
        placeholder="Label"
      />
      <Input
        value={local.value ?? ""}
        onChange={(e) => debounced("value", e.target.value)}
        className="h-8 text-[12px]"
        placeholder="Value"
      />
      <Input
        value={local.notes ?? ""}
        onChange={(e) => debounced("notes", e.target.value)}
        className="h-8 text-[11px] text-muted-foreground"
        placeholder="Notes"
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function ExtraDetailsCard({ festivalId }: { festivalId: string }) {
  const qc = useQueryClient();
  const { data: details = [], isLoading } = useExtraDetails(festivalId);
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["festival_extra_details", festivalId] });

  const addLine = async () => {
    const nextOrder = details.length
      ? Math.max(...details.map((d) => d.order_index)) + 1
      : 0;
    const { error } = await (supabase as any).from("festival_extra_details").insert({
      festival_id: festivalId,
      label: "",
      value: "",
      notes: null,
      order_index: nextOrder,
    });
    if (error) { toast.error("Could not add line"); return; }
    invalidate();
  };

  const update = async (id: string, patch: Partial<Detail>) => {
    const { error } = await (supabase as any)
      .from("festival_extra_details")
      .update(patch)
      .eq("id", id);
    if (error) { toast.error("Save failed"); return; }
    invalidate();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any)
      .from("festival_extra_details")
      .delete()
      .eq("id", id);
    if (error) { toast.error("Delete failed"); return; }
    invalidate();
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold flex items-center gap-1.5">
            <ListPlus className="h-4 w-4 text-muted-foreground" />
            Extra details
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Free-form lines for anything that doesn't fit elsewhere.
          </p>
        </div>
        <Button size="sm" onClick={addLine} className="h-8">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add line
        </Button>
      </div>

      {isLoading ? (
        <p className="text-[12px] text-muted-foreground">Loading…</p>
      ) : details.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-5 text-center">
          <p className="text-[12px] text-muted-foreground">
            No extra details yet. Click <strong>Add line</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_1.5fr_1fr_28px] gap-1.5 px-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Label</Label>
            <Label className="text-[10px] uppercase text-muted-foreground">Value</Label>
            <Label className="text-[10px] uppercase text-muted-foreground">Notes</Label>
            <span />
          </div>
          {details.map((d) => (
            <DetailRow
              key={d.id}
              detail={d}
              onChange={(patch) => update(d.id, patch)}
              onDelete={() => remove(d.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
