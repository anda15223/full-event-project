
-- Add flexible date-array columns for work days and accommodation nights.
-- Keeps the legacy boolean columns for now (used by PDF export until migrated).

ALTER TABLE public.festival_staff
  ADD COLUMN IF NOT EXISTS work_dates  date[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accom_dates date[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.festival_staff.work_dates  IS 'Dates this person works at the festival. Replaces works_thursday/friday/saturday/sunday.';
COMMENT ON COLUMN public.festival_staff.accom_dates IS 'Dates this person needs accommodation. Replaces accom_thursday/friday/saturday/sunday.';

-- Backfill: map the four boolean day flags to actual calendar dates of the festival's Thu/Fri/Sat/Sun.
-- Strategy: compute the Thursday of the ISO week that contains festival.start_date, then add 0/1/2/3.
WITH ref AS (
  SELECT s.id AS staff_id,
         (f.start_date - ((EXTRACT(ISODOW FROM f.start_date)::int - 4 + 7) % 7))::date AS thu
  FROM public.festival_staff s
  JOIN public.festivals f ON f.id = s.festival_id
)
UPDATE public.festival_staff s
SET work_dates = COALESCE(
      ARRAY_REMOVE(ARRAY[
        CASE WHEN s.works_thursday THEN ref.thu              END,
        CASE WHEN s.works_friday   THEN ref.thu + 1          END,
        CASE WHEN s.works_saturday THEN ref.thu + 2          END,
        CASE WHEN s.works_sunday   THEN ref.thu + 3          END
      ], NULL), '{}'),
    accom_dates = COALESCE(
      ARRAY_REMOVE(ARRAY[
        CASE WHEN s.accom_thursday THEN ref.thu              END,
        CASE WHEN s.accom_friday   THEN ref.thu + 1          END,
        CASE WHEN s.accom_saturday THEN ref.thu + 2          END,
        CASE WHEN s.accom_sunday   THEN ref.thu + 3          END
      ], NULL), '{}')
FROM ref
WHERE ref.staff_id = s.id
  AND (s.work_dates = '{}' AND s.accom_dates = '{}');
