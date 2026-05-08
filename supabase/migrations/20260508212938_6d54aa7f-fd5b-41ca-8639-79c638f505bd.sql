ALTER TABLE public.festival_power
  ADD COLUMN IF NOT EXISTS equipment_variant text NOT NULL DEFAULT 'standalone'
  CHECK (equipment_variant IN ('standalone', 'inside_tent_shared'));

UPDATE public.festival_power fp
SET equipment_variant = 'inside_tent_shared'
WHERE id IN (
  SELECT fp2.id FROM public.festival_power fp2
  JOIN public.festival_contracts fc ON fc.id = fp2.festival_contract_id
  JOIN public.festivals f ON f.id = fc.festival_id
  JOIN public.concepts c ON c.id = fc.concept_id
  WHERE f.slug = 'jelling-2026' AND c.slug IN ('fish-chips','gyros')
);