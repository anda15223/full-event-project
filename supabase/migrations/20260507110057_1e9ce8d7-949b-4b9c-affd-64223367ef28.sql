-- PATCH 1 — BC TROLLEY: split into catalog + festival-specific
DROP TABLE IF EXISTS bc_trolley_templates CASCADE;

CREATE TABLE trolley_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,
    default_supplier_id UUID REFERENCES suppliers(id),
    unit            TEXT NOT NULL,
    pack_size       NUMERIC,
    pack_unit       TEXT,
    notes           TEXT,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE festival_trolley_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id     UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id      UUID NOT NULL REFERENCES concepts(id),
    trolley_number  INT NOT NULL DEFAULT 1,
    trolley_item_id UUID NOT NULL REFERENCES trolley_items(id),
    qty             NUMERIC NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(festival_id, concept_id, trolley_number, trolley_item_id)
);

DROP TABLE IF EXISTS festival_bc_trolleys CASCADE;

-- PATCH 2 — COOKING EQUIPMENT ownership
ALTER TABLE equipment_catalog
    ADD COLUMN ownership TEXT DEFAULT 'owned'
        CHECK (ownership IN ('owned', 'rented', 'mixed'));
ALTER TABLE equipment_catalog
    ADD COLUMN rental_supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE equipment_catalog
    ADD COLUMN rental_cost_per_festival NUMERIC;

ALTER TABLE festival_equipment
    ADD COLUMN ownership_override TEXT
        CHECK (ownership_override IN ('owned', 'rented'));
ALTER TABLE festival_equipment
    ADD COLUMN rental_supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE festival_equipment
    ADD COLUMN rental_cost_dkk NUMERIC;

-- PATCH 3 — EQUIPMENT TRANSPORTATION
CREATE TABLE festival_equipment_transport (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id     UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    vehicle_name    TEXT NOT NULL,
    vehicle_type    TEXT,
    capacity_notes  TEXT,
    driver_staff_id UUID REFERENCES staff(id),
    departure_warehouse TEXT,
    departure_at    TIMESTAMPTZ,
    arrival_at      TIMESTAMPTZ,
    return_at       TIMESTAMPTZ,
    load_manifest   TEXT,
    status          TEXT DEFAULT 'planned',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE festival_equipment_transport_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transport_id    UUID NOT NULL REFERENCES festival_equipment_transport(id) ON DELETE CASCADE,
    festival_equipment_id UUID NOT NULL REFERENCES festival_equipment(id),
    qty             INT NOT NULL DEFAULT 1,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- PATCH 4 — STAFF TRANSPORT & ACCOMMODATION
CREATE TABLE festival_staff_vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id     UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    vehicle_name    TEXT NOT NULL,
    vehicle_type    TEXT,
    seats_total     INT,
    driver_staff_id UUID REFERENCES staff(id),
    rental_supplier_id UUID REFERENCES suppliers(id),
    rental_cost_dkk NUMERIC,
    pickup_at       TIMESTAMPTZ,
    return_at       TIMESTAMPTZ,
    status          TEXT DEFAULT 'pending',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE festival_staff_vehicle_seats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id      UUID NOT NULL REFERENCES festival_staff_vehicles(id) ON DELETE CASCADE,
    staff_id        UUID NOT NULL REFERENCES staff(id),
    direction       TEXT NOT NULL DEFAULT 'both',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vehicle_id, staff_id, direction)
);

CREATE TABLE festival_accommodations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id     UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    type            TEXT,
    address         TEXT,
    beds_total      INT NOT NULL DEFAULT 1,
    check_in        DATE,
    check_out       DATE,
    cost_dkk        NUMERIC,
    booking_status  TEXT DEFAULT 'pending',
    booking_ref     TEXT,
    supplier_id     UUID REFERENCES suppliers(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE festival_accommodation_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accommodation_id UUID NOT NULL REFERENCES festival_accommodations(id) ON DELETE CASCADE,
    staff_id        UUID NOT NULL REFERENCES staff(id),
    check_in        DATE,
    check_out       DATE,
    nights          INT GENERATED ALWAYS AS ((check_out - check_in)) STORED,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(accommodation_id, staff_id)
);

DROP TABLE IF EXISTS festival_logistics CASCADE;

-- PATCH 5 — REPORTS
CREATE TABLE festival_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id     UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    report_type     TEXT NOT NULL,
    audience        TEXT,
    file_url        TEXT,
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    generated_by    TEXT,
    sent_to_email   TEXT,
    sent_at         TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- PATCH 6 — VIEWS
DROP VIEW IF EXISTS v_grocery_list_by_supplier;
CREATE VIEW v_grocery_list_by_supplier AS
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

CREATE OR REPLACE VIEW v_trolley_order_by_supplier AS
SELECT
    f.id AS festival_id, f.name AS festival_name,
    s.id AS supplier_id, s.name AS supplier_name,
    ti.id AS item_id, ti.name AS item_name, ti.category AS item_category,
    ti.unit, ti.pack_size, ti.pack_unit,
    SUM(fti.qty) AS total_qty_needed
FROM festival_trolley_items fti
JOIN trolley_items ti ON ti.id = fti.trolley_item_id
JOIN festivals f ON f.id = fti.festival_id
LEFT JOIN suppliers s ON s.id = ti.default_supplier_id
GROUP BY f.id, f.name, s.id, s.name, ti.id, ti.name, ti.category, ti.unit, ti.pack_size, ti.pack_unit
ORDER BY f.name, s.name, ti.category, ti.name;

CREATE OR REPLACE VIEW v_cooking_equipment_rentals AS
SELECT
    f.id AS festival_id, f.name AS festival_name,
    c.name AS concept_name,
    ec.name AS equipment_name, fe.qty,
    s.id AS rental_supplier_id, s.name AS rental_supplier_name,
    COALESCE(fe.rental_cost_dkk, ec.rental_cost_per_festival) AS cost_dkk,
    fe.notes
FROM festival_equipment fe
JOIN equipment_catalog ec ON ec.id = fe.equipment_id
LEFT JOIN concepts c ON c.id = fe.concept_id
JOIN festivals f ON f.id = fe.festival_id
LEFT JOIN suppliers s ON s.id = COALESCE(fe.rental_supplier_id, ec.rental_supplier_id)
WHERE COALESCE(fe.ownership_override, ec.ownership) = 'rented'
ORDER BY f.name, s.name, c.name, ec.name;

DROP VIEW IF EXISTS v_festival_kpis;
CREATE VIEW v_festival_kpis AS
SELECT
    f.id AS festival_id, f.name AS festival_name,
    (SELECT COUNT(*) FROM festival_concepts fc WHERE fc.festival_id = f.id) AS concepts_count,
    (SELECT COUNT(DISTINCT staff_id) FROM festival_shifts fs WHERE fs.festival_id = f.id) AS workforce_count,
    (SELECT COALESCE(SUM(hours), 0) FROM festival_shifts fs WHERE fs.festival_id = f.id) AS total_person_hours,
    (SELECT COUNT(*) FROM festival_shifts fs WHERE fs.festival_id = f.id) AS total_shifts,
    (SELECT COUNT(*) FROM festival_action_items fa WHERE fa.festival_id = f.id) AS action_items_total,
    (SELECT COUNT(*) FROM festival_action_items fa WHERE fa.festival_id = f.id AND fa.status != 'done') AS action_items_open,
    (SELECT COUNT(*) FROM festival_action_items fa WHERE fa.festival_id = f.id AND fa.status != 'done' AND fa.due_date < CURRENT_DATE) AS action_items_overdue,
    (SELECT COALESCE(SUM(nights), 0) FROM festival_accommodation_assignments faa
        JOIN festival_accommodations fa ON fa.id = faa.accommodation_id WHERE fa.festival_id = f.id) AS total_bed_nights
FROM festivals f;

-- PATCH 7 — INDEXES + RLS
CREATE INDEX idx_trolley_items_supplier ON trolley_items(default_supplier_id);
CREATE INDEX idx_festival_trolley_festival ON festival_trolley_items(festival_id);
CREATE INDEX idx_festival_trolley_concept ON festival_trolley_items(festival_id, concept_id);
CREATE INDEX idx_festival_equip_transport_festival ON festival_equipment_transport(festival_id);
CREATE INDEX idx_festival_staff_vehicles_festival ON festival_staff_vehicles(festival_id);
CREATE INDEX idx_festival_accommodations_festival ON festival_accommodations(festival_id);
CREATE INDEX idx_festival_reports_festival ON festival_reports(festival_id);

ALTER TABLE trolley_items                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_trolley_items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_equipment_transport           ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_equipment_transport_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_staff_vehicles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_staff_vehicle_seats           ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_accommodations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_accommodation_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_reports                       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN (
            'trolley_items', 'festival_trolley_items',
            'festival_equipment_transport', 'festival_equipment_transport_items',
            'festival_staff_vehicles', 'festival_staff_vehicle_seats',
            'festival_accommodations', 'festival_accommodation_assignments',
            'festival_reports'
        )
    ) LOOP
        EXECUTE format('CREATE POLICY "auth_users_all_access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;