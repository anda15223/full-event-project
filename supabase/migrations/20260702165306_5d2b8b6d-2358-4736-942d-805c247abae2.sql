ALTER TABLE public.festival_staff
ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.festival_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_festival_staff_contract_id ON public.festival_staff(contract_id);