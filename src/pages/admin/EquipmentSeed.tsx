import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { seedEquipmentFromTemplate } from "@/lib/seedPowerEquipment";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface EmptyRow {
  festival_power_id: string;
  festival_id: string;
  festival_slug: string;
  festival_name: string;
  concept_id: string;
  concept_name: string;
  concept_alias: string | null;
  variant: "standalone" | "inside_tent_shared";
}

export default function EquipmentSeed() {
  const [rows, setRows] = useState<EmptyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: powers } = await supabase
      .from("festival_power")
      .select(
        "id, equipment_variant, festival_contract:festival_contract_id(id, concept_id, concept_alias, concept:concepts!concept_id(name), festival:festivals!festival_id(id, slug, name))",
      );
    const { data: equipment } = await supabase
      .from("festival_power_equipment")
      .select("festival_power_id");
    const haveEquip = new Set((equipment ?? []).map((e: any) => e.festival_power_id));
    const empty: EmptyRow[] = ((powers ?? []) as any[])
      .filter((p) => !haveEquip.has(p.id) && p.festival_contract?.concept_id)
      .map((p) => ({
        festival_power_id: p.id,
        festival_id: p.festival_contract.festival.id,
        festival_slug: p.festival_contract.festival.slug,
        festival_name: p.festival_contract.festival.name,
        concept_id: p.festival_contract.concept_id,
        concept_name: p.festival_contract.concept?.name ?? "?",
        concept_alias: p.festival_contract.concept_alias,
        variant: (p.equipment_variant ?? "standalone") as "standalone" | "inside_tent_shared",
      }))
      .sort((a, b) =>
        a.festival_name.localeCompare(b.festival_name) ||
        a.concept_name.localeCompare(b.concept_name),
      );
    setRows(empty);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const seedAll = async () => {
    if (!rows || rows.length === 0) return;
    setRunning(true);
    let totalItems = 0;
    let contracts = 0;
    const festivals = new Set<string>();
    for (const r of rows) {
      try {
        const { inserted } = await seedEquipmentFromTemplate({
          festivalPowerId: r.festival_power_id,
          conceptId: r.concept_id,
          variant: r.variant,
          festivalId: r.festival_id,
        });
        totalItems += inserted;
        if (inserted > 0) {
          contracts += 1;
          festivals.add(r.festival_slug);
        }
      } catch (e: any) {
        console.error("Seed failed for", r, e);
      }
    }
    setRunning(false);
    toast.success(`Seeded ${totalItems} equipment items across ${contracts} contracts at ${festivals.size} festivals`);
    await load();
  };

  const seedOne = async (r: EmptyRow) => {
    try {
      const { inserted } = await seedEquipmentFromTemplate({
        festivalPowerId: r.festival_power_id,
        conceptId: r.concept_id,
        variant: r.variant,
        festivalId: r.festival_id,
      });
      toast.success(`Seeded ${inserted} items for ${r.concept_name} at ${r.festival_name}`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Seed failed");
    }
  };

  if (loading || !rows) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  // Group by festival
  const byFestival = new Map<string, EmptyRow[]>();
  rows.forEach((r) => {
    const arr = byFestival.get(r.festival_slug) ?? [];
    arr.push(r);
    byFestival.set(r.festival_slug, arr);
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Power equipment — bulk seed</h1>
        <p className="text-sm text-muted-foreground">
          Festivals with empty equipment lists. Seed-from-template uses each contract's
          variant (defaults to "standalone").
        </p>
      </header>

      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div>
          <div className="text-sm font-medium">{rows.length} empty power records across {byFestival.size} festivals</div>
          <div className="text-xs text-muted-foreground">Click "Seed all" to apply the matching template to every empty record.</div>
        </div>
        <Button onClick={seedAll} disabled={running || rows.length === 0}>
          {running ? "Seeding…" : "Seed all"}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          All festivals have power equipment seeded.
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(byFestival.entries()).map(([slug, items]) => (
            <section key={slug} className="rounded-lg border bg-card overflow-hidden">
              <header className="px-4 py-2 bg-muted/40 flex items-baseline justify-between">
                <Link to={`/festivals/${slug}/power`} className="font-medium hover:underline">
                  {items[0].festival_name}
                </Link>
                <span className="text-xs text-muted-foreground">{items.length} empty</span>
              </header>
              <ul className="divide-y">
                {items.map((r) => (
                  <li key={r.festival_power_id} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">
                        {r.concept_alias || r.concept_name}
                        <span className="text-xs text-muted-foreground"> · {r.variant}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => seedOne(r)} disabled={running}>
                      Seed
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
