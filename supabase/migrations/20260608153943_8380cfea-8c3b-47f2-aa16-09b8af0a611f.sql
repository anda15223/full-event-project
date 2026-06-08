DROP INDEX IF EXISTS public.festival_staff_festival_number_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS festival_staff_festival_draft_number_uidx
  ON public.festival_staff (festival_id, is_draft, staff_number)
  WHERE staff_number IS NOT NULL;

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

  SELECT COALESCE(MIN(s.n), 1) INTO next_num
  FROM generate_series(1, COALESCE((
    SELECT MAX(staff_number) + 1
    FROM public.festival_staff
    WHERE festival_id = NEW.festival_id
      AND is_draft = NEW.is_draft
  ), 1)) AS s(n)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.festival_staff
    WHERE festival_id = NEW.festival_id
      AND is_draft = NEW.is_draft
      AND staff_number = s.n
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

CREATE OR REPLACE FUNCTION public.renumber_festival_staff(p_festival_id uuid, p_is_draft boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_record record;
  new_number int := 1;
BEGIN
  FOR row_record IN
    SELECT id
    FROM public.festival_staff
    WHERE festival_id = p_festival_id
      AND is_draft = p_is_draft
    ORDER BY staff_number NULLS LAST, created_at, id
  LOOP
    UPDATE public.festival_staff
    SET staff_number = -new_number
    WHERE id = row_record.id;
    new_number := new_number + 1;
  END LOOP;

  UPDATE public.festival_staff
  SET staff_number = abs(staff_number)
  WHERE festival_id = p_festival_id
    AND is_draft = p_is_draft
    AND staff_number < 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.renumber_festival_staff_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.renumber_festival_staff(OLD.festival_id, OLD.is_draft);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_renumber_festival_staff_after_delete ON public.festival_staff;
CREATE TRIGGER trg_renumber_festival_staff_after_delete
AFTER DELETE ON public.festival_staff
FOR EACH ROW
EXECUTE FUNCTION public.renumber_festival_staff_after_delete();

DO $$
DECLARE
  group_record record;
BEGIN
  FOR group_record IN
    SELECT festival_id, is_draft
    FROM public.festival_staff
    GROUP BY festival_id, is_draft
  LOOP
    PERFORM public.renumber_festival_staff(group_record.festival_id, group_record.is_draft);
  END LOOP;
END;
$$;