import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CardUploadZone, EditableField, MissingFlag } from "./shared";
import { Car, Hotel, Plus, Trash2, Users, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Props { festivalId: string; }

type CarRow = {
  id: string;
  festival_id: string;
  concept_id: string | null;
  label: string | null;
  make_model: string | null;
  license_plate: string | null;
  driver_id: string | null;
  is_rental: boolean;
  rental_cost: number | null;
  currency: string;
  notes: string | null;
};

type Crew = {
  id: string;
  name: string;
  is_crew: boolean;
  is_driver: boolean;
  needs_accommodation: boolean;
  role: string | null;
};

type Hotel = {
  id: string;
  festival_id: string;
  name: string | null;
  address: string | null;
  contact: string | null;
  rooms_count: number | null;
  cost_per_night: number | null;
  total_nights: number | null;
  total_cost: number | null;
  currency: string;
};

const CAR_CARD_ORIGIN = "transport";
const ACCOMMODATION_CARD_ORIGIN = "accommodation";

export function TransportationCard({ festivalId }: Props) {
  const qc = useQueryClient();

  // ---- Concepts (used to seed default cars) ----
  const { data: concepts = [] } = useQuery({
    queryKey: ["festival_concepts_transport", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_concepts")
        .select("id,name")
        .eq("festival_id", festivalId)
        .order("order_index");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!festivalId,
  });

  // ---- Crew (drivers + accommodation) ----
  const { data: crew = [] } = useQuery<Crew[]>({
    queryKey: ["personal_festival_db_transport", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_festival_db")
        .select("id,name,is_crew,is_driver,needs_accommodation,role")
        .eq("festival_id", festivalId)
        .eq("is_crew", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Crew[];
    },
    enabled: !!festivalId,
  });

  const drivers = useMemo(() => crew.filter((c) => c.is_driver), [crew]);

  // ---- Cars ----
  const { data: cars = [] } = useQuery<CarRow[]>({
    queryKey: ["festival_cars", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_cars")
        .select("*")
        .eq("festival_id", festivalId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as CarRow[];
    },
    enabled: !!festivalId,
  });

  // Seed one car per concept on first load if none exist.
  useEffect(() => {
    if (!festivalId || concepts.length === 0 || cars.length > 0) return;
    (async () => {
      const rows = concepts.map((c) => ({
        festival_id: festivalId,
        concept_id: c.id,
        label: `${c.name} car`,
        is_rental: false,
      }));
      const { error } = await supabase.from("festival_cars").insert(rows);
      if (!error) qc.invalidateQueries({ queryKey: ["festival_cars", festivalId] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [festivalId, concepts.length, cars.length]);

  // ---- Hotels ----
  const { data: hotels = [] } = useQuery<Hotel[]>({
    queryKey: ["festival_hotels", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_hotels")
        .select("*")
        .eq("festival_id", festivalId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Hotel[];
    },
    enabled: !!festivalId,
  });

  // ---- Mutations ----
  const updateCar = useMutation({
    mutationFn: async (patch: Partial<CarRow> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("festival_cars").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival_cars", festivalId] }),
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const addCar = useMutation({
    mutationFn: async (rental: boolean) => {
      const { error } = await supabase.from("festival_cars").insert({
        festival_id: festivalId,
        is_rental: rental,
        label: rental ? "Rental car" : "Owned car",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival_cars", festivalId] }),
  });

  const deleteCar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_cars").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival_cars", festivalId] }),
  });

  // Sync rental cost into cost_table whenever it changes.
  const syncRentalCost = async (car: CarRow) => {
    if (!car.is_rental || !car.rental_cost) return;
    const description = `Rental: ${car.label ?? car.make_model ?? "Car"} ${car.license_plate ?? ""}`.trim();
    // Look for existing cost row referencing this car.
    const { data: existing } = await supabase
      .from("cost_table")
      .select("id")
      .eq("festival_id", festivalId)
      .eq("card_origin", CAR_CARD_ORIGIN)
      .eq("description", description)
      .maybeSingle();
    if (existing) {
      await supabase.from("cost_table").update({
        amount: car.rental_cost,
        currency: car.currency,
      }).eq("id", existing.id);
    } else {
      await supabase.from("cost_table").insert({
        festival_id: festivalId,
        description,
        amount: car.rental_cost,
        currency: car.currency,
        card_origin: CAR_CARD_ORIGIN,
        notes: `Auto-registered from Transportation card`,
      });
    }
  };

  const updateCrew = useMutation({
    mutationFn: async (patch: Partial<Crew> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("personal_festival_db").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal_festival_db_transport", festivalId] }),
  });

  // ---- Hotels mutations ----
  const addHotel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("festival_hotels").insert({
        festival_id: festivalId,
        name: "",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival_hotels", festivalId] }),
  });

  const updateHotel = useMutation({
    mutationFn: async (patch: Partial<Hotel> & { id: string }) => {
      const { id, ...rest } = patch;
      const next: any = { ...rest };
      // Auto-compute total cost
      if (next.cost_per_night != null || next.total_nights != null || next.rooms_count != null) {
        const current = hotels.find((h) => h.id === id);
        const cpn = next.cost_per_night ?? current?.cost_per_night ?? 0;
        const nights = next.total_nights ?? current?.total_nights ?? 0;
        const rooms = next.rooms_count ?? current?.rooms_count ?? 1;
        next.total_cost = Number(cpn) * Number(nights) * Number(rooms || 1);
      }
      const { error } = await supabase.from("festival_hotels").update(next).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival_hotels", festivalId] }),
  });

  const deleteHotel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_hotels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival_hotels", festivalId] }),
  });

  const syncHotelCost = async (h: Hotel) => {
    if (!h.total_cost) return;
    const description = `Hotel: ${h.name ?? "Unnamed"}`;
    const { data: existing } = await supabase
      .from("cost_table")
      .select("id")
      .eq("festival_id", festivalId)
      .eq("card_origin", ACCOMMODATION_CARD_ORIGIN)
      .eq("description", description)
      .maybeSingle();
    if (existing) {
      await supabase.from("cost_table").update({
        amount: h.total_cost,
        currency: h.currency,
      }).eq("id", existing.id);
    } else {
      await supabase.from("cost_table").insert({
        festival_id: festivalId,
        description,
        amount: h.total_cost,
        currency: h.currency,
        card_origin: ACCOMMODATION_CARD_ORIGIN,
      });
    }
  };

  // ---- Derived ----
  const accommodationCount = crew.filter((c) => c.needs_accommodation).length;
  const localCount = crew.length - accommodationCount;
  const carsWithoutDriver = cars.filter((c) => !c.driver_id);

  return (
    <div className="space-y-6">
      {/* ===== 1. Cars ===== */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" />
            Cars
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => addCar.mutate(false)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add owned
            </Button>
            <Button size="sm" variant="outline" onClick={() => addCar.mutate(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add rental
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {carsWithoutDriver.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {carsWithoutDriver.length} car(s) without a driver assigned.
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Make / Model</TableHead>
                <TableHead className="w-32">Plate</TableHead>
                <TableHead className="w-44">Driver</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead className="w-32">Rental cost</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cars.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground text-center py-4">
                    No cars yet.
                  </TableCell>
                </TableRow>
              )}
              {cars.map((car) => (
                <TableRow key={car.id}>
                  <TableCell>
                    <EditableField
                      value={car.label}
                      placeholder="Label"
                      onChange={(v) => updateCar.mutate({ id: car.id, label: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <EditableField
                      value={car.make_model}
                      placeholder="e.g. VW Caddy"
                      onChange={(v) => updateCar.mutate({ id: car.id, make_model: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <EditableField
                      value={car.license_plate}
                      placeholder="AB12345"
                      onChange={(v) => updateCar.mutate({ id: car.id, license_plate: v })}
                    />
                  </TableCell>
                  <TableCell>
                    {!car.driver_id ? (
                      <div className="space-y-1">
                        <Select
                          value={car.driver_id ?? "__none"}
                          onValueChange={(v) =>
                            updateCar.mutate({ id: car.id, driver_id: v === "__none" ? null : v })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs border-destructive/60 text-destructive">
                            <SelectValue placeholder="No driver" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">— No driver —</SelectItem>
                            {drivers.map((d) => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <MissingFlag
                          isMissing
                          label={`Driver for ${car.label ?? "car"}`}
                          festivalId={festivalId}
                          cardOrigin={CAR_CARD_ORIGIN}
                          defaultPriority="high"
                        />
                      </div>
                    ) : (
                      <Select
                        value={car.driver_id}
                        onValueChange={(v) =>
                          updateCar.mutate({ id: car.id, driver_id: v === "__none" ? null : v })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— No driver —</SelectItem>
                          {drivers.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={car.is_rental ? "default" : "secondary"} className="text-xs">
                      {car.is_rental ? "Rental" : "Owned"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {car.is_rental ? (
                      <EditableField
                        type="number"
                        value={car.rental_cost == null ? "" : String(car.rental_cost)}
                        onChange={async (v) => {
                          const num = v === "" ? null : Number(v);
                          await updateCar.mutateAsync({ id: car.id, rental_cost: num });
                          await syncRentalCost({ ...car, rental_cost: num });
                        }}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => deleteCar.mutate(car.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {drivers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Tip: Mark crew members as drivers in the crew database to populate the driver dropdown.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ===== 2. Staff Accommodation ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Staff Accommodation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Local crew</div>
              <div className="text-2xl font-semibold tabular-nums">{localCount}</div>
            </div>
            <div className="rounded-lg border p-3 border-primary/40 bg-primary/5">
              <div className="text-xs text-muted-foreground">Needs accommodation</div>
              <div className="text-2xl font-semibold tabular-nums text-primary">{accommodationCount}</div>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-28">Driver</TableHead>
                <TableHead className="w-40">Needs accommodation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {crew.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground text-center py-4">
                    No crew members in personal_festival_db for this festival yet.
                  </TableCell>
                </TableRow>
              )}
              {crew.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.role ?? "—"}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={c.is_driver}
                      onCheckedChange={(v) => updateCrew.mutate({ id: c.id, is_driver: !!v })}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={c.needs_accommodation}
                      onCheckedChange={(v) => updateCrew.mutate({ id: c.id, needs_accommodation: !!v })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ===== 3. Hotels ===== */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Hotel className="h-4 w-4 text-primary" />
            Hotels
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => addHotel.mutate()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add hotel
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {hotels.length === 0 && (
            <p className="text-sm text-muted-foreground">No hotels booked yet.</p>
          )}
          {hotels.map((h) => {
            const missing = !h.name?.trim() || !h.address?.trim() || !h.cost_per_night || !h.total_nights;
            return (
              <div key={h.id} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <EditableField
                      value={h.name}
                      placeholder="Hotel name"
                      onChange={async (v) => {
                        await updateHotel.mutateAsync({ id: h.id, name: v });
                      }}
                    />
                    <EditableField
                      value={h.contact}
                      placeholder="Contact (phone/email)"
                      onChange={(v) => updateHotel.mutate({ id: h.id, contact: v })}
                    />
                    <EditableField
                      value={h.address}
                      placeholder="Address"
                      onChange={(v) => updateHotel.mutate({ id: h.id, address: v })}
                      className="col-span-2"
                    />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteHotel.mutate(h.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Rooms</div>
                    <EditableField
                      type="number"
                      value={h.rooms_count == null ? "" : String(h.rooms_count)}
                      onChange={async (v) => {
                        const next = { ...h, rooms_count: v === "" ? null : Number(v) };
                        await updateHotel.mutateAsync({ id: h.id, rooms_count: next.rooms_count });
                        await syncHotelCost(next);
                      }}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Cost / night</div>
                    <EditableField
                      type="number"
                      value={h.cost_per_night == null ? "" : String(h.cost_per_night)}
                      onChange={async (v) => {
                        const num = v === "" ? null : Number(v);
                        await updateHotel.mutateAsync({ id: h.id, cost_per_night: num });
                        await syncHotelCost({ ...h, cost_per_night: num });
                      }}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Nights</div>
                    <EditableField
                      type="number"
                      value={h.total_nights == null ? "" : String(h.total_nights)}
                      onChange={async (v) => {
                        const num = v === "" ? null : Number(v);
                        await updateHotel.mutateAsync({ id: h.id, total_nights: num });
                        await syncHotelCost({ ...h, total_nights: num });
                      }}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Total</div>
                    <div className="h-8 px-2 py-1 text-sm font-semibold tabular-nums">
                      {h.total_cost ? `${h.total_cost.toLocaleString()} ${h.currency}` : "—"}
                    </div>
                  </div>
                </div>
                {missing && (
                  <MissingFlag
                    isMissing
                    label={`Hotel info: ${h.name?.trim() || "(unnamed)"}`}
                    festivalId={festivalId}
                    cardOrigin={ACCOMMODATION_CARD_ORIGIN}
                    defaultPriority="high"
                  />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ===== 4. Upload zone ===== */}
      <CardUploadZone
        festivalId={festivalId}
        cardName="transportation_accommodation"
        title="Transportation & Accommodation — uploads"
        subtitle="Rental contracts, hotel bookings, driver licenses…"
      />
    </div>
  );
}

export default TransportationCard;
