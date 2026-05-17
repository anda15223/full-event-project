import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, Snowflake, Package, Store } from "lucide-react";

const sb = supabase as any;

export type PhasePatch = {
  phase_name?: string;
  from_location?: string | null;
  to_location?: string | null;
  planned_time?: string | null;
  notes?: string | null;
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

  /* Concepts (active contracts) */
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

  const close = () => onOpenChange(false);

  const appendNote = (extra: string) =>
    [currentNotes, extra].filter(Boolean).join("\n");

  const pickTransport = (v: any) => {
    const label = `${v.vehicle_name}${v.driver_name ? ` · ${v.driver_name}` : " · (no driver)"}`;
    onApply(
      {
        phase_name: `Drive ${v.vehicle_name}`,
        from_location: leaving,
        to_location: dest,
        notes: appendNote(`Vehicle: ${label}`),
      },
      { source_table: "festival_staff_vehicles", source_id: v.id, label: v.vehicle_name, detail: v.driver_name ?? "no driver" },
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
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="transport"><Truck className="h-3.5 w-3.5 mr-1" />Transport</TabsTrigger>
            <TabsTrigger value="cooling"><Snowflake className="h-3.5 w-3.5 mr-1" />Cooling</TabsTrigger>
            <TabsTrigger value="equipment"><Package className="h-3.5 w-3.5 mr-1" />Equipment</TabsTrigger>
            <TabsTrigger value="concepts"><Store className="h-3.5 w-3.5 mr-1" />Concepts</TabsTrigger>
          </TabsList>

          <TabsContent value="transport" className="max-h-[50vh] overflow-y-auto space-y-1.5">
            {transportQ.isLoading ? <Skeleton className="h-20 w-full" /> :
              (transportQ.data ?? []).length === 0 ? <Empty msg="No vehicles in Transport card." /> :
              (transportQ.data ?? []).map((v: any) => (
                <button key={v.id} onClick={() => pickTransport(v)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 text-sm flex justify-between items-center">
                  <div>
                    <div className="font-medium">{v.vehicle_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.driver_name ?? <span className="text-rose-600">no driver</span>}
                    </div>
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
