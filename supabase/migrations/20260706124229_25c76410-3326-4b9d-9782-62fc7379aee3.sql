
ALTER TABLE public.festival_concept_assignments
  ADD COLUMN IF NOT EXISTS festival_contract_id uuid REFERENCES public.festival_contracts(id) ON DELETE CASCADE;

-- Backfill: attach existing per-concept assignments to one existing contract for that concept.
UPDATE public.festival_concept_assignments a
SET festival_contract_id = sub.contract_id
FROM (
  SELECT DISTINCT ON (festival_id, concept_id) festival_id, concept_id, id AS contract_id
  FROM public.festival_contracts
  ORDER BY festival_id, concept_id, created_at NULLS LAST
) sub
WHERE a.festival_contract_id IS NULL
  AND a.festival_id = sub.festival_id
  AND a.concept_id = sub.concept_id;

-- Drop legacy uniqueness on (festival_id, concept_id, role) if present.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.festival_concept_assignments'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.festival_concept_assignments DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- New per-contract uniqueness so upserts differentiate stalls.
CREATE UNIQUE INDEX IF NOT EXISTS festival_concept_assignments_contract_role_uq
  ON public.festival_concept_assignments (festival_contract_id, role)
  WHERE festival_contract_id IS NOT NULL;
