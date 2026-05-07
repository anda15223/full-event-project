BEGIN;

ALTER TABLE ingredients 
    ADD COLUMN IF NOT EXISTS requires_manual_qty BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS manual_qty_reason TEXT;

COMMENT ON COLUMN ingredients.requires_manual_qty IS 
    'TRUE = quantity cannot be calculated from recipes (oil, vinegar, soda, etc). UI must flag these in RED until manually entered per festival.';
COMMENT ON COLUMN ingredients.manual_qty_reason IS
    'Why this requires manual entry: e.g. "depends on oil change frequency", "drinks vary per festival".';

CREATE TABLE IF NOT EXISTS festival_ingredient_manual (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id     UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
    qty             NUMERIC NOT NULL,
    unit            TEXT NOT NULL,
    notes           TEXT,
    entered_by      TEXT,
    entered_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(festival_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_festival_ingredient_manual_festival ON festival_ingredient_manual(festival_id);

ALTER TABLE festival_ingredient_manual ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_all_access" ON festival_ingredient_manual;
CREATE POLICY "auth_users_all_access" ON festival_ingredient_manual 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO suppliers (slug, name, category, country, notes) VALUES
    ('triple-trading',
     'Triple Trading',
     'packaging',
     'DK',
     'Packaging supplier — Fish serving paper, Fish serving boxes, Gyros wrapping paper. Per-product quantities use 1000-unit boxes.')
ON CONFLICT (slug) DO NOTHING;

DROP VIEW IF EXISTS v_grocery_list_by_supplier;
CREATE VIEW v_grocery_list_by_supplier AS
SELECT
    f.id AS festival_id, f.name AS festival_name,
    s.id AS supplier_id, s.name AS supplier_name,
    i.id AS ingredient_id, i.name AS ingredient_name,
    i.requires_manual_qty,
    'recipe-driven' AS source,
    COALESCE(isup.pack_size, i.pack_size) AS pack_size,
    COALESCE(isup.pack_unit, i.pack_unit) AS pack_unit,
    isup.unit_price_dkk,
    SUM(ri.qty_per_portion * ff.expected_portions) AS total_qty_needed,
    SUM(ff.expected_portions) AS total_portions,
    CASE WHEN isup.unit_price_dkk IS NOT NULL AND COALESCE(isup.pack_size, i.pack_size) > 0
        THEN ROUND((SUM(ri.qty_per_portion * ff.expected_portions) / COALESCE(isup.pack_size, i.pack_size)) * isup.unit_price_dkk, 2)
        ELSE NULL END AS estimated_cost_dkk
FROM festival_forecasts ff
JOIN dishes d ON d.id = ff.dish_id
JOIN recipe_ingredients ri ON ri.dish_id = d.id
JOIN ingredients i ON i.id = ri.ingredient_id
JOIN festivals f ON f.id = ff.festival_id
LEFT JOIN ingredient_suppliers isup ON isup.ingredient_id = i.id AND isup.is_default = true
LEFT JOIN suppliers s ON s.id = COALESCE(isup.supplier_id, i.default_supplier_id)
WHERE i.requires_manual_qty = false
GROUP BY f.id, f.name, s.id, s.name, i.id, i.name, i.requires_manual_qty,
         isup.pack_size, i.pack_size, isup.pack_unit, i.pack_unit, isup.unit_price_dkk
UNION ALL
SELECT
    f.id, f.name, s.id, s.name, i.id, i.name, i.requires_manual_qty,
    'manual',
    COALESCE(isup.pack_size, i.pack_size),
    COALESCE(isup.pack_unit, i.pack_unit),
    isup.unit_price_dkk,
    fim.qty, NULL,
    CASE WHEN isup.unit_price_dkk IS NOT NULL AND COALESCE(isup.pack_size, i.pack_size) > 0
        THEN ROUND((fim.qty / COALESCE(isup.pack_size, i.pack_size)) * isup.unit_price_dkk, 2)
        ELSE NULL END
FROM festival_ingredient_manual fim
JOIN festivals f ON f.id = fim.festival_id
JOIN ingredients i ON i.id = fim.ingredient_id
LEFT JOIN ingredient_suppliers isup ON isup.ingredient_id = i.id AND isup.is_default = true
LEFT JOIN suppliers s ON s.id = COALESCE(isup.supplier_id, i.default_supplier_id)
ORDER BY festival_name, supplier_name, ingredient_name;

CREATE OR REPLACE VIEW v_missing_manual_quantities AS
SELECT
    f.id AS festival_id, f.name AS festival_name,
    i.id AS ingredient_id, i.name AS ingredient_name,
    i.unit AS ingredient_unit,
    i.manual_qty_reason,
    s.name AS suggested_supplier
FROM festivals f
CROSS JOIN ingredients i
LEFT JOIN festival_ingredient_manual fim ON fim.festival_id = f.id AND fim.ingredient_id = i.id
LEFT JOIN ingredient_suppliers isup ON isup.ingredient_id = i.id AND isup.is_default = true
LEFT JOIN suppliers s ON s.id = COALESCE(isup.supplier_id, i.default_supplier_id)
WHERE i.requires_manual_qty = true
  AND i.is_active = true
  AND f.is_active = true
  AND fim.id IS NULL
ORDER BY f.name, i.name;

COMMIT;