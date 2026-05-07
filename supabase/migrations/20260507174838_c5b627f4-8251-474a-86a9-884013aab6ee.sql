BEGIN;

ALTER TABLE festivals
    ADD COLUMN IF NOT EXISTS organiser_name TEXT,
    ADD COLUMN IF NOT EXISTS organiser_cvr TEXT,
    ADD COLUMN IF NOT EXISTS organiser_address TEXT,
    ADD COLUMN IF NOT EXISTS contact_contract_name TEXT,
    ADD COLUMN IF NOT EXISTS contact_contract_phone TEXT,
    ADD COLUMN IF NOT EXISTS contact_contract_email TEXT,
    ADD COLUMN IF NOT EXISTS contact_operations_name TEXT,
    ADD COLUMN IF NOT EXISTS contact_operations_phone TEXT,
    ADD COLUMN IF NOT EXISTS contact_operations_email TEXT;

CREATE TABLE IF NOT EXISTS festival_contracts (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id                     UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id                      UUID NOT NULL REFERENCES concepts(id),
    contracting_entity              TEXT NOT NULL,
    contracting_entity_cvr          TEXT,
    counterparty                    TEXT NOT NULL,
    counterparty_cvr                TEXT,
    counterparty_name_in_contract   TEXT,
    tent_provided_by                TEXT DEFAULT 'festival-organiser',
    tent_size                       TEXT,
    tent_floor                      TEXT,
    tent_shared_with_concept_id     UUID REFERENCES concepts(id),
    tent_cost_handling              TEXT,
    power_in_contract               TEXT,
    extra_power_unit_cost_dkk       NUMERIC,
    fixed_fee_dkk                   NUMERIC,
    fixed_fee_includes_vat          BOOLEAN DEFAULT false,
    revenue_share_tier_1_max_dkk    NUMERIC,
    revenue_share_tier_1_pct        NUMERIC,
    revenue_share_tier_2_max_dkk    NUMERIC,
    revenue_share_tier_2_pct        NUMERIC,
    revenue_share_tier_3_pct        NUMERIC,
    drinks_revenue_share_pct        NUMERIC,
    pos_terminal_extra_cost_dkk     NUMERIC,
    pos_provider                    TEXT,
    payment_method_cashless         BOOLEAN DEFAULT false,
    settlement_terms                TEXT,
    max_wristbands_total            INT,
    max_partout_black               INT,
    max_partout_normal              INT,
    min_work_hours_for_partout      INT DEFAULT 25,
    operating_hours_summary         TEXT,
    caravan_allowed                 BOOLEAN DEFAULT true,
    caravan_max_count               INT DEFAULT 1,
    caravan_camp                    TEXT,
    caravan_booking_deadline        DATE,
    vehicle_permits                 INT DEFAULT 1,
    vehicle_delivery_cutoff_time    TIME,
    inspection_date                 DATE,
    inspection_time                 TIME,
    inspection_self_paid_if_late    BOOLEAN DEFAULT true,
    site_clearance_deadline         TIMESTAMPTZ,
    cleanup_radius_m                INT DEFAULT 10,
    br18_facade_compliance_required BOOLEAN DEFAULT false,
    vegetarian_required             BOOLEAN DEFAULT true,
    gluten_free_required            BOOLEAN DEFAULT true,
    lactose_free_required           BOOLEAN DEFAULT true,
    allowed_beverages               TEXT,
    contract_doc_url                TEXT,
    contract_signed_date            DATE,
    contract_year                   INT,
    notes                           TEXT,
    created_at                      TIMESTAMPTZ DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(festival_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_festival_contracts_festival ON festival_contracts(festival_id);
CREATE INDEX IF NOT EXISTS idx_festival_contracts_concept ON festival_contracts(concept_id);
ALTER TABLE festival_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all_access" ON festival_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS festival_power (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id         UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id          UUID NOT NULL REFERENCES concepts(id),
    power_unit          TEXT NOT NULL,
    quantity            INT NOT NULL,
    purpose             TEXT,
    estimated_kw        NUMERIC,
    estimated_amps      NUMERIC,
    source              TEXT NOT NULL CHECK (source IN ('contract', 'email-update', 'verbal', 'on-site-change')),
    source_date         DATE,
    source_reference    TEXT,
    is_current          BOOLEAN DEFAULT true,
    extra_cost_dkk      NUMERIC DEFAULT 0,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_festival_power_festival ON festival_power(festival_id);
CREATE INDEX IF NOT EXISTS idx_festival_power_concept ON festival_power(concept_id);
CREATE INDEX IF NOT EXISTS idx_festival_power_current ON festival_power(festival_id, is_current);
ALTER TABLE festival_power ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all_access" ON festival_power FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS festival_setup (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id             UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id              UUID REFERENCES concepts(id),
    work_type               TEXT NOT NULL CHECK (work_type IN ('setup', 'facade-build', 'wrap-decoration', 'takedown', 'other')),
    description             TEXT NOT NULL,
    contractor_supplier_id  UUID REFERENCES suppliers(id),
    scheduled_start_at      TIMESTAMPTZ,
    scheduled_end_at        TIMESTAMPTZ,
    actual_start_at         TIMESTAMPTZ,
    actual_end_at           TIMESTAMPTZ,
    crew_size               INT,
    crew_lead               TEXT,
    estimated_cost_dkk      NUMERIC,
    actual_cost_dkk         NUMERIC,
    invoice_received        BOOLEAN DEFAULT false,
    invoice_paid            BOOLEAN DEFAULT false,
    status                  TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'confirmed', 'in-progress', 'completed', 'cancelled')),
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_festival_setup_festival ON festival_setup(festival_id);
ALTER TABLE festival_setup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all_access" ON festival_setup FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS festival_transport (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id         UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    vehicle_type        TEXT NOT NULL,
    vehicle_purpose     TEXT,
    rental_supplier     TEXT,
    rental_supplier_id  UUID REFERENCES suppliers(id),
    pickup_date         DATE,
    pickup_time         TIME,
    pickup_location     TEXT,
    return_date         DATE,
    return_time         TIME,
    return_location     TEXT,
    estimated_cost_dkk  NUMERIC,
    actual_cost_dkk     NUMERIC,
    booking_reference   TEXT,
    status              TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'booked', 'picked-up', 'returned', 'cancelled')),
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_festival_transport_festival ON festival_transport(festival_id);
ALTER TABLE festival_transport ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all_access" ON festival_transport FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO suppliers (slug, name, category, country, invoiced_to, notes)
VALUES ('fidibus', 'Fidibus', 'setup-contractor', 'DK', 'The Fish Project ApS',
    'Labor rental contractor for festival setup + wrap. Provides crew for façade build, internal structure assembly, decoration/wrap, and takedown. Works INSIDE festival-provided tents — does NOT supply tents themselves. Invoices The Fish Project ApS (CVR 39236931). Crew typically includes Costel (food authority lead/setup), Marko, Anca (setup crew).')
ON CONFLICT (slug) DO NOTHING;

UPDATE festivals SET
    organiser_name = 'Festivalfonden af 2006',
    organiser_cvr = '29413770',
    organiser_address = 'Møllegade 10, 1. sal, 7300 Jelling',
    contact_contract_name = 'Bettina Küsch',
    contact_contract_phone = '+45 7587 2888',
    contact_contract_email = 'bettina@jellingmusikfestival.dk',
    contact_operations_name = 'Jonas Kring',
    contact_operations_phone = '+45 2296 9161',
    contact_operations_email = 'jonas@skevents.dk'
WHERE slug = 'jelling-2026';

INSERT INTO festival_contracts (
    festival_id, concept_id, contracting_entity, contracting_entity_cvr, counterparty, counterparty_cvr, counterparty_name_in_contract,
    tent_provided_by, tent_size, tent_floor, tent_shared_with_concept_id, tent_cost_handling,
    power_in_contract, extra_power_unit_cost_dkk, fixed_fee_dkk, fixed_fee_includes_vat,
    revenue_share_tier_1_max_dkk, revenue_share_tier_1_pct, revenue_share_tier_2_max_dkk, revenue_share_tier_2_pct,
    revenue_share_tier_3_pct, drinks_revenue_share_pct, pos_terminal_extra_cost_dkk, pos_provider, payment_method_cashless, settlement_terms,
    max_wristbands_total, max_partout_black, max_partout_normal, operating_hours_summary,
    caravan_allowed, caravan_camp, caravan_booking_deadline, vehicle_permits, vehicle_delivery_cutoff_time,
    inspection_date, inspection_time, site_clearance_deadline, cleanup_radius_m, br18_facade_compliance_required,
    allowed_beverages, contract_year, notes
)
SELECT f.id, c.id, 'The Fish Project ApS', '39236931', 'Festivalfonden af 2006', '29413770', 'The Fish Project (FP)',
    'festival-organiser', '12 façade × 9m deep', 'plastic floor included',
    (SELECT id FROM concepts WHERE slug = 'gyropolis-gyros'), 'FF deducts tent cost from final settlement',
    '7 × 16 Amp (original contract — superseded by 2026-05-07 email update; see festival_power)', 1000,
    3000, false, 160000, 15, 200000, 17, 20, 30, 1500, 'EventPos', true,
    'FF transfers full revenue minus festival fee within 2 weeks of festival end',
    10, 6, 4, 'Bod open during festival site opening hours',
    true, 'mellemledercamp', '2026-04-15', 1, '10:00',
    '2026-05-20', '09:00', '2026-05-25 07:00:00+02', 10, true,
    'Egekilde water (Royal) only — no other branded water', 2026,
    'Concept: Fresh Fish & Chips + fish burger. Min 1 vegetarian + gluten-free + lactose-free option. Shares 12×9m tent with Gyros By Gaia. INSIDE festival location.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'fish-and-chips'
ON CONFLICT (festival_id, concept_id) DO NOTHING;

INSERT INTO festival_contracts (
    festival_id, concept_id, contracting_entity, contracting_entity_cvr, counterparty, counterparty_cvr, counterparty_name_in_contract,
    tent_provided_by, tent_size, tent_floor, tent_shared_with_concept_id, tent_cost_handling,
    power_in_contract, extra_power_unit_cost_dkk, fixed_fee_dkk, fixed_fee_includes_vat,
    revenue_share_tier_1_max_dkk, revenue_share_tier_1_pct, revenue_share_tier_2_max_dkk, revenue_share_tier_2_pct,
    revenue_share_tier_3_pct, drinks_revenue_share_pct, pos_terminal_extra_cost_dkk, pos_provider, payment_method_cashless, settlement_terms,
    max_wristbands_total, max_partout_black, max_partout_normal, operating_hours_summary,
    caravan_allowed, caravan_camp, caravan_booking_deadline, vehicle_permits, vehicle_delivery_cutoff_time,
    inspection_date, inspection_time, site_clearance_deadline, cleanup_radius_m, br18_facade_compliance_required,
    allowed_beverages, contract_year, notes
)
SELECT f.id, c.id, 'The Fish Project ApS', '39236931', 'Festivalfonden af 2006', '29413770', 'The Fish Project ApS / Gyros By Gaia (GBG)',
    'festival-organiser', '12 façade × 9m deep', 'plastic floor included',
    (SELECT id FROM concepts WHERE slug = 'fish-and-chips'), 'FF deducts tent cost from final settlement',
    '2 × 32 Amp + 5 × 16 Amp (original contract — superseded by 2026-05-07 email; see festival_power)', 1000,
    3000, false, 160000, 15, 200000, 17, 20, 30, 1500, 'EventPos', true,
    'FF transfers full revenue minus festival fee within 2 weeks of festival end',
    10, 6, 4, 'Bod open during festival site opening hours',
    true, 'mellemledercamp', '2026-04-15', 1, '10:00',
    '2026-05-20', '09:00', '2026-05-25 07:00:00+02', 10, true,
    'Egekilde water (Royal) only — no other branded water', 2026,
    'Concept: Chicken Gyros with fries. Brand variants: "Gyros By Gaia" (contract name), "Gyropolis" (current marketing), "Gyros" — all same concept. Min 1 vegetarian + gluten-free + lactose-free option. Shares 12×9m tent with Fish Project. INSIDE festival location.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'gyropolis-gyros'
ON CONFLICT (festival_id, concept_id) DO NOTHING;

INSERT INTO festival_contracts (
    festival_id, concept_id, contracting_entity, contracting_entity_cvr, counterparty, counterparty_cvr, counterparty_name_in_contract,
    tent_provided_by, tent_size, tent_floor, tent_shared_with_concept_id, tent_cost_handling,
    power_in_contract, extra_power_unit_cost_dkk, fixed_fee_dkk, fixed_fee_includes_vat,
    revenue_share_tier_1_max_dkk, revenue_share_tier_1_pct, revenue_share_tier_2_max_dkk, revenue_share_tier_2_pct,
    revenue_share_tier_3_pct, drinks_revenue_share_pct, pos_terminal_extra_cost_dkk, pos_provider, payment_method_cashless, settlement_terms,
    max_wristbands_total, max_partout_black, max_partout_normal, operating_hours_summary,
    caravan_allowed, caravan_camp, caravan_booking_deadline, vehicle_permits, vehicle_delivery_cutoff_time,
    inspection_date, inspection_time, site_clearance_deadline, cleanup_radius_m, br18_facade_compliance_required,
    allowed_beverages, contract_year, notes
)
SELECT f.id, c.id, 'The Fish Project ApS', '39236931', 'Festivalfonden af 2006', '29413770', 'The Fish Project ApS / Chicks & Buns (CB)',
    'festival-organiser', '12 façade × 6m deep', 'plastic floor included',
    (SELECT id FROM concepts WHERE slug = 'la-creperie'), 'FF deducts tent cost from final settlement',
    '8 × 16/3A 3-phase (original contract — superseded by 2026-05-07 email; see festival_power)', 1000,
    3000, false, 160000, 15, 200000, 17, 20, 30, 1500, 'EventPos', true,
    'FF transfers full revenue minus festival fee within 2 weeks of festival end',
    12, 4, 8, 'Day 1 (Thursday): 12:00–03:00. Days 2-4 (Fri-Sun): 07:00–03:00',
    true, 'mellemledercamp', '2026-04-15', 1, '10:00',
    '2026-05-20', '09:00', '2026-05-25 07:00:00+02', 10, true,
    'Egekilde water (Royal) only — no other branded water', 2026,
    'Concept: Quality fried chicken — chicken-box, chicken burger, chicken bowls + gourmet jumbo fries. Min 1 vegetarian + gluten-free + lactose-free option. Shares 12×6m tent with La Creperie. CAMPING/Markedspladsen location.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'chicks-n-buns'
ON CONFLICT (festival_id, concept_id) DO NOTHING;

INSERT INTO festival_contracts (
    festival_id, concept_id, contracting_entity, contracting_entity_cvr, counterparty, counterparty_cvr, counterparty_name_in_contract,
    tent_provided_by, tent_size, tent_floor, tent_shared_with_concept_id, tent_cost_handling,
    power_in_contract, extra_power_unit_cost_dkk, fixed_fee_dkk, fixed_fee_includes_vat,
    revenue_share_tier_1_max_dkk, revenue_share_tier_1_pct, revenue_share_tier_2_max_dkk, revenue_share_tier_2_pct,
    revenue_share_tier_3_pct, drinks_revenue_share_pct, pos_terminal_extra_cost_dkk, pos_provider, payment_method_cashless, settlement_terms,
    max_wristbands_total, max_partout_black, max_partout_normal, operating_hours_summary,
    caravan_allowed, caravan_camp, caravan_booking_deadline, vehicle_permits, vehicle_delivery_cutoff_time,
    inspection_date, inspection_time, site_clearance_deadline, cleanup_radius_m, br18_facade_compliance_required,
    allowed_beverages, contract_year, notes
)
SELECT f.id, c.id, 'The Fish Project ApS', '39236931', 'Festivalfonden af 2006', '29413770', 'The Fish Project ApS / La Creperie (LC)',
    'festival-organiser', '12 façade × 6m deep', 'plastic floor included',
    (SELECT id FROM concepts WHERE slug = 'chicks-n-buns'), 'FF deducts tent cost from final settlement',
    '7 × 230V (original contract — superseded by 2026-05-07 email; see festival_power)', 1000,
    3000, false, 160000, 15, 200000, 17, 20, 30, 1500, 'EventPos', true,
    'FF transfers full revenue minus festival fee within 2 weeks of festival end',
    12, 4, 8, 'Day 1 (Thursday): 12:00–03:00. Days 2-4 (Fri-Sun): 07:00–03:00',
    true, 'mellemledercamp', '2026-04-15', 1, '10:00',
    '2026-05-20', '09:00', '2026-05-25 07:00:00+02', 10, true,
    'Egekilde water (Royal) only — no other branded water', 2026,
    'Concept: Pancakes — savory, sweet, breakfast pancakes with egg & bacon. Min 1 vegetarian + gluten-free + lactose-free option. Shares 12×6m tent with Chicks & Buns. CAMPING/Markedspladsen location.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'la-creperie'
ON CONFLICT (festival_id, concept_id) DO NOTHING;

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '16A', 7, 'contract', '2026-01-01', 'Samarbejdsaftale 2026 — The Fish Project', false,
    'Original contract allocation. Superseded by 2026-05-07 email update to Jonas Kring.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'fish-and-chips';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '32A', 2, 'contract', '2026-01-01', 'Samarbejdsaftale 2026 — Gyros By Gaia', false,
    'Original contract allocation (32A part). Superseded by 2026-05-07 email update.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'gyropolis-gyros';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '16A', 5, 'contract', '2026-01-01', 'Samarbejdsaftale 2026 — Gyros By Gaia', false,
    'Original contract allocation (16A part). Superseded by 2026-05-07 email update.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'gyropolis-gyros';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '16A/3-phase', 8, 'contract', '2026-01-01', 'Samarbejdsaftale 2026 — Chicks & Buns', false,
    'Original contract allocation. Superseded by 2026-05-07 email update.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'chicks-n-buns';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '230V', 7, 'contract', '2026-01-01', 'Samarbejdsaftale 2026 — La Creperie', false,
    'Original contract allocation. Superseded by 2026-05-07 email update.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'la-creperie';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '32A', 2, 'main equipment (fryers etc.)', 'email-update', '2026-05-07', 'Email to Jonas Kring 2026-05-07', true,
    'Updated allocation per latest electricity review. Email to Jonas dated 2026-05-07.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'fish-and-chips';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '16A/3-phase', 4, 'main equipment', 'email-update', '2026-05-07', 'Email to Jonas Kring 2026-05-07', true,
    'Updated allocation per latest electricity review.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'fish-and-chips';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '32A', 1, 'fridge container', 'email-update', '2026-05-07', 'Email to Jonas Kring 2026-05-07', true,
    'Dedicated power for Godik fridge container.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'fish-and-chips';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '32A', 1, 'main equipment', 'email-update', '2026-05-07', 'Email to Jonas Kring 2026-05-07 — listed as "Gaia"', true,
    'Updated allocation. Email lists this concept as "Gaia" — same as Gyros By Gaia / Gyropolis.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'gyropolis-gyros';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '16A/3-phase', 4, 'main equipment', 'email-update', '2026-05-07', 'Email to Jonas Kring 2026-05-07 — listed as "Gaia"', true,
    'Updated allocation.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'gyropolis-gyros';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '16A/3-phase', 6, 'main equipment', 'email-update', '2026-05-07', 'Email to Jonas Kring 2026-05-07', true,
    'Updated allocation per latest electricity review.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'chicks-n-buns';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, estimated_kw, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '230V/2kW', 12, 'pancake plates + ancillary', 24, 'email-update', '2026-05-07', 'Email to Jonas Kring 2026-05-07', true,
    'Updated allocation per latest electricity review. 12 × 2kW = 24 kW total estimated.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'la-creperie';

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, source, source_date, source_reference, is_current, notes)
SELECT f.id, c.id, '32A', 1, 'fridge container', 'email-update', '2026-05-07', 'Email to Jonas Kring 2026-05-07', true,
    'Dedicated power for fridge container.'
FROM festivals f, concepts c WHERE f.slug = 'jelling-2026' AND c.slug = 'la-creperie';

INSERT INTO festival_action_items (festival_id, title, description, category, owner, due_date, status, priority)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'), a.title, a.description, a.category, a.owner, a.due_date, a.status, a.priority
FROM (VALUES
    ('VERIFY: caravan booked for sort-armbånd leaders (Jelling)',
     'Contract deadline 15 April for booking 1× campingvogn place per concept on mellemledercamp (only for sort-armbånd leaders). Deadline passed — confirm whether bookings were made for FP, GBG, CB, LC. If not booked, contact Jonas Kring immediately.',
     'logistics', 'Alexandra', DATE '2026-05-08', 'open', 'high'),
    ('VERIFY: extra POS terminals ordered (Jelling)',
     'Contract deadline 15 April for ordering extra POS terminals at 1500 DKK + moms each. EventPos recommendation is 1 terminal per 3 façade meters. Each tent is 12 façade meters → 4 terminals recommended per tent, 8 total. Deadline passed — verify count and confirm with Jonas Kring.',
     'pos', 'Alexandra', DATE '2026-05-08', 'open', 'high'),
    ('VERIFY: menu + prices set up in EventPos (Jelling)',
     'Contract deadline 15 April for online setup of variants + prices per sales unit in POS terminals. Deadline passed — verify all 4 concepts have menu + prices entered. If not, do it ASAP before festival.',
     'pos', 'Alexandra', DATE '2026-05-08', 'open', 'critical'),
    ('VERIFY: gas consumption declared to FF (Jelling)',
     'Contract deadline 15 March for declaring expected gas consumption (kg) including buffer/storage at booth. Deadline passed — verify declaration was made for all 4 concepts. Check with Jonas Kring.',
     'compliance', 'Alexandra', DATE '2026-05-10', 'open', 'high'),
    ('VERIFY: rear-area equipment placement drawing submitted (Jelling)',
     'Contract deadline 15 March for submitting drawing of equipment placement in 3m rear area. Deadline passed — verify submission for all 4 concepts.',
     'planning', 'Alexandra', DATE '2026-05-10', 'open', 'normal'),
    ('VERIFY: power needs declaration submitted (Jelling)',
     'Contract had two power-needs deadlines: 18 January (initial) and 15 March (final). Latest update was email to Jonas dated 2026-05-07 with updated requirements. Verify FF has confirmed the new allocation.',
     'compliance', 'Alexandra', DATE '2026-05-10', 'open', 'high'),
    ('Receive BR18 façade compliance bilag from FF (Jelling)',
     'Contracts mention "nyt tiltag for facader 2026, bilag følger" — BR18 façade compliance is a NEW 2026 requirement. The supporting document (bilag) is yet to be sent by Festivalfonden. Once received, ensure all 4 façades comply before 20 May inspection.',
     'compliance', 'Alexandra', DATE '2026-05-15', 'open', 'critical'),
    ('VERIFY: brandmateriel ready per concept (Jelling)',
     'Each concept must bring own correct fire equipment matching booth activities. Already loaded in DB (4 F-class extinguishers + 4 blankets + 4 first-aid kits). Confirm everything is packed in trolleys before transport day.',
     'safety', 'Costel', DATE '2026-05-18', 'open', 'high')
) AS a(title, description, category, owner, due_date, status, priority)
ON CONFLICT DO NOTHING;

COMMIT;