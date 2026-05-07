
-- PART 1 — WIPE public schema EXCEPT auth-critical objects
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('profiles', 'user_roles')
    ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.viewname) || ' CASCADE';
    END LOOP;
END $$;

-- PART 2 — CATALOG TABLES
CREATE TABLE festivals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    year INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    setup_date DATE,
    breakdown_date DATE,
    address TEXT,
    city TEXT,
    country TEXT DEFAULT 'DK',
    organiser_name TEXT,
    organiser_phone TEXT,
    organiser_email TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    short_name TEXT,
    description TEXT,
    color_hex TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    invoiced_to TEXT,
    payment_terms TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT NOT NULL,
    pack_size NUMERIC,
    pack_unit TEXT,
    default_supplier_id UUID REFERENCES suppliers(id),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    sale_price_dkk NUMERIC,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(concept_id, slug)
);

CREATE TABLE recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dish_id UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id),
    qty_per_portion NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dish_id, ingredient_id)
);

CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    short_name TEXT,
    phone TEXT,
    email TEXT,
    origin TEXT,
    role_default TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE equipment_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    default_supplier_id UUID REFERENCES suppliers(id),
    power_type TEXT,
    power_amps NUMERIC,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bc_trolley_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    trolley_number INT NOT NULL,
    category TEXT NOT NULL,
    item_name TEXT NOT NULL,
    qty NUMERIC,
    unit TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(concept_id, trolley_number, category, item_name)
);

-- PART 3 — FESTIVAL-SPECIFIC TABLES
CREATE TABLE festival_concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id UUID NOT NULL REFERENCES concepts(id),
    zone TEXT,
    stall_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(festival_id, concept_id, zone)
);

CREATE TABLE festival_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    dish_id UUID NOT NULL REFERENCES dishes(id),
    day_date DATE NOT NULL,
    expected_portions INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(festival_id, dish_id, day_date)
);

CREATE TABLE festival_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff(id),
    concept_id UUID REFERENCES concepts(id),
    role TEXT,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    hours NUMERIC GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
    ) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE festival_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES equipment_catalog(id),
    concept_id UUID REFERENCES concepts(id),
    zone TEXT,
    qty INT NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE festival_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    owner TEXT,
    due_date DATE,
    status TEXT DEFAULT 'open',
    priority TEXT DEFAULT 'normal',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE festival_deadlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    deadline_at TIMESTAMPTZ NOT NULL,
    is_hard BOOLEAN DEFAULT false,
    consequence TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE festival_facade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id UUID NOT NULL REFERENCES concepts(id),
    status TEXT DEFAULT 'pending',
    print_deadline DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(festival_id, concept_id)
);

CREATE TABLE festival_cooling (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    unit_type TEXT NOT NULL,
    supplier_id UUID REFERENCES suppliers(id),
    supplier_ref TEXT,
    delivery_date DATE,
    pickup_date DATE,
    cost_dkk NUMERIC,
    payment_due DATE,
    payment_status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE festival_logistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    start_date DATE,
    end_date DATE,
    cost_dkk NUMERIC,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE festival_safety (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    item_class TEXT,
    qty INT NOT NULL DEFAULT 1,
    location TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE festival_bc_trolleys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id UUID NOT NULL REFERENCES concepts(id),
    trolley_number INT NOT NULL,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(festival_id, concept_id, trolley_number)
);

-- PART 4 — VIEWS (security_invoker so RLS of base tables applies)
CREATE VIEW v_grocery_list_by_supplier
WITH (security_invoker = true) AS
SELECT
    f.id AS festival_id, f.name AS festival_name,
    s.id AS supplier_id, s.name AS supplier_name,
    i.id AS ingredient_id, i.name AS ingredient_name,
    i.unit AS ingredient_unit, i.pack_size, i.pack_unit,
    SUM(ri.qty_per_portion * ff.expected_portions) AS total_qty_needed,
    SUM(ff.expected_portions) AS total_portions
FROM festival_forecasts ff
JOIN dishes d ON d.id = ff.dish_id
JOIN recipe_ingredients ri ON ri.dish_id = d.id
JOIN ingredients i ON i.id = ri.ingredient_id
JOIN festivals f ON f.id = ff.festival_id
LEFT JOIN suppliers s ON s.id = i.default_supplier_id
GROUP BY f.id, f.name, s.id, s.name, i.id, i.name, i.unit, i.pack_size, i.pack_unit
ORDER BY f.name, s.name, i.name;

CREATE VIEW v_festival_kpis
WITH (security_invoker = true) AS
SELECT
    f.id AS festival_id, f.name AS festival_name,
    (SELECT COUNT(*) FROM festival_concepts fc WHERE fc.festival_id = f.id) AS concepts_count,
    (SELECT COUNT(DISTINCT staff_id) FROM festival_shifts fs WHERE fs.festival_id = f.id) AS workforce_count,
    (SELECT COALESCE(SUM(hours), 0) FROM festival_shifts fs WHERE fs.festival_id = f.id) AS total_person_hours,
    (SELECT COUNT(*) FROM festival_shifts fs WHERE fs.festival_id = f.id) AS total_shifts,
    (SELECT COUNT(*) FROM festival_action_items fa WHERE fa.festival_id = f.id) AS action_items_total,
    (SELECT COUNT(*) FROM festival_action_items fa WHERE fa.festival_id = f.id AND fa.status != 'done') AS action_items_open,
    (SELECT COUNT(*) FROM festival_action_items fa WHERE fa.festival_id = f.id AND fa.status != 'done' AND fa.due_date < CURRENT_DATE) AS action_items_overdue
FROM festivals f;

CREATE VIEW v_festival_next_deadline
WITH (security_invoker = true) AS
SELECT DISTINCT ON (festival_id)
    festival_id, title, deadline_at, is_hard, consequence
FROM festival_deadlines
WHERE status = 'pending' AND deadline_at > NOW()
ORDER BY festival_id, deadline_at ASC;

-- PART 5 — INDEXES
CREATE INDEX idx_festival_concepts_festival ON festival_concepts(festival_id);
CREATE INDEX idx_festival_forecasts_festival ON festival_forecasts(festival_id);
CREATE INDEX idx_festival_shifts_festival ON festival_shifts(festival_id);
CREATE INDEX idx_festival_shifts_date ON festival_shifts(festival_id, shift_date);
CREATE INDEX idx_festival_action_items_festival ON festival_action_items(festival_id);
CREATE INDEX idx_festival_action_items_status ON festival_action_items(festival_id, status);
CREATE INDEX idx_festival_deadlines_festival ON festival_deadlines(festival_id, deadline_at);
CREATE INDEX idx_recipe_ingredients_dish ON recipe_ingredients(dish_id);
CREATE INDEX idx_dishes_concept ON dishes(concept_id);
CREATE INDEX idx_ingredients_supplier ON ingredients(default_supplier_id);

-- PART 6 — RLS
DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('profiles', 'user_roles')
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY "auth_users_all_access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;

-- PART 7 — SEED CONCEPTS
INSERT INTO concepts (slug, name, short_name, color_hex) VALUES
    ('fish-and-chips',  'Fish & Chips',      'Fish',     '#1E40AF'),
    ('gyropolis-gyros', 'Gyropolis Gyros',   'Gyros',    '#B45309'),
    ('la-creperie',     'La Crêperie',       'Crêperie', '#7C3AED'),
    ('chicks-n-buns',   'Chicks ''n'' Buns', 'Chicks',   '#DC2626');

-- Re-attach auth trigger if missing
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
