ALTER TABLE public.festival_staff
  ADD COLUMN IF NOT EXISTS accom_thursday boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accom_friday boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accom_saturday boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accom_sunday boolean NOT NULL DEFAULT false;

-- Backfill: anyone marked needs_accommodation gets all their working days flagged
UPDATE public.festival_staff
SET accom_thursday = COALESCE(works_thursday, false),
    accom_friday   = COALESCE(works_friday, false),
    accom_saturday = COALESCE(works_saturday, false),
    accom_sunday   = COALESCE(works_sunday, false)
WHERE needs_accommodation = true
  AND accom_thursday = false
  AND accom_friday = false
  AND accom_saturday = false
  AND accom_sunday = false;