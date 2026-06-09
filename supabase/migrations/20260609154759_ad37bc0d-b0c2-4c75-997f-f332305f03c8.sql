
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  home_location text,
  default_role text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_authenticated_all" ON public.employees
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER employees_touch_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_employees_name_lower ON public.employees (lower(name));

-- Link festival_staff -> employees
ALTER TABLE public.festival_staff
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_festival_staff_employee_id ON public.festival_staff (employee_id);

-- Backfill: one employee per distinct trimmed lowercase non-empty name across all festival_staff.
WITH distinct_names AS (
  SELECT
    lower(btrim(name)) AS name_key,
    (array_agg(btrim(name) ORDER BY updated_at DESC NULLS LAST))[1] AS display_name,
    (array_agg(home_location ORDER BY updated_at DESC NULLS LAST) FILTER (WHERE home_location IS NOT NULL AND btrim(home_location) <> ''))[1] AS home_location,
    (array_agg(role ORDER BY updated_at DESC NULLS LAST))[1] AS default_role
  FROM public.festival_staff
  WHERE name IS NOT NULL AND btrim(name) <> ''
  GROUP BY lower(btrim(name))
),
inserted AS (
  INSERT INTO public.employees (name, home_location, default_role)
  SELECT display_name, home_location, default_role FROM distinct_names
  RETURNING id, lower(btrim(name)) AS name_key
)
UPDATE public.festival_staff fs
SET employee_id = i.id
FROM inserted i
WHERE fs.employee_id IS NULL
  AND fs.name IS NOT NULL
  AND lower(btrim(fs.name)) = i.name_key;
