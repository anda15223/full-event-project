ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Prevent duplicate people: same name + DOB can only exist once
CREATE UNIQUE INDEX IF NOT EXISTS employees_name_dob_unique
  ON public.employees (lower(btrim(name)), date_of_birth)
  WHERE date_of_birth IS NOT NULL;