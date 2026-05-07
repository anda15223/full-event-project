BEGIN;

CREATE TABLE IF NOT EXISTS festival_accommodation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    venue_name TEXT NOT NULL,
    venue_address TEXT,
    venue_url TEXT,
    booking_reference TEXT,
    room_count INT,
    bed_count INT,
    person_count INT,
    bed_nights INT,
    check_in_date DATE,
    check_out_date DATE,
    nights INT,
    group_label TEXT,
    estimated_cost_dkk NUMERIC,
    actual_cost_dkk NUMERIC,
    status TEXT DEFAULT 'planned' CHECK (status IN ('planned','booked','confirmed','cancelled','gap')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_festival_accommodation_festival ON festival_accommodation(festival_id);
ALTER TABLE festival_accommodation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all_access" ON festival_accommodation FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS festival_daka (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id UUID REFERENCES concepts(id),
    container_label TEXT NOT NULL,
    quantity INT DEFAULT 1,
    pickup_arrangement TEXT,
    pickup_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_festival_daka_festival ON festival_daka(festival_id);
ALTER TABLE festival_daka ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all_access" ON festival_daka FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS festival_facade_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
    concept_id UUID NOT NULL REFERENCES concepts(id),
    design_status TEXT NOT NULL CHECK (design_status IN ('not-started','in-progress','designed','printed','ready','installed')),
    design_deadline DATE,
    print_deadline DATE,
    has_aluminium_frame BOOLEAN DEFAULT true,
    has_printed_panels BOOLEAN DEFAULT true,
    has_logo BOOLEAN DEFAULT true,
    has_menu BOOLEAN DEFAULT true,
    has_flag BOOLEAN DEFAULT true,
    has_menu_lights BOOLEAN DEFAULT true,
    br18_compliance_status TEXT DEFAULT 'pending' CHECK (br18_compliance_status IN ('pending','in-progress','compliant','non-compliant')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(festival_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_festival_facade_status_festival ON festival_facade_status(festival_id);
ALTER TABLE festival_facade_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all_access" ON festival_facade_status FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO festival_setup (festival_id, concept_id, work_type, description, contractor_supplier_id, scheduled_start_at, scheduled_end_at, crew_size, crew_lead, status, notes)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, x.work_type, x.description, x.supplier_id, x.start_t, x.end_t, x.crew, x.lead, 'planned', x.notes
FROM (VALUES
    ('setup','18 May early morning: Depart Søborg with 3× Europcar lift vehicles + 1× Iveco + BMW. 5 setup crew each drives 1 vehicle (Fif→BMW, Marius→lift#1, Costel→lift#2, Marko→lift#3, Anca→Iveco)', NULL::uuid, TIMESTAMPTZ '2026-05-18 06:00:00+02', TIMESTAMPTZ '2026-05-18 09:00:00+02', 5, 'Alexandra Artimon', 'Departure from Søborg warehouse. All equipment, façade, BC trolleys, tables, dry goods loaded.'),
    ('setup','18 May arrival in Jelling: Split convoy — 1 vehicle to Fish+Gyros INSIDE stage location, 1 to Creperie+Chicks CAMPING, 1 extra vehicle distributes', NULL::uuid, TIMESTAMPTZ '2026-05-18 09:00:00+02', TIMESTAMPTZ '2026-05-18 12:00:00+02', 5, 'Alexandra Artimon', 'On-site arrival. Begin unload at both tent locations.'),
    ('facade-build','18 May daytime: Fidibus tent setup — 2× 6×9m INSIDE + 2× 6×6m CAMPING (joined as 12×9m + 12×6m via gutter), plastic floor, façade install, truss anchoring per Jonas↔Fidibus BR18 plan, ground-hole stakes', (SELECT id FROM suppliers WHERE slug='fidibus'), TIMESTAMPTZ '2026-05-18 09:00:00+02', TIMESTAMPTZ '2026-05-18 18:00:00+02', NULL::int, 'Fidibus crew', 'Fidibus handles tent setup, façade install, truss anchoring. TFP not involved in tent build itself.'),
    ('setup','18 May daytime: TFP setup crew unloads BC trolleys, places cooking equipment, tables and countertops per floor plans, connects lights (arbejds-, deko-, udendørs-belysning), tests electrical connections', NULL::uuid, TIMESTAMPTZ '2026-05-18 09:00:00+02', TIMESTAMPTZ '2026-05-18 18:00:00+02', 5, 'Costel', 'Equipment placement, lighting setup, electrical test.'),
    ('setup','18 May evening: Setup crew check-in at hotel/hostel (Vejle area). Dinner. Review status vs Tue 19 May goals', NULL::uuid, TIMESTAMPTZ '2026-05-18 19:00:00+02', TIMESTAMPTZ '2026-05-18 22:00:00+02', 5, 'Alexandra Artimon', 'End of day 1 review.')
) AS x(work_type, description, supplier_id, start_t, end_t, crew, lead, notes);

INSERT INTO festival_setup (festival_id, concept_id, work_type, description, contractor_supplier_id, scheduled_start_at, scheduled_end_at, crew_size, crew_lead, status, notes) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '19 May 07:00–18:00: Godik delivers 2× 20ft køle/fryse containers per booking 247741. TFP connects 32A cable, sets temperature (INSIDE = fridge only; CAMPING = TBD with Costel)', (SELECT id FROM suppliers WHERE slug='godik'), TIMESTAMPTZ '2026-05-19 07:00:00+02', TIMESTAMPTZ '2026-05-19 18:00:00+02', 5, 'Marius', 'planned', 'Container placement per map sent to logistik@godik.dk by 5 May.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '19 May daytime: Final placement of cooking equipment. Install 6× DAKA used-oil containers (2 each for Fish + Gyros + Chicks — La Creperie has no oil). Façade final check. Lighting test. Pack eager prep — batter ingredients staged for 21 May morning mix', NULL, TIMESTAMPTZ '2026-05-19 09:00:00+02', TIMESTAMPTZ '2026-05-19 17:00:00+02', 5, 'Costel', 'planned', 'DAKA install + final equipment + prep staging.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '19 May daytime: EventPos kasseterminals delivered and installed by Jelling staff (1 per bod minimum)', NULL, TIMESTAMPTZ '2026-05-19 10:00:00+02', TIMESTAMPTZ '2026-05-19 16:00:00+02', NULL, 'Jelling staff', 'planned', 'Per contract — TFP confirms POS terminals operational.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '19 May evening: Final walk-through of all 4 bods against the Wednesday 20 May 09:00 inspection checklist. Everything connected to el', NULL, TIMESTAMPTZ '2026-05-19 18:00:00+02', TIMESTAMPTZ '2026-05-19 20:00:00+02', 5, 'Alexandra Artimon', 'planned', 'Pre-inspection walkthrough.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '⚠️ HARD DEADLINE: 20 May 09:00 — MYNDIGHEDERNES BRANDEFTERSYN. All 4 bods must be fully set up with electrical connected. If not passed, godkendelse is at TFP own expense. Brand-only inspection (no gas — all-electric setup confirmed).', NULL, TIMESTAMPTZ '2026-05-20 09:00:00+02', TIMESTAMPTZ '2026-05-20 11:00:00+02', NULL, 'Authorities', 'planned', 'CRITICAL HARD DEADLINE. Brand inspection (no gas component since all-electric).'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '20 May before 10:00: All goods delivered in single window — BC Catering, JEKA/Fiskerikajen, Saaby (pita+chicken), Arab Aarhus/Megahouse, Kavsman, Inco, Søborg/Kolkek', NULL, TIMESTAMPTZ '2026-05-20 07:00:00+02', TIMESTAMPTZ '2026-05-20 10:00:00+02', NULL, 'Suppliers', 'planned', 'Per varekørsel rule — vehicles before 10:00, then move to ordinær P-plads.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '20 May mid-morning: TFP receives goods, stores per requirements (cold into Godik, dry per concept, packaging staged)', NULL, TIMESTAMPTZ '2026-05-20 10:00:00+02', TIMESTAMPTZ '2026-05-20 12:00:00+02', 5, 'Costel', 'planned', 'Goods receipt + storage rotation.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '20 May afternoon: Mise en place — cut onions, tomatoes, lemons, cabbage for coleslaw, sauce portions. Allergy signs + E-smiley displayed', NULL, TIMESTAMPTZ '2026-05-20 13:00:00+02', TIMESTAMPTZ '2026-05-20 18:00:00+02', 5, 'Costel', 'planned', 'Per concept prep. Pancake dough mixed fresh on Thu morning per recipe.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '21 May early morning: Main crew (14 people) departs Søborg in 8+1 van + Duster. Arrive Jelling late morning. Check-in Cabin Vejle (4-night stay starts)', NULL, TIMESTAMPTZ '2026-05-21 06:00:00+02', TIMESTAMPTZ '2026-05-21 12:00:00+02', 14, 'Main crew', 'planned', '14 main crew arrive. Setup crew already on-site since 18 May.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '21 May 07:00: CAMPING bods (La Creperie + Chicks) OPEN — breakfast service starts (pancakes w/ æg & bacon, chicken breakfast)', NULL, TIMESTAMPTZ '2026-05-21 07:00:00+02', TIMESTAMPTZ '2026-05-21 12:00:00+02', NULL, NULL, 'planned', 'Camping opens 07:00 per contract.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'setup', '21 May 16:00: INSIDE bods (Fish + Gyros) OPEN — festival pladsens åbningstider start. Service to 02:00', NULL, TIMESTAMPTZ '2026-05-21 16:00:00+02', TIMESTAMPTZ '2026-05-22 02:00:00+02', NULL, NULL, 'planned', 'Festival main grounds opens 16:00 Thursday.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'takedown', '25 May early morning: Full clean-up. Leave area fully rent & opryddet latest 07:00 per contract. Jonas Kring walk-through', NULL, TIMESTAMPTZ '2026-05-25 04:00:00+02', TIMESTAMPTZ '2026-05-25 07:00:00+02', 19, 'Alexandra Artimon', 'planned', 'Cleanup deadline 07:00 per contract.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'takedown', '25 May 07:00–18:00: Godik pickup window for 2× 20ft containers. TFP disconnects 32A cable + CISA locks before pickup', (SELECT id FROM suppliers WHERE slug='godik'), TIMESTAMPTZ '2026-05-25 07:00:00+02', TIMESTAMPTZ '2026-05-25 18:00:00+02', 2, 'Marius', 'planned', 'Godik pickup per booking 247741.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'takedown', '25 May morning: Fidibus full breakdown — tent, façade, truss, equipment. TFP not involved in tent breakdown', (SELECT id FROM suppliers WHERE slug='fidibus'), TIMESTAMPTZ '2026-05-25 07:00:00+02', TIMESTAMPTZ '2026-05-25 14:00:00+02', NULL, 'Fidibus crew', 'planned', 'Fidibus breakdown.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), NULL, 'takedown', '25 May midday: Main crew (14) departs Jelling in 8+1 van + Duster. Setup crew (3) departs after Fidibus handover. Marius drives lift back, Fif drives BMW', NULL, TIMESTAMPTZ '2026-05-25 12:00:00+02', TIMESTAMPTZ '2026-05-25 18:00:00+02', 19, 'Alexandra Artimon', 'planned', 'Departure from Jelling.');

INSERT INTO festival_transport (festival_id, vehicle_type, vehicle_purpose, rental_supplier, pickup_date, return_date, status, notes) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Europcar lift vehicle #1', 'Fish & Chips + Gyros — façade, equipment, BC trolleys, tables, dry goods, packaging', 'Europcar', '2026-05-18', '2026-05-25', 'booked', 'Booked ✓. Driver 18 May: Marius. Drives back home separately on 25 May.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Europcar lift vehicle #2', 'La Creperie + Chicks — façade, equipment, BC trolleys, tables, dry goods', 'Europcar', '2026-05-18', '2026-05-25', 'booked', 'Booked ✓. Driver 18 May: Costel.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Europcar lift vehicle #3 (extra)', 'Extra capacity — needed on top of the 2 already booked', 'Europcar', '2026-05-18', '2026-05-25', 'planned', 'TO BOOK ASAP. Driver 18 May: Marko.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Iveco with lift', 'Food goods — fresh fish, meat, produce, dairy, packaging deliveries (19–20 May supplier deliveries)', 'Iveco rental', '2026-05-18', '2026-05-25', 'booked', 'Booked ✓. Driver 18 May: Anca.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'BMW (Fif own)', '5 seats — personal car, manager travel', 'TFP own', '2026-05-18', '2026-05-25', 'booked', 'Fif own car (status=booked). Drives 18 May with setup crew, drives back separately 25 May (may stay 1 extra night).'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), '8+1 van', 'Main shift workers transport (9 seats incl. driver) — 21 May Jelling arrival, 25 May return', 'Rental TBD', '2026-05-21', '2026-05-25', 'planned', 'TO RENT before 11 May 2026. Carries 9 of 14 main shift workers. Driver TBD.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Duster (TFP existing)', 'Main shift workers transport (5 seats incl. driver)', 'TFP own', '2026-05-21', '2026-05-25', 'booked', 'Existing TFP vehicle (status=booked). Carries 5 of 14 main shift workers. Service + fuel + insurance check before 20 May.');

INSERT INTO festival_accommodation (festival_id, venue_name, venue_url, room_count, bed_count, person_count, bed_nights, check_in_date, check_out_date, nights, group_label, status, notes) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Cabin Vejle', 'https://www.cabinn.com/hotel/cabinn-vejle', 10, 20, 21, 40, '2026-05-21', '2026-05-25', 4, 'All 21 Søborg crew (main + setup)', 'booked', 'BOOKED ✓. 10 doubles × 4 nights = 40 bed-nights. ⚠️ 21 ppl in 20 beds = 1 bed short. Need to add 1 single/double before 11 May.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Hostel/Airbnb TBD (setup crew)', NULL, NULL, NULL, 5, 15, '2026-05-18', '2026-05-21', 3, 'Setup crew (5 ppl) — 18, 19, 20 May', 'gap', 'NOT BOOKED. Need 2-3 doubles in/near Vejle for 18, 19, 20 May = 15 bed-nights. ASAP — Jelling area fills fast.'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Cabin Vejle (extension)', 'https://www.cabinn.com/hotel/cabinn-vejle', NULL, NULL, 2, 2, '2026-05-25', '2026-05-26', 1, 'Managers extra night (Marius + Fif possibly)', 'planned', 'May need 1 extra night Mon 25 May for managers to complete breakdown departure. To add to Cabin booking.');

INSERT INTO festival_daka (festival_id, concept_id, container_label, quantity, pickup_arrangement, notes)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'), c.id, x.label, 1, 'Pickup from Søborg (existing DAKA agreement)', x.notes
FROM concepts c
JOIN (VALUES
    ('fish-and-chips','DAKA #1 - Fish','Sealed, INSIDE tent. Returns to Søborg with equipment, then collected by DAKA from Søborg per existing agreement.'),
    ('fish-and-chips','DAKA #2 - Fish','Backup container.'),
    ('gyropolis-gyros','DAKA #1 - Gyros','Sealed, INSIDE tent. Returns to Søborg, picked up by DAKA per existing agreement.'),
    ('gyropolis-gyros','DAKA #2 - Gyros','Backup container.'),
    ('chicks-n-buns','DAKA #1 - Chicks','Sealed, CAMPING tent. Returns to Søborg, picked up by DAKA per existing agreement.'),
    ('chicks-n-buns','DAKA #2 - Chicks','Backup container.')
) AS x(concept_slug, label, notes) ON c.slug = x.concept_slug;

INSERT INTO festival_facade_status (festival_id, concept_id, design_status, design_deadline, print_deadline, br18_compliance_status, notes)
SELECT (SELECT id FROM festivals WHERE slug='jelling-2026'), c.id, x.design_status, x.design_deadline, x.print_deadline, 'pending', x.notes
FROM concepts c
JOIN (VALUES
    ('fish-and-chips','ready', NULL::date, NULL::date, 'Designed, printed and ready ✓. Stored at Fidibus.'),
    ('gyropolis-gyros','ready', NULL::date, NULL::date, 'Designed, printed and ready ✓. Stored at Fidibus.'),
    ('la-creperie','ready', NULL::date, NULL::date, 'Designed, printed and ready ✓. Stored at Fidibus.'),
    ('chicks-n-buns','in-progress', DATE '2026-04-27', DATE '2026-05-10', 'NEW design in progress. ⚠️ Print deadline was 27 April 2026 — VERIFY status. If not printed, urgent action required.')
) AS x(concept_slug, design_status, design_deadline, print_deadline, notes) ON c.slug = x.concept_slug;

INSERT INTO festival_action_items (festival_id, title, description, category, owner, due_date, status, priority) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Book accommodation 18-20 May for setup crew (5 ppl, 15 bed-nights)', 'Setup crew (Fif, Costel, Marius, Marko, Anca) need rooms 18, 19, 20 May. Need 2-3 doubles in/near Vejle. Hostel or Airbnb. ASAP — Jelling area fills fast.', 'logistics', 'Alexandra', DATE '2026-05-09', 'open', 'critical'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Close 1-bed gap at Cabin Vejle 21-24 May (21 ppl in 20 beds)', 'Cabin Vejle has 10 doubles = 20 beds, but 21 Søborg ppl. Need to add 1 extra bed/room before 11 May.', 'logistics', 'Alexandra', DATE '2026-05-11', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Book 3rd Europcar lift vehicle (extra capacity)', 'Currently have 2 lift vehicles booked — 3rd needed for full equipment + façade + trolleys load. Driver: Marko. Pickup 18 May, return 25 May.', 'logistics', 'Marius', DATE '2026-05-11', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Rent 1× 8+1 van for main crew transport', 'Need 8+1 van for 9 of 14 main shift workers (Duster carries the other 5). Pickup 21 May, return 25 May. Driver TBD.', 'logistics', 'Marius', DATE '2026-05-11', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Verify Chicks ''n'' Buns façade printed by 10 May deadline', 'Chicks façade was "NEW design in progress" with print deadline 27 April. Original deadline already passed. URGENT verify with Fidibus — is it printed and ready? If not, escalate.', 'compliance', 'Alexandra', DATE '2026-05-10', 'open', 'critical'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Verify DAKA Søborg pickup timing post-festival', 'DAKA picks up from Søborg per existing agreement (NOT from Jelling site). 6 sealed containers total: 2× Fish + 2× Gyros + 2× Chicks. La Creperie has no oil (pancakes). Confirm pickup window with DAKA after containers return to Søborg ~25-26 May.', 'compliance', 'Costel', DATE '2026-05-26', 'open', 'normal'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Decide CAMPING container mode (fridge / freezer / split)', 'INSIDE fridge container = fridge only (decided). CAMPING container mode TBD with Costel + team. Decide before 5 May (placement map deadline) — already passed. Confirm now.', 'operations', 'Costel', DATE '2026-05-09', 'open', 'high'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Confirm setup crew driver licences valid', 'All 5 setup crew need valid licences: C-class for Europcar lifts (Marius, Costel, Marko), B for BMW (Fif) + Iveco (Anca). Verify before 15 May.', 'compliance', 'Marius', DATE '2026-05-15', 'open', 'normal'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Confirm loading plan for 3 Europcar lifts + Iveco', 'What goes on which vehicle. Equipment + façade + BC trolleys + tables + dry goods + packaging — split by destination tent. Document before 18 May setup.', 'operations', 'Costel', DATE '2026-05-17', 'open', 'normal'),
((SELECT id FROM festivals WHERE slug='jelling-2026'), 'Confirm Duster ready (service, fuel, insurance) for 21 May main crew', 'TFP Duster carries 5 of 14 main shift workers. Verify operational state before 20 May.', 'logistics', 'Marius', DATE '2026-05-20', 'open', 'normal');

COMMIT;