BEGIN;

DO $$
DECLARE
  v_gron_w1 uuid;
  v_gron_w2 uuid;
BEGIN
  SELECT id INTO v_gron_w1 FROM festivals WHERE slug = 'gron-koncert-uge1-2026';
  SELECT id INTO v_gron_w2 FROM festivals WHERE slug = 'gron-koncert-uge2-2026';
  IF v_gron_w1 IS NULL OR v_gron_w2 IS NULL THEN
    RAISE EXCEPTION 'Grøn festival rows missing — apply v1.x seed first';
  END IF;
END $$;

INSERT INTO suppliers (name, slug, category, country, notes)
VALUES (
  'Muskelsvindfonden',
  'muskelsvindfonden',
  'festival_organiser',
  'DK',
  E'Festival organiser for Grøn Koncert (8-city touring festival, mid-July). Stadepladsaftaler signed via muskelsvindfonden.jotform.com.\nProvides cooling truck, power infrastructure, OnlinePOS terminals, safety equipment hire. Tents are NOT rented from Grøn for Fish Project ops — self-supplied via Fidibus (2025 Grøn invoice line of 14,700 DKK for telt was a billing mistake, confirmed by Fif 7 May 2026).\nAddress: Kongsvang Allé 23, 8000 Aarhus C. Tel +45 8948 2222.\nF&B Manager: Jacob Paaske Harms — mobile +45 2265 2417 (responsible for Grøn + Cirkus Summarum + Forskels Feltet).\nNot to be confused with Festivalfonden af 2006 (Jelling organiser).'
)
ON CONFLICT (slug) DO NOTHING;

UPDATE festivals
   SET notes = COALESCE(notes,'') ||
     CASE WHEN COALESCE(notes,'') ILIKE '%Muskelsvindfonden%' THEN ''
          ELSE E'\n[v2.0 Grøn File A] Organiser: Muskelsvindfonden. Contracting entity (Fish Project side): Blue Fish ApS (CVR 40747745). POS: OnlinePOS. All-electric (no gas). 4 stadepladser: Fish Project 1 (all tour), Fish Project 2 (5 cities), Gyropolis Gyros 1 (all tour), Gyropolis Gyros 2 (all tour, cooling-heavy).'
     END
 WHERE slug IN ('gron-koncert-uge1-2026','gron-koncert-uge2-2026');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'festivals' AND column_name = 'organiser_id'
  ) THEN
    EXECUTE $sql$
      UPDATE festivals
         SET organiser_id = (SELECT id FROM suppliers WHERE slug = 'muskelsvindfonden')
       WHERE slug IN ('gron-koncert-uge1-2026','gron-koncert-uge2-2026')
         AND (organiser_id IS NULL
              OR organiser_id <> (SELECT id FROM suppliers WHERE slug = 'muskelsvindfonden'))
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'festivals' AND column_name = 'organiser_name'
  ) THEN
    EXECUTE $sql$
      UPDATE festivals
         SET organiser_name = 'Muskelsvindfonden'
       WHERE slug IN ('gron-koncert-uge1-2026','gron-koncert-uge2-2026')
    $sql$;
  END IF;
END $$;

-- ----- FISH & CHIPS — week 1 (covers both Fish Project 1 + Fish Project 2) -----
INSERT INTO festival_contracts (
  festival_id, concept_id,
  counterparty, counterparty_name_in_contract,
  contracting_entity, contracting_entity_cvr,
  pos_provider, notes
)
SELECT
  (SELECT id FROM festivals WHERE slug = 'gron-koncert-uge1-2026'),
  (SELECT id FROM concepts WHERE slug = 'fish-and-chips'),
  'Muskelsvindfonden',
  'Stadepladsaftale: Fish Project 1 + Fish Project 2 — Grøn week 1',
  'Blue Fish ApS',
  '40747745',
  'OnlinePOS',
  E'[v2.0 Grøn File A] TWO stadepladser under one Muskelsvindfonden agreement (signed via muskelsvindfonden.jotform.com).\n\n--- FISH PROJECT 1 (all tour, week 1 cities: Tårnby 16 Jul, Kolding 17, Aarhus 18, Aalborg 19) ---\nPower: 1× 125A CEE — 74 kW / 107 A peak. Daily 5,086 DKK. Tour total 40,688 DKK.\nCooling: 1 køl + 1 frys palleplads = 4,700 DKK.\nPOS: 2× OnlinePOS = 7,500 DKK. Stilladsbar 2,100 + Topskilt 1,650. Safety 525. Gas: NONE.\nEquipment: Fryer Large CEE 32A 21kW + Fryer Small.\nSubtotal: 57,163 DKK ex VAT.\n\n--- FISH PROJECT 2 (5-city: Tårnby, Kolding, Aarhus in week 1) ---\nPower: 1× 125A CEE — 74 kW / 107 A peak. 5-city total 25,430 DKK.\nCooling: 0 pallepladser (piggybacks on Fish 1 cooling).\nPOS: 2× OnlinePOS = 7,500 DKK. Stilladsbar 2,100 + Topskilt 1,650. Safety 525. Gas: NONE.\nSubtotal: 37,205 DKK ex VAT.\n\nContracting entity: Blue Fish ApS (CVR 40747745, Nordea reg 2878 konto 6291597619).'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_contracts
  WHERE festival_id = (SELECT id FROM festivals WHERE slug = 'gron-koncert-uge1-2026')
    AND concept_id = (SELECT id FROM concepts WHERE slug = 'fish-and-chips')
);

-- ----- FISH & CHIPS — week 2 (covers both Fish Project 1 + Fish Project 2) -----
INSERT INTO festival_contracts (
  festival_id, concept_id,
  counterparty, counterparty_name_in_contract,
  contracting_entity, contracting_entity_cvr,
  pos_provider, notes
)
SELECT
  (SELECT id FROM festivals WHERE slug = 'gron-koncert-uge2-2026'),
  (SELECT id FROM concepts WHERE slug = 'fish-and-chips'),
  'Muskelsvindfonden',
  'Stadepladsaftale: Fish Project 1 + Fish Project 2 — Grøn week 2',
  'Blue Fish ApS',
  '40747745',
  'OnlinePOS',
  E'[v2.0 Grøn File A] Week 2 extension of the same Muskelsvindfonden agreement.\n\n--- FISH PROJECT 1 (week 2 cities: Esbjerg 23 Jul, Odense 24, Næstved 25, Valby 26) ---\nSame terms as week 1. Festival-paid services counted in week 1 row.\n\n--- FISH PROJECT 2 (week 2 cities: Odense 24, Valby 26 only) ---\nAalborg, Esbjerg, Næstved NOT served by Fish 2. Same terms; cost in week 1 row.\n\nContracting entity: Blue Fish ApS (CVR 40747745).'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_contracts
  WHERE festival_id = (SELECT id FROM festivals WHERE slug = 'gron-koncert-uge2-2026')
    AND concept_id = (SELECT id FROM concepts WHERE slug = 'fish-and-chips')
);

-- ----- GYROPOLIS GYROS — week 1 (covers both Gyros 1 + Gyros 2) -----
INSERT INTO festival_contracts (
  festival_id, concept_id,
  counterparty, counterparty_name_in_contract,
  contracting_entity, contracting_entity_cvr,
  pos_provider, notes
)
SELECT
  (SELECT id FROM festivals WHERE slug = 'gron-koncert-uge1-2026'),
  (SELECT id FROM concepts WHERE slug = 'gyropolis-gyros'),
  'Muskelsvindfonden',
  'Stadepladsaftale: Gyropolis Gyros 1 + Gyropolis Gyros 2 — Grøn week 1',
  'Blue Fish ApS',
  '40747745',
  'OnlinePOS',
  E'[v2.0 Grøn File A] TWO stadepladser under one Muskelsvindfonden agreement (signed via muskelsvindfonden.jotform.com).\n\n--- GYROPOLIS GYROS 1 (front-of-house serve, all 8 tour cities) ---\nPower: 1× 125A CEE — 83 kW / 120 A peak (higher than Fish: oven + griddle + 3-phase). Tour total 40,688 DKK.\nCooling: 1 køl + 1 frys palleplads = 4,700 DKK.\nPOS: 2× OnlinePOS = 7,500 DKK. Stilladsbar 2,100 + Topskilt 1,650. Safety 525. Gas: NONE.\nEquipment: Oven CEE 32A 21kW 3-phase, Griddle CEE 32A.\nSubtotal: 57,163 DKK ex VAT.\n\n--- GYROPOLIS GYROS 2 (cooling/storage stade, all 8 tour cities) ---\nPower: 1× 125A CEE — 83 kW / 120 A peak (same as Gyros 1).\nCooling: 4 køl + 4 frys pallepladser = 18,800 DKK. CARRIES COOLING LOAD FOR BOTH GYROS STADES + Fish 1/Fish 2 spillover via shared trailer.\nPOS: 2× OnlinePOS = 7,500 DKK. Stilladsbar 2,100 + Topskilt 1,650. Safety 525. Gas: NONE.\nEquipment: Oven + Griddle on 32A, plus shared cooling infrastructure.\nSubtotal: 71,263 DKK ex VAT — most expensive due to cooling load.\n\nContracting entity: Blue Fish ApS (CVR 40747745).'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_contracts
  WHERE festival_id = (SELECT id FROM festivals WHERE slug = 'gron-koncert-uge1-2026')
    AND concept_id = (SELECT id FROM concepts WHERE slug = 'gyropolis-gyros')
);

-- ----- GYROPOLIS GYROS — week 2 (covers both Gyros 1 + Gyros 2) -----
INSERT INTO festival_contracts (
  festival_id, concept_id,
  counterparty, counterparty_name_in_contract,
  contracting_entity, contracting_entity_cvr,
  pos_provider, notes
)
SELECT
  (SELECT id FROM festivals WHERE slug = 'gron-koncert-uge2-2026'),
  (SELECT id FROM concepts WHERE slug = 'gyropolis-gyros'),
  'Muskelsvindfonden',
  'Stadepladsaftale: Gyropolis Gyros 1 + Gyropolis Gyros 2 — Grøn week 2',
  'Blue Fish ApS',
  '40747745',
  'OnlinePOS',
  E'[v2.0 Grøn File A] Week 2 extension of the same Muskelsvindfonden agreement (Esbjerg, Odense, Næstved, Valby).\n\n--- GYROPOLIS GYROS 1 ---\nSame terms as week 1. Festival-paid services counted in week 1 row.\n\n--- GYROPOLIS GYROS 2 ---\nSame terms as week 1. Festival-paid services counted in week 1 row.\n\nContracting entity: Blue Fish ApS (CVR 40747745).'
WHERE NOT EXISTS (
  SELECT 1 FROM festival_contracts
  WHERE festival_id = (SELECT id FROM festivals WHERE slug = 'gron-koncert-uge2-2026')
    AND concept_id = (SELECT id FROM concepts WHERE slug = 'gyropolis-gyros')
);

COMMIT;