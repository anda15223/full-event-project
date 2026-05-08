import { supabase } from "@/integrations/supabase/client";

export type EquipmentVariant = "standalone" | "inside_tent_shared";

/**
 * Re-seeds festival_power_equipment for a power record from the
 * concept_equipment_template matching (concept_id, variant).
 * Wipes any existing rows for this power record first.
 */
export async function seedEquipmentFromTemplate(opts: {
  festivalPowerId: string;
  conceptId: string;
  variant: EquipmentVariant;
  festivalId: string; // used to resolve shared concept -> contract id at this festival
}) {
  const { festivalPowerId, conceptId, variant, festivalId } = opts;

  // Pull template rows
  const { data: tmpl, error: tErr } = await supabase
    .from("concept_equipment_template")
    .select("*")
    .eq("concept_id", conceptId)
    .eq("variant", variant)
    .order("position");
  if (tErr) throw tErr;

  // Resolve shared concept slugs -> contract ids at this festival
  const sharedSlugs = Array.from(
    new Set(
      (tmpl ?? [])
        .filter((t) => t.is_shared_with_other_concept && t.shared_with_concept_slug)
        .map((t) => t.shared_with_concept_slug as string),
    ),
  );

  const slugToContractId = new Map<string, string>();
  if (sharedSlugs.length > 0) {
    const { data: contracts } = await supabase
      .from("festival_contracts")
      .select("id, concept_id, concepts:concept_id(slug)")
      .eq("festival_id", festivalId);
    (contracts ?? []).forEach((c: any) => {
      const slug = c.concepts?.slug;
      if (slug && sharedSlugs.includes(slug)) slugToContractId.set(slug, c.id);
    });
  }

  // Delete existing equipment
  const { error: dErr } = await supabase
    .from("festival_power_equipment")
    .delete()
    .eq("festival_power_id", festivalPowerId);
  if (dErr) throw dErr;

  // Build insert rows (skip placeholder qty=0 rows)
  const rows = (tmpl ?? [])
    .filter((t) => (t.quantity ?? 0) > 0)
    .map((t) => ({
      festival_power_id: festivalPowerId,
      position: t.position,
      equipment_name: t.equipment_name,
      quantity: t.quantity,
      power_type: t.power_type,
      power_kw: t.power_kw,
      is_shared: !!t.is_shared_with_other_concept,
      shared_with_concepts:
        t.is_shared_with_other_concept && t.shared_with_concept_slug
          ? [slugToContractId.get(t.shared_with_concept_slug)].filter(Boolean)
          : null,
      notes: t.notes,
    }));

  if (rows.length === 0) return { inserted: 0 };

  const { error: iErr } = await supabase.from("festival_power_equipment").insert(rows);
  if (iErr) throw iErr;
  return { inserted: rows.length };
}
