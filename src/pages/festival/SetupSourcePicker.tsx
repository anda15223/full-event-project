import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, Snowflake, Package, Store, Image as ImageIcon, Zap } from "lucide-react";

const sb = supabase as any;

export type PhasePatch = {
  phase_name?: string;
  from_location?: string | null;
  to_location?: string | null;
  planned_time?: string | null;
  notes?: string | null;
  driver_name?: string | null;
};

export type SourceSnapshot = {
  source_table: string;
  source_id: string;
  label: string;
  detail: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  festivalId: string;
  soborgDefault: string;
  destinationDefault: string;
  currentNotes: string | null;
  onApply: (patch: PhasePatch, snap: SourceSnapshot) => void;
};

const SOBORG = "Søborg HQ";

export default function SetupSourcePicker({
  open, onOpenChange, festivalId, soborgDefault, destinationDefault, currentNotes, onApply,
}: Props) {
  const [tab, setTab] = useState("transport");
  const leaving = soborgDefault || SOBORG;
  const dest = destinationDefault || "Festival site";

  /* Transport — festival_transport */
  const transportQ = useQuery({
    enabled: open && !!festivalId,
    queryKey: ["picker-transport", festivalId],
    queryFn: async () => {
      const { data } = await sb.from("festival_transport")
        .select("id, vehicle_type, vehicle_purpose, rental_supplier, pickup_date, pickup_time, pickup_location, return_date, status, capacity, license_plate, notes")
        .eq("festival_id", festivalId).order("pickup_date");
      return data ?? [];
    },
  });

  /* Cooling */
  const coolingQ = useQuery({
    enabled: open && !!festivalId,
    queryKey: ["picker-cooling", festivalId],
    queryFn: async () => {
      const { data } = await sb.from("festival_cooling_unit")
        .select("id, unit_label, supplier, delivery_date, pickup_date, status, order_reference")
        .eq("festival_id", festivalId).order("unit_label");
      return data ?? [];
    },
  });

  /* Equipment */
  const equipQ = useQuery({
    enabled: open && !!festivalId,
    queryKey: ["picker-equipment", festivalId],
    queryFn: async () => {
      const { data } = await sb.from("festival_equipment")
        .select("id, name, qty, category, zone, notes")
        .eq("festival_id", festivalId).order("name");
      return data ?? [];
    },
  });

  /* Concepts (active contracts) + façade + power joined */
  const conceptsQ = useQuery({
    enabled: open && !!festivalId,
    queryKey: ["picker-concepts", festivalId],
    queryFn: async () => {
      const { data: contracts } = await sb.from("festival_contracts")
        .select("id, concept_id, concept_alias, tent_size")
        .eq("festival_id", festivalId).eq("is_active", true);
      const cids = Array.from(new Set((contracts ?? []).map((c: any) => c.concept_id).filter(Boolean)));
      const nameMap = new Map<string, string>();
      if (cids.length) {
        const { data: concepts } = await sb.from("concepts").select("id, name").in("id", cids);
        (concepts ?? []).forEach((c: any) => nameMap.set(c.id, c.name));
      }
      return (contracts ?? []).map((c: any) => ({
        ...c,
        concept_name: c.concept_id ? nameMap.get(c.concept_id) ?? "Concept" : (c.concept_alias ?? "Concept"),
      }));
    },
  });

  /* Façade — one per active concept */
  const facadeQ = useQuery({
    enabled: open && !!festivalId && !!conceptsQ.data,
    queryKey: ["picker-facade", festivalId, (conceptsQ.data ?? []).map((c: any) => c.id).join(",")],
    queryFn: async () => {
      const contractIds = (conceptsQ.data ?? []).map((c: any) => c.id);
      if (!contractIds.length) return [];
      const { data } = await sb.from("festival_facade")
        .select("id, festival_contract_id, design_status, material_type, material_supplier, dimensions_text, dimensions_w_cm, dimensions_h_cm, panel_count, print_deadline")
        .in("festival_contract_id", contractIds);
      const byContract = new Map<string, string>();
      (conceptsQ.data ?? []).forEach((c: any) => byContract.set(c.id, c.concept_name));
      return (data ?? []).map((f: any) => ({
        ...f,
        concept_name: byContract.get(f.festival_contract_id) ?? "Concept",
      }));
    },
  });

  /* Power — one per active concept */
  const powerQ = useQuery({
    enabled: open && !!festivalId && !!conceptsQ.data,
    queryKey: ["picker-power", festivalId, (conceptsQ.data ?? []).map((c: any) => c.id).join(",")],
    queryFn: async () => {
      const contractIds = (conceptsQ.data ?? []).map((c: any) => c.id);
      if (!contractIds.length) return [];
      const { data } = await sb.from("festival_power")
        .select("id, festival_contract_id, status, total_kw_estimate, total_amp_estimate, connections_16a_240v, connections_16a_400v, connections_32a, connections_63a, connections_125a, tableau_required, tableau_count, tent_location, power_drawing_file_path, submission_deadline")
        .in("festival_contract_id", contractIds);
      const byContract = new Map<string, string>();
      (conceptsQ.data ?? []).forEach((c: any) => byContract.set(c.id, c.concept_name));
      return (data ?? []).map((p: any) => ({
        ...p,
        concept_name: byContract.get(p.festival_contract_id) ?? "Concept",
      }));
    },
  });

  const close = () => onOpenChange(false);

  const appendNote = (extra: string) =>
    [currentNotes, extra].filter(Boolean).join("\n");

  const pickTransport = async (v: any) => {
    const label = `${v.vehicle_type ?? "Vehicle"}${v.license_plate ? ` (${v.license_plate})` : ""}`;

    // Resolve assigned driver from transport_legs → transport_leg_assignments → festival_staff
    let driver: string | null = null;
    try {
      const { data: legs } = await sb.from("transport_legs")
        .select("id, leg_phase, leg_date")
        .eq("transport_id", v.id)
        .order("leg_date", { ascending: true });
      const legIds = (legs ?? []).map((l: any) => l.id);
      if (legIds.length) {
        const { data: assigns } = await sb.from("transport_leg_assignments")
          .select("leg_id, staff_id, role")
          .in("leg_id", legIds)
          .eq("role", "driver");
        // Prefer setup_outbound leg's driver, else any
        const setupLegIds = new Set((legs ?? []).filter((l: any) => l.leg_phase === "setup_outbound").map((l: any) => l.id));
        const preferred = (assigns ?? []).find((a: any) => a.staff_id && setupLegIds.has(a.leg_id))
          ?? (assigns ?? []).find((a: any) => a.staff_id);
        if (preferred?.staff_id) {
          const { data: s } = await sb.from("festival_staff")
            .select("name").eq("id", preferred.staff_id).maybeSingle();
          if (s?.name) driver = s.name;
        }
      }
    } catch { /* non-blocking */ }

    // Fallback: legacy notes regex
    if (!driver) {
      const m = (v.notes ?? "").match(/Driver[^:]*:\s*([^.\n\[]+)/i);
      if (m) driver = m[1].trim();
    }

    onApply(
      {
        phase_name: `Drive ${v.vehicle_type ?? "vehicle"}`,
        from_location: v.pickup_location || leaving,
        to_location: dest,
        planned_time: v.pickup_time ? v.pickup_time.slice(0, 5) : null,
        driver_name: driver,
        notes: appendNote(`Vehicle: ${label}${driver ? ` · driver ${driver}` : ""}${v.vehicle_purpose ? ` — ${v.vehicle_purpose}` : ""}`),
      },
      { source_table: "festival_transport", source_id: v.id, label, detail: driver ?? v.rental_supplier ?? "" },
    );
    close();
  };

  const pickCooling = (c: any) => {
    onApply(
      {
        phase_name: `Pick up cooling ${c.unit_label}`,
        from_location: c.supplier || leaving,
        to_location: dest,
        notes: appendNote(`Cooling: ${c.unit_label}${c.order_reference ? ` (ref ${c.order_reference})` : ""}`),
      },
      { source_table: "festival_cooling_unit", source_id: c.id, label: `Cooling ${c.unit_label}`, detail: c.supplier ?? "" },
    );
    close();
  };

  const pickEquipment = (e: any) => {
    onApply(
      {
        from_location: leaving,
        to_location: dest,
        notes: appendNote(`Cargo: ${e.qty ?? 1}× ${e.name ?? "equipment"}${e.zone ? ` → ${e.zone}` : ""}`),
      },
      { source_table: "festival_equipment", source_id: e.id, label: e.name ?? "Equipment", detail: `${e.qty ?? 1}× ${e.category ?? ""}` },
    );
    close();
  };

  const pickConcept = (c: any) => {
    onApply(
      {
        phase_name: `Setup ${c.concept_name}`,
        from_location: leaving,
        to_location: `${dest} — ${c.concept_name}`,
        notes: appendNote(`Concept: ${c.concept_name}${c.tent_size ? ` (tent ${c.tent_size})` : ""}`),
      },
      { source_table: "festival_contracts", source_id: c.id, label: c.concept_name, detail: c.tent_size ?? "" },
    );
    close();
  };

  const pickFacade = (f: any) => {
    const dims = f.dimensions_text
      ?? (f.dimensions_w_cm && f.dimensions_h_cm ? `${f.dimensions_w_cm}×${f.dimensions_h_cm} cm` : null);
    onApply(
      {
        phase_name: `Façade install — ${f.concept_name}`,
        from_location: leaving,
        to_location: `${dest} — ${f.concept_name}`,
        notes: appendNote(`Façade: ${f.concept_name} · ${f.material_type ?? "—"}${dims ? ` · ${dims}` : ""}${f.panel_count ? ` · ${f.panel_count} panel(s)` : ""}${f.material_supplier ? ` · ${f.material_supplier}` : ""} · status ${f.design_status ?? "n/a"}`),
      },
      {
        source_table: "festival_facade",
        source_id: f.id,
        label: `Façade — ${f.concept_name}`,
        detail: [f.material_type, dims].filter(Boolean).join(" · "),
      },
    );
    close();
  };

  const pickPower = (p: any) => {
    const conns = [
      p.connections_16a_240v ? `${p.connections_16a_240v}×16A/240` : null,
      p.connections_16a_400v ? `${p.connections_16a_400v}×16A/400` : null,
      p.connections_32a ? `${p.connections_32a}×32A` : null,
      p.connections_63a ? `${p.connections_63a}×63A` : null,
      p.connections_125a ? `${p.connections_125a}×125A` : null,
    ].filter(Boolean).join(", ");
    onApply(
      {
        phase_name: `Power hookup — ${p.concept_name}`,
        from_location: leaving,
        to_location: p.tent_location ? `${dest} — ${p.tent_location}` : `${dest} — ${p.concept_name}`,
        notes: appendNote(`Electricity: ${p.concept_name}${p.total_kw_estimate ? ` · ${p.total_kw_estimate} kW` : ""}${p.total_amp_estimate ? ` / ${p.total_amp_estimate} A` : ""}${conns ? ` · ${conns}` : ""}${p.tableau_required ? ` · tableau ×${p.tableau_count ?? 1}` : ""}${p.power_drawing_file_path ? " · drawing attached" : ""}`),
      },
      {
        source_table: "festival_power",
        source_id: p.id,
        label: `Power — ${p.concept_name}`,
        detail: [p.total_kw_estimate ? `${p.total_kw_estimate} kW` : null, conns || null].filter(Boolean).join(" · "),
      },
    );
    close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attach source to phase</DialogTitle>
          <DialogDescription>
            Pick an item from another card. Its data is copied into this phase and stays fully editable.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="transport"><Truck className="h-3.5 w-3.5 mr-1" />Transport</TabsTrigger>
            <TabsTrigger value="cooling"><Snowflake className="h-3.5 w-3.5 mr-1" />Cooling</TabsTrigger>
            <TabsTrigger value="equipment"><Package className="h-3.5 w-3.5 mr-1" />Equipment</TabsTrigger>
            <TabsTrigger value="facade"><ImageIcon className="h-3.5 w-3.5 mr-1" />Façade</TabsTrigger>
            <TabsTrigger value="power"><Zap className="h-3.5 w-3.5 mr-1" />Power</TabsTrigger>
            <TabsTrigger value="concepts"><Store className="h-3.5 w-3.5 mr-1" />Concepts</TabsTrigger>
          </TabsList>

          <TabsContent value="transport" className="max-h-[50vh] overflow-y-auto space-y-1.5">
            {transportQ.isLoading ? <Skeleton className="h-20 w-full" /> :
              (transportQ.data ?? []).length === 0 ? <Empty msg="No vehicles in Transport card." /> :
              (transportQ.data ?? []).map((v: any) => (
                <button key={v.id} onClick={() => pickTransport(v)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 text-sm">
                  <div className="font-medium">{v.vehicle_type ?? "Vehicle"}{v.license_plate ? ` · ${v.license_plate}` : ""}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {v.vehicle_purpose ?? v.rental_supplier ?? "—"}
                    {v.pickup_date ? ` · ${v.pickup_date}` : ""}
                    {v.pickup_time ? ` ${String(v.pickup_time).slice(0,5)}` : ""}
                  </div>
                </button>
              ))}
          </TabsContent>

          <TabsContent value="cooling" className="max-h-[50vh] overflow-y-auto space-y-1.5">
            {coolingQ.isLoading ? <Skeleton className="h-20 w-full" /> :
              (coolingQ.data ?? []).length === 0 ? <Empty msg="No cooling units." /> :
              (coolingQ.data ?? []).map((c: any) => (
                <button key={c.id} onClick={() => pickCooling(c)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 text-sm">
                  <div className="font-medium">{c.unit_label}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.supplier ?? "—"} · {c.status ?? "not_ordered"}
                    {c.delivery_date ? ` · delivery ${c.delivery_date}` : ""}
                  </div>
                </button>
              ))}
          </TabsContent>

          <TabsContent value="equipment" className="max-h-[50vh] overflow-y-auto space-y-1.5">
            {equipQ.isLoading ? <Skeleton className="h-20 w-full" /> :
              (equipQ.data ?? []).length === 0 ? <Empty msg="No equipment items." /> :
              (equipQ.data ?? []).map((e: any) => (
                <button key={e.id} onClick={() => pickEquipment(e)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 text-sm">
                  <div className="font-medium">{e.qty ?? 1}× {e.name ?? "Equipment"}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.category ?? "—"}{e.zone ? ` · ${e.zone}` : ""}
                  </div>
                </button>
              ))}
          </TabsContent>

          <TabsContent value="concepts" className="max-h-[50vh] overflow-y-auto space-y-1.5">
            {conceptsQ.isLoading ? <Skeleton className="h-20 w-full" /> :
              (conceptsQ.data ?? []).length === 0 ? <Empty msg="No active concept contracts." /> :
              (conceptsQ.data ?? []).map((c: any) => (
                <button key={c.id} onClick={() => pickConcept(c)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 text-sm">
                  <div className="font-medium">{c.concept_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.tent_size ? `tent ${c.tent_size}` : "—"}
                  </div>
                </button>
              ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-xs text-muted-foreground text-center py-6">{msg}</div>;
}
