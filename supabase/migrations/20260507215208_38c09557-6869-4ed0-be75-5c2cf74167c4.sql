BEGIN;

DO $$
DECLARE
  v_gron_w1 uuid;
  v_gron_w2 uuid;
BEGIN
  SELECT id INTO v_gron_w1 FROM festivals WHERE slug = 'gron-koncert-uge1-2026';
  SELECT id INTO v_gron_w2 FROM festivals WHERE slug = 'gron-koncert-uge2-2026';
  IF v_gron_w1 IS NULL OR v_gron_w2 IS NULL THEN
    RAISE EXCEPTION 'Grøn festival rows missing';
  END IF;
END $$;

-- ============================================================================
-- 1. POWER — 8 rows (4 stades × 2 weeks)
-- ============================================================================

-- Week 1
INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, estimated_kw, estimated_amps, source, source_reference, is_current, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       (SELECT id FROM concepts WHERE slug='fish-and-chips'),
       '125A CEE 400V 3-phase', 1, 'Fish Project 1 stade — week 1', 74, 107, 'contract',
       'Stadepladsaftale Muskelsvindfonden', true,
       '[v2.0 Grøn File B] Fish Project 1 stade — 1× 125A CEE per city. Daily 5,086 DKK × 4 cities week 1 (Tårnby, Kolding, Aarhus, Aalborg). Tour-wide cost (40,688 DKK) booked under week 1 contract. Equipment: Fryer Large 32A 21kW dedicated + Fryer Small × N (more detail to extract from full PDF contract).'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_power
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND purpose='Fish Project 1 stade — week 1'
);

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, estimated_kw, estimated_amps, source, source_reference, is_current, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       (SELECT id FROM concepts WHERE slug='fish-and-chips'),
       '125A CEE 400V 3-phase', 1, 'Fish Project 2 stade — week 1', 74, 107, 'contract',
       'Stadepladsaftale Muskelsvindfonden', true,
       '[v2.0 Grøn File B] Fish Project 2 stade (5-city: Tårnby, Kolding, Aarhus, Odense, Valby). Week 1 covers Tårnby/Kolding/Aarhus only (NOT Aalborg). Tour-wide cost 25,430 DKK booked under week 1 contract.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_power
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND purpose='Fish Project 2 stade — week 1'
);

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, estimated_kw, estimated_amps, source, source_reference, is_current, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       (SELECT id FROM concepts WHERE slug='gyropolis-gyros'),
       '125A CEE 400V 3-phase', 1, 'Gyropolis Gyros 1 stade — week 1', 83, 120, 'contract',
       'Stadepladsaftale Muskelsvindfonden', true,
       '[v2.0 Grøn File B] Gyropolis Gyros 1 stade — front-of-house serve. 83 kW / 120 A peak (higher than Fish due to Oven 32A + Griddle 32A 3-phase loads). Tour-wide cost 40,688 DKK.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_power
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND purpose='Gyropolis Gyros 1 stade — week 1'
);

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, estimated_kw, estimated_amps, source, source_reference, is_current, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       (SELECT id FROM concepts WHERE slug='gyropolis-gyros'),
       '125A CEE 400V 3-phase', 1, 'Gyropolis Gyros 2 stade — week 1', 83, 120, 'contract',
       'Stadepladsaftale Muskelsvindfonden', true,
       '[v2.0 Grøn File B] Gyropolis Gyros 2 stade — also actively cooks (same 83 kW profile as Gyros 1). Carries the cooling load for the entire Gyros operation across all 8 cities. Tour-wide cost 40,688 DKK.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_power
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND purpose='Gyropolis Gyros 2 stade — week 1'
);

-- Week 2
INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, estimated_kw, estimated_amps, source, source_reference, is_current, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026'),
       (SELECT id FROM concepts WHERE slug='fish-and-chips'),
       '125A CEE 400V 3-phase', 1, 'Fish Project 1 stade — week 2', 74, 107, 'contract',
       'Stadepladsaftale Muskelsvindfonden', true,
       '[v2.0 Grøn File B] Fish Project 1 stade — week 2 cities (Esbjerg, Odense, Næstved, Valby). Cost already in week 1 row.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_power
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026')
    AND purpose='Fish Project 1 stade — week 2'
);

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, estimated_kw, estimated_amps, source, source_reference, is_current, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026'),
       (SELECT id FROM concepts WHERE slug='fish-and-chips'),
       '125A CEE 400V 3-phase', 1, 'Fish Project 2 stade — week 2', 74, 107, 'contract',
       'Stadepladsaftale Muskelsvindfonden', true,
       '[v2.0 Grøn File B] Fish Project 2 stade — week 2 cities Odense + Valby ONLY (NOT Esbjerg, NOT Næstved). Cost in week 1.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_power
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026')
    AND purpose='Fish Project 2 stade — week 2'
);

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, estimated_kw, estimated_amps, source, source_reference, is_current, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026'),
       (SELECT id FROM concepts WHERE slug='gyropolis-gyros'),
       '125A CEE 400V 3-phase', 1, 'Gyropolis Gyros 1 stade — week 2', 83, 120, 'contract',
       'Stadepladsaftale Muskelsvindfonden', true,
       '[v2.0 Grøn File B] Gyropolis Gyros 1 stade — week 2 cities. Cost in week 1.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_power
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026')
    AND purpose='Gyropolis Gyros 1 stade — week 2'
);

INSERT INTO festival_power (festival_id, concept_id, power_unit, quantity, purpose, estimated_kw, estimated_amps, source, source_reference, is_current, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026'),
       (SELECT id FROM concepts WHERE slug='gyropolis-gyros'),
       '125A CEE 400V 3-phase', 1, 'Gyropolis Gyros 2 stade — week 2', 83, 120, 'contract',
       'Stadepladsaftale Muskelsvindfonden', true,
       '[v2.0 Grøn File B] Gyropolis Gyros 2 stade — week 2 cities. Cost in week 1.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_power
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026')
    AND purpose='Gyropolis Gyros 2 stade — week 2'
);

-- ============================================================================
-- 2. EQUIPMENT — anchor rows per concept (week 1 only; gear travels)
-- ============================================================================

INSERT INTO festival_equipment (festival_id, concept_id, name, category, quantity, power_unit, estimated_kw, ownership, position_notes, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       (SELECT id FROM concepts WHERE slug='fish-and-chips'),
       'Fryer Large (Fish concept, both stades share trailer)',
       'cooking', 1, 'CEE 32A 400V 3-phase', 21, 'owned',
       'Deployed at active Fish stade per city',
       '[v2.0 Grøn File B] CEE 32A, dedicated line per Muskelsvindfonden contract notes. Equipment travels in shared trailer between cities; deployed daily at whichever Fish stade is serving.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_equipment
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND concept_id=(SELECT id FROM concepts WHERE slug='fish-and-chips')
    AND name LIKE 'Fryer Large%'
);

INSERT INTO festival_equipment (festival_id, concept_id, name, category, quantity, power_unit, estimated_kw, ownership, position_notes, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       (SELECT id FROM concepts WHERE slug='fish-and-chips'),
       'Fryer Small #1 (Fish concept) — TBD extract',
       'cooking', 1, 'CEE 16A 400V 3-phase (TBD)', NULL, 'owned',
       'Deployed at Fish stades',
       '[v2.0 Grøn File B] ⚠️ EXTRACT FROM FULL PDF: Plug type, amperage, kW for small fryers were cut off in PDF text. Likely 16A 3-phase based on Jelling reference. Verify against full contract text.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_equipment
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND concept_id=(SELECT id FROM concepts WHERE slug='fish-and-chips')
    AND name LIKE 'Fryer Small%'
);

INSERT INTO festival_equipment (festival_id, concept_id, name, category, quantity, power_unit, estimated_kw, ownership, position_notes, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       (SELECT id FROM concepts WHERE slug='gyropolis-gyros'),
       'Oven (Gyros concept)',
       'cooking', 1, 'CEE 32A 400V 3-phase', 21, 'owned',
       'Deployed at Gyros stades',
       '[v2.0 Grøn File B] CEE 32A 3-phase 21kW per Muskelsvindfonden contract.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_equipment
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND concept_id=(SELECT id FROM concepts WHERE slug='gyropolis-gyros')
    AND name LIKE 'Oven%'
);

INSERT INTO festival_equipment (festival_id, concept_id, name, category, quantity, power_unit, estimated_kw, ownership, position_notes, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       (SELECT id FROM concepts WHERE slug='gyropolis-gyros'),
       'Griddle (Gyros concept)',
       'cooking', 1, 'CEE 32A 400V 3-phase', NULL, 'owned',
       'Deployed at Gyros stades',
       '[v2.0 Grøn File B] CEE 32A per Muskelsvindfonden contract. Power kW cut off in PDF text — extract from full contract.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_equipment
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND concept_id=(SELECT id FROM concepts WHERE slug='gyropolis-gyros')
    AND name LIKE 'Griddle%'
);

-- Action item: extract remaining equipment from full PDFs
INSERT INTO festival_action_items (festival_id, title, description, due_date, priority, status, category, owner)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       '⚠️ Extract full Grøn equipment list from stadepladsaftale PDFs',
       'PDFs Fish 1, Fish 2, Gyros 1, Gyros 2 had equipment list text cut off mid-page. Need to re-read full contracts and add missing equipment rows (likely additional small fryers for Fish, additional griddles/heating for Gyros, plus ancillary items like POS counters, fridge containers per stade, etc.). Current festival_equipment rows are anchor-only and incomplete.',
       '2026-06-01', 'high', 'open', 'operations', 'Alexandra'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_action_items
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND title LIKE '%Extract full Grøn equipment list%'
);

-- ============================================================================
-- 3. COOLING — 10 pallepladser in Grøn's touring truck
-- ============================================================================

INSERT INTO festival_cooling (festival_id, unit_type, delivery_date, pickup_date, cost_dkk, contract_amount_excl_vat_dkk, payment_status, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       'Fish Project 1 — 1 køl + 1 frys palleplads (in Grøn truck)',
       '2026-07-15', '2026-07-19', 4700, 4700, 'pending',
       '[v2.0 Grøn File B] 2 pallets reserved inside Grøn cooling truck (festival infrastructure). Truck moves with tour Tårnby → Kolding → Aarhus → Aalborg. Cost 4,700 DKK ex VAT (booked under Fish 1 stadepladsaftale). Daily access for stock rotation.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_cooling
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND unit_type LIKE '%Fish Project 1%'
);

INSERT INTO festival_cooling (festival_id, unit_type, delivery_date, pickup_date, cost_dkk, payment_status, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026'),
       'Fish Project 1 — 1 køl + 1 frys palleplads (in Grøn truck)',
       '2026-07-22', '2026-07-26', 0, 'pending',
       '[v2.0 Grøn File B] Same 2-pallet reservation continues into week 2 (Esbjerg → Odense → Næstved → Valby). Cost in week 1.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_cooling
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026')
    AND unit_type LIKE '%Fish Project 1%'
);

INSERT INTO festival_cooling (festival_id, unit_type, delivery_date, pickup_date, cost_dkk, contract_amount_excl_vat_dkk, payment_status, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       'Gyropolis Gyros 1 — 1 køl + 1 frys palleplads (in Grøn truck)',
       '2026-07-15', '2026-07-19', 4700, 4700, 'pending',
       '[v2.0 Grøn File B] 2 pallets reserved inside Grøn cooling truck. Cost 4,700 DKK ex VAT. Front-of-house serve stade — daily stock rotation needed for fresh meat/sauces.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_cooling
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND unit_type LIKE '%Gyropolis Gyros 1%'
);

INSERT INTO festival_cooling (festival_id, unit_type, delivery_date, pickup_date, cost_dkk, payment_status, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026'),
       'Gyropolis Gyros 1 — 1 køl + 1 frys palleplads (in Grøn truck)',
       '2026-07-22', '2026-07-26', 0, 'pending',
       '[v2.0 Grøn File B] Same 2-pallet reservation continues week 2. Cost in week 1.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_cooling
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026')
    AND unit_type LIKE '%Gyropolis Gyros 1%'
);

INSERT INTO festival_cooling (festival_id, unit_type, delivery_date, pickup_date, cost_dkk, contract_amount_excl_vat_dkk, payment_status, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026'),
       'Gyropolis Gyros 2 — 4 køl + 4 frys pallepladser (in Grøn truck)',
       '2026-07-15', '2026-07-19', 18800, 18800, 'pending',
       '[v2.0 Grøn File B] 8 pallets reserved — CARRIES PRIMARY COOLING LOAD for the entire Gyros operation across all 8 cities. Cost 18,800 DKK ex VAT (most expensive line item of the 4 stadepladser). Includes capacity for Fish 1/2 spillover during peak demand cities.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_cooling
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge1-2026')
    AND unit_type LIKE '%Gyropolis Gyros 2%'
);

INSERT INTO festival_cooling (festival_id, unit_type, delivery_date, pickup_date, cost_dkk, payment_status, notes)
SELECT (SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026'),
       'Gyropolis Gyros 2 — 4 køl + 4 frys pallepladser (in Grøn truck)',
       '2026-07-22', '2026-07-26', 0, 'pending',
       '[v2.0 Grøn File B] Same 8-pallet reservation continues week 2. Cost in week 1.'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_cooling
  WHERE festival_id=(SELECT id FROM festivals WHERE slug='gron-koncert-uge2-2026')
    AND unit_type LIKE '%Gyropolis Gyros 2%'
);

COMMIT;