ALTER TABLE festivals 
    ADD COLUMN IF NOT EXISTS pack_date DATE,
    ADD COLUMN IF NOT EXISTS pack_down_date DATE,
    ADD COLUMN IF NOT EXISTS confirmation_status TEXT DEFAULT 'confirmed' 
        CHECK (confirmation_status IN ('confirmed', 'not-confirmed', 'cancelled')),
    ADD COLUMN IF NOT EXISTS tent_size_overall TEXT,
    ADD COLUMN IF NOT EXISTS project_leaders TEXT,
    ADD COLUMN IF NOT EXISTS menu_summary TEXT;

ALTER TABLE festival_cooling
    ADD COLUMN IF NOT EXISTS supplier_booking_number TEXT,
    ADD COLUMN IF NOT EXISTS delivery_time_earliest TIME,
    ADD COLUMN IF NOT EXISTS delivery_time_latest TIME,
    ADD COLUMN IF NOT EXISTS pickup_time_earliest TIME,
    ADD COLUMN IF NOT EXISTS pickup_time_latest TIME,
    ADD COLUMN IF NOT EXISTS power_connection TEXT,
    ADD COLUMN IF NOT EXISTS electrical_cable_length_m NUMERIC,
    ADD COLUMN IF NOT EXISTS lock_count INT,
    ADD COLUMN IF NOT EXISTS contract_amount_excl_vat_dkk NUMERIC,
    ADD COLUMN IF NOT EXISTS contract_amount_incl_vat_dkk NUMERIC,
    ADD COLUMN IF NOT EXISTS contract_notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS festivals_slug_key ON festivals(slug);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_slug_key ON suppliers(slug);

INSERT INTO suppliers (slug, name, category, country, invoiced_to, contact_name, contact_phone, contact_email, notes)
VALUES ('godik','Godik ApS','cooling','DK','Blue Fish ApS','Jakob Muldbjerg','+45 9644 3313','salg@godik.dk',
'Customer 146382. CVR 16725579. 20ft cooling/freezer containers. Insurance fire+theft incl. with DKK 29589 deductible. Payment netto kontant 7 days before delivery. logistik@godik.dk; bogholderi@godik.dk.')
ON CONFLICT (slug) DO NOTHING;

UPDATE festivals SET
    confirmation_status='confirmed',
    project_leaders='Alexandra Artimon, Marius Artimon, Costel, every teamleder',
    menu_summary='Camping: Chicken concept + Pancakes. INSIDE festival: Fish & Chips + Gyros.'
WHERE slug='jelling-2026';

INSERT INTO festivals (slug, name, year, start_date, end_date, address, city, country, confirmation_status, tent_size_overall, project_leaders, menu_summary, notes, is_active) VALUES
    ('heartland-2026','Heartland Festival',2026,'2026-06-18','2026-06-20','Egeskov Slot','Sydfyn','DK','confirmed','1x12x9m or 2x6x9m','Costel, Marius, Alexandra Artimon','Fish & Chips + Gyros','Confirmed.',true),
    ('copenhell-2026','Copenhell',2026,'2026-06-24','2026-06-27',NULL,'Refshaleøen, København','DK','confirmed','1x6x6m','Marius, Alexandra Artimon','Fish & Chips','Confirmed.',true),
    ('tinderbox-2026','Tinderbox Festival',2026,'2026-06-25','2026-06-27',NULL,'Odense','DK','confirmed','1x12x6m','Costel (Alexandra leaves Friday 16:00)','Fish & Chips + Gyros','Confirmed.',true),
    ('cirkus-summarum-kbh-2026','Cirkus Summarum KBH',2026,'2026-06-23','2026-07-16',NULL,'Ballerup','DK','confirmed','Container','Ancha, Alexandra Artimon, Marius','Fish & Chips + Pancakes','Long residency 24 days.',true),
    ('vig-2026','Vig Festival',2026,'2026-07-08','2026-07-11',NULL,'Vig, Holbæk','DK','confirmed',NULL,'Depends on setup','Fish & Chips + Pancakes','Project leaders TBD.',true),
    ('gron-koncert-uge1-2026','GRØN Koncert week 1',2026,'2026-07-16','2026-07-19',NULL,'Tårnby, Kolding, Aarhus, Aalborg','DK','confirmed',NULL,'Alexandra Artimon, Marius, Costel, every teamleder','Fish & Chips + Gyros','TOURING 4 cities.',true),
    ('cirkus-summarum-aarhus-2026','Cirkus Summarum Aarhus',2026,'2026-07-21','2026-08-06','Tangkrogen','Aarhus','DK','confirmed','Container','1 from Gaia, 1 from Fish Bistro','Fish & Chips + Pancakes','Long residency. Pack down 7-9 Aug.',true),
    ('gron-koncert-uge2-2026','GRØN Koncert week 2',2026,'2026-07-23','2026-07-26',NULL,'Esbjerg, Odense, Næstved, Valby','DK','confirmed',NULL,'Alexandra Artimon, Marius, Costel, every teamleder','Fish & Chips + Gyros','TOURING 4 cities.',true),
    ('syd-for-solen-2026','Syd For Solen',2026,'2026-08-13','2026-08-15','Tudsemindevej 39','Valbyparken, København SV','DK','confirmed','1x12x9m or 2x6x9m','Costel, Marco','Fish & Chips + Gyros','Confirmed.',true),
    ('suset-2026','Suset',2026,'2026-08-21','2026-08-22',NULL,'Esbjerg','DK','confirmed',NULL,'Depends on setup','Fish & Chips','Project leaders TBD.',true),
    ('tonder-2026','Tønder Festival',2026,'2026-08-26','2026-08-29',NULL,'Tønder','DK','confirmed','2x6x9m','Costel, Marko','Fish & Chips + Gyros','Confirmed.',true),
    ('aarhus-festuge-2026','Aarhus Festuge',2026,'2026-08-28','2026-09-06',NULL,'Aarhus','DK','confirmed',NULL,NULL,'Fish & Chips + Pancakes + Gyros','Confirmed. 10 days.',true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO festival_concepts (festival_id, concept_id, zone, stall_name)
SELECT f.id, c.id, NULL, NULL FROM festivals f, concepts c
WHERE (f.slug, c.slug) IN (
    ('heartland-2026','fish-and-chips'),('heartland-2026','gyropolis-gyros'),
    ('copenhell-2026','fish-and-chips'),
    ('tinderbox-2026','fish-and-chips'),('tinderbox-2026','gyropolis-gyros'),
    ('cirkus-summarum-kbh-2026','fish-and-chips'),('cirkus-summarum-kbh-2026','la-creperie'),
    ('vig-2026','fish-and-chips'),('vig-2026','la-creperie'),
    ('gron-koncert-uge1-2026','fish-and-chips'),('gron-koncert-uge1-2026','gyropolis-gyros'),
    ('cirkus-summarum-aarhus-2026','fish-and-chips'),('cirkus-summarum-aarhus-2026','la-creperie'),
    ('gron-koncert-uge2-2026','fish-and-chips'),('gron-koncert-uge2-2026','gyropolis-gyros'),
    ('syd-for-solen-2026','fish-and-chips'),('syd-for-solen-2026','gyropolis-gyros'),
    ('suset-2026','fish-and-chips'),
    ('tonder-2026','fish-and-chips'),('tonder-2026','gyropolis-gyros'),
    ('aarhus-festuge-2026','fish-and-chips'),('aarhus-festuge-2026','gyropolis-gyros'),('aarhus-festuge-2026','la-creperie')
);

DELETE FROM festival_cooling WHERE festival_id = (SELECT id FROM festivals WHERE slug='jelling-2026');

INSERT INTO festival_cooling (festival_id, unit_type, supplier_id, supplier_ref, supplier_booking_number, delivery_date, pickup_date, delivery_time_earliest, delivery_time_latest, pickup_time_earliest, pickup_time_latest, cost_dkk, contract_amount_excl_vat_dkk, contract_amount_incl_vat_dkk, payment_due, payment_status, power_connection, electrical_cable_length_m, lock_count, contract_notes, notes)
VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'),'20ft cooling/freezer combo (x2)',(SELECT id FROM suppliers WHERE slug='godik'),'Godik #247741','247741','2026-05-19','2026-05-25','07:00','18:00','07:00','18:00',15732.50,12586.00,15732.50,'2026-05-12','pending','400V/32A CEE',10,2,
'Container 06090 x 2 with 2 lock fittings each. CISA padlock 07620 with 1 key. 20% discount. Insurance, Track&Trace, Env fee 7.5% incl. Lessee handles connection. Map of placement due 14 days before festival.',
'Booking 247741. Sales: Jakob Muldbjerg +45 9644 3313. Container 270x250x615 ext, 225x227x530 int, 10250W max, 2500kg.'),
((SELECT id FROM festivals WHERE slug='heartland-2026'),'20ft cooling/freezer combo',(SELECT id FROM suppliers WHERE slug='godik'),'Godik #247805','247805','2026-06-16','2026-06-21','07:00','18:00','07:00','18:00',9089.06,7271.25,9089.06,'2026-06-09','pending','400V/32A CEE',10,1,
'Container 06090 with 2 lock fittings. CISA padlock 07620. 20% discount. Insurance/T&T/Env fee 7.5% incl.',
'Booking 247805. Egeskov Gade 20, 5772 Kværndrup, gravel road by sign Leveringer.'),
((SELECT id FROM festivals WHERE slug='syd-for-solen-2026'),'20ft cooling/freezer combo',(SELECT id FROM suppliers WHERE slug='godik'),'Godik #247806','247806','2026-08-11','2026-08-16','07:00','18:00','07:00','18:00',6939.06,5551.25,6939.06,'2026-08-04','pending','400V/32A CEE',10,1,
'Container 06090 with 2 lock fittings. CISA padlock 07620. 20% discount. Insurance/T&T/Env fee 7.5% incl.',
'Booking 247806. Tudsemindevej 39, 2450 København SV.');

INSERT INTO festival_deadlines (festival_id, title, description, deadline_at, is_hard, consequence, status) VALUES
((SELECT id FROM festivals WHERE slug='heartland-2026'),'Godik cooling payment','Payment due to Godik for booking #247805. 9089.06 DKK incl moms.',TIMESTAMPTZ '2026-06-09 17:00:00+02',true,'Late: 1.5%/month. May affect delivery.','pending'),
((SELECT id FROM festivals WHERE slug='syd-for-solen-2026'),'Godik cooling payment','Payment due to Godik for booking #247806. 6939.06 DKK incl moms.',TIMESTAMPTZ '2026-08-04 17:00:00+02',true,'Late: 1.5%/month. May affect delivery.','pending'),
((SELECT id FROM festivals WHERE slug='heartland-2026'),'Send placement map to Godik','Map of driving route + container placement due 14 days before festival start.',TIMESTAMPTZ '2026-06-04 17:00:00+02',false,'Default to driver discretion.','pending'),
((SELECT id FROM festivals WHERE slug='syd-for-solen-2026'),'Send placement map to Godik','Map of driving route + container placement due 14 days before festival start.',TIMESTAMPTZ '2026-07-30 17:00:00+02',false,'Default to driver discretion.','pending');

INSERT INTO festival_action_items (festival_id, title, description, category, owner, due_date, status, priority) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'),'URGENT: Send Godik placement map for Jelling','Per Godik contract, map due 14 days before festival. Jelling starts 21 May. Send ASAP to logistik@godik.dk with route + 2 container placements.','logistics','Marius Artimon',DATE '2026-05-08','open','critical');

INSERT INTO festival_action_items (festival_id, title, description, category, owner, due_date, status, priority)
SELECT f.id, a.title, a.description, a.category, a.owner, a.due_date, 'open', a.priority
FROM festivals f
CROSS JOIN (VALUES
    ('Confirm zone assignments per concept','For non-Jelling festivals, festival_concepts has zone=NULL. Specify INSIDE/CAMPING per concept.','planning','Alexandra',DATE '2026-05-31','normal'),
    ('Add organiser contact info','Organiser name/phone/email missing.','planning','Alexandra',DATE '2026-05-31','normal'),
    ('Add festival-specific address','Exact delivery/setup address missing.','logistics','Alexandra',DATE '2026-05-31','normal')
) AS a(title, description, category, owner, due_date, priority)
WHERE f.slug IN ('heartland-2026','copenhell-2026','tinderbox-2026','cirkus-summarum-kbh-2026','vig-2026','gron-koncert-uge1-2026','cirkus-summarum-aarhus-2026','gron-koncert-uge2-2026','syd-for-solen-2026','suset-2026','tonder-2026','aarhus-festuge-2026');

INSERT INTO festival_action_items (festival_id, title, description, category, owner, due_date, status, priority) VALUES
((SELECT id FROM festivals WHERE slug='jelling-2026'),'Track yellow (unconfirmed) festivals: GRIM FEST + Fyrfesten','GRIM FEST (Aarhus, 30 Jul – 1 Aug) and Fyrfesten (Viborg, 29 Aug) yellow in calendar. Confirm or drop.','planning','Alexandra',DATE '2026-06-30','open','normal');