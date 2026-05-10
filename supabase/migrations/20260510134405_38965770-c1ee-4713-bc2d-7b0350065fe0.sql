
-- Phase 2K-2: Promote season_rentals to canonical vehicle identity table

-- STEP 1: Add canonical vehicle columns
ALTER TABLE public.season_rentals
  ADD COLUMN license_plate text,
  ADD COLUMN capacity smallint,
  ADD COLUMN accreditation_pdf_path text,
  ADD COLUMN accreditation_uploaded_at timestamptz,
  ADD COLUMN ownership text NOT NULL DEFAULT 'season_rental'
    CHECK (ownership IN ('season_rental', 'company_owned', 'one_off_rental')),
  ADD COLUMN display_name text;

-- Relax NOT NULL on fields that don't apply to company-owned vehicles
ALTER TABLE public.season_rentals
  ALTER COLUMN reservation_number DROP NOT NULL,
  ALTER COLUMN supplier_name DROP NOT NULL;

-- STEP 2: Backfill existing rows (Marius #1, Costel #2)
UPDATE public.season_rentals
SET capacity = 3, ownership = 'season_rental'
WHERE reservation_number IN ('26581644', '26581645');

-- STEP 3: Insert 8 new canonical rows

-- Company-owned (3)
INSERT INTO public.season_rentals
  (vehicle_type, capacity, ownership, primary_driver_name, status,
   season_label, contracting_entity, start_date, end_date, notes)
VALUES
  ('Duster (TFP existing)', 5, 'company_owned', NULL, 'active',
   'Company Fleet', 'Full Event Project ApS', '2026-01-01', '2099-12-31',
   'Full Event Project owned. Crew transport. Driver TBD per festival.'),
  ('BMW (Fif own)', 2, 'company_owned', 'Alexandra Artimon (Fif)', 'active',
   'Company Fleet', 'Full Event Project ApS', '2026-01-01', '2099-12-31',
   'Full Event Project owned. Driver TBD per festival.'),
  ('Iveco with lift', 3, 'company_owned', NULL, 'active',
   'Company Fleet', 'Full Event Project ApS', '2026-01-01', '2099-12-31',
   'Full Event Project owned. Aarhus-side support. Driver TBD per festival.');

-- GRØN-specific framework rentals (3)
INSERT INTO public.season_rentals
  (vehicle_type, capacity, ownership, reservation_number, season_label,
   supplier_name, contracting_entity, start_date, end_date, status, notes)
VALUES
  ('Europcar lift A', 3, 'one_off_rental', '26581648', 'GRØN week 1+2 framework',
   'Europcar Mobility Group Denmark A/S', 'AEGEAN APS',
   '2026-07-16', '2026-07-26', 'active',
   'GRØN-specific framework rental. Spans both GRØN weeks (16–26 July).'),
  ('Europcar lift B', 3, 'one_off_rental', '26581649', 'GRØN week 1+2 framework',
   'Europcar Mobility Group Denmark A/S', 'AEGEAN APS',
   '2026-07-16', '2026-07-26', 'active',
   'GRØN-specific framework rental. Spans both GRØN weeks (16–26 July).'),
  ('9-seater', 9, 'one_off_rental', '26581650', 'GRØN week 1+2 framework',
   'Europcar Mobility Group Denmark A/S', 'AEGEAN APS',
   '2026-07-16', '2026-07-26', 'active',
   'GRØN-specific framework rental. Spans both GRØN weeks (16–26 July).');

-- Jelling one-offs (2)
INSERT INTO public.season_rentals
  (vehicle_type, capacity, ownership, reservation_number, season_label,
   supplier_name, contracting_entity, start_date, end_date, status, notes)
VALUES
  ('Europcar lift vehicle #3 (extra)', 3, 'one_off_rental', '26581646', 'Jelling 2026',
   'Europcar Mobility Group Denmark A/S', 'AEGEAN APS',
   '2026-05-15', '2026-05-26', 'active',
   'Jelling 2026 only. 15–26 May, Bilgruppe 7A, Marko driver. 11 days @ 669.10 DKK ex VAT.'),
  ('8+1 van', 9, 'one_off_rental', '26581647', 'Jelling 2026',
   'Europcar Mobility Group Denmark A/S', 'AEGEAN APS',
   '2026-05-15', '2026-05-26', 'active',
   'Jelling 2026 only. Bilgruppe J9AP, 9-seater minivan. Driver TBD.');

-- STEP 4: Strip GRØN cluttered suffixes on festival_transport.vehicle_type
UPDATE public.festival_transport
SET vehicle_type = 'Europcar lift A'
WHERE festival_id IN (SELECT id FROM public.festivals WHERE slug IN ('gron-koncert-uge1-2026', 'gron-koncert-uge2-2026'))
  AND vehicle_type LIKE 'Europcar lift A (Res%';

UPDATE public.festival_transport
SET vehicle_type = 'Europcar lift B'
WHERE festival_id IN (SELECT id FROM public.festivals WHERE slug IN ('gron-koncert-uge1-2026', 'gron-koncert-uge2-2026'))
  AND vehicle_type LIKE 'Europcar lift B (Res%';

UPDATE public.festival_transport
SET vehicle_type = '9-seater'
WHERE festival_id IN (SELECT id FROM public.festivals WHERE slug IN ('gron-koncert-uge1-2026', 'gron-koncert-uge2-2026'))
  AND vehicle_type LIKE '9-seater (Res 26581650%';

-- STEP 5: Backfill season_rental_id on festival_transport

UPDATE public.festival_transport ft
SET season_rental_id = (SELECT id FROM public.season_rentals WHERE vehicle_type = 'Duster (TFP existing)' AND ownership = 'company_owned')
WHERE ft.vehicle_type = 'Duster (TFP existing)' AND ft.season_rental_id IS NULL;

UPDATE public.festival_transport ft
SET season_rental_id = (SELECT id FROM public.season_rentals WHERE vehicle_type = 'BMW (Fif own)' AND ownership = 'company_owned')
WHERE ft.vehicle_type = 'BMW (Fif own)' AND ft.season_rental_id IS NULL;

UPDATE public.festival_transport ft
SET season_rental_id = (SELECT id FROM public.season_rentals WHERE vehicle_type = 'Iveco with lift' AND ownership = 'company_owned')
WHERE ft.vehicle_type = 'Iveco with lift' AND ft.season_rental_id IS NULL;

UPDATE public.festival_transport ft
SET season_rental_id = (SELECT id FROM public.season_rentals WHERE reservation_number = '26581648')
WHERE ft.vehicle_type = 'Europcar lift A' AND ft.season_rental_id IS NULL;

UPDATE public.festival_transport ft
SET season_rental_id = (SELECT id FROM public.season_rentals WHERE reservation_number = '26581649')
WHERE ft.vehicle_type = 'Europcar lift B' AND ft.season_rental_id IS NULL;

UPDATE public.festival_transport ft
SET season_rental_id = (SELECT id FROM public.season_rentals WHERE reservation_number = '26581650')
WHERE ft.vehicle_type = '9-seater' AND ft.season_rental_id IS NULL;

UPDATE public.festival_transport ft
SET season_rental_id = (SELECT id FROM public.season_rentals WHERE reservation_number = '26581646')
WHERE ft.vehicle_type = 'Europcar lift vehicle #3 (extra)' AND ft.season_rental_id IS NULL;

UPDATE public.festival_transport ft
SET season_rental_id = (SELECT id FROM public.season_rentals WHERE reservation_number = '26581647')
WHERE ft.vehicle_type = '8+1 van' AND ft.season_rental_id IS NULL;
