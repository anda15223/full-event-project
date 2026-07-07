import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Wrench, FileDown, Download, Loader2, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { EquipmentConceptCard } from "@/components/festival/cards/EquipmentConceptCard";
import { computeConceptEquipmentStatus, summarizeConceptEquipment, EquipmentRow } from "@/lib/equipmentStatus";
import type { ConceptSlug } from "@/components/concept/types";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";

const SLUG_ORDER: ConceptSlug[] = ["fish-chips", "gyros", "creperie", "chicks"];

type Festival = { id: string; slug: string; name: string };

export default function FestivalEquipment() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals")
        .select("id,slug,name").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });
  const festival = festivalQ.data;
  const festivalId = festival?.id ?? "";

  const pageQ = useQuery({
    queryKey: ["equipment-page", slug],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: contracts, error: cErr } = await supabase
        .from("festival_contracts")
        .select("id, concept_id, assigned_vehicle_id, tent_primary_contract_id, instance_label, concept_alias, concepts!concept_id(id, slug, name)")
        .eq("festival_id", festivalId).eq("is_active", true);
      if (cErr) throw cErr;
      const list = (contracts ?? []) as any[];
      const cIds = list.map((c) => c.id);
      if (cIds.length === 0) return { items: [] as any[], rowsByPower: new Map<string, EquipmentRow[]>(), childrenByPrimary: new Map<string, any[]>(), powerByContract: new Map<string, string>() };

      const { data: powers, error: pErr } = await supabase
        .from("festival_power").select("id, festival_contract_id").in("festival_contract_id", cIds);
      if (pErr) throw pErr;
      const powerByContract = new Map<string, string>();
      (powers ?? []).forEach((p: any) => powerByContract.set(p.festival_contract_id, p.id));

      // Auto-create festival_power rows for active contracts that don't have one yet,
      // so the Equipment page is usable even before the user visits Power.
      const missing = cIds.filter((id) => !powerByContract.has(id));
      if (missing.length > 0) {
        const { data: created, error: cpErr } = await supabase
          .from("festival_power")
          .insert(missing.map((id) => ({ festival_contract_id: id })))
          .select("id, festival_contract_id");
        if (cpErr) throw cpErr;
        (created ?? []).forEach((p: any) => powerByContract.set(p.festival_contract_id, p.id));
      }
      const powerIds = Array.from(powerByContract.values());

      const rowsByPower = new Map<string, EquipmentRow[]>();
      if (powerIds.length > 0) {
        const { data: eq, error: eErr } = await supabase
          .from("festival_power_equipment").select("*")
          .in("festival_power_id", powerIds)
          .order("category").order("position");
        if (eErr) throw eErr;

        // Fetch trolley splits for these equipment rows in one shot.
        const eqIds = (eq ?? []).map((r: any) => r.id);
        const splitsByEq = new Map<string, any[]>();
        if (eqIds.length > 0) {
          const { data: splits } = await (supabase as any)
            .from("festival_equipment_trolley_split")
            .select("id, equipment_id, trolley_number, quantity, notes")
            .in("equipment_id", eqIds)
            .order("trolley_number");
          (splits ?? []).forEach((s: any) => {
            const arr = splitsByEq.get(s.equipment_id) ?? [];
            arr.push({ id: s.id, trolley_number: s.trolley_number, quantity: s.quantity, notes: s.notes });
            splitsByEq.set(s.equipment_id, arr);
          });
        }

        (eq ?? []).forEach((r: any) => {
          const row: EquipmentRow = { ...r, trolley_splits: splitsByEq.get(r.id) ?? [] };
          const arr = rowsByPower.get(r.festival_power_id) ?? [];
          arr.push(row);
          rowsByPower.set(r.festival_power_id, arr);
        });
      }

      const childrenByPrimary = new Map<string, any[]>();
      list.forEach((c) => {
        const pid = c.tent_primary_contract_id as string | null;
        if (pid && c.concepts) {
          const arr = childrenByPrimary.get(pid) ?? [];
          arr.push({ contractId: c.id, conceptName: c.concepts.name, conceptSlug: c.concepts.slug, mergedInto: pid });
          childrenByPrimary.set(pid, arr);
        }
      });

      const items = list
        .filter((c) => c.concepts && powerByContract.has(c.id))
        .map((c) => {
          const alias = (c.concept_alias ?? "").trim();
          const displayName = alias
            ? alias
            : c.instance_label
              ? `${c.concepts.name} ${c.instance_label}`
              : c.concepts.name;
          return {
            contractId: c.id as string,
            assignedVehicleId: (c.assigned_vehicle_id ?? null) as string | null,
            concept: c.concepts,
            displayName,
            powerId: powerByContract.get(c.id)!,
            mergedChildren: [] as any[],
            mergeTargets: [] as any[],
          };
        })
        .sort((a, b) => {
          const ai = SLUG_ORDER.indexOf(a.concept.slug);
          const bi = SLUG_ORDER.indexOf(b.concept.slug);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

      return { items, rowsByPower, childrenByPrimary, powerByContract };
    },
  });

  const items = pageQ.data?.items ?? [];
  const rowsByPower = pageQ.data?.rowsByPower ?? new Map();
  const powerByContract = pageQ.data?.powerByContract ?? new Map<string, string>();

  /** Combine equipment rows from a primary + any merged children. */
  const combinedRowsFor = (powerId: string, mergedChildren: any[]): EquipmentRow[] => {
    const base = rowsByPower.get(powerId) ?? [];
    if (!mergedChildren?.length) return base;
    const extras: EquipmentRow[] = [];
    mergedChildren.forEach((ch: any) => {
      const cpId = powerByContract.get(ch.contractId);
      if (cpId) extras.push(...(rowsByPower.get(cpId) ?? []));
    });
    return [...base, ...extras];
  };

  const summary = useMemo(() => {
    let totalItems = 0, totalPowered = 0, totalKw = 0, unassigned = 0;
    items.forEach((it: any) => {
      const rows = combinedRowsFor(it.powerId, it.mergedChildren);
      const s = summarizeConceptEquipment(rows);
      totalItems += s.items;
      totalPowered += s.powered;
      totalKw += s.kw;
      if (!it.assignedVehicleId && rows.length > 0) unassigned++;
    });
    return { concepts: items.length, items: totalItems, powered: totalPowered, kw: Math.round(totalKw * 10) / 10, unassigned };
  }, [items, rowsByPower, powerByContract]);

  if (festivalQ.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <FestivalBackBar />
      <div>
        <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> {festival.name}
        </Link>
        <div className="flex items-center justify-between gap-3 mt-2">
          <div className="flex items-center gap-3">
            <Wrench className="h-7 w-7 text-slate-500" />
            <h1 className="text-3xl font-bold tracking-tight">Equipment & Trolleys</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-muted">
                <FileDown className="h-3.5 w-3.5" /> Export PDF
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[11px]">Choose a report</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={`/festivals/${slug}/equipment/export`} target="_blank" rel="noopener noreferrer" className="text-xs">
                  📋 Equipment per concept
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/festivals/${slug}/equipment/export/by-category`} target="_blank" rel="noopener noreferrer" className="text-xs">
                  🗂️ Equipment by category (table)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/festivals/${slug}/equipment/export/trolleys`} target="_blank" rel="noopener noreferrer" className="text-xs">
                  🛒 Trolley load lists
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/festivals/${slug}/equipment/export/vehicles`} target="_blank" rel="noopener noreferrer" className="text-xs">
                  🚛 Vehicle load lists
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/festivals/${slug}/equipment/export/soborg`} target="_blank" rel="noopener noreferrer" className="text-xs">
                  📦 Søborg pick list
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Per-concept inventory grouped by category. Powered items contribute to electricity demand.
          Items marked Søborg load from the warehouse; on-site items are delivered to the festival.
        </p>
      </div>
      <EquipmentImportBar
        festivalId={festivalId}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["equipment-page", slug] });
          qc.invalidateQueries({ queryKey: ["festival-loading-vehicles", festivalId] });
        }}
      />

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill>{summary.concepts} concept{summary.concepts === 1 ? "" : "s"}</Pill>
          <Pill>{summary.items} item{summary.items === 1 ? "" : "s"}</Pill>
          <Pill tone="amber">⚡ {summary.powered} powered</Pill>
          <Pill tone="amber">🔌 {summary.kw.toFixed(1)} kW demand</Pill>
          <Pill tone={summary.unassigned > 0 ? "rose" : "muted"}>
            🚛 {summary.unassigned} unassigned
          </Pill>
        </div>
      )}

      {pageQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No active concepts at this festival.
        </div>
      ) : (
        <div className={items.length === 1 ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>

          {items.map((it: any) => (
            <EquipmentConceptCard
              key={it.contractId}
              festivalId={festivalId}
              festivalSlug={slug}
              conceptId={it.concept.id}
              conceptSlug={it.concept.slug}
              conceptName={it.displayName}
              contractId={it.contractId}
              powerId={it.powerId}
              assignedVehicleId={it.assignedVehicleId}
              rows={combinedRowsFor(it.powerId, it.mergedChildren)}
              mergedChildren={it.mergedChildren}
              mergeTargets={it.mergeTargets}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "amber" | "rose" }) {
  const cls =
    tone === "amber" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
    tone === "rose"  ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" :
                       "bg-muted text-muted-foreground border";
  return <span className={`px-2.5 py-1 rounded-full border ${cls}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Import + Reset bar
// ---------------------------------------------------------------------------

function EquipmentImportBar({
  festivalId,
  onChanged,
}: {
  festivalId: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [festivals, setFestivals] = useState<Array<{ id: string; name: string }>>([]);
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState<null | "import" | "reset">(null);

  useEffect(() => {
    if (!festivalId) return;
    supabase
      .from("festivals")
      .select("id,name")
      .neq("id", festivalId)
      .order("start_date", { ascending: false })
      .then(({ data }) => setFestivals((data as any) ?? []));
  }, [festivalId]);

  async function handleImport() {
    if (!sourceId || !festivalId) return;
    setBusy("import");
    try {
      const summary = await importEquipmentAndTrolleys(sourceId, festivalId);
      toast({ title: "Equipment imported", description: summary });
      onChanged();
    } catch (e) {
      toast({ title: "Import failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function handleReset() {
    setBusy("reset");
    try {
      const summary = await resetEquipmentAndTrolleys(festivalId);
      toast({ title: "Equipment reset", description: summary });
      setSourceId("");
      onChanged();
    } catch (e) {
      toast({ title: "Reset failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-sm space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Download className="h-3.5 w-3.5" />
        <span className="font-medium">Import equipment & trolley cars from another festival</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sourceId} onValueChange={setSourceId}>
          <SelectTrigger className="h-8 w-[240px] text-xs">
            <SelectValue placeholder="Pick festival…" />
          </SelectTrigger>
          <SelectContent>
            {festivals.map((f) => (
              <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm" variant="outline" className="h-8"
          disabled={!sourceId || busy !== null}
          onClick={handleImport}
        >
          {busy === "import"
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : "Import equipment"}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive"
                disabled={busy !== null}>
                {busy === "reset"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><Trash2 className="h-3.5 w-3.5 mr-1" /> Reset all</>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all equipment & trolley cars?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete every equipment item, trolley split, and trolley-car
                  assignment for this festival. Concepts, contracts, and vehicles are kept.
                  You can re-import from another festival afterwards.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Matches by concept · overwrites current equipment & trolley cars for each concept.
        Trolley-car → transport links are re-matched by vehicle type when possible; otherwise left blank.
      </p>
    </div>
  );
}

// Fields to strip when cloning festival_power_equipment rows.
const PWE_STRIP = new Set<string>([
  "id", "created_at", "updated_at",
  "festival_power_id", // remapped to target
  "linked_facade_id",  // references target-specific rows
  "linked_topskilt_id",
]);

type ContractImportRow = {
  id: string;
  concept_id: string;
  concept_alias: string | null;
  instance_label: string | null;
  created_at: string | null;
  assigned_vehicle_id: string | null;
};

type ContractPair = {
  src: ContractImportRow;
  tgt: ContractImportRow;
  conceptId: string;
};

const normalizeImportKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const contractLabelKey = (row: ContractImportRow) =>
  normalizeImportKey(row.concept_alias) || normalizeImportKey(row.instance_label);

const contractSortKey = (row: ContractImportRow) =>
  [contractLabelKey(row), row.created_at ?? "", row.id].join("|");

function groupContractsByConcept(rows: ContractImportRow[]) {
  const grouped = new Map<string, ContractImportRow[]>();
  rows.forEach((row) => {
    if (!row.concept_id) return;
    const list = grouped.get(row.concept_id) ?? [];
    list.push(row);
    grouped.set(row.concept_id, list);
  });
  grouped.forEach((list) => list.sort((a, b) => contractSortKey(a).localeCompare(contractSortKey(b))));
  return grouped;
}

function buildContractPairs(sourceRows: ContractImportRow[], targetRows: ContractImportRow[]): ContractPair[] {
  const sourceByConcept = groupContractsByConcept(sourceRows);
  const targetByConcept = groupContractsByConcept(targetRows);
  const pairs: ContractPair[] = [];

  for (const [conceptId, targetList] of targetByConcept) {
    const sourceList = sourceByConcept.get(conceptId) ?? [];
    if (sourceList.length === 0) continue;
    const usedSource = new Set<number>();

    targetList.forEach((target, targetIndex) => {
      const targetKey = contractLabelKey(target);
      let sourceIndex = targetKey
        ? sourceList.findIndex((source, index) => !usedSource.has(index) && contractLabelKey(source) === targetKey)
        : -1;

      if (sourceIndex === -1 && !usedSource.has(targetIndex) && sourceList[targetIndex]) {
        sourceIndex = targetIndex;
      }
      if (sourceIndex === -1) {
        sourceIndex = sourceList.findIndex((_, index) => !usedSource.has(index));
      }
      if (sourceIndex === -1) return;

      usedSource.add(sourceIndex);
      pairs.push({ src: sourceList[sourceIndex], tgt: target, conceptId });
    });
  }

  return pairs;
}

const TRANSPORT_CLONE_STRIP = new Set<string>([
  "id", "created_at", "updated_at", "festival_id",
  "accreditation_pdf_path", "accreditation_uploaded_at",
]);

function transportKeys(row: any) {
  const norm = (value: unknown) => normalizeImportKey(value);
  const keys: string[] = [];
  if (row.season_rental_id) keys.push(`season:${row.season_rental_id}`);
  if (norm(row.license_plate)) keys.push(`plate:${norm(row.license_plate)}`);
  keys.push(`full:${[
    row.vehicle_type, row.vehicle_purpose, row.rental_supplier_id, row.rental_supplier,
    row.booking_reference, row.pickup_date, row.pickup_time, row.return_date, row.return_time,
  ].map(norm).join("|")}`);
  keys.push(`booking:${[
    row.vehicle_type, row.rental_supplier_id, row.rental_supplier, row.booking_reference,
  ].map(norm).join("|")}`);
  keys.push(`type-date:${[
    row.vehicle_type, row.pickup_date, row.return_date,
  ].map(norm).join("|")}`);
  return keys.filter((key) => !key.endsWith(":") && !key.endsWith(":||||") && !key.endsWith(":||"));
}

async function buildTransportMap(sourceFestivalId: string, targetFestivalId: string, sourceTransportIds: string[]) {
  const uniqueSourceIds = Array.from(new Set(sourceTransportIds.filter(Boolean)));
  const transportMap = new Map<string, string>();
  if (uniqueSourceIds.length === 0) return { transportMap, createdVehicles: 0, unresolvedVehicles: 0 };

  const [srcT, tgtT] = await Promise.all([
    supabase.from("festival_transport").select("*").in("id", uniqueSourceIds),
    supabase.from("festival_transport").select("*").eq("festival_id", targetFestivalId),
  ]);
  if (srcT.error) throw srcT.error;
  if (tgtT.error) throw tgtT.error;

  const targetByKey = new Map<string, string[]>();
  const addTarget = (row: any) => {
    transportKeys(row).forEach((key) => {
      const list = targetByKey.get(key) ?? [];
      list.push(row.id);
      targetByKey.set(key, list);
    });
  };
  (tgtT.data ?? []).forEach(addTarget);

  const usedTargets = new Set<string>();
  let createdVehicles = 0;

  for (const source of (srcT.data ?? []) as any[]) {
    let targetId: string | undefined;
    for (const key of transportKeys(source)) {
      targetId = (targetByKey.get(key) ?? []).find((id) => !usedTargets.has(id));
      if (targetId) break;
    }

    if (!targetId) {
      const clone: Record<string, unknown> = {};
      Object.entries(source).forEach(([key, value]) => {
        if (!TRANSPORT_CLONE_STRIP.has(key)) clone[key] = value;
      });
      clone.festival_id = targetFestivalId;
      clone.is_draft = false;
      clone.draft_source_festival_id = sourceFestivalId;
      clone.status = "planned";
      clone.vehicle_type = clone.vehicle_type || "Vehicle";

      const { data, error } = await supabase.from("festival_transport")
        .insert(clone as any)
        .select("*")
        .single();
      if (error) throw error;
      targetId = (data as any).id;
      addTarget(data);
      createdVehicles++;
    }

    transportMap.set(source.id, targetId);
    usedTargets.add(targetId);
  }

  return {
    transportMap,
    createdVehicles,
    unresolvedVehicles: uniqueSourceIds.length - transportMap.size,
  };
}

async function importEquipmentAndTrolleys(
  sourceFestivalId: string,
  targetFestivalId: string,
): Promise<string> {
  // 1. Build source -> target contract pairs. Pair duplicates within the same concept,
  //    instead of collapsing to one row per concept.
  const [srcC, tgtC] = await Promise.all([
    supabase.from("festival_contracts")
      .select("id, concept_id, concept_alias, instance_label, created_at, assigned_vehicle_id")
      .eq("festival_id", sourceFestivalId).eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase.from("festival_contracts")
      .select("id, concept_id, concept_alias, instance_label, created_at, assigned_vehicle_id")
      .eq("festival_id", targetFestivalId).eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);
  if (srcC.error) throw srcC.error;
  if (tgtC.error) throw tgtC.error;

  const pairs = buildContractPairs((srcC.data ?? []) as ContractImportRow[], (tgtC.data ?? []) as ContractImportRow[]);
  if (pairs.length === 0) {
    return "Nothing to import — no matching concepts on both festivals.";
  }

  // 2. Load festival_power rows on both sides for these contracts.
  const srcContractIds = pairs.map((p) => p.src.id);
  const tgtContractIds = pairs.map((p) => p.tgt.id);
  const [srcP, tgtP] = await Promise.all([
    supabase.from("festival_power").select("id, festival_contract_id").in("festival_contract_id", srcContractIds),
    supabase.from("festival_power").select("id, festival_contract_id").in("festival_contract_id", tgtContractIds),
  ]);
  if (srcP.error) throw srcP.error;
  if (tgtP.error) throw tgtP.error;

  const srcPowerByContract = new Map<string, string>();
  (srcP.data ?? []).forEach((r: any) => srcPowerByContract.set(r.festival_contract_id, r.id));
  const tgtPowerByContract = new Map<string, string>();
  (tgtP.data ?? []).forEach((r: any) => tgtPowerByContract.set(r.festival_contract_id, r.id));

  // Auto-create target power rows if any are missing.
  const missing = tgtContractIds.filter((id) => !tgtPowerByContract.has(id));
  if (missing.length > 0) {
    const { data: created, error } = await supabase.from("festival_power")
      .insert(missing.map((id) => ({ festival_contract_id: id })))
      .select("id, festival_contract_id");
    if (error) throw error;
    (created ?? []).forEach((r: any) => tgtPowerByContract.set(r.festival_contract_id, r.id));
  }

  // 3. Wipe current equipment/splits/trolley-cars at target to make import idempotent.
  const tgtPowerIds = Array.from(tgtPowerByContract.values());
  if (tgtPowerIds.length > 0) {
    // Delete equipment (cascades to splits via equipment_id FK if configured; delete splits explicitly too).
    const { data: oldEq } = await supabase.from("festival_power_equipment")
      .select("id").in("festival_power_id", tgtPowerIds);
    const oldEqIds = (oldEq ?? []).map((r: any) => r.id);
    if (oldEqIds.length > 0) {
      await supabase.from("festival_equipment_trolley_split")
        .delete().in("equipment_id", oldEqIds);
    }
    await supabase.from("festival_power_equipment").delete().in("festival_power_id", tgtPowerIds);
  }
  await supabase.from("festival_trolley_assignments").delete().eq("festival_id", targetFestivalId);

  // 4. Copy festival_power_equipment source -> target and remember id mapping.
  const srcPowerIds = Array.from(srcPowerByContract.values());
  const srcPowerToContract = new Map<string, string>();
  (srcP.data ?? []).forEach((r: any) => srcPowerToContract.set(r.id, r.festival_contract_id));

  const srcContractToTargetPower = new Map<string, string>();
  for (const p of pairs) {
    const tp = tgtPowerByContract.get(p.tgt.id);
    if (tp) srcContractToTargetPower.set(p.src.id, tp);
  }

  const eqMap = new Map<string, string>();
  let insertedEq = 0;
  if (srcPowerIds.length > 0) {
    const { data: srcEq, error: eErr } = await supabase.from("festival_power_equipment")
      .select("*").in("festival_power_id", srcPowerIds);
    if (eErr) throw eErr;

    for (const row of (srcEq ?? []) as any[]) {
      const srcContractId = srcPowerToContract.get(row.festival_power_id);
      const targetPowerId = srcContractId ? srcContractToTargetPower.get(srcContractId) : undefined;
      if (!targetPowerId) continue;

      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (PWE_STRIP.has(k)) continue;
        clean[k] = v;
      }
      clean.festival_power_id = targetPowerId;

      const { data, error } = await supabase.from("festival_power_equipment")
        .insert(clean as any).select("id").single();
      if (error) throw error;
      eqMap.set(row.id, (data as any).id);
      insertedEq++;
    }
  }

  // 5. Copy festival_equipment_trolley_split via eq id mapping.
  let insertedSplits = 0;
  if (eqMap.size > 0) {
    const srcEqIds = Array.from(eqMap.keys());
    const { data: srcSplits, error: sErr } = await supabase.from("festival_equipment_trolley_split")
      .select("*").in("equipment_id", srcEqIds);
    if (sErr) throw sErr;

    const rows = (srcSplits ?? []).map((s: any) => {
      const targetEq = eqMap.get(s.equipment_id);
      if (!targetEq) return null;
      return {
        equipment_id: targetEq,
        festival_id: targetFestivalId,
        trolley_number: s.trolley_number,
        quantity: s.quantity,
        notes: s.notes,
      };
    }).filter(Boolean);
    if (rows.length > 0) {
      const { error } = await supabase.from("festival_equipment_trolley_split")
        .insert(rows as any);
      if (error) throw error;
      insertedSplits = rows.length;
    }
  }

  // 6. Copy vehicle assignments for equipment cards and trolley cars.
  const { data: srcAssigns, error: aErr } = await supabase
    .from("festival_trolley_assignments")
    .select("trolley_id, transport_id")
    .eq("festival_id", sourceFestivalId);
  if (aErr) throw aErr;

  const referencedTransportIds = Array.from(new Set([
    ...pairs.map((p) => p.src.assigned_vehicle_id).filter(Boolean),
    ...(srcAssigns ?? []).map((a: any) => a.transport_id).filter(Boolean),
  ])) as string[];
  const { transportMap, createdVehicles, unresolvedVehicles } = await buildTransportMap(
    sourceFestivalId,
    targetFestivalId,
    referencedTransportIds,
  );

  let assignedConceptCars = 0;
  let unlinkedConceptCars = 0;
  for (const pair of pairs) {
    const mappedVehicle = pair.src.assigned_vehicle_id
      ? transportMap.get(pair.src.assigned_vehicle_id) ?? null
      : null;
    if (pair.src.assigned_vehicle_id && !mappedVehicle) unlinkedConceptCars++;
    const { error } = await supabase.from("festival_contracts")
      .update({ assigned_vehicle_id: mappedVehicle })
      .eq("id", pair.tgt.id);
    if (error) throw error;
    if (mappedVehicle) assignedConceptCars++;
  }

  let insertedAssigns = 0;
  let unlinkedTransports = 0;
  if ((srcAssigns ?? []).length > 0) {
    const rows: any[] = [];
    for (const a of (srcAssigns ?? []) as any[]) {
      const mappedTransport = a.transport_id ? transportMap.get(a.transport_id) ?? null : null;
      if (a.transport_id && !mappedTransport) unlinkedTransports++;
      rows.push({
        festival_id: targetFestivalId,
        trolley_id: a.trolley_id,
        transport_id: mappedTransport,
      });
    }
    if (rows.length > 0) {
      // Upsert on unique (festival_id, trolley_id).
      const { error } = await supabase.from("festival_trolley_assignments")
        .upsert(rows, { onConflict: "festival_id,trolley_id" });
      if (error) throw error;
      insertedAssigns = rows.length;
    }
  }

  const bits = [
    `${insertedEq} equipment items`,
    `${insertedSplits} trolley split${insertedSplits === 1 ? "" : "s"}`,
    `${assignedConceptCars} concept car${assignedConceptCars === 1 ? "" : "s"} assigned`,
    `${insertedAssigns} trolley car${insertedAssigns === 1 ? "" : "s"} assigned`,
  ];
  if (createdVehicles > 0) bits.push(`${createdVehicles} missing vehicle${createdVehicles === 1 ? "" : "s"} created`);
  if (unlinkedConceptCars > 0) bits.push(`${unlinkedConceptCars} concept car${unlinkedConceptCars === 1 ? "" : "s"} left blank`);
  if (unlinkedTransports > 0) bits.push(`${unlinkedTransports} without matching vehicle`);
  if (unresolvedVehicles > 0) bits.push(`${unresolvedVehicles} source vehicle${unresolvedVehicles === 1 ? "" : "s"} not found`);
  return bits.join(" · ");
}

async function resetEquipmentAndTrolleys(festivalId: string): Promise<string> {
  // 1. Find all festival_power rows for this festival's contracts.
  const { data: contracts, error: cErr } = await supabase.from("festival_contracts")
    .select("id").eq("festival_id", festivalId);
  if (cErr) throw cErr;
  const contractIds = (contracts ?? []).map((r: any) => r.id);

  let eqDeleted = 0;
  let splitDeleted = 0;
  let carsDeleted = 0;
  let conceptCarsCleared = 0;

  if (contractIds.length > 0) {
    const { count: vc } = await supabase.from("festival_contracts")
      .update({ assigned_vehicle_id: null }, { count: "exact" })
      .in("id", contractIds);
    conceptCarsCleared = vc ?? 0;

    const { data: powers } = await supabase.from("festival_power")
      .select("id").in("festival_contract_id", contractIds);
    const powerIds = (powers ?? []).map((r: any) => r.id);

    if (powerIds.length > 0) {
      const { data: eq } = await supabase.from("festival_power_equipment")
        .select("id").in("festival_power_id", powerIds);
      const eqIds = (eq ?? []).map((r: any) => r.id);
      if (eqIds.length > 0) {
        const { count: sc } = await supabase.from("festival_equipment_trolley_split")
          .delete({ count: "exact" }).in("equipment_id", eqIds);
        splitDeleted = sc ?? 0;
        const { count: ec } = await supabase.from("festival_power_equipment")
          .delete({ count: "exact" }).in("id", eqIds);
        eqDeleted = ec ?? 0;
      }
    }
  }

  const { count: cc } = await supabase.from("festival_trolley_assignments")
    .delete({ count: "exact" }).eq("festival_id", festivalId);
  carsDeleted = cc ?? 0;

  return `Deleted ${eqDeleted} equipment items · ${splitDeleted} trolley splits · ${carsDeleted} trolley-car assignments · cleared ${conceptCarsCleared} concept car links.`;
}
