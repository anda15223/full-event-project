-- ============================================================
-- Festival shared tables (Sprint 1 foundation)
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_personal_festival_db_updated ON public.personal_festival_db;
--   DROP TRIGGER IF EXISTS trg_equipment_db_updated ON public.equipment_db;
--   DROP TRIGGER IF EXISTS trg_cost_table_updated ON public.cost_table;
--   DROP TRIGGER IF EXISTS trg_tasks_deadlines_updated ON public.tasks_deadlines;
--   DROP TRIGGER IF EXISTS trg_suppliers_db_updated ON public.suppliers_db;
--   DROP TABLE IF EXISTS public.tasks_deadlines;
--   DROP TABLE IF EXISTS public.cost_table;
--   DROP TABLE IF EXISTS public.equipment_db;
--   DROP TABLE IF EXISTS public.personal_festival_db;
--   DROP TABLE IF EXISTS public.suppliers_db;
--   DROP TYPE IF EXISTS public.task_priority;
--   DROP TYPE IF EXISTS public.task_status;
--   DROP TYPE IF EXISTS public.equipment_source;
--   DROP TYPE IF EXISTS public.equipment_status;
-- ============================================================

-- Enums
CREATE TYPE public.task_priority AS ENUM ('urgent','high','normal','low');
CREATE TYPE public.task_status AS ENUM ('pending','in_progress','done');
CREATE TYPE public.equipment_source AS ENUM ('by_us','by_festival');
CREATE TYPE public.equipment_status AS ENUM ('pending','confirmed','delivered','returned');

-- 1. personal_festival_db ------------------------------------
CREATE TABLE public.personal_festival_db (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  phone text,
  email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_personal_festival_db_festival_id ON public.personal_festival_db(festival_id);

-- 2. equipment_db --------------------------------------------
CREATE TABLE public.equipment_db (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  source public.equipment_source NOT NULL DEFAULT 'by_us',
  status public.equipment_status NOT NULL DEFAULT 'pending',
  quantity text,
  card_origin text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, item_name, card_origin)
);
CREATE INDEX idx_equipment_db_festival_id ON public.equipment_db(festival_id);

-- 3. cost_table ----------------------------------------------
CREATE TABLE public.cost_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(12,2),
  currency text NOT NULL DEFAULT 'DKK',
  card_origin text,
  invoice_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cost_table_festival_id ON public.cost_table(festival_id);

-- 4. tasks_deadlines -----------------------------------------
CREATE TABLE public.tasks_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES public.festivals(id) ON DELETE CASCADE,
  task text NOT NULL,
  deadline date,
  priority public.task_priority NOT NULL DEFAULT 'normal',
  status public.task_status NOT NULL DEFAULT 'pending',
  card_origin text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_deadlines_festival_id ON public.tasks_deadlines(festival_id);

-- 5. suppliers_db --------------------------------------------
CREATE TABLE public.suppliers_db (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  product_categories text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at triggers ----------------------------------------
CREATE TRIGGER trg_personal_festival_db_updated
  BEFORE UPDATE ON public.personal_festival_db
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_equipment_db_updated
  BEFORE UPDATE ON public.equipment_db
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_cost_table_updated
  BEFORE UPDATE ON public.cost_table
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tasks_deadlines_updated
  BEFORE UPDATE ON public.tasks_deadlines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_suppliers_db_updated
  BEFORE UPDATE ON public.suppliers_db
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS --------------------------------------------------------
ALTER TABLE public.personal_festival_db ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_db ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers_db ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON public.personal_festival_db
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_full_access" ON public.equipment_db
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_full_access" ON public.cost_table
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_full_access" ON public.tasks_deadlines
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_full_access" ON public.suppliers_db
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));