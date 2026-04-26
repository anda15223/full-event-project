ALTER TABLE public.festival_bc_trolley_items
ADD COLUMN concept_id uuid REFERENCES public.festival_concepts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_festival_bc_trolley_items_concept_id
ON public.festival_bc_trolley_items(concept_id);