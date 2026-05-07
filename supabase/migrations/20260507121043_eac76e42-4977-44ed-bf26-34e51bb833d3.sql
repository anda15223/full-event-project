CREATE TABLE storage_locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    location_type   TEXT,
    address         TEXT,
    city            TEXT,
    country         TEXT DEFAULT 'DK',
    contact_name    TEXT,
    contact_phone   TEXT,
    contact_email   TEXT,
    delivery_notes  TEXT,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ingredient_suppliers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    is_default      BOOLEAN DEFAULT false,
    supplier_sku    TEXT,
    pack_size       NUMERIC,
    pack_unit       TEXT,
    unit_price_dkk  NUMERIC,
    currency        TEXT DEFAULT 'DKK',
    last_price_update DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ingredient_id, supplier_id)
);

CREATE UNIQUE INDEX idx_ingredient_suppliers_one_default
    ON ingredient_suppliers(ingredient_id)
    WHERE is_default = true;

CREATE TABLE ingredient_storage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    storage_location_id UUID NOT NULL REFERENCES storage_locations(id) ON DELETE CASCADE,
    is_primary      BOOLEAN DEFAULT false,
    current_qty     NUMERIC,
    current_qty_unit TEXT,
    last_stock_check DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ingredient_id, storage_location_id)
);

COMMENT ON COLUMN ingredients.default_supplier_id IS
    'DEPRECATED — use ingredient_suppliers.is_default instead. Will be removed in v1.3.';

DROP VIEW IF EXISTS v_grocery_list_by_supplier;
CREATE VIEW v_grocery_list_by_supplier AS
SELECT
    f.id                AS festival_id,
    f.name              AS festival_name,
    s.id                AS supplier_id,
    s.name              AS supplier_name,
    i.id                AS ingredient_id,
    i.name              AS ingredient_name,
    COALESCE(isup.pack_size, i.pack_size) AS pack_size,
    COALESCE(isup.pack_unit, i.pack_unit) AS pack_unit,
    isup.unit_price_dkk,
    SUM(ri.qty_per_portion * ff.expected_portions) AS total_qty_needed,
    SUM(ff.expected_portions) AS total_portions,
    CASE
        WHEN isup.unit_price_dkk IS NOT NULL AND COALESCE(isup.pack_size, i.pack_size) > 0
        THEN ROUND(
            (SUM(ri.qty_per_portion * ff.expected_portions) / COALESCE(isup.pack_size, i.pack_size))
            * isup.unit_price_dkk,
            2
        )
        ELSE NULL
    END AS estimated_cost_dkk
FROM festival_forecasts ff
JOIN dishes d           ON d.id = ff.dish_id
JOIN recipe_ingredients ri ON ri.dish_id = d.id
JOIN ingredients i      ON i.id = ri.ingredient_id
JOIN festivals f        ON f.id = ff.festival_id
LEFT JOIN ingredient_suppliers isup
    ON isup.ingredient_id = i.id AND isup.is_default = true
LEFT JOIN suppliers s
    ON s.id = COALESCE(isup.supplier_id, i.default_supplier_id)
GROUP BY f.id, f.name, s.id, s.name, i.id, i.name,
         isup.pack_size, i.pack_size, isup.pack_unit, i.pack_unit, isup.unit_price_dkk
ORDER BY f.name, s.name, i.name;

CREATE OR REPLACE VIEW v_ingredient_supplier_options AS
SELECT
    i.id                AS ingredient_id,
    i.name              AS ingredient_name,
    s.id                AS supplier_id,
    s.name              AS supplier_name,
    isup.is_default,
    isup.pack_size,
    isup.pack_unit,
    isup.unit_price_dkk,
    isup.notes
FROM ingredients i
JOIN ingredient_suppliers isup ON isup.ingredient_id = i.id
JOIN suppliers s ON s.id = isup.supplier_id
ORDER BY i.name, isup.is_default DESC, s.name;

CREATE OR REPLACE VIEW v_ingredient_storage_options AS
SELECT
    i.id                AS ingredient_id,
    i.name              AS ingredient_name,
    sl.id               AS storage_id,
    sl.name             AS storage_name,
    isto.is_primary,
    isto.current_qty,
    isto.current_qty_unit,
    isto.last_stock_check,
    isto.notes
FROM ingredients i
JOIN ingredient_storage isto ON isto.ingredient_id = i.id
JOIN storage_locations sl ON sl.id = isto.storage_location_id
ORDER BY i.name, isto.is_primary DESC, sl.name;

CREATE INDEX idx_ingredient_suppliers_ingredient ON ingredient_suppliers(ingredient_id);
CREATE INDEX idx_ingredient_suppliers_supplier ON ingredient_suppliers(supplier_id);
CREATE INDEX idx_ingredient_storage_ingredient ON ingredient_storage(ingredient_id);
CREATE INDEX idx_ingredient_storage_location ON ingredient_storage(storage_location_id);

ALTER TABLE storage_locations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_suppliers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_storage     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users_all_access" ON public.storage_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all_access" ON public.ingredient_suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all_access" ON public.ingredient_storage FOR ALL TO authenticated USING (true) WITH CHECK (true);