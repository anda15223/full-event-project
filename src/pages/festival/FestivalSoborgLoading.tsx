import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2, Truck, Package, AlertTriangle, Snowflake, Download,
  Flame, Square, Anchor, ShoppingCart, CreditCard, Droplet, Tent, Type, FileImage,
} from "lucide-react";
import {
  getSoborgLoadingManifest, sortedCategories, categoryLabel,
  type SoborgLoadingManifest, type LoadingItem,
} from "@/lib/soborgLoading";

const CATEGORY_ICON: Record<string, typeof Flame> = {
  cooking: Flame,
  table: Square,
  scaffold: Anchor,
  trolley: ShoppingCart,
  pos: CreditCard,
  prep: Square,
  sink: Droplet,
  popup_tent: Tent,
  facade: FileImage,
  topskilt: Type,
  other: Package,
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

export default function FestivalSoborgLoading() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<SoborgLoadingManifest | null>(null);
  const [loading, setLoading] = useState(true);

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

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(data.festival.start_date);
  const days = Math.round((start.getTime() - today.getTime()) / 86400000);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Soborg Loading Manifest</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.festival.name} · {data.total_items} items total ·{" "}
            {days >= 0 ? `T-${days} days to load` : `Started ${-days} days ago`}
          </p>
        </div>
        <Link to={`/festivals/${slug}/soborg-loading/export`}>
          <Button size="sm" variant="outline">
            <Download className="h-4 w-4" /> Export PDF
          </Button>
        </Link>
      </div>

      {data.vehicles.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No equipment assigned to vehicles yet.
          </CardContent>
        </Card>
      )}

      {data.vehicles.map((veh) => (
        <Card key={veh.vehicle_id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-lg">
              <Truck className="h-5 w-5 text-primary" />
              {veh.vehicle_type}
              <span className="text-sm font-normal text-muted-foreground ml-auto">
                {veh.car_total_items} items
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {veh.concepts.map((cg) => (
              <div key={cg.contract_id} className="border-l-2 border-border pl-4">
                <div className="font-medium text-sm mb-2">
                  {cg.concept_name}
                  {cg.concept_alias && <span className="text-muted-foreground"> — {cg.concept_alias}</span>}
                  <span className="text-xs text-muted-foreground ml-2">({cg.total_items} items)</span>
                </div>
                <div className="space-y-3">
                  {sortedCategories(cg.items_by_category).map((cat) => {
                    const Icon = CATEGORY_ICON[cat] ?? Package;
                    const items = cg.items_by_category[cat];
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
                </div>
              </div>
            ))}
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
            <ul className="text-sm space-y-1 mb-3">
              {data.unassigned.concepts.map((c) => (
                <li key={c.contract_id}>
                  • {c.concept_name}
                  {c.concept_alias && <span className="text-muted-foreground"> — {c.concept_alias}</span>}
                  {c.total_items > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">({c.total_items} items)</span>
                  )}
                </li>
              ))}
            </ul>
            <Link to={`/festivals/${slug}/power`}>
              <Button size="sm" variant="outline">Assign vehicle</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {data.not_loaded_from_soborg.items.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Snowflake className="h-4 w-4 text-blue-500" /> Delivered on-site (NOT loaded from Soborg)
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
    </div>
  );
}
