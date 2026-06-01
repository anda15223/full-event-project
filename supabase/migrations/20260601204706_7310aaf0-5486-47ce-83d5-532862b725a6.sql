
ALTER TABLE public.festival_staff
  ADD COLUMN IF NOT EXISTS staff_number int;

-- Backfill: assign sequential numbers per festival, ordered by creation
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY festival_id ORDER BY created_at, id) AS rn
  FROM public.festival_staff
  WHERE staff_number IS NULL
)
UPDATE public.festival_staff fs
SET staff_number = n.rn
FROM numbered n
WHERE fs.id = n.id;

-- Unique per festival (allow nulls just in case during transition)
CREATE UNIQUE INDEX IF NOT EXISTS festival_staff_festival_number_uidx
  ON public.festival_staff (festival_id, staff_number)
  WHERE staff_number IS NOT NULL;

-- Auto-assign smallest available number on insert when not provided.
-- Reuses gaps left by deletions.
CREATE OR REPLACE FUNCTION public.assign_festival_staff_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_num int;
BEGIN
  IF NEW.staff_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- find smallest positive integer not already used for this festival
  SELECT COALESCE(MIN(s.n), 1) INTO next_num
  FROM generate_series(1, COALESCE((
    SELECT MAX(staff_number) + 1 FROM public.festival_staff WHERE festival_id = NEW.festival_id
  ), 1)) AS s(n)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.festival_staff
    WHERE festival_id = NEW.festival_id AND staff_number = s.n
  );

  NEW.staff_number := next_num;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_festival_staff_number ON public.festival_staff;
CREATE TRIGGER trg_assign_festival_staff_number
BEFORE INSERT ON public.festival_staff
FOR EACH ROW
EXECUTE FUNCTION public.assign_festival_staff_number();
