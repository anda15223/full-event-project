import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Tent, Zap, Snowflake, Users, Clock, Package, ShoppingCart,
  ListChecks, Image as ImageIcon, Truck, FileText,
} from "lucide-react";

const sb = supabase as any;

export type PickerCategory =
  | "tent" | "power" | "cooling" | "other"
  | "contacts" | "hours" | "equipment" | "trolleys"
  | "power_order" | "order_list" | "facade" | "soborg" | "info_doc";

export type PickedItem = {
  label: string;
  spec?: string | null;
  qty?: number | null;
  dimensions?: string | null;
  area?: string | null;
  concept_id?: string | null;
  position_notes?: string | null;
};

const ICONS: Record<PickerCategory, any> = {
  tent: Tent, power: Zap, cooling: Snowflake, other: Plus,
  contacts: Users, hours: Clock, equipment: Package, trolleys: ShoppingCart,
  power_order: Zap, order_list: ListChecks, facade: ImageIcon,
  soborg: Truck, info_doc: FileText,
};

const LABELS: Record<PickerCategory, string> = {
  tent: "tent", power: "power", cooling: "cooling", other: "other",
  contacts: "contact", hours: "opening hours", equipment: "equipment",
  trolleys: "trolley", power_order: "power order item", order_list: "order list item",
  facade: "facade", soborg: "Søborg loading", info_doc: "info doc",
};

export default function BuildOutPicker({
  category, festivalId, onPick, label,
}: {
  category: PickerCategory;
  festivalId: string;
  onPick: (item: PickedItem) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[category];
  const catLabel = LABELS[category];

  const q = useQuery({
    queryKey: ["buildout-picker", category, festivalId],
    enabled: open && !!festivalId,
    queryFn: async () => {
      if (category === "tent") {
        const { data } = await sb.from("festival_contracts")
          .select("id, concept_id, concept_alias, tent_size, tent_floor, tent_provided_by, stall_count, concept:concepts!concept_id(name)")
          .eq("festival_id", festivalId).eq("is_active", true);
        return (data ?? []).map((c: any) => ({
          key: c.id,
          title: `${c.concept?.name ?? c.concept_alias ?? "Concept"} — tent`,
          subtitle: [c.tent_size, c.tent_floor, c.tent_provided_by && `by ${c.tent_provided_by}`].filter(Boolean).join(" · "),
          item: {
            label: `${c.concept?.name ?? c.concept_alias ?? "Concept"} tent`,
            spec: c.tent_size ?? null, dimensions: c.tent_size ?? null,
            qty: c.stall_count ?? 1, concept_id: c.concept_id,
            position_notes: c.tent_floor ? `Floor: ${c.tent_floor}` : null,
          } as PickedItem,
        }));
      }

      if (category === "power") {
        const { data: contracts } = await sb.from("festival_contracts")
          .select("id, concept_id, concept_alias, concept:concepts!concept_id(name)")
          .eq("festival_id", festivalId).eq("is_active", true);
        const ids = (contracts ?? []).map((c: any) => c.id);
        if (ids.length === 0) return [];
        const { data: power } = await sb.from("festival_power")
          .select("festival_contract_id, connections_16a_240v, connections_16a_400v, connections_32a, connections_63a, connections_125a, total_kw_estimate, tent_location, notes")
          .in("festival_contract_id", ids);
        return (power ?? []).map((p: any) => {
          const c = (contracts ?? []).find((x: any) => x.id === p.festival_contract_id);
          const parts: string[] = [];
          if (p.connections_16a_240v) parts.push(`${p.connections_16a_240v}×16A/240V`);
          if (p.connections_16a_400v) parts.push(`${p.connections_16a_400v}×16A/400V`);
          if (p.connections_32a) parts.push(`${p.connections_32a}×32A`);
          if (p.connections_63a) parts.push(`${p.connections_63a}×63A`);
          if (p.connections_125a) parts.push(`${p.connections_125a}×125A`);
          const spec = parts.join(" · ") || (p.total_kw_estimate ? `${p.total_kw_estimate} kW` : "");
          const name = c?.concept?.name ?? c?.concept_alias ?? "Concept";
          return {
            key: p.festival_contract_id,
            title: `${name} — power`,
            subtitle: spec || "no connections set",
            item: { label: `${name} power`, spec, concept_id: c?.concept_id ?? null, area: p.tent_location ?? null, position_notes: p.notes ?? null } as PickedItem,
          };
        });
      }

      if (category === "cooling") {
        const { data } = await sb.from("festival_cooling")
          .select("id, unit_type, power_connection, electrical_cable_length_m, supplier_ref, delivery_date")
          .eq("festival_id", festivalId);
        return (data ?? []).map((u: any) => ({
          key: u.id,
          title: u.unit_type ?? "Cooling unit",
          subtitle: [u.power_connection, u.electrical_cable_length_m && `${u.electrical_cable_length_m}m cable`, u.supplier_ref].filter(Boolean).join(" · "),
          item: {
            label: u.unit_type ?? "Cooling unit", spec: u.power_connection ?? null, qty: 1,
            position_notes: u.electrical_cable_length_m ? `Cable: ${u.electrical_cable_length_m} m` : null,
          } as PickedItem,
        }));
      }

      if (category === "contacts") {
        const { data } = await sb.from("festival_contacts")
          .select("id, full_name, role, organization, phone, email, notes, is_primary")
          .eq("festival_id", festivalId).order("is_primary", { ascending: false });
        return (data ?? []).map((c: any) => ({
          key: c.id,
          title: `${c.full_name ?? "Contact"}${c.is_primary ? " ★" : ""}`,
          subtitle: [c.role, c.organization, c.phone, c.email].filter(Boolean).join(" · "),
          item: {
            label: c.full_name ?? "Contact",
            spec: [c.role, c.organization].filter(Boolean).join(" · ") || null,
            position_notes: [c.phone && `☎ ${c.phone}`, c.email && `✉ ${c.email}`, c.notes].filter(Boolean).join(" · ") || null,
          } as PickedItem,
        }));
      }

      if (category === "hours") {
        const { data } = await sb.from("festival_concept_hours")
          .select("id, operating_date, open_time, close_time, computed_hours, notes, concept_id, concept:concepts!concept_id(name)")
          .eq("festival_id", festivalId).order("operating_date").order("open_time");
        return (data ?? []).map((h: any) => ({
          key: h.id,
          title: `${h.concept?.name ?? "Concept"} — ${h.operating_date}`,
          subtitle: `${h.open_time?.slice(0,5) ?? "?"} – ${h.close_time?.slice(0,5) ?? "?"}${h.computed_hours ? ` (${h.computed_hours}h)` : ""}`,
          item: {
            label: `${h.concept?.name ?? "Concept"} hours`,
            spec: `${h.operating_date} · ${h.open_time?.slice(0,5)}–${h.close_time?.slice(0,5)}`,
            concept_id: h.concept_id, position_notes: h.notes ?? null,
          } as PickedItem,
        }));
      }

      if (category === "equipment") {
        const { data } = await sb.from("festival_equipment")
          .select("id, name, category, brand, model, quantity, ownership, position_zone, position_notes, concept_id, concept:concepts!concept_id(name)")
          .eq("festival_id", festivalId).order("category").order("name");
        return (data ?? []).map((e: any) => ({
          key: e.id,
          title: `${e.name ?? "Equipment"}${e.quantity > 1 ? ` ×${e.quantity}` : ""}`,
          subtitle: [e.category, [e.brand, e.model].filter(Boolean).join(" "), e.ownership, e.concept?.name].filter(Boolean).join(" · "),
          item: {
            label: e.name ?? "Equipment",
            spec: [e.brand, e.model].filter(Boolean).join(" ") || e.category || null,
            qty: e.quantity ?? 1, area: e.position_zone ?? null,
            concept_id: e.concept_id, position_notes: e.position_notes ?? null,
          } as PickedItem,
        }));
      }

      if (category === "trolleys") {
        const { data } = await sb.from("festival_trolley_items")
          .select("id, trolley_number, qty, notes, concept_id, trolley_item_id, concept:concepts!concept_id(name), item:trolley_items!trolley_item_id(name)")
          .eq("festival_id", festivalId).order("trolley_number");
        return (data ?? []).map((t: any) => ({
          key: t.id,
          title: `Trolley #${t.trolley_number ?? "?"} — ${t.item?.name ?? "item"}`,
          subtitle: [t.concept?.name, t.qty && `qty ${t.qty}`].filter(Boolean).join(" · "),
          item: {
            label: `Trolley #${t.trolley_number ?? "?"}: ${t.item?.name ?? "item"}`,
            spec: t.item?.name ?? null, qty: t.qty ?? 1,
            concept_id: t.concept_id, position_notes: t.notes ?? null,
          } as PickedItem,
        }));
      }

      if (category === "power_order") {
        const { data: pow } = await sb.from("festival_power")
          .select("id, festival_contract_id, festival_contract:festival_contracts!festival_contract_id(festival_id)")
          .limit(2000);
        const ids = (pow ?? [])
          .filter((p: any) => p.festival_contract?.festival_id === festivalId)
          .map((p: any) => p.id);
        if (ids.length === 0) return [];
        const { data } = await sb.from("festival_power_order_items")
          .select("id, category, item_name, quantity, unit, unit_price, total_price, currency, notes")
          .in("festival_power_id", ids).order("category").order("position");
        return (data ?? []).map((o: any) => ({
          key: o.id,
          title: `${o.item_name ?? "Item"}${o.quantity ? ` ×${o.quantity}` : ""}`,
          subtitle: [o.category, o.total_price && `${o.total_price} ${o.currency ?? ""}`.trim()].filter(Boolean).join(" · "),
          item: {
            label: o.item_name ?? "Order item",
            spec: [o.category, o.unit].filter(Boolean).join(" · ") || null,
            qty: o.quantity ?? 1, position_notes: o.notes ?? null,
          } as PickedItem,
        }));
      }

      if (category === "order_list") {
        const { data: parents } = await sb.from("festival_concept_prices")
          .select("id, concept_id, concept:concepts!concept_id(name)")
          .eq("festival_id", festivalId);
        const ids = (parents ?? []).map((p: any) => p.id);
        if (ids.length === 0) return [];
        const { data } = await sb.from("festival_concept_price_item")
          .select("id, concept_prices_id, product_name, price, category, notes")
          .in("concept_prices_id", ids).order("category").order("display_order");
        return (data ?? []).map((it: any) => {
          const parent = (parents ?? []).find((p: any) => p.id === it.concept_prices_id);
          return {
            key: it.id,
            title: `${it.product_name ?? "Item"}`,
            subtitle: [parent?.concept?.name, it.category, it.price && `${it.price} kr`].filter(Boolean).join(" · "),
            item: {
              label: it.product_name ?? "Order item",
              spec: it.category ?? null,
              concept_id: parent?.concept_id ?? null,
              position_notes: it.notes ?? null,
            } as PickedItem,
          };
        });
      }

      if (category === "facade") {
        const { data: contracts } = await sb.from("festival_contracts")
          .select("id, concept_id, concept_alias, concept:concepts!concept_id(name)")
          .eq("festival_id", festivalId).eq("is_active", true);
        const ids = (contracts ?? []).map((c: any) => c.id);
        if (ids.length === 0) return [];
        const { data } = await sb.from("festival_facade")
          .select("id, festival_contract_id, design_status, material_type, material_supplier, design_concept_note")
          .in("festival_contract_id", ids);
        return (data ?? []).map((f: any) => {
          const c = (contracts ?? []).find((x: any) => x.id === f.festival_contract_id);
          const name = c?.concept?.name ?? c?.concept_alias ?? "Concept";
          return {
            key: f.id,
            title: `${name} — facade`,
            subtitle: [f.design_status, f.material_type, f.material_supplier].filter(Boolean).join(" · "),
            item: {
              label: `${name} facade`,
              spec: [f.material_type, f.material_supplier].filter(Boolean).join(" · ") || null,
              concept_id: c?.concept_id ?? null,
              position_notes: f.design_concept_note ?? null,
            } as PickedItem,
          };
        });
      }

      if (category === "soborg") {
        const { data } = await sb.from("festival_setup")
          .select("id, work_type, description, location, scheduled_start_at, scheduled_end_at, crew_size, status, concept_id, concept:concepts!concept_id(name)")
          .eq("festival_id", festivalId)
          .or("location.ilike.%søborg%,location.ilike.%soborg%,work_type.ilike.%load%,description.ilike.%søborg%,description.ilike.%soborg%")
          .order("scheduled_start_at", { nullsFirst: false });
        return (data ?? []).map((s: any) => ({
          key: s.id,
          title: `${s.work_type ?? "Loading"}${s.concept?.name ? ` — ${s.concept.name}` : ""}`,
          subtitle: [s.location, s.scheduled_start_at && new Date(s.scheduled_start_at).toLocaleString(), s.crew_size && `crew ${s.crew_size}`, s.status].filter(Boolean).join(" · "),
          item: {
            label: s.work_type ?? "Søborg loading",
            spec: s.description ?? null, area: s.location ?? null,
            qty: s.crew_size ?? null, concept_id: s.concept_id,
            position_notes: s.scheduled_start_at ? `Start: ${new Date(s.scheduled_start_at).toLocaleString()}` : null,
          } as PickedItem,
        }));
      }

      if (category === "info_doc") {
        const { data } = await sb.from("festival_location_documents")
          .select("id, file_name, description, mime_type, file_size_bytes")
          .eq("festival_id", festivalId).order("uploaded_at", { ascending: false });
        return (data ?? []).map((d: any) => ({
          key: d.id,
          title: d.file_name ?? "Document",
          subtitle: [d.description, d.mime_type, d.file_size_bytes && `${Math.round(d.file_size_bytes/1024)} KB`].filter(Boolean).join(" · "),
          item: {
            label: d.file_name ?? "Document",
            spec: d.mime_type ?? null,
            position_notes: d.description ?? null,
          } as PickedItem,
        }));
      }

      return [];
    },
  });

  const items = q.data ?? [];

  const pick = (it: PickedItem) => {
    onPick(it);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-[11px]">
          <Plus className="h-3 w-3 mr-1" /> {label ?? `Add ${catLabel}`}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Icon className="h-4 w-4" /> Add {catLabel} — from this festival
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {q.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : items.length === 0 ? (
            <div className="text-xs text-muted-foreground italic px-1">
              No {catLabel} found in this festival's database yet.
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto space-y-1.5">
              {items.map((it: any) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => pick(it.item)}
                  className="w-full text-left rounded-md border bg-background hover:bg-muted/40 px-3 py-2 transition"
                >
                  <div className="text-xs font-medium">{it.title}</div>
                  {it.subtitle && (
                    <div className="text-[11px] text-muted-foreground truncate">{it.subtitle}</div>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="pt-2 border-t flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground">Scoped to this festival · copy on pick</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => pick({ label: "" })}
            >
              + Blank row
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
