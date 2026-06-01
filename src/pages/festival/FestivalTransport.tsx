import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileUp, Pencil, Plus, Printer, Trash2, Truck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ImportFromPreviousCard, CARD_TABLES } from "@/components/festival/ImportFromPreviousCard";
import { useDraftMode } from "@/hooks/useDraftMode";

// ---------- types ----------
type Festival = { id: string; slug: string; name: string; start_date: string; end_date: string };
type SeasonRental = {
  id: string;
  vehicle_type: string | null;
  capacity: number | null;
  license_plate: string | null;
  accreditation_pdf_path: string | null;
  accreditation_uploaded_at: string | null;
  reservation_number: string | null;
  season_label: string | null;
  ownership: string | null;
};
type Vehicle = {
  id: string; festival_id: string; vehicle_type: string; capacity: number | null;
  status: string | null; season_rental_id: string | null; notes: string | null;
  accreditation_pdf_path: string | null; accreditation_uploaded_at: string | null;
  license_plate: string | null;
  season_rental?: SeasonRental | null;
};

// Phase 2K-3: dual-read helpers — canonical season_rentals first, fall back to legacy festival_transport columns.
function vName(v: Vehicle): string { return v.season_rental?.vehicle_type ?? v.vehicle_type ?? ""; }
function vCapacity(v: Vehicle): number | null { return v.season_rental?.capacity ?? v.capacity ?? null; }
function vPlate(v: Vehicle): string | null { return v.season_rental?.license_plate ?? v.license_plate ?? null; }
function vAccredPath(v: Vehicle): string | null { return v.season_rental?.accreditation_pdf_path ?? v.accreditation_pdf_path ?? null; }
function vAccredUploadedAt(v: Vehicle): string | null { return v.season_rental?.accreditation_uploaded_at ?? v.accreditation_uploaded_at ?? null; }
type Leg = {
  id: string; transport_id: string; leg_label: string; leg_phase: string;
  leg_date: string; leg_start_time: string | null; origin: string | null;
  destination: string | null; effective_capacity: number | null;
  cargo_description: string | null; notes: string | null; status: string;
};
type Assignment = {
  id: string; leg_id: string; staff_id: string | null; role: string;
  seat_position: string | null; pickup_point: string | null; notes: string | null;
};
type Staff = { id: string; name: string | null; role: string; requires_transport: boolean; home_location: string | null };

const VEHICLE_STATUSES = ["planned", "booked", "picked-up", "returned", "cancelled"];
const LEG_STATUSES = ["planned", "confirmed", "completed", "cancelled"];
const LEG_PHASES = [
  "setup_outbound", "crew_outbound", "festival_shuttle",
  "tour_city_move", "pre_build", "return_home", "support",
];

const PHASE_LABEL: Record<string, string> = {
  setup_outbound: "Setup outbound",
  crew_outbound: "Crew outbound",
  festival_shuttle: "Festival shuttle",
  tour_city_move: "Tour city move",
  pre_build: "Pre-build",
  return_home: "Return home",
  support: "Support",
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function fmtDateLong(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Bucket staff by home city (Aarhus / Copenhagen / Other)
function cityBucket(loc: string | null | undefined): "aarhus" | "copenhagen" | "other" {
  const s = (loc ?? "").toLowerCase();
  if (s.includes("aarhus") || s.includes("århus")) return "aarhus";
  if (s.includes("copenhagen") || s.includes("københavn") || s.includes("kobenhavn") || s.includes("kbh")) return "copenhagen";
  return "other";
}

function StaffOptions({
  staff, assignedIds, currentId,
}: { staff: Staff[]; assignedIds: Set<string>; currentId?: string | null }) {
  const groups: { key: string; label: string; items: Staff[] }[] = [
    { key: "aarhus", label: "Aarhus", items: [] },
    { key: "copenhagen", label: "Copenhagen", items: [] },
    { key: "other", label: "Other", items: [] },
  ];
  staff.forEach((s) => {
    const b = cityBucket(s.home_location);
    groups.find((g) => g.key === b)!.items.push(s);
  });
  return (
    <>
      {groups.filter((g) => g.items.length > 0).map((g) => (
        <SelectGroup key={g.key}>
          <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.label}</SelectLabel>
          {g.items.map((s) => {
            const taken = assignedIds.has(s.id) && s.id !== currentId;
            return (
              <SelectItem
                key={s.id}
                value={s.id}
                className={cn(taken && "text-destructive line-through opacity-70")}
              >
                {s.name ?? "(unnamed)"} · {s.role}
                {taken && " · assigned"}
              </SelectItem>
            );
          })}
        </SelectGroup>
      ))}
    </>
  );
}

// ============================================================
export default function FestivalTransport() {
  const { draftMode } = useDraftMode();
  const { slug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const focusLegId = searchParams.get("leg");

  const { data: festival } = useQuery({
    queryKey: ["festival", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals").select("id,slug,name,start_date,end_date").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["transport-vehicles", slug],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_transport")
        .select("id,festival_id,vehicle_type,capacity,status,season_rental_id,notes,accreditation_pdf_path,accreditation_uploaded_at,license_plate, season_rental:season_rentals(id,vehicle_type,capacity,license_plate,accreditation_pdf_path,accreditation_uploaded_at,reservation_number,season_label,ownership)")
        .eq("festival_id", festival!.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as any as Vehicle[];
    },
  });

  const vehicleIds = vehicles.map((v) => v.id);

  const { data: legs = [] } = useQuery({
    queryKey: ["transport-legs-all", slug, vehicleIds.join(",")],
    enabled: vehicleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transport_legs")
        .select("*")
        .in("transport_id", vehicleIds)
        .order("leg_date").order("leg_start_time");
      if (error) throw error;
      return (data ?? []) as any as Leg[];
    },
  });

  const legIds = legs.map((l) => l.id);

  const { data: assignments = [] } = useQuery({
    queryKey: ["transport-assignments-all", slug, legIds.join(",")],
    enabled: legIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transport_leg_assignments")
        .select("*")
        .in("leg_id", legIds);
      if (error) throw error;
      return (data ?? []) as any as Assignment[];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["festival-staff", festival?.id, draftMode],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_staff")
        .select("id,name,role,requires_transport,home_location")
        .eq("festival_id", festival!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as any as Staff[];
    },
  });

  const staffById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);

  // For each leg, set of staff_ids already assigned (any role) to ANOTHER leg in
  // the same (festival_id, leg_date, leg_phase). All legs here belong to one festival.
  const conflictByLeg = useMemo(() => {
    const legById = new Map(legs.map((l) => [l.id, l]));
    // Group staff_ids by `${date}|${phase}` -> array of {legId, staffId}
    const slotIndex = new Map<string, { legId: string; staffId: string }[]>();
    assignments.forEach((a) => {
      if (!a.staff_id) return;
      const l = legById.get(a.leg_id);
      if (!l) return;
      const key = `${l.leg_date}|${l.leg_phase}`;
      if (!slotIndex.has(key)) slotIndex.set(key, []);
      slotIndex.get(key)!.push({ legId: a.leg_id, staffId: a.staff_id });
    });
    const result = new Map<string, Set<string>>();
    legs.forEach((l) => {
      const key = `${l.leg_date}|${l.leg_phase}`;
      const entries = slotIndex.get(key) ?? [];
      const set = new Set<string>();
      entries.forEach((e) => {
        if (e.legId !== l.id) set.add(e.staffId);
      });
      result.set(l.id, set);
    });
    return result;
  }, [legs, assignments]);

  // Per-date set of staff currently assigned (any role) to ANY leg on that date.
  // A driver assigned on the 21st is still "available" on the 18th.
  const assignedIdsByDate = useMemo(() => {
    const legById = new Map(legs.map((l) => [l.id, l]));
    const map = new Map<string, Set<string>>();
    assignments.forEach((a) => {
      if (!a.staff_id) return;
      const l = legById.get(a.leg_id);
      if (!l) return;
      if (!map.has(l.leg_date)) map.set(l.leg_date, new Set());
      map.get(l.leg_date)!.add(a.staff_id);
    });
    return map;
  }, [legs, assignments]);

  // Staff assigned to ANY return_home leg, regardless of date. Used on return legs
  // so nobody is "left at the hotel" — once they have a return ride, they appear
  // as taken in every other return leg dropdown.
  const returnHomeAssignedIds = useMemo(() => {
    const legById = new Map(legs.map((l) => [l.id, l]));
    const set = new Set<string>();
    assignments.forEach((a) => {
      if (!a.staff_id) return;
      const l = legById.get(a.leg_id);
      if (!l || l.leg_phase !== "return_home") return;
      set.add(a.staff_id);
    });
    return set;
  }, [legs, assignments]);

  // Scroll to focused leg
  useEffect(() => {
    if (!focusLegId || legs.length === 0) return;
    const el = document.getElementById(`leg-${focusLegId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2500);
    }
  }, [focusLegId, legs.length]);

  // Aggregate stats
  const totalSeats = vehicles.reduce((a, v) => a + (vCapacity(v) ?? 0), 0);
  const totalAssignments = assignments.filter((a) => a.staff_id).length;
  const driverCount = useMemo(() => new Set(assignments.filter((a) => a.role === "driver" && a.staff_id).map((a) => a.staff_id!)).size, [assignments]);

  // Phase summary
  const phaseSummary = useMemo(() => {
    const groups = new Map<string, Leg[]>();
    legs.forEach((l) => {
      const key = `${l.leg_phase}|${l.leg_date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(l);
    });
    return Array.from(groups.entries()).map(([key, gLegs]) => {
      const [phase, date] = key.split("|");
      const seats = gLegs.reduce((a, l) => a + (l.effective_capacity ?? 0), 0);
      const legAssignments = assignments.filter((a) => gLegs.some((l) => l.id === a.leg_id));
      const assigned = legAssignments.filter((a) => a.staff_id).length;
      const tbdDrivers = gLegs.filter((l) => {
        const driverA = legAssignments.find((a) => a.leg_id === l.id && a.role === "driver");
        return !driverA || !driverA.staff_id;
      }).length;
      return { phase, date, count: gLegs.length, seats, assigned, tbdDrivers };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [legs, assignments]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 print:max-w-full print:space-y-4">

      {festival?.id && <AccreditationCard festivalId={festival.id} />}

      <ImportFromPreviousCard
        cardLabel="transport"
        tables={CARD_TABLES.transport}
        currentFestivalId={festival?.id ?? ""}
        onCommitted={() => window.location.reload()}
      />
      {/* Print header (only in print) */}
      <div className="hidden print:block print-header">
        <div className="text-sm font-bold">
          {festival?.name} — Transport Plan
        </div>
        <div className="text-xs text-gray-600">
          Generated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Copenhagen" })}
        </div>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 print:hidden">
          <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> {festival?.name ?? slug}
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Screen print
            </Button>
            <Button asChild size="sm" className="shrink-0">
              <a href={`/festivals/${slug}/transport/export`} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" /> Export PDF
              </a>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Transport</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Festival vehicles and transport legs. Vehicles are assigned to concepts on the Equipment page.
        </p>
      </div>

      {/* Summary pills */}
      {vehicles.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
            {vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}
          </span>
          <span className={cn(
            "px-2.5 py-1 rounded-full border",
            totalAssignments > 0
              ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
              : "bg-muted text-muted-foreground"
          )}>
            {totalAssignments} assignment{totalAssignments === 1 ? "" : "s"}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
            {legs.length} leg{legs.length === 1 ? "" : "s"}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
            {driverCount} driver{driverCount === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Phase summary */}
      {phaseSummary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:grid-cols-4 print:gap-2 print:break-after-page">
          {phaseSummary.map((p, i) => {
            const tbd = p.tbdDrivers > 0;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-2xl border p-4 text-sm print:border-2 print:rounded-none",
                  tbd
                    ? "border-destructive/40 bg-destructive/5 print:bg-white"
                    : "border-emerald-500/40 bg-emerald-500/5 print:bg-white",
                )}
              >
                <div className="font-semibold text-xs uppercase tracking-wide text-muted-foreground print:text-black">
                  {PHASE_LABEL[p.phase] ?? p.phase}
                </div>
                <div className="font-medium">{fmtDate(p.date)}</div>
                <div className="mt-1 text-xs text-muted-foreground print:text-black">
                  {p.count} {p.count === 1 ? "vehicle" : "vehicles"} · {p.seats} seats · {p.assigned} assigned
                </div>
                {tbd && (
                  <div className="mt-1 text-xs font-semibold text-destructive print:text-black">
                    🚨 {p.tbdDrivers} driver{p.tbdDrivers === 1 ? "" : "s"} TBD
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Vehicles */}
      <div className="space-y-4 print:space-y-3">
        {vehicles.map((v) => (
          <VehicleBlock
            key={v.id}
            vehicle={v}
            legs={legs.filter((l) => l.transport_id === v.id)}
            assignments={assignments}
            staff={staff}
            staffById={staffById}
            festivalId={festival?.id ?? ""}
            slug={slug}
            focusLegId={focusLegId}
            conflictByLeg={conflictByLeg}
            assignedIdsByDate={assignedIdsByDate}
            returnHomeAssignedIds={returnHomeAssignedIds}
          />
        ))}
        {vehicles.length === 0 && festival && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground space-y-4">
            <div className="flex items-center justify-center">
              <div className="h-12 w-12 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center">
                <Truck className="h-6 w-6" />
              </div>
            </div>
            <p>No vehicles allocated yet.</p>
          </div>
        )}
      </div>

      <div className="print:hidden">
        <AddVehicleButton festivalId={festival?.id ?? ""} slug={slug} />
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body { background: white !important; }
          .print\\:hidden, nav, aside, [data-sidebar] { display: none !important; }
          .vehicle-block { break-inside: avoid; page-break-inside: avoid; }
          .leg-row { break-inside: avoid; page-break-inside: avoid; }
          .print-header { position: running(header); }
          * { color: black !important; box-shadow: none !important; }
          .badge-print { border: 1px solid #999; padding: 1px 4px; border-radius: 2px; font-size: 10px; }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

// ============================================================
function VehicleBlock({
  vehicle, legs, assignments, staff, staffById, festivalId, slug, focusLegId, conflictByLeg, assignedIdsByDate, returnHomeAssignedIds,
}: {
  vehicle: Vehicle; legs: Leg[]; assignments: Assignment[]; staff: Staff[];
  staffById: Record<string, Staff>; festivalId: string; slug: string; focusLegId: string | null;
  conflictByLeg: Map<string, Set<string>>;
  assignedIdsByDate: Map<string, Set<string>>;
  returnHomeAssignedIds: Set<string>;
}) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [addLegOpen, setAddLegOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const cancelled = vehicle.status === "cancelled";

  const deleteVehicle = useMutation({
    mutationFn: async () => {
      // Delete assignments for this vehicle's legs first
      const legIds = legs.map((l) => l.id);
      if (legIds.length > 0) {
        const { error: assignErr } = await supabase
          .from("transport_leg_assignments")
          .delete()
          .in("leg_id", legIds);
        if (assignErr) throw assignErr;
      }
      // Then delete legs
      if (legIds.length > 0) {
        const { error: legErr } = await supabase
          .from("transport_legs")
          .delete()
          .in("id", legIds);
        if (legErr) throw legErr;
      }
      // Finally delete the vehicle
      const { error } = await supabase
        .from("festival_transport")
        .delete()
        .eq("id", vehicle.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport-vehicles", slug] });
      qc.invalidateQueries({ queryKey: ["transport-legs-all"] });
      qc.invalidateQueries({ queryKey: ["transport-assignments-all"] });
      toast.success("Vehicle deleted");
      setDeleteOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete vehicle"),
  });

  return (
    <div
      className={cn(
        "vehicle-block rounded-2xl border bg-card overflow-hidden shadow-sm print:border-2 print:rounded-none",
        cancelled && "opacity-50 relative",
      )}
    >
      {cancelled && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="bg-destructive/80 text-destructive-foreground px-6 py-2 font-bold tracking-widest rotate-[-8deg] rounded">
            CANCELLED
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 p-5 border-b bg-muted/30 print:bg-white print:border-b-2">
        <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center shrink-0 print:hidden">
          <Truck className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">{vName(vehicle)}</h3>
            <span className="text-xs px-2 py-0.5 rounded border bg-background badge-print">
              {vCapacity(vehicle) ?? "?"} seats
            </span>
            <StatusPill status={vehicle.status ?? "planned"} />
            {vehicle.season_rental?.reservation_number && (
              <span className="text-xs text-muted-foreground border px-2 py-0.5 rounded badge-print">
                Res {vehicle.season_rental.reservation_number}
              </span>
            )}
          </div>
          {vehicle.notes && <p className="text-xs text-muted-foreground mt-1 print:hidden">{vehicle.notes}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} className="print:hidden">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)} className="print:hidden text-destructive hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <AccreditationBlock vehicle={vehicle} slug={slug} />
      <LicensePlateBlock vehicle={vehicle} slug={slug} />

      <LegsTable
        legs={legs}
        assignments={assignments}
        staff={staff}
        staffById={staffById}
        festivalId={festivalId}
        focusLegId={focusLegId}
        conflictByLeg={conflictByLeg}
        assignedIdsByDate={assignedIdsByDate}
        returnHomeAssignedIds={returnHomeAssignedIds}
      />

      <div className="p-3 border-t print:hidden">
        <Button variant="outline" size="sm" onClick={() => setAddLegOpen(true)}>
          <Plus className="h-4 w-4" /> Add leg
        </Button>
      </div>

      <VehicleEditDrawer open={editOpen} onOpenChange={setEditOpen} vehicle={vehicle} slug={slug} />
      <LegEditDrawer
        open={addLegOpen}
        onOpenChange={setAddLegOpen}
        slug={slug}
        transportId={vehicle.id}
        defaultCapacity={vCapacity(vehicle)}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{vName(vehicle)}</strong> and all {legs.length} leg{legs.length === 1 ? "" : "s"} associated with it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteVehicle.mutate()}
              disabled={deleteVehicle.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteVehicle.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    planned: "bg-muted text-muted-foreground border-border",
    booked: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300",
    "picked-up": "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    returned: "bg-muted text-muted-foreground border-border",
    cancelled: "bg-destructive/10 text-destructive border-destructive/30",
    confirmed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  };
  return (
    <span className={cn("text-[10px] uppercase font-semibold px-2 py-0.5 rounded border badge-print print:bg-white", cls[status] ?? cls.planned)}>
      {status}
    </span>
  );
}

// ============================================================
function LegsTable({
  legs, assignments, staff, staffById, festivalId, focusLegId, conflictByLeg, assignedIdsByDate, returnHomeAssignedIds,
}: {
  legs: Leg[]; assignments: Assignment[]; staff: Staff[];
  staffById: Record<string, Staff>; festivalId: string; focusLegId: string | null;
  conflictByLeg: Map<string, Set<string>>;
  assignedIdsByDate: Map<string, Set<string>>;
  returnHomeAssignedIds: Set<string>;
}) {
  if (legs.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground italic">No legs scheduled.</div>;
  }
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-muted-foreground bg-muted/20 print:bg-white">
          <tr>
            <th className="text-left p-3">Date</th>
            <th className="text-left p-3">Phase</th>
            <th className="text-left p-3">Label</th>
            <th className="text-left p-3">From → To</th>
            <th className="text-left p-3">Driver</th>
            <th className="text-left p-3">Passengers</th>
            <th className="text-left p-3 print:hidden">Status</th>
            <th className="text-left p-3 print:hidden"></th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg) => (
            <LegRow
              key={leg.id}
              leg={leg}
              assignments={assignments.filter((a) => a.leg_id === leg.id)}
              vehicleLegs={legs}
              vehicleAssignments={assignments}
              staff={staff}
              staffById={staffById}
              festivalId={festivalId}
              highlighted={focusLegId === leg.id}
              conflictStaffIds={conflictByLeg.get(leg.id) ?? new Set()}
              assignedIds={
                leg.leg_phase === "return_home"
                  ? new Set<string>([
                      ...(assignedIdsByDate.get(leg.leg_date) ?? new Set<string>()),
                      ...returnHomeAssignedIds,
                    ])
                  : (assignedIdsByDate.get(leg.leg_date) ?? new Set<string>())
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegRow({
  leg, assignments, vehicleLegs, vehicleAssignments, staff, staffById, festivalId, highlighted, conflictStaffIds, assignedIds,
}: {
  leg: Leg; assignments: Assignment[];
  vehicleLegs: Leg[]; vehicleAssignments: Assignment[];
  staff: Staff[];
  staffById: Record<string, Staff>; festivalId: string; highlighted: boolean;
  conflictStaffIds: Set<string>;
  assignedIds: Set<string>;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const driver = assignments.find((a) => a.role === "driver");
  const passengers = assignments.filter((a) => a.role !== "driver");
  const cap = leg.effective_capacity ?? 0;
  const assignedCount = assignments.filter((a) => a.staff_id).length;
  const overCapacity = assignedCount > cap;

  // For return_home legs, find a source outbound leg of the same vehicle to copy from
  const isReturn = leg.leg_phase === "return_home";
  const sourceLeg = useMemo(() => {
    if (!isReturn) return null;
    const candidates = vehicleLegs
      .filter((l) => l.id !== leg.id && l.leg_phase !== "return_home" && l.leg_date <= leg.leg_date)
      .filter((l) => vehicleAssignments.some((a) => a.leg_id === l.id && a.staff_id))
      .sort((a, b) => b.leg_date.localeCompare(a.leg_date));
    return candidates[0] ?? null;
  }, [isReturn, vehicleLegs, vehicleAssignments, leg.id, leg.leg_date]);

  const copyFromSource = useMutation({
    mutationFn: async () => {
      if (!sourceLeg) throw new Error("No outbound leg to copy from");
      const src = vehicleAssignments.filter((a) => a.leg_id === sourceLeg.id && a.staff_id);
      // Existing staff on the target leg — skip duplicates
      const existing = new Set(assignments.filter((a) => a.staff_id).map((a) => a.staff_id!));
      // If target already has a driver assigned, don't overwrite
      const hasDriver = !!driver?.staff_id;
      const rows = src
        .filter((a) => !existing.has(a.staff_id!))
        .filter((a) => !(a.role === "driver" && hasDriver))
        .map((a) => ({ leg_id: leg.id, role: a.role, staff_id: a.staff_id }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("transport_leg_assignments").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["transport-assignments-all"] });
      toast.success(n ? `Copied ${n} assignment${n === 1 ? "" : "s"} from outbound` : "Nothing new to copy");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to copy"),
  });

  return (
    <>
      <tr
        id={`leg-${leg.id}`}
        className={cn(
          "leg-row border-t align-top",
          overCapacity && "border-l-4 border-l-destructive",
          highlighted && "bg-primary/5",
        )}
      >
        <td className="p-3 whitespace-nowrap">
          <div className="font-medium">{fmtDate(leg.leg_date)}</div>
          {leg.leg_start_time && <div className="text-xs text-muted-foreground">{leg.leg_start_time.slice(0, 5)}</div>}
        </td>
        <td className="p-3 text-xs">
          <span className="badge-print border px-2 py-0.5 rounded">{PHASE_LABEL[leg.leg_phase] ?? leg.leg_phase}</span>
        </td>
        <td className="p-3">
          <div className="font-medium">{leg.leg_label}</div>
          {leg.cargo_description && <div className="text-xs text-muted-foreground">{leg.cargo_description}</div>}
        </td>
        <td className="p-3 text-xs whitespace-nowrap">
          {leg.origin && <div>{leg.origin}</div>}
          {leg.destination && <div className="text-muted-foreground">→ {leg.destination}</div>}
        </td>
        <td className="p-3">
          <DriverCell leg={leg} driver={driver} staff={staff} staffById={staffById} festivalId={festivalId} conflictStaffIds={conflictStaffIds} assignedIds={assignedIds} />
        </td>
        <td className="p-3">
          <PassengersCell
            leg={leg}
            passengers={passengers}
            assignments={assignments}
            staff={staff}
            staffById={staffById}
            cap={cap}
            assignedCount={assignedCount}
            overCapacity={overCapacity}
            expanded={expanded}
            setExpanded={setExpanded}
            conflictStaffIds={conflictStaffIds}
            assignedIds={assignedIds}
          />
        </td>
        <td className="p-3 print:hidden">
          <StatusPill status={leg.status} />
        </td>
        <td className="p-3 print:hidden">
          <div className="flex items-center gap-1">
            {isReturn && sourceLeg && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1"
                title={`Copy driver + passengers from ${PHASE_LABEL[sourceLeg.leg_phase] ?? sourceLeg.leg_phase} (${fmtDate(sourceLeg.leg_date)})`}
                onClick={() => copyFromSource.mutate()}
                disabled={copyFromSource.isPending}
              >
                Copy from outbound
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </td>
      </tr>
      {/* Print-only passenger list */}
      {passengers.length > 0 && (
        <tr className="hidden print:table-row leg-row">
          <td></td>
          <td colSpan={7} className="px-3 pb-2 text-xs">
            <span className="font-semibold">Passengers:</span>{" "}
            {passengers
              .map((p) => (p.staff_id ? (staffById[p.staff_id]?.name ?? "?") : "TBD"))
              .join(", ")}
          </td>
        </tr>
      )}
      <LegEditDrawer open={editOpen} onOpenChange={setEditOpen} slug="" transportId={leg.transport_id} leg={leg} />
    </>
  );
}

// ============================================================
function DriverCell({
  leg, driver, staff, staffById, festivalId, conflictStaffIds, assignedIds,
}: { leg: Leg; driver: Assignment | undefined; staff: Staff[]; staffById: Record<string, Staff>; festivalId: string; conflictStaffIds: Set<string>; assignedIds: Set<string> }) {
  const qc = useQueryClient();

  const upsertDriver = useMutation({
    mutationFn: async (staffId: string | null) => {
      // "__none__" / null clears the assignment entirely
      if (staffId === null) {
        if (driver) {
          const { error } = await supabase
            .from("transport_leg_assignments").delete().eq("id", driver.id);
          if (error) throw error;
        }
        return;
      }
      if (driver) {
        const { error } = await supabase
          .from("transport_leg_assignments")
          .update({ staff_id: staffId, updated_at: new Date().toISOString() })
          .eq("id", driver.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("transport_leg_assignments")
          .insert({ leg_id: leg.id, role: "driver", staff_id: staffId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport-assignments-all"] });
      toast.success("Driver updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const handleSelect = (v: string) => upsertDriver.mutate(v === "__none__" ? null : v);

  // Print: just text
  const printName = driver?.staff_id ? staffById[driver.staff_id]?.name ?? "?" : "__________________";

  if (!driver) {
    return (
      <>
        <div className="hidden print:block text-xs">DRIVER: __________________</div>
        <div className="print:hidden">
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-orange-500/40 text-orange-700 dark:text-orange-300"
            onClick={async () => {
              const { error } = await supabase
                .from("transport_leg_assignments")
                .insert({ leg_id: leg.id, role: "driver", staff_id: null });
              if (error) { toast.error(error.message); return; }
              qc.invalidateQueries({ queryKey: ["transport-assignments-all"] });
            }}
          >
            <Plus className="h-3 w-3" /> Add driver
          </Button>
        </div>
      </>
    );
  }

  if (!driver.staff_id) {
    return (
      <>
        <div className="hidden print:block text-xs">DRIVER: __________________</div>
        <div className="print:hidden">
          <Select onValueChange={handleSelect}>
            <SelectTrigger className="h-8 text-xs border-destructive/50 bg-destructive/5 text-destructive">
              <SelectValue placeholder="🚨 TBD — Assign driver" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-muted-foreground italic">— None —</SelectItem>
              <StaffOptions staff={staff} assignedIds={assignedIds} />
            </SelectContent>
          </Select>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="hidden print:block text-xs font-medium">DRIVER: {printName}</div>
      <div className="print:hidden">
        <Select value={driver.staff_id} onValueChange={handleSelect}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-muted-foreground italic">— None (clear) —</SelectItem>
            <StaffOptions staff={staff} assignedIds={assignedIds} currentId={driver.staff_id} />
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

// ============================================================
function PassengersCell({
  leg, passengers, assignments, staff, staffById, cap, assignedCount, overCapacity, expanded, setExpanded, conflictStaffIds, assignedIds,
}: {
  leg: Leg; passengers: Assignment[]; assignments: Assignment[]; staff: Staff[];
  staffById: Record<string, Staff>; cap: number; assignedCount: number; overCapacity: boolean;
  expanded: boolean; setExpanded: (b: boolean) => void; conflictStaffIds: Set<string>;
  assignedIds: Set<string>;
}) {
  const qc = useQueryClient();
  const usedStaffIds = new Set(assignments.filter((a) => a.staff_id).map((a) => a.staff_id!));
  const available = staff.filter((s) => s.requires_transport && !usedStaffIds.has(s.id));

  const addPassenger = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await supabase
        .from("transport_leg_assignments")
        .insert({ leg_id: leg.id, role: "passenger", staff_id: staffId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport-assignments-all"] });
      toast.success("Passenger added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transport_leg_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport-assignments-all"] });
    },
  });

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "text-xs font-medium tabular-nums hover:underline print:no-underline",
          overCapacity && "text-destructive",
        )}
      >
        {assignedCount} / {cap}
        {overCapacity && <span className="ml-1 badge-print border border-destructive px-1 rounded">OVER CAPACITY</span>}
      </button>
      {(expanded || passengers.length > 0) && (
        <ul className={cn("mt-1 space-y-0.5 text-xs", !expanded && "hidden print:block")}>
          {passengers.map((p) => {
            const s = p.staff_id ? staffById[p.staff_id] : null;
            return (
              <li key={p.id} className="flex items-center gap-1">
                <span>{s?.name ?? "TBD"}</span>
                {p.seat_position && <span className="text-muted-foreground">· {p.seat_position}</span>}
                <button
                  onClick={() => removeAssignment.mutate(p.id)}
                  className="ml-auto print:hidden text-muted-foreground hover:text-destructive"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {expanded && (
        <div className="mt-2 print:hidden">
          <Select onValueChange={(v) => addPassenger.mutate(v)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="+ Add passenger" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No staff available</div>}
              <StaffOptions staff={available} assignedIds={assignedIds} />
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ============================================================
function AccreditationBlock({ vehicle, slug }: { vehicle: Vehicle; slug: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const path = vAccredPath(vehicle);
  const uploadedAt = vAccredUploadedAt(vehicle);

  const refresh = () => qc.invalidateQueries({ queryKey: ["transport-vehicles", slug] });

  async function uploadFile(file: File) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files allowed");
      return;
    }
    setBusy(true);
    try {
      const objectPath = `${slug}/${vehicle.id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("vehicle-permits")
        .upload(objectPath, file, { upsert: true, contentType: "application/pdf" });
      if (upErr) throw upErr;
      // Phase 2K-3: dual-write to canonical season_rentals + legacy festival_transport.
      const ts = new Date().toISOString();
      const writes: Promise<any>[] = [
        Promise.resolve(supabase.from("festival_transport")
          .update({ accreditation_pdf_path: objectPath, accreditation_uploaded_at: ts })
          .eq("id", vehicle.id)),
      ];
      if (vehicle.season_rental_id) {
        writes.push(Promise.resolve(supabase.from("season_rentals")
          .update({ accreditation_pdf_path: objectPath, accreditation_uploaded_at: ts })
          .eq("id", vehicle.season_rental_id)));
      }
      const results = await Promise.all(writes);
      const dbErr = results.find((r) => r.error)?.error;
      if (dbErr) throw dbErr;
      toast.success("Accreditation uploaded");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function openSigned() {
    if (!path) return;
    const { data, error } = await supabase.storage.from("vehicle-permits").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not create link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function downloadFile() {
    if (!path) return;
    try {
      const { data, error } = await supabase.storage.from("vehicle-permits").download(path);
      if (error || !data) throw error ?? new Error("No file");
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-${vName(vehicle).replace(/\s+/g, "_")}-accreditation.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? "Download failed");
    }
  }

  async function removeFile() {
    if (!path) return;
    setBusy(true);
    try {
      const { error: rmErr } = await supabase.storage.from("vehicle-permits").remove([path]);
      if (rmErr) throw rmErr;
      const writes: Promise<any>[] = [
        Promise.resolve(supabase.from("festival_transport")
          .update({ accreditation_pdf_path: null, accreditation_uploaded_at: null })
          .eq("id", vehicle.id)),
      ];
      if (vehicle.season_rental_id) {
        writes.push(Promise.resolve(supabase.from("season_rentals")
          .update({ accreditation_pdf_path: null, accreditation_uploaded_at: null })
          .eq("id", vehicle.season_rental_id)));
      }
      const results = await Promise.all(writes);
      const dbErr = results.find((r) => r.error)?.error;
      if (dbErr) throw dbErr;
      toast.success("Accreditation removed");
      setConfirmRemove(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  function pickFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) uploadFile(f);
    };
    input.click();
  }

  return (
    <div className="px-4 py-3 border-b bg-background print:hidden">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Accreditation
        </div>
        {path ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Uploaded {uploadedAt ? new Date(uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={openSigned} disabled={busy}>View</Button>
              <Button variant="outline" size="sm" onClick={downloadFile} disabled={busy}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
              <Button variant="outline" size="sm" onClick={pickFile} disabled={busy}>
                <FileUp className="h-3.5 w-3.5" /> Replace
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmRemove(true)} disabled={busy}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300">
              <AlertCircle className="h-3.5 w-3.5" />
              No accreditation uploaded
            </span>
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={pickFile} disabled={busy}>
                <FileUp className="h-3.5 w-3.5" /> Upload PDF
              </Button>
            </div>
          </>
        )}
      </div>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove accreditation?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the PDF from storage. You can re-upload at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeFile} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
function LicensePlateBlock({ vehicle, slug }: { vehicle: Vehicle; slug: string }) {
  const qc = useQueryClient();
  const initial = vPlate(vehicle) ?? "";
  const [plateInput, setPlateInput] = useState(initial);
  const [savedPlate, setSavedPlate] = useState(initial);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    const v = vPlate(vehicle) ?? "";
    setPlateInput(v);
    setSavedPlate(v);
    setSaveStatus("idle");
  }, [vehicle.license_plate, vehicle.season_rental?.license_plate]);

  const hasUnsavedChanges = plateInput.trim() !== savedPlate.trim();

  async function handleSave() {
    setSaveStatus("saving");
    const trimmed = plateInput.trim().slice(0, 12);
    const valueToSave = trimmed === "" ? null : trimmed;
    // Phase 2K-3: dual-write — canonical season_rentals + legacy festival_transport.
    const writes: Promise<any>[] = [
      Promise.resolve(supabase.from("festival_transport")
        .update({ license_plate: valueToSave })
        .eq("id", vehicle.id)),
    ];
    if (vehicle.season_rental_id) {
      writes.push(Promise.resolve(supabase.from("season_rentals")
        .update({ license_plate: valueToSave })
        .eq("id", vehicle.season_rental_id)));
    }
    const results = await Promise.all(writes);
    const err = results.find((r) => r.error)?.error;
    if (err) {
      setSaveStatus("error");
      console.error("Failed to save license plate:", err);
      return;
    }
    setSavedPlate(trimmed);
    setSaveStatus("saved");
    setTimeout(() => {
      setSaveStatus("idle");
    }, 2000);
    qc.invalidateQueries({ queryKey: ["transport-vehicles", slug] });
    qc.invalidateQueries({ queryKey: ["festival-loading-vehicles"] });
  }

  const empty = !savedPlate.trim();

  // Button state A-E styling
  let btnCls = "";
  let btnLabel = "Save";
  let btnDisabled = false;

  if (saveStatus === "idle" && !hasUnsavedChanges) {
    // A. DISABLED (nothing to save)
    btnCls = "bg-gray-200 text-gray-500 cursor-not-allowed opacity-50";
    btnLabel = "Save";
    btnDisabled = true;
  } else if (saveStatus === "idle" && hasUnsavedChanges) {
    // B. ENABLED (unsaved changes)
    btnCls = "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer";
    btnLabel = "Save";
    btnDisabled = false;
  } else if (saveStatus === "saving") {
    // C. SAVING
    btnCls = "bg-blue-400 text-white cursor-not-allowed opacity-70";
    btnLabel = "Saving...";
    btnDisabled = true;
  } else if (saveStatus === "saved") {
    // D. SAVED (transient)
    btnCls = "bg-green-600 text-white cursor-not-allowed";
    btnLabel = "Saved";
    btnDisabled = true;
  } else if (saveStatus === "error") {
    // E. ERROR
    btnCls = "bg-red-600 text-white hover:bg-red-700 cursor-pointer";
    btnLabel = "Failed — retry";
    btnDisabled = false;
  }

  return (
    <div className="px-4 py-3 border-b bg-background print:hidden">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          License plate
        </div>
        <Input
          value={plateInput}
          onChange={(e) => setPlateInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hasUnsavedChanges) handleSave();
          }}
          maxLength={12}
          placeholder="AB 12 345"
          className={cn(
            "h-8 w-[140px] font-mono text-sm uppercase tracking-wider",
            empty && "bg-destructive/10 border-destructive/40",
          )}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={btnDisabled}
          className={cn(
            "h-8 px-3 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1",
            btnCls,
          )}
        >
          {saveStatus === "saved" && <CheckCircle2 className="h-3.5 w-3.5" />}
          {saveStatus === "error" && <X className="h-3.5 w-3.5" />}
          {btnLabel}
        </button>
        {empty && <span className="text-xs text-destructive font-medium">Not entered</span>}
      </div>
    </div>
  );
}

// ============================================================
function VehicleEditDrawer({
  open, onOpenChange, vehicle, slug,
}: { open: boolean; onOpenChange: (b: boolean) => void; vehicle: Vehicle; slug: string }) {
  const qc = useQueryClient();
  const initialCapacity = vCapacity(vehicle) ?? 0;
  const [capacity, setCapacity] = useState(initialCapacity);
  const [status, setStatus] = useState(vehicle.status ?? "planned");
  const [notes, setNotes] = useState(vehicle.notes ?? "");

  useEffect(() => {
    setCapacity(vCapacity(vehicle) ?? 0);
    setStatus(vehicle.status ?? "planned");
    setNotes(vehicle.notes ?? "");
  }, [vehicle, open]);

  const save = useMutation({
    mutationFn: async () => {
      // Per-assignment fields stay on festival_transport. Capacity is canonical → dual-write.
      const legacyP = supabase
        .from("festival_transport")
        .update({ capacity, status, notes, updated_at: new Date().toISOString() })
        .eq("id", vehicle.id);
      const canonicalP = vehicle.season_rental_id
        ? supabase.from("season_rentals").update({ capacity }).eq("id", vehicle.season_rental_id)
        : null;
      if (!vehicle.season_rental_id) {
        console.warn("VehicleEditDrawer: vehicle has no season_rental_id, skipping canonical capacity write", vehicle.id);
      }
      const [legacyRes, canonicalRes] = await Promise.all([
        Promise.resolve(legacyP),
        canonicalP ? Promise.resolve(canonicalP) : Promise.resolve({ error: null } as any),
      ]);
      if ((legacyRes as any).error) throw (legacyRes as any).error;
      if ((canonicalRes as any).error) throw (canonicalRes as any).error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport-vehicles", slug] });
      toast.success("Vehicle updated");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit vehicle</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Vehicle</Label>
            <p className="text-sm font-medium">{vName(vehicle)}</p>
          </div>
          <div>
            <Label>Capacity</Label>
            <Input type="number" value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VEHICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </div>
        </div>
        <SheetFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
function LegEditDrawer({
  open, onOpenChange, slug, transportId, leg, defaultCapacity,
}: {
  open: boolean; onOpenChange: (b: boolean) => void; slug: string; transportId: string;
  leg?: Leg; defaultCapacity?: number | null;
}) {
  const qc = useQueryClient();
  const { draftMode } = useDraftMode();
  const [form, setForm] = useState({
    leg_label: leg?.leg_label ?? "",
    leg_phase: leg?.leg_phase ?? "setup_outbound",
    leg_date: leg?.leg_date ?? "",
    leg_start_time: leg?.leg_start_time ?? "",
    origin: leg?.origin ?? "",
    destination: leg?.destination ?? "",
    effective_capacity: leg?.effective_capacity ?? defaultCapacity ?? 0,
    cargo_description: leg?.cargo_description ?? "",
    notes: leg?.notes ?? "",
    status: leg?.status ?? "planned",
  });

  useEffect(() => {
    if (open && leg) {
      setForm({
        leg_label: leg.leg_label, leg_phase: leg.leg_phase, leg_date: leg.leg_date,
        leg_start_time: leg.leg_start_time ?? "", origin: leg.origin ?? "",
        destination: leg.destination ?? "", effective_capacity: leg.effective_capacity ?? 0,
        cargo_description: leg.cargo_description ?? "", notes: leg.notes ?? "", status: leg.status,
      });
    } else if (open && !leg) {
      setForm((f) => ({ ...f, effective_capacity: defaultCapacity ?? 0 }));
    }
  }, [open, leg, defaultCapacity]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        leg_start_time: form.leg_start_time || null,
        transport_id: transportId,
        updated_at: new Date().toISOString(),
      };
      if (leg) {
        const { error } = await supabase.from("transport_legs").update(payload).eq("id", leg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transport_legs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["transport-legs-all"] });
      toast.success(leg ? "Leg updated" : "Leg created");
      onOpenChange(false);

      // Warn if any required staff is still missing a return ride
      if (form.leg_phase === "return_home") {
        try {
          const { data: tRow } = await supabase
            .from("festival_transport").select("festival_id").eq("id", transportId).maybeSingle();
          const fid = tRow?.festival_id;
          if (!fid) return;
          const [{ data: allStaff }, { data: allVehicles }] = await Promise.all([
            supabase.from("festival_staff")
              .select("id,name,requires_transport").eq("festival_id", fid).eq("requires_transport", true),
            supabase.from("festival_transport").select("id").eq("festival_id", fid).eq("is_draft", draftMode),
          ]);
          const vids = (allVehicles ?? []).map((v: any) => v.id);
          if (vids.length === 0) return;
          const { data: returnLegs } = await supabase
            .from("transport_legs").select("id").in("transport_id", vids).eq("leg_phase", "return_home");
          const lids = (returnLegs ?? []).map((l: any) => l.id);
          const { data: returnAssigns } = lids.length
            ? await supabase.from("transport_leg_assignments")
                .select("staff_id").in("leg_id", lids).not("staff_id", "is", null)
            : { data: [] as any[] };
          const covered = new Set((returnAssigns ?? []).map((a: any) => a.staff_id));
          const missing = (allStaff ?? []).filter((s: any) => !covered.has(s.id));
          if (missing.length > 0) {
            const names = missing.map((s: any) => s.name ?? "?").join(", ");
            toast.warning(`${missing.length} staff still without a return ride`, {
              description: names,
              duration: 10000,
            });
          }
        } catch { /* non-blocking */ }
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!leg) return;
      const { error } = await supabase.from("transport_legs").delete().eq("id", leg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport-legs-all"] });
      toast.success("Leg deleted");
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{leg ? "Edit leg" : "Add leg"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 py-4">
          <Field label="Label">
            <Input value={form.leg_label} onChange={(e) => setForm({ ...form, leg_label: e.target.value })} />
          </Field>
          <Field label="Phase">
            <Select value={form.leg_phase} onValueChange={(v) => setForm({ ...form, leg_phase: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEG_PHASES.map((p) => <SelectItem key={p} value={p}>{PHASE_LABEL[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date">
              <Input type="date" value={form.leg_date} onChange={(e) => setForm({ ...form, leg_date: e.target.value })} />
            </Field>
            <Field label="Start time">
              <Input type="time" value={form.leg_start_time} onChange={(e) => setForm({ ...form, leg_start_time: e.target.value })} />
            </Field>
          </div>
          <Field label="Origin">
            <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
          </Field>
          <Field label="Destination">
            <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          </Field>
          <Field label="Effective capacity">
            <Input type="number" value={form.effective_capacity}
              onChange={(e) => setForm({ ...form, effective_capacity: parseInt(e.target.value) || 0 })} />
          </Field>
          <Field label="Cargo">
            <Textarea value={form.cargo_description} onChange={(e) => setForm({ ...form, cargo_description: e.target.value })} rows={2} />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEG_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <SheetFooter className="flex-row justify-between">
          {leg ? (
            <Button variant="destructive" size="sm" onClick={() => remove.mutate()}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : <div />}
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ============================================================
function AddVehicleButton({ festivalId, slug }: { festivalId: string; slug: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [vehicleType, setVehicleType] = useState("");
  const [capacity, setCapacity] = useState(3);
  const [status, setStatus] = useState("planned");
  const [ownership, setOwnership] = useState<"one_off_rental" | "season_rental" | "company_owned">("one_off_rental");
  const [reservationNumber, setReservationNumber] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      // Step 1: create canonical vehicle row in season_rentals
      const { data: canonical, error: cErr } = await supabase
        .from("season_rentals")
        .insert({
          vehicle_type: vehicleType,
          capacity,
          ownership,
          reservation_number: reservationNumber.trim() || null,
          status: "active",
        } as any)
        .select()
        .single();
      if (cErr) throw cErr;

      // Step 2: create the per-festival assignment, FK to canonical
      const { error: aErr } = await supabase
        .from("festival_transport")
        .insert({
          festival_id: festivalId,
          season_rental_id: canonical.id,
          vehicle_type: vehicleType, // legacy mirror, dropped in 2K-5
          capacity,                  // legacy mirror
          status,
        } as any);
      if (aErr) {
        // roll back canonical insert if assignment fails
        await supabase.from("season_rentals").delete().eq("id", canonical.id);
        throw aErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport-vehicles", slug] });
      toast.success("Vehicle added");
      setOpen(false);
      setVehicleType("");
      setReservationNumber("");
      setOwnership("one_off_rental");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!festivalId}
        className="w-full rounded-2xl border-2 border-dashed border-border py-4 text-sm text-muted-foreground hover:bg-muted/30 transition flex items-center justify-center gap-2 disabled:opacity-50 print:hidden"
      >
        <Plus className="h-4 w-4" /> Add vehicle
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add vehicle</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-4">
            <Field label="Vehicle type / name">
              <Input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="e.g. Europcar lift vehicle #4" />
            </Field>
            <Field label="Ownership">
              <Select value={ownership} onValueChange={(v) => setOwnership(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_off_rental">One-off rental</SelectItem>
                  <SelectItem value="season_rental">Season rental</SelectItem>
                  <SelectItem value="company_owned">Company-owned</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reservation number (optional)">
              <Input value={reservationNumber} onChange={(e) => setReservationNumber(e.target.value)} placeholder="e.g. 26581644" />
            </Field>
            <Field label="Capacity">
              <Input type="number" value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value) || 0)} />
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VEHICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <p className="text-xs text-muted-foreground">
              Creates a canonical vehicle in the fleet and assigns it to this festival. To add an existing fleet vehicle, use the picker (coming in 2K-4).
            </p>
          </div>
          <SheetFooter>
            <Button onClick={() => create.mutate()} disabled={!vehicleType || create.isPending}>Create</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
