ALTER TABLE public.festival_contracts
ADD COLUMN IF NOT EXISTS tent_primary_contract_id uuid REFERENCES public.festival_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_festival_contracts_tent_primary ON public.festival_contracts(tent_primary_contract_id);

COMMENT ON COLUMN public.festival_contracts.tent_primary_contract_id IS 'When set, this contract shares a tent with the referenced primary contract. Power & Equipment cards display merged into the primary; this contract''s cards are hidden.';