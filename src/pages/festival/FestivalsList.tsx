import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tent } from "lucide-react";

type Festival = { id: string; slug: string; name: string; year: number; start_date: string; end_date: string };

export default function FestivalsList() {
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("festivals").select("*").order("start_date", { ascending: true }).then(({ data }) => {
      setFestivals((data as Festival[]) ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-heading font-bold text-foreground">Festivals</h1>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : festivals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No festivals yet. Add one via the database.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {festivals.map(f => (
            <Link key={f.id} to={`/festivals/${f.slug}`} className="rounded-2xl border border-border/50 p-5 bg-card hover:shadow-md transition">
              <Tent className="h-5 w-5 text-primary mb-3" />
              <h3 className="font-semibold text-foreground">{f.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{f.year} · {f.start_date} → {f.end_date}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
