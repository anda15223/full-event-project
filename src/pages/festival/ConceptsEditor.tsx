import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { useFestival, useConcepts } from "@/hooks/useFestival";

export default function ConceptsEditor() {
  const { slug } = useParams<{ slug: string }>();
  const { data: festival } = useFestival(slug);
  const { data: concepts = [] } = useConcepts(festival?.id);

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Concepts</h1>
        <p className="text-sm text-muted-foreground mt-1">{concepts.length} concepts at {festival.name}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {concepts.map(c => (
          <Card key={c.id} className="p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-[15px] leading-tight">{c.name}</h3>
                <p className="text-[12px] text-muted-foreground">{c.tent_size}</p>
              </div>
              <Badge variant="outline" className={c.zone === "INSIDE" ? "border-primary/40 text-primary" : "border-accent/40 text-accent-foreground"}>
                {c.zone}
              </Badge>
            </div>
            {c.products_sold && (
              <p className="text-[12px] text-muted-foreground line-clamp-3">{c.products_sold}</p>
            )}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Thu:</span> {c.sales_hours_thu}</div>
              <div><span className="text-muted-foreground">Fri:</span> {c.sales_hours_fri}</div>
              <div><span className="text-muted-foreground">Sat:</span> {c.sales_hours_sat}</div>
              <div><span className="text-muted-foreground">Sun:</span> {c.sales_hours_sun}</div>
            </div>
            <div className="border-t border-border/50 pt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Power baseline:</span> {c.power_baseline}</div>
              <div><span className="text-muted-foreground">Gas:</span> {c.gas_required ? "Yes" : "No"}</div>
              <div><span className="text-muted-foreground">Wristbands:</span> {c.wristband_max} ({c.wristband_black_partout} black + {c.wristband_normal_partout} normal)</div>
            </div>
            {Array.isArray(c.power_extras) && c.power_extras.length > 0 && (
              <div className="bg-secondary/40 rounded-lg p-2.5 text-[11px] space-y-1">
                <p className="font-medium text-muted-foreground">Power extras</p>
                {c.power_extras.map((p: any, i: number) => (
                  <p key={i}>• {p.amperage} ×{p.count}{p.phase ? ` ${p.phase}` : ""} — {p.notes}</p>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
