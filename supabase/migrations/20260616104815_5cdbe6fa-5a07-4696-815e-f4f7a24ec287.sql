
-- Employee code (EMP-0001 ...) + duplicate email guard
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_code text;

CREATE SEQUENCE IF NOT EXISTS public.employees_code_seq START 1;

CREATE OR REPLACE FUNCTION public.assign_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_code IS NULL OR NEW.employee_code = '' THEN
    NEW.employee_code := 'EMP-' || lpad(nextval('public.employees_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_assign_code ON public.employees;
CREATE TRIGGER employees_assign_code
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.assign_employee_code();

-- Backfill existing rows
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.employees WHERE employee_code IS NULL ORDER BY created_at, id LOOP
    UPDATE public.employees
      SET employee_code = 'EMP-' || lpad(nextval('public.employees_code_seq')::text, 4, '0')
      WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS employees_code_unique ON public.employees(employee_code);

-- Case-insensitive unique on email (when present) to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS employees_email_lower_unique
  ON public.employees(lower(email)) WHERE email IS NOT NULL AND email <> '';
