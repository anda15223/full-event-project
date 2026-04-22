import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFestival, useConcepts } from "@/hooks/useFestival";

type PowerExtra = { amperage?: string; count?: number; phase?: string; notes?: string };

function ConceptCard({ concept, onChanged }: { concept: any; onChanged: () => void }) {
  const [local, setLocal] = useState<any>(concept);

  useEffect(() => setLocal(concept), [concept.id, concept.updated_at]);

  const save = async (patch: Record<string, any>) => {
    setLocal((p: any) => ({ ...p, ...patch }));
    const { error } = await (supabase as any)
      .from("festival_concepts")
      .update(patch)
      .eq("id", concept.id);
    if (error) { toast.error("Save failed"); return; }
    onChanged();
  };

  // Debounced text save
  const debouncedSave = (() => {
    let timers: Record<string, ReturnType<typeof setTimeout>> = {};
    return (field: string, value: any) => {
      setLocal((p: any) => ({ ...p, [field]: value }));
      if (timers[field]) clearTimeout(timers[field]);
      timers[field] = setTimeout(() => save({ [field]: value }), 500);
    };
  })();

  const extras: PowerExtra[] = Array.isArray(local.power_extras) ? local.power_extras : [];

  const setExtras = (next: PowerExtra[]) => save({ power_extras: next });
  const addExtra = () => setExtras([...extras, { amperage: "", count: 1, phase: "", notes: "" }]);
  const updateExtra = (idx: number, patch: Partial<PowerExtra>) => {
    const next = extras.map((e, i) => i === idx ? { ...e, ...patch } : e);
    setExtras(next);
  };
  const removeExtra = (idx: number) => setExtras(extras.filter((_, i) => i !== idx));

  const remove = async () => {
    if (!confirm(`Delete concept "${concept.name}"?`)) return;
    const { error } = await supabase.from("festival_concepts").delete().eq("id", concept.id);
    if (error) { toast.error("Delete failed"); return; }
    toast.success("Concept removed");
    onChanged();
  };

  return (
    <Card className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <Input
            value={local.name ?? ""}
            onChange={(e) => debouncedSave("name", e.target.value)}
            className="h-9 text-[15px] font-semibold"
            placeholder="Concept name"
          />
          <Input
            value={local.tent_size ?? ""}
            onChange={(e) => debouncedSave("tent_size", e.target.value)}
            className="h-7 text-[12px] text-muted-foreground"
            placeholder="Tent size (e.g. 6×9)"
          />
        </div>
        <div className="flex flex-col items-end gap-2">
          <Select value={local.zone ?? "INSIDE"} onValueChange={(v) => save({ zone: v })}>
            <SelectTrigger className="h-8 w-[110px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="INSIDE">INSIDE</SelectItem>
              <SelectItem value="OUTSIDE">OUTSIDE</SelectItem>
              <SelectItem value="VIP">VIP</SelectItem>
              <SelectItem value="BACKSTAGE">BACKSTAGE</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Products */}
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Products sold</Label>
        <Textarea
          value={local.products_sold ?? ""}
          onChange={(e) => debouncedSave("products_sold", e.target.value)}
          rows={2}
          className="text-[12px]"
          placeholder="What's on the menu…"
        />
      </div>

      {/* Sales hours */}
      <div className="space-y-2">
        <Label className="text-[11px] text-muted-foreground">Sales hours</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["thu", "fri", "sat", "sun"] as const).map((d) => (
            <div key={d} className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground uppercase">{d}</span>
              <Input
                value={local[`sales_hours_${d}`] ?? ""}
                onChange={(e) => debouncedSave(`sales_hours_${d}`, e.target.value)}
                className="h-8 text-[12px]"
                placeholder="—"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Power + gas */}
      <div className="border-t border-border/50 pt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <Label className="text-[11px] text-muted-foreground">Power baseline</Label>
            <Input
              value={local.power_baseline ?? ""}
              onChange={(e) => debouncedSave("power_baseline", e.target.value)}
              className="h-8 text-[12px]"
              placeholder="e.g. 63A"
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[11px] text-muted-foreground">Gas required</Label>
            <div className="flex items-center gap-2 h-8">
              <Switch checked={!!local.gas_required} onCheckedChange={(v) => save({ gas_required: v })} />
              <Input
                value={local.gas_supplier ?? ""}
                onChange={(e) => debouncedSave("gas_supplier", e.target.value)}
                className="h-7 text-[12px] flex-1"
                placeholder="Supplier"
                disabled={!local.gas_required}
              />
            </div>
          </div>
        </div>

        {/* Wristbands */}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-0.5">
            <Label className="text-[11px] text-muted-foreground">Wristband max</Label>
            <Input
              type="number"
              value={local.wristband_max ?? ""}
              onChange={(e) => debouncedSave("wristband_max", e.target.value === "" ? null : Number(e.target.value))}
              className="h-8 text-[12px]"
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[11px] text-muted-foreground">Black partout</Label>
            <Input
              type="number"
              value={local.wristband_black_partout ?? ""}
              onChange={(e) => debouncedSave("wristband_black_partout", e.target.value === "" ? null : Number(e.target.value))}
              className="h-8 text-[12px]"
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[11px] text-muted-foreground">Normal partout</Label>
            <Input
              type="number"
              value={local.wristband_normal_partout ?? ""}
              onChange={(e) => debouncedSave("wristband_normal_partout", e.target.value === "" ? null : Number(e.target.value))}
              className="h-8 text-[12px]"
            />
          </div>
        </div>
      </div>

      {/* Power extras */}
      <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Zap className="h-3 w-3" /> Power extras
          </p>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={addExtra}>
            <Plus className="h-3 w-3 mr-0.5" /> Add
          </Button>
        </div>
        {extras.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">None</p>
        ) : (
          <div className="space-y-1.5">
            {extras.map((p, i) => (
              <div key={i} className="grid grid-cols-[80px_60px_70px_1fr_28px] gap-1.5 items-center">
                <Input
                  value={p.amperage ?? ""}
                  onChange={(e) => updateExtra(i, { amperage: e.target.value })}
                  className="h-7 text-[11px]"
                  placeholder="16A"
                />
                <Input
                  type="number"
                  value={p.count ?? ""}
                  onChange={(e) => updateExtra(i, { count: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="h-7 text-[11px]"
                  placeholder="×"
                />
                <Input
                  value={p.phase ?? ""}
                  onChange={(e) => updateExtra(i, { phase: e.target.value })}
                  className="h-7 text-[11px]"
                  placeholder="1P/3P"
                />
                <Input
                  value={p.notes ?? ""}
                  onChange={(e) => updateExtra(i, { notes: e.target.value })}
                  className="h-7 text-[11px]"
                  placeholder="Notes"
                />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => removeExtra(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom details lines */}
      {(() => {
        const det: Array<{ label?: string; value?: string; unit?: string }> =
          Array.isArray(local.details) ? local.details : [];
        const setDet = (next: typeof det) => save({ details: next });
        const addDet = () => setDet([...det, { label: "", value: "", unit: "" }]);
        const updDet = (i: number, patch: Partial<typeof det[0]>) =>
          setDet(det.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
        const rmDet = (i: number) => setDet(det.filter((_, idx) => idx !== i));
        return (
          <div className="bg-muted/40 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground">Details</p>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={addDet}>
                <Plus className="h-3 w-3 mr-0.5" /> Add line
              </Button>
            </div>
            {det.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">None</p>
            ) : (
              <div className="space-y-1.5">
                {det.map((d, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1.2fr_70px_28px] gap-1.5 items-center">
                    <Input
                      value={d.label ?? ""}
                      onChange={(e) => updDet(i, { label: e.target.value })}
                      className="h-7 text-[11px]"
                      placeholder="Label (e.g. Fridge)"
                    />
                    <Input
                      value={d.value ?? ""}
                      onChange={(e) => updDet(i, { value: e.target.value })}
                      className="h-7 text-[11px]"
                      placeholder="Value"
                    />
                    <Input
                      value={d.unit ?? ""}
                      onChange={(e) => updDet(i, { unit: e.target.value })}
                      className="h-7 text-[11px]"
                      placeholder="Unit"
                    />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => rmDet(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </Card>
  );
}

export default function ConceptsEditor() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const { data: festival } = useFestival(slug);
  const { data: concepts = [] } = useConcepts(festival?.id);

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["festival_concepts", festival.id] });

  const addConcept = async () => {
    const nextOrder = concepts.length ? Math.max(...concepts.map((c: any) => c.order_index)) + 1 : 0;
    const { error } = await supabase.from("festival_concepts").insert({
      festival_id: festival.id,
      name: "New concept",
      zone: "INSIDE",
      order_index: nextOrder,
      gas_required: false,
      power_extras: [],
    });
    if (error) { toast.error("Could not add concept"); return; }
    invalidate();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Concepts</h1>
          <p className="text-sm text-muted-foreground mt-1">{concepts.length} concepts at {festival.name}</p>
        </div>
        <Button onClick={addConcept} size="sm" className="h-8">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add concept
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {concepts.map((c: any) => (
          <ConceptCard key={c.id} concept={c} onChanged={invalidate} />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Changes autosave (500ms debounce on text/number, instant on toggles/selects).</p>
    </div>
  );
}
