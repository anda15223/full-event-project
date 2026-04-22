import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Truck, BedDouble } from "lucide-react";
import { useFestival, useVehicles, useAccommodation } from "@/hooks/useFestival";

const STATUS_COLOR: Record<string, string> = {
  booked: "bg-success/10 text-success border-success/20",
  to_book: "bg-warning/10 text-warning border-warning/20",
  owned: "bg-primary/10 text-primary border-primary/20",
};

export default function TransportEditor() {
  const { slug } = useParams<{ slug: string }>();
  const { data: festival } = useFestival(slug);
  const { data: vehicles = [] } = useVehicles(festival?.id);
  const { data: accom = [] } = useAccommodation(festival?.id);

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const totalSeats = vehicles.reduce((s, v) => s + (v.seats || 0), 0);
  const bedNights = accom.reduce((s, a) => {
    if (!a.check_in || !a.check_out || !a.people_count) return s;
    const days = Math.round((new Date(a.check_out).getTime() - new Date(a.check_in).getTime()) / 86400000);
    return s + days * a.people_count;
  }, 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transportation & Accommodation</h1>
        <p className="text-sm text-muted-foreground mt-1">{vehicles.length} vehicles · {totalSeats} seats · {accom.length} bookings · {bedNights} bed-nights</p>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold text-[14px] mb-3 flex items-center gap-2"><Truck className="h-4 w-4" />Vehicles</h2>
        <div className="space-y-2">
          {vehicles.map(v => (
            <div key={v.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary/40 border border-border/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{v.label}</span>
                  <Badge variant="outline" className="text-[10px]">{v.vehicle_type}</Badge>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {v.driver && <>Driver: {v.driver} · </>}
                  {v.purpose}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {v.travel_date && <span className="text-[11px] text-muted-foreground">{new Date(v.travel_date).toLocaleDateString()}</span>}
                {v.seats && <span className="text-[11px] text-muted-foreground">{v.seats} seats</span>}
                <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_COLOR[v.status] || ""}`}>{v.status.replace("_", " ")}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-[14px] mb-3 flex items-center gap-2"><BedDouble className="h-4 w-4" />Accommodation</h2>
        <div className="space-y-2">
          {accom.map(a => (
            <div key={a.id} className="flex items-start justify-between py-2 px-3 rounded-lg hover:bg-secondary/40 border border-border/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{a.label}</span>
                  <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_COLOR[a.status] || ""}`}>{a.status.replace("_", " ")}</Badge>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {a.check_in && a.check_out && <>{new Date(a.check_in).toLocaleDateString()} – {new Date(a.check_out).toLocaleDateString()} · </>}
                  {a.people_count} ppl · {a.room_config}
                </div>
                {a.notes && <p className="text-[11px] text-muted-foreground italic mt-0.5">{a.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
