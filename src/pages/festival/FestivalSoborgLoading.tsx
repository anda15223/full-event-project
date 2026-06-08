import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Truck, Package, AlertTriangle, Snowflake, Download,
  Flame, Square, Anchor, ShoppingCart, CreditCard, Droplet, Tent, Type, FileImage, ArrowLeft,
  Calendar, Copy,
} from "lucide-react";

import {
  getSoborgLoadingManifest, sortedCategories, categoryLabel, regroupForSoborgPDF,
  type SoborgLoadingManifest, type LoadingItem,
} from "@/lib/soborgLoading";
import { FestivalTrolleyAssignCard } from "@/components/festival/FestivalTrolleyAssignCard";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";

const sb: any = supabase;

const CATEGORY_ICON: Record<string, typeof Flame> = {
  cooking: Flame, table: Square, scaffold: Anchor, trolley: ShoppingCart,
  pos: CreditCard, prep: Square, sink: Droplet, popup_tent: Tent,
  facade: FileImage, topskilt: Type, other: Package,
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function ItemLine({ item }: { item: LoadingItem }) {
  const tags: string[] = [];
  if (item.power_type) tags.push(item.power_type);
  if (item.power_kw) tags.push(`${Number(item.power_kw).toFixed(1)} kW`);
  if (item.is_shared) tags.push("shared");
  return (
    <div className="text-sm flex items-baseline gap-2">
      <span className="font-medium tabular-nums">{item.quantity}×</span>
      <span>{item.name}</span>
      {tags.length > 0 && <span className="text-xs text-muted-foreground">({tags.join(", ")})</span>}
      {item.notes && <span className="text-xs text-muted-foreground italic">— {item.notes}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vehicle picker — lists festival_transport + season_rentals         */
/* ------------------------------------------------------------------ */

type VehicleOption = {
  source: "transport" | "season";
  id: string;            // transport.id OR season_rental.id
  label: string;
  sublabel: string;
  season_rental_id: string | null;
  vehicle_type: string;
  license_plate: string | null;
};

function VehiclePickerDialog({
  open, onOpenChange, festivalId, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  festivalId: string;
  onPick: (transportId: string) => void;
}) {
  const [opts, setOpts] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !festivalId) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const [tRes, sRes] = await Promise.all([
        sb.from("festival_transport")
          .select("id, vehicle_type, license_plate, season_rental_id, vehicle_purpose")
          .eq("festival_id", festivalId),
        sb.from("season_rentals")
          .select("id, vehicle_type, license_plate, supplier_name, status")
          .neq("status", "ended")
          .order("vehicle_type"),
      ]);
      const transports = (tRes.data ?? []) as any[];
      const seasons = (sRes.data ?? []) as any[];
      const linkedSeasonIds = new Set(
        transports.map((t) => t.season_rental_id).filter(Boolean),
      );
      const list: VehicleOption[] = [
        ...transports.map((t): VehicleOption => ({
          source: "transport",
          id: t.id,
          label: t.vehicle_type ?? "Vehicle",
          sublabel: [t.license_plate, t.vehicle_purpose].filter(Boolean).join(" · ") || "festival transport",
          season_rental_id: t.season_rental_id ?? null,
          vehicle_type: t.vehicle_type ?? "Vehicle",
          license_plate: t.license_plate ?? null,
        })),
        ...seasons
          .filter((s) => !linkedSeasonIds.has(s.id))
          .map((s): VehicleOption => ({
            source: "season",
            id: s.id,
            label: s.vehicle_type ?? "Season rental",
            sublabel: [s.license_plate, s.supplier_name, "season rental"].filter(Boolean).join(" · "),
            season_rental_id: s.id,
            vehicle_type: s.vehicle_type ?? "Vehicle",
            license_plate: s.license_plate ?? null,
          })),
      ];
      if (alive) { setOpts(list); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [open, festivalId]);

  const handle = async (o: VehicleOption) => {
    let transportId = o.id;
    if (o.source === "season") {
      // create a draft festival_transport row pointing at this season rental
      const { data, error } = await sb.from("festival_transport").insert({
        festival_id: festivalId,
        vehicle_type: o.vehicle_type,
        license_plate: o.license_plate,
        season_rental_id: o.season_rental_id,
        is_draft: true,
        status: "draft",
      }).select("id").single();
      if (error || !data) {
        toast.error("Could not add vehicle: " + (error?.message ?? "unknown"));
        return;
      }
      transportId = data.id;
    }
    onPick(transportId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pick a vehicle</DialogTitle>
          <DialogDescription>Season rentals and festival transport. Picking a season rental adds it to this festival.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto space-y-1.5">
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> :
            opts.length === 0 ? <div className="text-sm text-muted-foreground">No vehicles available.</div> :
            opts.map((o) => (
              <button key={`${o.source}-${o.id}`} onClick={() => handle(o)}
                className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 text-sm">
                <div className="font-medium flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5" /> {o.label}
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">{o.source}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">{o.sublabel}</div>
              </button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Import-from-festival dialog                                        */
/* ------------------------------------------------------------------ */

function ImportFromFestivalDialog({
  open, onOpenChange, currentFestivalId, currentSlug, onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentFestivalId: string;
  currentSlug: string;
  onImported: () => void;
}) {
  const [festivals, setFestivals] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    sb.from("festivals")
      .select("id, slug, name, start_date")
      .neq("id", currentFestivalId)
      .order("start_date", { ascending: false })
      .then(({ data }: any) => setFestivals(data ?? []));
  }, [open, currentFestivalId]);

  const runImport = async (sourceFestivalId: string, name: string) => {
    setBusy(sourceFestivalId);
    try {
      // 1) Source + target contracts (with concept_id + assigned_vehicle_id)
      const [srcContractsRes, tgtContractsRes] = await Promise.all([
        sb.from("festival_contracts")
          .select("id, concept_id, assigned_vehicle_id")
          .eq("festival_id", sourceFestivalId).eq("is_active", true),
        sb.from("festival_contracts")
          .select("id, concept_id")
          .eq("festival_id", currentFestivalId).eq("is_active", true),
      ]);
      const srcContracts = (srcContractsRes.data ?? []) as any[];
      const tgtContracts = (tgtContractsRes.data ?? []) as any[];
      const tgtByConcept = new Map(tgtContracts.map((c) => [c.concept_id, c.id]));

      // 2) Source vehicles → season_rental_id (so we can match across festivals)
      const srcVehicleIds = Array.from(new Set(srcContracts.map((c) => c.assigned_vehicle_id).filter(Boolean)));
      const srcVehMap = new Map<string, { season_rental_id: string | null; vehicle_type: string; license_plate: string | null }>();
      if (srcVehicleIds.length) {
        const { data: vs } = await sb.from("festival_transport")
          .select("id, season_rental_id, vehicle_type, license_plate")
          .in("id", srcVehicleIds);
        (vs ?? []).forEach((v: any) => srcVehMap.set(v.id, {
          season_rental_id: v.season_rental_id ?? null,
          vehicle_type: v.vehicle_type ?? "Vehicle",
          license_plate: v.license_plate ?? null,
        }));
      }

      // 3) Target vehicles index by season_rental_id
      const { data: tgtVehs } = await sb.from("festival_transport")
        .select("id, season_rental_id, vehicle_type, license_plate")
        .eq("festival_id", currentFestivalId);
      const tgtVehBySeason = new Map<string, string>();
      (tgtVehs ?? []).forEach((v: any) => {
        if (v.season_rental_id) tgtVehBySeason.set(v.season_rental_id, v.id);
      });

      // 4) Assign vehicles to target contracts
      let assignedCount = 0;
      for (const sc of srcContracts) {
        const tgtContractId = tgtByConcept.get(sc.concept_id);
        if (!tgtContractId || !sc.assigned_vehicle_id) continue;
        const srcVeh = srcVehMap.get(sc.assigned_vehicle_id);
        if (!srcVeh?.season_rental_id) continue;
        let tgtVehId = tgtVehBySeason.get(srcVeh.season_rental_id);
        if (!tgtVehId) {
          const { data: newV } = await sb.from("festival_transport").insert({
            festival_id: currentFestivalId,
            vehicle_type: srcVeh.vehicle_type,
            license_plate: srcVeh.license_plate,
            season_rental_id: srcVeh.season_rental_id,
            is_draft: true,
            status: "draft",
          }).select("id").single();
          if (!newV) continue;
          tgtVehId = newV.id;
          tgtVehBySeason.set(srcVeh.season_rental_id, tgtVehId);
        }
        await sb.from("festival_contracts").update({ assigned_vehicle_id: tgtVehId }).eq("id", tgtContractId);
        assignedCount++;
      }

      // 5) Copy loads_from_soborg flags per concept (match equipment by name within concept's power)
      let flagsCopied = 0;
      for (const sc of srcContracts) {
        const tgtContractId = tgtByConcept.get(sc.concept_id);
        if (!tgtContractId) continue;
        const [{ data: srcPowers }, { data: tgtPowers }] = await Promise.all([
          sb.from("festival_power").select("id").eq("festival_contract_id", sc.id),
          sb.from("festival_power").select("id").eq("festival_contract_id", tgtContractId),
        ]);
        const srcPowerIds = (srcPowers ?? []).map((p: any) => p.id);
        const tgtPowerIds = (tgtPowers ?? []).map((p: any) => p.id);
        if (!srcPowerIds.length || !tgtPowerIds.length) continue;

        const [{ data: srcEq }, { data: tgtEq }] = await Promise.all([
          sb.from("festival_power_equipment")
            .select("equipment_name, loads_from_soborg")
            .in("festival_power_id", srcPowerIds),
          sb.from("festival_power_equipment")
            .select("id, equipment_name")
            .in("festival_power_id", tgtPowerIds),
        ]);
        const srcFlagByName = new Map<string, boolean>();
        (srcEq ?? []).forEach((e: any) => {
          const k = String(e.equipment_name ?? "").trim().toLowerCase();
          if (k) srcFlagByName.set(k, !!e.loads_from_soborg);
        });
        for (const t of (tgtEq ?? []) as any[]) {
          const k = String(t.equipment_name ?? "").trim().toLowerCase();
          if (!srcFlagByName.has(k)) continue;
          await sb.from("festival_power_equipment")
            .update({ loads_from_soborg: srcFlagByName.get(k) })
            .eq("id", t.id);
          flagsCopied++;
        }
      }

      toast.success(`Imported from ${name}: ${assignedCount} vehicle assignment(s), ${flagsCopied} equipment flag(s).`);
      onImported();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Import failed: " + (e?.message ?? "unknown"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Søborg loading from another festival</DialogTitle>
          <DialogDescription>
            Copies vehicle assignments (matched by season rental + concept) and "loads from Søborg" flags (matched by equipment name within each concept).
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto space-y-1.5">
          {festivals.length === 0 ? <div className="text-sm text-muted-foreground">No other festivals.</div> :
            festivals.map((f) => (
              <button key={f.id} disabled={busy === f.id}
                onClick={() => runImport(f.id, f.name)}
                className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 text-sm disabled:opacity-50">
                <div className="font-medium flex items-center gap-2">
                  <Copy className="h-3.5 w-3.5" /> {f.name}
                  {busy === f.id && <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto" />}
                </div>
                <div className="text-xs text-muted-foreground">{f.start_date}</div>
              </button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                          */
/* ------------------------------------------------------------------ */

export default function FestivalSoborgLoading() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<SoborgLoadingManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerForContract, setPickerForContract] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const reload = () => {
    setLoading(true);
    getSoborgLoadingManifest(slug).then((d) => { setData(d); setLoading(false); });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getSoborgLoadingManifest(slug).then((d) => { if (alive) { setData(d); setLoading(false); } });
    return () => { alive = false; };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading manifest…
      </div>
    );
  }
  if (!data) return <div className="p-6">Festival not found.</div>;

  const festivalId = data.festival.id;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(data.festival.start_date);
  const days = Math.round((start.getTime() - today.getTime()) / 86400000);

  const assignVehicleToContract = async (transportId: string) => {
    if (!pickerForContract) return;
    const { error } = await sb.from("festival_contracts")
      .update({ assigned_vehicle_id: transportId }).eq("id", pickerForContract);
    if (error) { toast.error(error.message); return; }
    toast.success("Vehicle assigned");
    setPickerForContract(null);
    reload();
  };

  const updateLoadingDate = async (transportId: string, date: string) => {
    const { error } = await sb.from("festival_transport")
      .update({ loading_date: date || null }).eq("id", transportId);
    if (error) { toast.error(error.message); return; }
    reload();
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <FestivalBackBar />
      <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> {data.festival.name}
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Søborg Loading Manifest</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.festival.name} · {data.total_items} items total ·{" "}
            {days >= 0 ? `T-${days} days to load` : `Started ${-days} days ago`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Copy className="h-4 w-4" /> Import from festival
          </Button>
          <Link to={`/festivals/${slug}/soborg-loading/export`}>
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4" /> Export PDF
            </Button>
          </Link>
        </div>
      </div>

      {data.vehicles.length === 0 && data.unassigned.concepts.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No equipment assigned to vehicles yet.
          </CardContent>
        </Card>
      )}

      <FestivalTrolleyAssignCard festivalId={festivalId} festivalSlug={slug} />

      {data.vehicles.map((veh) => (
        <Card key={veh.vehicle_id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-lg flex-wrap">
              <Truck className="h-5 w-5 text-primary" />
              <span>{veh.vehicle_type}</span>
              {veh.license_plate && <span className="text-xs text-muted-foreground">{veh.license_plate}</span>}
              <div className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <Input
                  type="date"
                  value={veh.loading_date ?? ""}
                  onChange={(e) => updateLoadingDate(veh.transport_id, e.target.value)}
                  className="h-7 w-[140px] text-xs"
                />
              </div>
              <span className="text-sm font-normal text-muted-foreground ml-auto">
                {veh.car_total_items} items
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {veh.concepts.map((cg) => {
              const grouped = regroupForSoborgPDF(cg.items_by_category);
              return (
              <div key={cg.contract_id} className="border-l-2 border-border pl-4">
                <div className="font-medium text-sm mb-2">
                  {cg.concept_name}
                  {cg.concept_alias && <span className="text-muted-foreground"> — {cg.concept_alias}</span>}
                  <span className="text-xs text-muted-foreground ml-2">({cg.total_items} items)</span>
                </div>
                <div className="space-y-3">
                  {sortedCategories(grouped).map((cat) => {
                    const Icon = CATEGORY_ICON[cat] ?? Package;
                    const items = grouped[cat];
                    return (
                      <div key={cat}>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          <Icon className="h-3.5 w-3.5" /> {categoryLabel(cat)}
                        </div>
                        <div className="space-y-0.5 pl-5">
                          {items.map((it) => <ItemLine key={it.id} item={it} />)}
                        </div>
                      </div>
                    );
                  })}
                  {cg.trolley_contents.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                        <ShoppingCart className="h-3.5 w-3.5" /> Trolley contents
                      </div>
                      <div className="space-y-0.5 pl-5">
                        {cg.trolley_contents.map((t) => (
                          <div key={t.id} className="text-sm flex items-baseline gap-2">
                            <span className="font-medium tabular-nums whitespace-nowrap">{t.quantity}</span>
                            <span>{t.item_name}</span>
                            {t.notes && <span className="text-xs text-muted-foreground italic">— {t.notes}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {data.unassigned.concepts.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700">
              <AlertTriangle className="h-4 w-4" /> Concepts without vehicle assignment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-2">
              {data.unassigned.concepts.map((c) => (
                <li key={c.contract_id} className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    • {c.concept_name}
                    {c.concept_alias && <span className="text-muted-foreground"> — {c.concept_alias}</span>}
                    {c.total_items > 0 && (
                      <span className="text-xs text-muted-foreground ml-2">({c.total_items} items)</span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setPickerForContract(c.contract_id)}>
                    <Truck className="h-3.5 w-3.5" /> Assign vehicle
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.not_loaded_from_soborg.items.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Snowflake className="h-4 w-4 text-blue-500" /> Delivered on-site (NOT loaded from Søborg)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {data.not_loaded_from_soborg.items.map((u) => (
                <li key={u.id}>
                  • {u.quantity}× {u.unit_label}
                  {u.container_type && <span> — {u.container_type}</span>}
                  {u.supplier && <span className="text-muted-foreground"> ({u.supplier})</span>}
                  {(u.delivery_date || u.pickup_date) && (
                    <span className="text-xs text-muted-foreground ml-2">
                      delivered {fmtDate(u.delivery_date)} · picked up {fmtDate(u.pickup_date)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <VehiclePickerDialog
        open={!!pickerForContract}
        onOpenChange={(v) => !v && setPickerForContract(null)}
        festivalId={festivalId}
        onPick={assignVehicleToContract}
      />
      <ImportFromFestivalDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        currentFestivalId={festivalId}
        currentSlug={slug}
        onImported={reload}
      />
    </div>
  );
}
