import { Link } from "react-router-dom";
import { Calendar, MapPin, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFestivals } from "@/hooks/useFestival";

export default function FestivalsList() {
  const { data: festivals = [], isLoading } = useFestivals();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Festivals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plan every festival with the same systematic approach as Jelling 2026
          </p>
        </div>
        <Button size="sm" disabled className="opacity-60">
          <Plus className="h-4 w-4 mr-1.5" />
          New festival
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : festivals.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground text-sm">
          No festivals yet
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {festivals.map(f => (
            <Link key={f.id} to={`/festivals/${f.slug}`}>
              <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer h-full">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-[15px] leading-tight">{f.name}</h3>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {f.status}
                  </Badge>
                </div>
                <div className="space-y-1.5 text-[12px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(f.start_date).toLocaleDateString()} – {new Date(f.end_date).toLocaleDateString()}
                  </div>
                  {f.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {f.location}
                    </div>
                  )}
                </div>
                {f.organiser_name && (
                  <p className="mt-3 text-[11px] text-muted-foreground border-t border-border/50 pt-2">
                    Organiser: {f.organiser_name}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
