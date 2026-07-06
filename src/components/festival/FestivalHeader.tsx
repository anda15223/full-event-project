import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface FestivalHeaderProps {
  festival: {
    id: string;
    slug: string;
    name: string;
    location: string | null;
    date_start: string;
    date_end: string;
    lat: number | null;
    lng: number | null;
    address?: string | null;
    city?: string | null;
    driving_url?: string | null;
  };
  rightSlot?: React.ReactNode;
  compact?: boolean;
}

function formatRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameMonth =
    s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  const sameYear = s.getFullYear() === e.getFullYear();
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-DK", opts).format(d);
  if (sameMonth) {
    return `${s.getDate()} – ${e.getDate()} ${fmt(e, { month: "long", year: "numeric" })}`;
  }
  if (sameYear) {
    return `${fmt(s, { day: "numeric", month: "short" })} – ${fmt(e, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${fmt(s, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(e, { day: "numeric", month: "short", year: "numeric" })}`;
}

function daysUntil(iso: string): number {
  const d = new Date(iso + "T00:00:00").getTime();
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.ceil((d - t.getTime()) / 86400000);
}

function CountdownPill({ startDate }: { startDate: string }) {
  const diff = daysUntil(startDate);
  let label: string;
  let cls: string;
  if (diff < 0) { label = "PAST"; cls = "bg-muted text-muted-foreground"; }
  else if (diff === 0) { label = "TODAY"; cls = "bg-destructive text-destructive-foreground"; }
  else if (diff === 1) { label = "T-1 day"; cls = "bg-destructive text-destructive-foreground"; }
  else if (diff <= 6) { label = `T-${diff} days`; cls = "bg-destructive text-destructive-foreground"; }
  else if (diff <= 14) { label = `T-${diff} days`; cls = "bg-amber-500 text-white"; }
  else { label = `T-${diff} days`; cls = "bg-emerald-600 text-white"; }
  return (
    <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", cls)}>
      {label}
    </span>
  );
}

function CoordinatesDialog({
  festivalId, slug, currentLat, currentLng, currentAddress, currentDrivingUrl,
}: { festivalId: string; slug: string; currentLat: number | null; currentLng: number | null; currentAddress?: string | null; currentDrivingUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState(currentLat?.toString() ?? "");
  const [lng, setLng] = useState(currentLng?.toString() ?? "");
  const [address, setAddress] = useState(currentAddress ?? "");
  const [drivingUrl, setDrivingUrl] = useState(currentDrivingUrl ?? "");
  const [geocoding, setGeocoding] = useState(false);
  const qc = useQueryClient();

  const geocodeAddress = async () => {
    if (!address.trim()) return toast.error("Enter an address first");
    setGeocoding(true);
    try {
      const { data, error } = await supabase.functions.invoke("reverse-geocode", {
        body: { address: address.trim() },
      });
      if (error) throw error;
      if (data?.lat && data?.lng) {
        setLat(String(data.lat));
        setLng(String(data.lng));
        if (data.address) setAddress(data.address);
        toast.success("Coordinates found");
      } else {
        toast.error("No coordinates found for this address");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Geocoding failed");
    } finally {
      setGeocoding(false);
    }
  };

  const m = useMutation({
    mutationFn: async () => {
      const latNum = parseFloat(lat); const lngNum = parseFloat(lng);
      if (Number.isNaN(latNum) || Number.isNaN(lngNum)) throw new Error("Invalid coordinates");

      let finalAddress: string | null = address.trim() || null;
      let city: string | null = null;

      if (!finalAddress) {
        try {
          const { data, error } = await supabase.functions.invoke("reverse-geocode", {
            body: { lat: latNum, lng: lngNum },
          });
          if (!error && data?.address) {
            finalAddress = data.address;
            city = data.city ?? null;
          }
        } catch {}
      }

      const updates: { lat: number; lng: number; address?: string; city?: string } = { lat: latNum, lng: lngNum };
      if (finalAddress) updates.address = finalAddress;
      if (city) updates.city = city;

      const { error } = await supabase.from("festivals").update(updates).eq("id", festivalId);
      if (error) throw error;
      return { address: finalAddress };
    },
    onSuccess: (res) => {
      toast.success(res?.address ? `Saved · ${res.address}` : "Coordinates saved");
      qc.invalidateQueries({ queryKey: ["festival", slug] });
      qc.invalidateQueries({ queryKey: ["festival-overview", slug] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="mt-3">Set coordinates</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Set location</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="address">Address</Label>
            <div className="flex gap-2">
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Vig Festivalplads, 4560 Vig" />
              <Button type="button" variant="outline" onClick={geocodeAddress} disabled={geocoding}>
                {geocoding ? "..." : "Find"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Type an address and press Find to auto-fill coordinates.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="lat">Latitude</Label>
              <Input id="lat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="55.7553" />
            </div>
            <div>
              <Label htmlFor="lng">Longitude</Label>
              <Input id="lng" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="9.4239" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FestivalHeader({ festival, rightSlot, compact = false }: FestivalHeaderProps) {
  const hasCoords = festival.lat != null && festival.lng != null;
  return (
    <header className={cn(!compact && "mb-6 sm:mb-8", "space-y-3 sm:space-y-4")}>
      {!compact && (
        <>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground break-words">
            {festival.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm sm:text-lg text-muted-foreground">
            <span className="text-foreground">
              {formatRange(festival.date_start, festival.date_end)}
            </span>
            <span aria-hidden className="hidden sm:inline">·</span>
            <span>{festival.location ?? "Location not set"}</span>
            <span className="sm:ml-auto"><CountdownPill startDate={festival.date_start} /></span>
          </div>
        </>
      )}

      {compact && festival.location && (
        <div className="text-sm text-muted-foreground">{festival.location}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="space-y-2">
          <div className="h-48 sm:h-64 rounded-2xl overflow-hidden shadow-md border border-border">
            {hasCoords ? (
              <iframe
                title={`Map of ${festival.name}`}
                src={`https://maps.google.com/maps?q=${festival.lat},${festival.lng}&z=14&output=embed`}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="h-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                <p className="text-sm">Location coordinates not set</p>
                <CoordinatesDialog
                  festivalId={festival.id}
                  slug={festival.slug}
                  currentLat={festival.lat}
                  currentLng={festival.lng}
                  currentAddress={festival.address}
                />
              </div>
            )}
          </div>
          {hasCoords && (
            <div className="flex flex-wrap items-center gap-2">
              {festival.address && (
                <span className="text-sm text-muted-foreground flex-1 min-w-0 truncate" title={festival.address}>
                  {festival.address}
                </span>
              )}
              <Button asChild size="sm" variant="default">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${festival.lat},${festival.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open navigation in Google Maps"
                >
                  Navigate
                </a>
              </Button>
              <CoordinatesDialog
                festivalId={festival.id}
                slug={festival.slug}
                currentLat={festival.lat}
                currentLng={festival.lng}
                currentAddress={festival.address}
              />
            </div>
          )}
        </div>
        <div className="min-w-0">{rightSlot ?? null}</div>
      </div>
    </header>
  );
}

export default FestivalHeader;
