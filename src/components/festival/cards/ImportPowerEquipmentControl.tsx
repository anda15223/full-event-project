import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Source = {
  festivalId: string;
  festivalName: string;
  powerId: string;
  rowCount: number;
};

interface Props {
  /** Current festival id (excluded from the source list). */
  currentFestivalId: string;
  /** Concept slug — we only import equipment from the same concept (Fish & Chips → Fish & Chips). */
  conceptSlug: string;
  /** Target festival_power.id rows will be inserted into. */
  targetPowerId: string;
  /** Refresh callback after rows change. */
  onImported: () => void;
}

/**
 * Copy the powered-equipment list from the same concept at another festival
 * into this card. Choose Append (keep existing) or Replace (clear first).
 * Imported rows are fully editable afterwards.
 */
export function ImportPowerEquipmentControl({
  currentFestivalId, conceptSlug, targetPowerId, onImported,
}: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      // 1) Concept id from slug
      const { data: concept } = await supabase
        .from("concepts").select("id").eq("slug", conceptSlug).maybeSingle();
      if (!concept) { setSources([]); setLoading(false); return; }

      // 2) All contracts (any festival except current) for this concept
      const { data: contracts } = await supabase
        .from("festival_contracts")
        .select("id, festival_id, festivals!festival_id(id,name,start_date)")
        .eq("concept_id", concept.id).eq("is_active", true)
        .neq("festival_id", currentFestivalId);
      const list = (contracts ?? []) as any[];
      if (list.length === 0) { setSources([]); setLoading(false); return; }

      // 3) Power rows for those contracts
      const cIds = list.map((c) => c.id);
      const { data: powers } = await supabase
        .from("festival_power").select("id, festival_contract_id").in("festival_contract_id", cIds);
      const powerList = (powers ?? []) as any[];
      const powerIds = powerList.map((p) => p.id);
      if (powerIds.length === 0) { setSources([]); setLoading(false); return; }

      // 4) Count equipment per power
      const { data: eq } = await supabase
        .from("festival_power_equipment")
        .select("festival_power_id").in("festival_power_id", powerIds);
      const countByPower = new Map<string, number>();
      (eq ?? []).forEach((r: any) => {
        countByPower.set(r.festival_power_id, (countByPower.get(r.festival_power_id) ?? 0) + 1);
      });

      const out: Source[] = powerList
        .map((p) => {
          const contract = list.find((c) => c.id === p.festival_contract_id);
          const fest = contract?.festivals;
          const count = countByPower.get(p.id) ?? 0;
          if (!fest || count === 0) return null;
          return {
            festivalId: fest.id, festivalName: fest.name,
            powerId: p.id, rowCount: count,
          } as Source;
        })
        .filter(Boolean) as Source[];

      out.sort((a, b) => a.festivalName.localeCompare(b.festivalName));
      if (!cancel) { setSources(out); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [currentFestivalId, conceptSlug]);

  async function handleImport() {
    if (!sourceId) return;
    const src = sources.find((s) => s.powerId === sourceId);
    if (!src) return;
    setBusy(true);
    try {
      // Fetch source rows in full
      const { data: rows, error: fetchErr } = await supabase
        .from("festival_power_equipment").select("*")
        .eq("festival_power_id", src.powerId);
      if (fetchErr) throw fetchErr;
      const sourceRows = (rows ?? []) as any[];
      if (sourceRows.length === 0) {
        toast.info("No equipment rows on source");
        return;
      }

      if (mode === "replace") {
        const { error: delErr } = await supabase
          .from("festival_power_equipment").delete().eq("festival_power_id", targetPowerId);
        if (delErr) throw delErr;
      }

      // Strip identifiers/timestamps & retarget
      const inserts = sourceRows.map(({ id, created_at, updated_at, festival_power_id, ...rest }) => ({
        ...rest,
        festival_power_id: targetPowerId,
      }));
      const { error: insErr } = await supabase
        .from("festival_power_equipment").insert(inserts);
      if (insErr) throw insErr;

      toast.success(`Imported ${inserts.length} item${inserts.length === 1 ? "" : "s"} from ${src.festivalName}`);
      onImported();
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking other festivals…
      </div>
    );
  }
  if (sources.length === 0) return null;

  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-2 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
        <Download className="h-3 w-3" /> Import equipment from
      </div>
      <Select value={sourceId} onValueChange={setSourceId}>
        <SelectTrigger className="h-7 text-xs w-[200px]">
          <SelectValue placeholder="Pick festival…" />
        </SelectTrigger>
        <SelectContent>
          {sources.map((s) => (
            <SelectItem key={s.powerId} value={s.powerId} className="text-xs">
              {s.festivalName} ({s.rowCount})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={mode} onValueChange={(v) => setMode(v as "append" | "replace")}>
        <SelectTrigger className="h-7 text-xs w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="append" className="text-xs">Append</SelectItem>
          <SelectItem value="replace" className="text-xs">Replace</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" className="h-7 text-xs"
        disabled={!sourceId || busy} onClick={handleImport}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Import"}
      </Button>
    </div>
  );
}
