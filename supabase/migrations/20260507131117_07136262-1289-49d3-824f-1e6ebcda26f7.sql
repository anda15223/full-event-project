-- BC Trolley load: schema patch + catalog + festival items + action item
ALTER TABLE trolley_items 
    ADD COLUMN IF NOT EXISTS is_consumable BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS default_storage_location_id UUID REFERENCES storage_locations(id);

CREATE OR REPLACE VIEW v_consumables_order_by_supplier AS
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
WHERE ti.is_consumable = true
GROUP BY f.id, f.name, s.id, s.name, ti.id, ti.name, ti.category, ti.unit, ti.pack_size, ti.pack_unit
ORDER BY f.name, s.name, ti.category, ti.name;

CREATE OR REPLACE VIEW v_trolley_pack_list AS
SELECT
    f.id AS festival_id, f.name AS festival_name,
    c.id AS concept_id, c.operational_name AS concept_name,
    fti.trolley_number, ti.category AS item_category, ti.name AS item_name,
    fti.qty, ti.unit, ti.is_consumable,
    CASE WHEN ti.is_consumable THEN 'order from ' || COALESCE(s.name, 'TBD')
         ELSE 'pull from ' || COALESCE(sl.name, 'storage TBD') END AS source
FROM festival_trolley_items fti
JOIN festivals f ON f.id = fti.festival_id
JOIN concepts c ON c.id = fti.concept_id
JOIN trolley_items ti ON ti.id = fti.trolley_item_id
LEFT JOIN suppliers s ON s.id = ti.default_supplier_id
LEFT JOIN storage_locations sl ON sl.id = ti.default_storage_location_id
ORDER BY f.name, c.operational_name, fti.trolley_number, ti.category, ti.name;

WITH soborg AS (SELECT id FROM storage_locations WHERE slug = 'soborg')
INSERT INTO trolley_items (slug, name, category, unit, is_consumable, default_storage_location_id)
SELECT i.slug, i.name, i.category, i.unit, false, soborg.id
FROM soborg
CROSS JOIN (VALUES
    ('knife','Knife','cooking-tool','piece'),
    ('cutting-board','Cutting board','cooking-tool','piece'),
    ('whisker','Whisker','cooking-tool','piece'),
    ('spoon-spatula','Spoon/spatula','cooking-tool','piece'),
    ('tong','Tong','cooking-tool','piece'),
    ('fish-spatula','Fish spatula','cooking-tool','piece'),
    ('pita-spatula','Pita spatula','cooking-tool','piece'),
    ('stainless-steel-spatula','Stainless steel spatula','cooking-tool','piece'),
    ('silicon-spatula-small','Silicon spatula small','cooking-tool','piece'),
    ('wooden-pancake-spreader','Wooden stick pancake spreader','cooking-tool','piece'),
    ('medium-metal-spoon','Medium metal spoon','cooking-tool','piece'),
    ('scissors','Scissors','cooking-tool','piece'),
    ('lemon-cutter','Lemon cutter','cooking-tool','piece'),
    ('razor-blade-griddle','Razor blade griddle','cooking-tool','piece'),
    ('stal-scraper','Stal scraper (spaclu)','cooking-tool','piece'),
    ('mandolin','Mandolin','cooking-tool','piece'),
    ('bowl','Bowl','container','piece'),
    ('small-strainer','Small strainer','container','piece'),
    ('big-strainer','Big strainer','container','piece'),
    ('plastic-box-5l','Plastic box 5L','container','piece'),
    ('plastic-box-10l','Plastic box 10L (with lid)','container','piece'),
    ('plastic-box-16l','Big plastic box 16L','container','piece'),
    ('plastic-round-bottle-1l','Plastic round bottle 1L','container','piece'),
    ('batter-plastic-cup-1l','Batter plastic cup 1L','container','piece'),
    ('alu-gn-1-1-box','Alu GN 1/1 box','container','piece'),
    ('gn-1-1-metal','GN 1/1 metal','container','piece'),
    ('gn-1-1-with-holes','GN 1/1 with holes','container','piece'),
    ('meat-tray','Meat tray','container','piece'),
    ('kanga-box','Kanga box','container','piece'),
    ('vas-bidon-batter','Vas/bidon for mixing batter','container','piece'),
    ('napkin-holder','Napkin holder','serving-tool','piece'),
    ('oil-spray-bottle','Oil spray bottle','cooking-tool','piece'),
    ('oil-bottle-100ml','Oil bottle 100ml','cooking-tool','piece'),
    ('oil-fedtudlager','Oil fedtudlager','cooking-tool','piece'),
    ('blender','Blender','prep-equipment','piece'),
    ('cooking-plate','Cooking plate','prep-equipment','piece'),
    ('pot-10l','Pot 10L','prep-equipment','piece'),
    ('funnel','Funnel','prep-equipment','piece'),
    ('batter-mixer','Batter mixer (with battery)','prep-equipment','piece'),
    ('silicon-mat','Silicon mat','prep-equipment','piece')
) AS i(slug, name, category, unit)
ON CONFLICT (slug) DO NOTHING;

-- FISH & CHIPS
WITH f AS (SELECT id FROM festivals WHERE slug = 'jelling-2026'),
     c AS (SELECT id FROM concepts WHERE slug = 'fish-and-chips')
INSERT INTO festival_trolley_items (festival_id, concept_id, trolley_number, trolley_item_id, qty, notes)
SELECT f.id, c.id, 1, ti.id, x.qty, x.notes
FROM f, c
CROSS JOIN (VALUES
    ('bowl',3,'2 batter + 1 fries'),('whisker',2,NULL),('knife',4,NULL),
    ('cutting-board',3,NULL),('spoon-spatula',5,'Range 4-5, MAX'),
    ('plastic-box-10l',20,'For fish/lemon, with lids'),('plastic-box-16l',15,NULL),
    ('plastic-box-5l',20,NULL),('alu-gn-1-1-box',2,NULL),('tong',2,NULL),
    ('fish-spatula',2,NULL),('scissors',2,'Plan v4 says "2+", review qty'),
    ('small-strainer',1,NULL),('big-strainer',1,NULL),('gn-1-1-metal',3,NULL),
    ('gn-1-1-with-holes',3,NULL),('lemon-cutter',1,NULL),('napkin-holder',2,NULL)
) AS x(item_slug, qty, notes)
JOIN trolley_items ti ON ti.slug = x.item_slug
ON CONFLICT DO NOTHING;

-- GYROS
WITH f AS (SELECT id FROM festivals WHERE slug = 'jelling-2026'),
     c AS (SELECT id FROM concepts WHERE slug = 'gyropolis-gyros')
INSERT INTO festival_trolley_items (festival_id, concept_id, trolley_number, trolley_item_id, qty, notes)
SELECT f.id, c.id, 1, ti.id, x.qty, x.notes
FROM f, c
CROSS JOIN (VALUES
    ('pita-spatula',2,NULL),('oil-spray-bottle',3,NULL),('tong',6,NULL),
    ('razor-blade-griddle',3,NULL),('bowl',3,'2 big for fries + 1 small for veggie'),
    ('kanga-box',2,NULL),('meat-tray',20,NULL),('silicon-mat',1,'For meat tray'),
    ('knife',3,NULL),('scissors',3,NULL),('napkin-holder',2,NULL),
    ('plastic-box-5l',1,'Qty not in plan v4 - placeholder')
) AS x(item_slug, qty, notes)
JOIN trolley_items ti ON ti.slug = x.item_slug
ON CONFLICT DO NOTHING;

-- LA CRÊPERIE
WITH f AS (SELECT id FROM festivals WHERE slug = 'jelling-2026'),
     c AS (SELECT id FROM concepts WHERE slug = 'la-creperie')
INSERT INTO festival_trolley_items (festival_id, concept_id, trolley_number, trolley_item_id, qty, notes)
SELECT f.id, c.id, 1, ti.id, x.qty, x.notes
FROM f, c
CROSS JOIN (VALUES
    ('vas-bidon-batter',15,'Range 10-15, MAX'),('batter-mixer',1,'Qty not specified'),
    ('funnel',1,NULL),('cooking-plate',1,NULL),('pot-10l',1,NULL),('blender',1,NULL),
    ('stainless-steel-spatula',4,NULL),('oil-bottle-100ml',2,NULL),('oil-fedtudlager',3,NULL),
    ('wooden-pancake-spreader',4,NULL),('medium-metal-spoon',4,NULL),
    ('silicon-spatula-small',6,NULL),('cutting-board',1,NULL),('knife',1,NULL),
    ('scissors',2,NULL),('batter-plastic-cup-1l',2,NULL),('mandolin',1,NULL),
    ('plastic-box-5l',10,NULL),('plastic-box-10l',1,'Qty not in plan v4 - placeholder'),
    ('plastic-round-bottle-1l',1,'Qty not in plan v4 - placeholder'),('stal-scraper',2,NULL)
) AS x(item_slug, qty, notes)
JOIN trolley_items ti ON ti.slug = x.item_slug
ON CONFLICT DO NOTHING;

-- Action item for Chicks 'n' Buns
WITH f AS (SELECT id FROM festivals WHERE slug = 'jelling-2026')
INSERT INTO festival_action_items (festival_id, title, description, category, owner, due_date, status, priority)
SELECT f.id,
    'Plan Chicks ''n'' Buns BC Trolley contents',
    'No trolley list exists for Chicks ''n'' Buns yet. Need to define what kitchen tools, containers, and prep equipment go in the trolley. Reference the other 3 concepts as starting point — adapt for chicken-specific prep.',
    'operations','Costel',DATE '2026-05-13','open','high'
FROM f
ON CONFLICT DO NOTHING;