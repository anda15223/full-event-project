import { useEffect, useState } from "react";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type SourceFestival = { id: string; name: string; start_date: string | null };
type FestivalContractLite = Pick<Tables<"festival_contracts">, "id" | "concept_id">;
type FestivalPowerRow = Tables<"festival_power">;
type FestivalPowerEquipmentInsert = TablesInsert<"festival_power_equipment">;


interface Props {
  currentFestivalId: string;
  onChanged: () => void;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Festival-wide import of full power cards from another festival.
 * Matches concepts by (concept_id + stall order) so duplicate stalls are preserved.
 * Replace mode wipes each matched target power's equipment and order-list items first.
 */
export function PowerImportBar({ currentFestivalId, onChanged }: Props) {
  const [festivals, setFestivals] = useState<SourceFestival[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [mode, setMode] = useState<"append" | "replace">("replace");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("festivals").select("id,name,start_date")
        .neq("id", currentFestivalId)
        .order("start_date", { ascending: false });
      if (!cancel) { setFestivals((data ?? []) as SourceFestival[]); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [currentFestivalId]);

  async function handleImport() {
    if (!sourceId) return;
    setBusy(true);
    try {
      // Load contracts on both sides
      const { data: srcContracts, error: e1 } = await supabase
        .from("festival_contracts")
        .select("id, concept_id, created_at")
        .eq("festival_id", sourceId).eq("is_active", true)
        .order("created_at", { ascending: true });
      if (e1) throw e1;
      const { data: tgtContracts, error: e2 } = await supabase
        .from("festival_contracts")
        .select("id, concept_id, created_at")
        .eq("festival_id", currentFestivalId).eq("is_active", true)
        .order("created_at", { ascending: true });
      if (e2) throw e2;

      // Index contracts by concept_id in creation order -> stall #
      const indexList = (rows: FestivalContractLite[]) => {
        const byConcept = new Map<string, string[]>();
        rows.forEach((r) => {
          if (!r.concept_id) return;
          const arr = byConcept.get(r.concept_id) ?? [];
          arr.push(r.id);
          byConcept.set(r.concept_id, arr);
        });
        return byConcept;
      };
      const srcByConcept = indexList(srcContracts ?? []);
      const tgtByConcept = indexList(tgtContracts ?? []);

      // Pair up matching contracts by (concept, index)
      const pairs: Array<{ srcContractId: string; tgtContractId: string }> = [];
      tgtByConcept.forEach((tgtIds, conceptId) => {
        const srcIds = srcByConcept.get(conceptId) ?? [];
        tgtIds.forEach((tgtId, i) => {
          const srcId = srcIds[i];
          if (srcId) pairs.push({ srcContractId: srcId, tgtContractId: tgtId });
        });
      });

      if (pairs.length === 0) {
        toast.info("No matching concepts to import");
        return;
      }
      const contractIdMap = new Map(pairs.map((p) => [p.srcContractId, p.tgtContractId]));

      // Get full festival_power rows for both sides so the whole card is copied.
      const allContractIds = pairs.flatMap((p) => [p.srcContractId, p.tgtContractId]);
      const { data: powers, error: e3 } = await supabase
        .from("festival_power").select("*")
        .in("festival_contract_id", allContractIds);
      if (e3) throw e3;
      const powerByContract = new Map<string, FestivalPowerRow>();
      (powers ?? []).forEach((p) => powerByContract.set(p.festival_contract_id, p));

      // Build power-id pairs
      const powerPairs = pairs
        .map((p) => ({
          srcPower: powerByContract.get(p.srcContractId),
          tgtPower: powerByContract.get(p.tgtContractId),
        }))
        .filter((p): p is { srcPower: FestivalPowerRow; tgtPower: FestivalPowerRow } => Boolean(p.srcPower && p.tgtPower));

      if (powerPairs.length === 0) {
        toast.info("No power rows found to import from");
        return;
      }

      const srcPowerIds = powerPairs.map((p) => p.srcPower.id as string);
      const tgtPowerIds = powerPairs.map((p) => p.tgtPower.id as string);
      const srcToTgt = new Map(powerPairs.map((p) => [p.srcPower.id as string, p.tgtPower.id as string]));

      const powerCardPatch = (row: FestivalPowerRow): TablesUpdate<"festival_power"> => {
        const {
          id: _id, festival_contract_id: _contractId, created_at: _createdAt, updated_at: _updatedAt,
          // Electricity order data is never imported — it must come from this
          // festival's own order list upload + parse.
          allocated_kw: _allocatedKw,
          connections_125a: _c125, connections_16a_240v: _c16240, connections_16a_400v: _c16400,
          connections_32a: _c32, connections_63a: _c63,
          cost_dkk: _cost, delivery_date: _delivery, pickup_date: _pickup,
          order_list_file_path: _orderFile, order_list_parsed_at: _orderParsed,
          order_reference: _orderRef, ordered_date: _orderedDate,
          parse_summary: _parseSummary, last_parsed_at: _lastParsed,
          status: _status,
          ...rest
        } = row;
        return {
          ...rest,
          shared_tent_with_contracts: row.shared_tent_with_contracts?.map((id) => contractIdMap.get(id) ?? id) ?? null,
        };
      };
      for (const { srcPower, tgtPower } of powerPairs) {
        const { error: upErr } = await supabase
          .from("festival_power")
          .update(powerCardPatch(srcPower))
          .eq("id", tgtPower.id);
        if (upErr) throw upErr;
      }

      // Fetch source equipment
      const { data: eq, error: e4 } = await supabase
        .from("festival_power_equipment").select("*")
        .in("festival_power_id", srcPowerIds);
      if (e4) throw e4;

      if (mode === "replace") {
        const { error: dEqErr } = await supabase
          .from("festival_power_equipment").delete()
          .in("festival_power_id", tgtPowerIds);
        if (dEqErr) throw dEqErr;
      }

      const inserts: FestivalPowerEquipmentInsert[] = (eq ?? []).map(({ id: _id, created_at: _createdAt, updated_at: _updatedAt, festival_power_id, ...rest }) => ({
        ...rest,
        festival_power_id: srcToTgt.get(festival_power_id)!,
      }));

      if (inserts.length > 0) {
        const { error: iErr } = await supabase
          .from("festival_power_equipment").insert(inserts);
        if (iErr) throw iErr;
      }

      toast.success(`Imported ${powerPairs.length} power card(s), ${inserts.length} equipment item(s) — electricity order not imported`);
      onChanged();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Import failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const { data: contracts, error: cErr } = await supabase
        .from("festival_contracts").select("id")
        .eq("festival_id", currentFestivalId).eq("is_active", true);
      if (cErr) throw cErr;
      const cIds = (contracts ?? []).map((c) => c.id);
      if (cIds.length === 0) { toast.info("Nothing to reset"); return; }

      const { data: powers, error: pErr } = await supabase
        .from("festival_power").select("id").in("festival_contract_id", cIds);
      if (pErr) throw pErr;
      const pIds = (powers ?? []).map((p) => p.id);
      if (pIds.length === 0) { toast.info("No power rows"); return; }

      const { error: dErr } = await supabase
        .from("festival_power_equipment").delete().in("festival_power_id", pIds);
      if (dErr) throw dErr;

      toast.success("All powered equipment cleared for this festival");
      onChanged();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Reset failed"));
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading festivals…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Download className="h-3.5 w-3.5" /> Import full power cards from
      </div>
      <Select value={sourceId} onValueChange={setSourceId}>
        <SelectTrigger className="h-8 text-xs w-[220px]">
          <SelectValue placeholder="Pick festival…" />
        </SelectTrigger>
        <SelectContent>
          {festivals.map((f) => (
            <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={mode} onValueChange={(v) => setMode(v as "append" | "replace")}>
        <SelectTrigger className="h-8 text-xs w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="replace" className="text-xs">Replace</SelectItem>
          <SelectItem value="append" className="text-xs">Append</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8 text-xs" disabled={!sourceId || busy} onClick={handleImport}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Import"}
      </Button>

      <div className="ml-auto">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={resetting}>
              {resetting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
              Reset all
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all powered equipment?</AlertDialogTitle>
              <AlertDialogDescription>
                Deletes every powered-equipment row for every concept at this festival.
                Concepts, power allocations, documents and order-list items are untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
