import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tent } from "lucide-react";

type FestivalCard = {
  slug: string;
  name: string;
  year: number | null;
  doc_count: number;
  latest: string | null;
};

export default function DocumentsFestivals() {
  const [items, setItems] = useState<FestivalCard[]>([]);

  useEffect(() => {
    (async () => {
      const { data: festivals } = await supabase.from("festivals").select("slug, name, year");
      const { data: docs } = await supabase
        .from("extracted_documents")
        .select("festival_slug, received_at")
        .eq("category", "festival");

      const byFest: Record<string, { count: number; latest: string | null }> = {};
      (docs || []).forEach((d: { festival_slug: string | null; received_at: string | null }) => {
        if (!d.festival_slug) return;
        if (!byFest[d.festival_slug]) byFest[d.festival_slug] = { count: 0, latest: null };
        byFest[d.festival_slug].count++;
        if (!byFest[d.festival_slug].latest || (d.received_at && d.received_at > byFest[d.festival_slug].latest!)) {
          byFest[d.festival_slug].latest = d.received_at;
        }
      });

      const list: FestivalCard[] = (festivals || []).map((f: { slug: string; name: string; year: number | null }) => ({
        slug: f.slug,
        name: f.name,
        year: f.year,
        doc_count: byFest[f.slug]?.count || 0,
        latest: byFest[f.slug]?.latest || null,
      }));
      setItems(list);
    })();
  }, []);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Festival documents</h1>
        <p className="text-sm text-muted-foreground mt-1">All festival-tagged documents grouped by event.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && (
          <Card className="p-8 col-span-full text-center text-sm text-muted-foreground">
            No festivals yet. Add festivals in the Festivals section, then sync emails.
          </Card>
        )}
        {items.map((f) => (
          <Link key={f.slug} to={`/documents/festivals/${f.slug}`}>
            <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Tent className="h-5 w-5" />
                </div>
                <span className="text-xs text-muted-foreground">{f.year || ""}</span>
              </div>
              <h3 className="font-semibold mt-3">{f.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{f.doc_count} documents</p>
              {f.latest && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Latest: {new Date(f.latest).toLocaleDateString()}
                </p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
