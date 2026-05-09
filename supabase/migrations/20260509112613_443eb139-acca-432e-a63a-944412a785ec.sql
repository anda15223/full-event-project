-- Create festival_topskilt table to track topskilt status per contract
CREATE TABLE public.festival_topskilt (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  festival_contract_id UUID NOT NULL,
  design_status TEXT NOT NULL DEFAULT 'not_started',
  print_status TEXT,
  print_deadline DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.festival_topskilt ENABLE ROW LEVEL SECURITY;

-- RLS policy: authenticated users full access
CREATE POLICY "auth_users_all_access"
ON public.festival_topskilt
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Seed with one row per existing contract, default not_started
INSERT INTO public.festival_topskilt (festival_contract_id, design_status)
SELECT id, 'not_started'
FROM public.festival_contracts;