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

type SourceFestival = { id: string; name: string; start_date: string | null };

interface Props {
  currentFestivalId: string;
  onChanged: () => void;
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
      const indexList = (rows: any[]) => {
        const byConcept = new Map<string, string[]>();
        rows.forEach((r) => {
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

      // Get full festival_power rows for both sides so the whole card is copied.
      const allContractIds = pairs.flatMap((p) => [p.srcContractId, p.tgtContractId]);
      const { data: powers, error: e3 } = await supabase
        .from("festival_power").select("*")
        .in("festival_contract_id", allContractIds);
      if (e3) throw e3;
      const powerByContract = new Map<string, any>();
      (powers ?? []).forEach((p: any) => powerByContract.set(p.festival_contract_id, p));

      // Build power-id pairs
      const powerPairs = pairs
        .map((p) => ({
          srcPower: powerByContract.get(p.srcContractId),
          tgtPower: powerByContract.get(p.tgtContractId),
        }))
        .filter((p) => p.srcPower && p.tgtPower) as Array<{ srcPower: any; tgtPower: any }>;

      if (powerPairs.length === 0) {
        toast.info("No power rows found to import from");
        return;
      }

      const srcPowerIds = powerPairs.map((p) => p.srcPower.id as string);
      const tgtPowerIds = powerPairs.map((p) => p.tgtPower.id as string);
      const srcToTgt = new Map(powerPairs.map((p) => [p.srcPower.id as string, p.tgtPower.id as string]));

      const powerCardPatch = ({ id, festival_contract_id, created_at, updated_at, ...rest }: any) => rest;
      for (const { srcPower, tgtPower } of powerPairs) {
        const { error: upErr } = await supabase
          .from("festival_power")
          .update(powerCardPatch(srcPower) as any)
          .eq("id", tgtPower.id);
        if (upErr) throw upErr;
      }

      // Fetch source equipment
      const { data: eq, error: e4 } = await supabase
        .from("festival_power_equipment").select("*")
        .in("festival_power_id", srcPowerIds);
      if (e4) throw e4;

      // Fetch source festival order-list rows.
      const { data: orderItems, error: oiErr } = await supabase
        .from("festival_power_order_items").select("*")
        .in("festival_power_id", srcPowerIds);
      if (oiErr) throw oiErr;

      if (mode === "replace") {
        const { error: dEqErr } = await supabase
          .from("festival_power_equipment").delete()
          .in("festival_power_id", tgtPowerIds);
        if (dEqErr) throw dEqErr;
        const { error: dOiErr } = await supabase
          .from("festival_power_order_items").delete()
          .in("festival_power_id", tgtPowerIds);
        if (dOiErr) throw dOiErr;
      }

      const inserts = (eq ?? []).map(({ id, created_at, updated_at, festival_power_id, ...rest }: any) => ({
        ...rest,
        festival_power_id: srcToTgt.get(festival_power_id)!,
      }));

      if (inserts.length > 0) {
        const { error: iErr } = await supabase
          .from("festival_power_equipment").insert(inserts);
        if (iErr) throw iErr;
      }

      const orderInserts = (orderItems ?? []).map(({ id, created_at, updated_at, festival_power_id, ...rest }: any) => ({
        ...rest,
        festival_power_id: srcToTgt.get(festival_power_id)!,
      }));

      if (orderInserts.length > 0) {
        const { error: oiInsErr } = await supabase
          .from("festival_power_order_items")
          .insert(orderInserts as any);
        if (oiInsErr) throw oiInsErr;
      }

      toast.success(`Imported ${powerPairs.length} power card(s), ${inserts.length} equipment item(s), ${orderInserts.length} order-list item(s)`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
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
      const cIds = (contracts ?? []).map((c: any) => c.id);
      if (cIds.length === 0) { toast.info("Nothing to reset"); return; }

      const { data: powers, error: pErr } = await supabase
        .from("festival_power").select("id").in("festival_contract_id", cIds);
      if (pErr) throw pErr;
      const pIds = (powers ?? []).map((p: any) => p.id);
      if (pIds.length === 0) { toast.info("No power rows"); return; }

      const { error: dErr } = await supabase
        .from("festival_power_equipment").delete().in("festival_power_id", pIds);
      if (dErr) throw dErr;

      toast.success("All powered equipment cleared for this festival");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
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
