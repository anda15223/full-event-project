# 🧠 THE FESTIVAL BRAIN — v1.0

**The Fish Project / Freek Show — Festival Operations Card Specification**

> This document is the authoritative reference for what each festival card is, what data it shows, which database tables it reads from, and what reports it produces. It applies to **every festival** (Jelling, Roskilde, Tinderbox, etc.) — only the data inside changes per festival, never the structure.

> **Lovable instruction:** Treat this document as the source of truth for the festival module. Do not invent new fields. Do not create new tables. Do not consolidate or split cards without explicit instruction. When asked to modify a card, only modify what's described here.

---

## 📐 CARD ORDER (operational sequence — locked)

| # | Card | Sub-cards | Output report |
|---|---|---|---|
| 1 | Introduction | — | — |
| 2 | Concepts | — | — |
| 3 | Equipment | Setup · Façade · Equipment Transportation | 📄 Fidibus build sheet · 📄 Print files |
| 4 | Cooling & Storage | — | — |
| 5 | Power | — | 📄 Power requirements |
| 6 | Staffing & Vagtplan | — | 📄 Vagtplan PDF per person |
| 7 | Staff Transportation & Accommodation | — | 📄 Travel + accommodation roster |
| 8 | BC Trolley | Per concept (4 sub-views) | 📄 BC Catering order list (per supplier) |
| 9 | Cooking Equipment per Concept | Per concept (4 sub-views) | 📄 Gas inspection list · 📄 Rental order |
| 10 | Menu & Groceries | Recipes · Forecast · Grocery List | 📄 Grocery order per supplier |
| 11 | Safety & Compliance | — | 📄 Safety inventory for brand inspection |
| 12 | Setup Timeline & Day Plan | — | 📄 Day-by-day action plan |

**The flow reads:** Who you are → What you sell → What you build → How you power it → Who works → How they get there → What they bring → How they cook → What they cook → Safety → Day-by-day plan.

---

## 🎨 GLOBAL DESIGN RULES

**Status colors per card** (computed from completion %):
- 🟢 Green: ≥90% complete, no overdue items
- 🟡 Yellow: 50–89% complete, or has items due within 7 days
- 🔴 Red: <50% complete, or has overdue items
- ⚪ Empty: 0% complete (initial state)

**Hero KPIs** — every card preview shows 2–4 numbers + status pill.

**Sub-page** — clicking a card opens a detail page with full data, edit forms, and report download buttons.

**Reports** — all PDF, branded "The Fish Project / Freek Show", clean black-and-white print-friendly layout.

**Festival-agnostic data lives in catalog tables** (concepts, suppliers, ingredients, staff, equipment_catalog, trolley_items). Edit once, used everywhere.

**Festival-specific data lives in festival_* tables.** Linked to the festival, not the catalog.

---

## CARD 1 — INTRODUCTION

**Purpose:** First card you see. Festival contact + basic identifying info. Read-mostly.

**Hero KPIs:**
- Festival dates (e.g. "21–24 May 2026")
- Days until start (countdown)
- Organiser contact name

**Sub-page content:**
- Festival full name, year
- Start/end dates, setup date, breakdown date
- Address, city, country
- Organiser name, phone, email
- Notes / general info field

**Tables read from:** `festivals`

**Tables written to:** `festivals`

**Status logic:** Always green if all required fields filled. Yellow if any required field empty.

**Empty state:** "Add festival details to begin"

**Actions:**
- Edit festival info
- Copy organiser contact

**Reports:** None

---

## CARD 2 — CONCEPTS

**Purpose:** Which of the 4 concepts (Fish & Chips, Gyropolis, Crêperie, Chicks 'n' Buns) operate at this festival, in which zone.

**Hero KPIs:**
- Concept count (e.g. "4")
- Zone breakdown (e.g. "2 INSIDE · 2 CAMPING")

**Sub-page content:**
- Table of selected concepts × zones
- Stall name per concept (optional)
- Notes per concept

**Tables read from:** `concepts`, `festival_concepts`

**Tables written to:** `festival_concepts`

**Status logic:**
- 🟢 Green: at least 1 concept assigned
- ⚪ Empty: no concepts assigned

**Empty state:** "Select which concepts will operate at this festival"

**Actions:**
- Add concept to festival
- Assign zone (INSIDE/CAMPING)
- Remove concept

**Reports:** None

**Critical:** Many other cards (Equipment, Cooking, BC Trolley, Menu) inherit from concepts. **Concepts must be set first.**

---

## CARD 3 — EQUIPMENT

**Purpose:** Physical infrastructure to build the stalls. Three sub-cards inside.

**Hero KPIs:**
- Total Setup items count
- Façade status summary (e.g. "3/4 print-ready")
- Equipment trucks count

### 3.1 — Setup sub-card

**Purpose:** Master physical equipment list for **Fidibus** to build the stalls.

**Content:**
- Tables, table covers, countertops
- Façade panels (structure)
- Cables, lights
- DAKA bins
- Price-writing display (chalkboards / printed boards)
- Quantities per concept × per zone

**Arrival contact info** — who Fidibus calls when they arrive on site (typically Costel)

**Tables read from:** `equipment_catalog` (filtered by `category = 'fidibus-build'`), `festival_equipment`, `concepts`

**Tables written to:** `festival_equipment`

**Status logic:**
- 🟢 Green: all build items quantified, contact set
- 🔴 Red: missing items or no arrival contact

**Reports:** 📄 **Fidibus Build Sheet PDF**
- Grouped by concept
- Includes quantities, zone, arrival contact, Fidibus deadline
- Sent to Fidibus before festival

### 3.2 — Façade sub-card

**Purpose:** Track façade print readiness per concept.

**Content:**
- Status per concept: pending / in-progress / print-ready / printed / installed
- Print deadline (festival-wide, e.g. 27 Apr)
- Notes per concept

**Tables read from:** `festival_facade`, `concepts`

**Tables written to:** `festival_facade`

**Status logic:**
- 🟢 Green: all concepts at "print-ready" or beyond by deadline
- 🟡 Yellow: any concept "in-progress" within 7 days of print deadline
- 🔴 Red: any concept "pending" past print deadline

**Reports:** 📄 **Façade Print Files** (links to design files for each concept)

### 3.3 — Equipment Transportation sub-card

**Purpose:** How equipment gets from warehouse to festival site. Trucks, drivers, loading.

**Content:**
- Vehicle name, type, capacity
- Driver (links to staff)
- Departure warehouse (Søborg / Aarhus)
- Departure / arrival / return times
- Load manifest (what's on which truck)
- Status: planned / loaded / in-transit / delivered / returned

**Tables read from:** `festival_equipment_transport`, `festival_equipment_transport_items`, `festival_equipment`, `staff`

**Tables written to:** `festival_equipment_transport`, `festival_equipment_transport_items`

**Status logic:**
- 🟢 Green: all transports planned with drivers
- 🟡 Yellow: drivers missing or capacity unclear
- 🔴 Red: no transport planned

**Reports:** Internal load manifest (optional)

---

## CARD 4 — COOLING & STORAGE

**Purpose:** Refrigerated containers and cold storage logistics.

**Hero KPIs:**
- Number of cooling units
- Total cost
- Payment due date

**Sub-page content:**
- Unit type (e.g. "20ft container")
- Supplier (Godik, etc.)
- Supplier reference number
- Delivery date / pickup date
- Cost in DKK
- Payment due date + status (pending/paid/overdue)

**Tables read from:** `festival_cooling`, `suppliers`

**Tables written to:** `festival_cooling`

**Status logic:**
- 🟢 Green: all units booked, payment current
- 🟡 Yellow: payment due within 7 days
- 🔴 Red: payment overdue or unbooked units

**Empty state:** "Add cooling/storage units"

**Reports:** None (supplier handles delivery directly)

---

## CARD 5 — POWER

**Purpose:** Total electrical + gas requirements per stall.

**Hero KPIs:**
- Total amps required
- Number of stalls needing gas
- Gas supplier (typically Ronny VVS)

**Sub-page content:**
- Per concept × zone: amps required
- Gas required: yes/no per concept
- Gas supplier contact
- Electrical supplier (festival-provided usually)
- Baseline (e.g. "4×16A")

**Tables read from:** `festival_equipment` (joined with `equipment_catalog.power_amps` and `power_type`), `concepts`, `suppliers`

**Tables written to:** Indirectly via `festival_equipment` (no direct power table needed — it's a derived view of equipment with power needs)

**Status logic:**
- 🟢 Green: all stalls have power assigned
- 🟡 Yellow: gas connections pending
- 🔴 Red: missing requirements

**Empty state:** "Power needs are calculated from cooking equipment — start with Card 9"

**Reports:** 📄 **Power Requirements PDF**
- Total amps per stall
- Gas needs per stall (sent to Ronny VVS)
- Sent to festival electrical organiser

---

## CARD 6 — STAFFING & VAGTPLAN

**Purpose:** Who works when. Vagtplan per person, per concept, per day.

**Hero KPIs:**
- Total people
- Total person-hours
- Total shifts
- Origin breakdown (Søborg / local / managers / setup)

**Sub-page content:**
- Master roster of staff working this festival
- Vagtplan grid: staff × day × shift
- Role per shift (cook / cashier / runner / manager)
- Concept assignment per shift
- Hours auto-calculated from start/end times

**Tables read from:** `staff`, `festival_shifts`, `concepts`

**Tables written to:** `festival_shifts`

**Status logic:**
- 🟢 Green: all shifts covered, no overlaps
- 🟡 Yellow: shifts unfilled within 7 days
- 🔴 Red: shifts unfilled, overlaps detected

**Empty state:** "Build the vagtplan"

**Actions:**
- Add staff to festival
- Create shift
- Bulk shift create (template by concept × day)
- Detect overlaps
- Export per-person vagtplan

**Reports:** 📄 **Personal Vagtplan PDF** (one per staff member)
- Their shifts only
- Festival info, address, contact
- Sent via email or printed for handout

**Critical:** This card determines headcount → drives Card 7 (Transport & Accommodation). Build this first.

---

## CARD 7 — STAFF TRANSPORTATION & ACCOMMODATION

**Purpose:** How people get to the festival, where they sleep. **People only** — equipment transport lives in Card 3.3.

**Hero KPIs:**
- Number of vehicles
- Total bed-nights
- Number of accommodations

**Sub-page content:**

**Vehicles section:**
- Vehicle name (BMW, Van 2, rental)
- Type (car/van/rental)
- Driver (links to staff)
- Seat assignments per direction (outbound/return)
- Rental cost + supplier (if rented)
- Pickup/return times

**Accommodations section:**
- Cabin/hotel/apartment name
- Type, address
- Total beds, check-in, check-out
- Cost + booking status
- Booking reference

**Assignments section:**
- Which staff sleeps in which accommodation
- Per-person check-in/check-out (might differ from accommodation block)
- Auto-calculated nights per person

**Tables read from:** `staff`, `festival_staff_vehicles`, `festival_staff_vehicle_seats`, `festival_accommodations`, `festival_accommodation_assignments`, `suppliers`

**Tables written to:** `festival_staff_vehicles`, `festival_staff_vehicle_seats`, `festival_accommodations`, `festival_accommodation_assignments`

**Status logic:**
- 🟢 Green: every staff member has both transport (in or out) and accommodation
- 🟡 Yellow: some assignments missing
- 🔴 Red: many staff unassigned

**Empty state:** "Assign staff to vehicles and accommodations"

**Reports:** 📄 **Travel & Accommodation Roster PDF**
- Per staff: which car, which room, which nights
- Internal use

---

## CARD 8 — BC TROLLEY

**Purpose:** Small kitchen gear, cleaning products, packaging, signage. Per concept (each concept gets 1–2 trolleys).

**Hero KPIs:**
- Number of trolleys (e.g. "8 = 2 per concept × 4 concepts")
- Number of unique items
- Number of suppliers to order from

**Sub-page content:**

**Tab per concept** (4 tabs: F&C / Gyros / Crêperie / Chicks):
- Items grouped by category:
  - Cooking-tool (knives, tongs, scales, containers)
  - Cleaning-product (sanitizer, dish soap, gloves, sponges)
  - Packaging (containers, napkins, cups, lids)
  - Signage (markers, tape, signs)
  - Serving (utensils, plates)
- Quantity per item
- Supplier per item (auto-pulled from catalog default)

**Tables read from:** `trolley_items`, `festival_trolley_items`, `concepts`, `suppliers`

**Tables written to:** `festival_trolley_items`

**Status logic:**
- 🟢 Green: all 4 concepts populated, all items have suppliers
- 🟡 Yellow: some quantities missing
- 🔴 Red: concepts empty

**Empty state:** "Add trolley items per concept"

**Actions:**
- Copy trolley from another festival (template)
- Add item from catalog
- Bulk-update quantities
- Generate supplier order PDF

**Reports:** 📄 **BC Trolley Order Per Supplier PDF**
- One PDF per supplier (BC Catering, others)
- Items grouped by category
- Quantities aggregated across all concepts and trolleys
- Sent to supplier as order

**Powered by view:** `v_trolley_order_by_supplier`

---

## CARD 9 — COOKING EQUIPMENT PER CONCEPT

**Purpose:** Cooking gear per concept stall. Friteuse, plates, hoods, gas burners, electric units.

**Hero KPIs:**
- Total cooking units
- Owned vs rented split
- Number of stalls needing gas
- Total rental cost (if any)

**Sub-page content:**

**Tab per concept** (4 tabs):
- Equipment list with quantities
- Per item: power type (electric / gas / none)
- Per item: amps
- Per item: ownership (owned / rented)
- Per item: rental supplier + cost (if rented)

**Tables read from:** `equipment_catalog` (filtered by `category = 'cooking'`), `festival_equipment`, `concepts`, `suppliers`

**Tables written to:** `festival_equipment`

**Status logic:**
- 🟢 Green: all concepts have cooking equipment, gas needs identified
- 🟡 Yellow: rentals not booked
- 🔴 Red: missing equipment, gas inspection date approaching with gaps

**Empty state:** "Add cooking equipment per concept"

**Reports:**
1. 📄 **Gas Inspection List PDF** — for brand inspection on hard deadline
   - All gas-using equipment, location, type
   - Sent to inspector
2. 📄 **Cooking Equipment Rental Order PDF** — only rented items
   - Per supplier
   - Powered by view: `v_cooking_equipment_rentals`

---

## CARD 10 — MENU & GROCERIES

**Purpose:** What you sell + how much you'll sell + what to order. The computational engine.

**Hero KPIs:**
- Total dishes
- Total expected portions across all days
- Total grocery cost (estimated)
- Number of suppliers

**Sub-page content:** Three sub-views (tabs).

### 10.1 — Recipes sub-view

**Purpose:** Recipe library per concept, per dish. Reusable across festivals.

**Content:**
- Per concept × per dish:
  - Sale price DKK
  - Ingredient list with qty per portion
- Edit recipe
- Upload recipe (Excel) and parse
- Pull from Restaurant Manager (future integration)

**Tables read from:** `dishes`, `recipe_ingredients`, `ingredients`, `concepts`

**Tables written to:** `dishes`, `recipe_ingredients`

**Status:** Reusable catalog. Doesn't gate festival readiness directly (recipes persist between festivals).

### 10.2 — Forecast sub-view

**Purpose:** How many portions of each dish will sell each day at this festival.

**Content:**
- Grid: dish (rows) × day (columns)
- Expected portions per cell
- Total per dish, total per day, grand total
- Seed from previous festival (if same concept ran before)

**Tables read from:** `festival_forecasts`, `dishes`, `festivals`

**Tables written to:** `festival_forecasts`

**Status:**
- 🟢 Green: all dishes have forecasts for all festival days
- 🔴 Red: empty grid

### 10.3 — Grocery List sub-view

**Purpose:** Computed grocery order, grouped by supplier. Output of Recipes × Forecast.

**Content:**
- Per supplier (table grouped):
  - Ingredient name
  - Total qty needed (calculated)
  - Pack size → number of packs to order
  - Optional: + safety margin %
- Auto-recalculates when recipes or forecasts change

**Tables read from:** view `v_grocery_list_by_supplier`

**Tables written to:** None (computed view)

**Reports:** 📄 **Grocery Order Per Supplier PDF**
- One PDF per supplier
- Ingredients grouped by category
- Sent to supplier as order

---

## CARD 11 — SAFETY & COMPLIANCE

**Purpose:** Brand inspection requirements. Extinguishers, fire blankets, first-aid kits, etc.

**Hero KPIs:**
- Number of extinguishers
- Number of fire blankets
- Number of first-aid kits
- Hard deadline for inspection (countdown)

**Sub-page content:**
- Item type (extinguisher / fire-blanket / first-aid-kit)
- Item class (F-class / F-mark)
- Quantity
- Location (which zone, which stall)
- Notes
- Hard deadline reference (linked from `festival_deadlines` where `is_hard = true`)

**Tables read from:** `festival_safety`, `festival_deadlines` (filter: brand inspection)

**Tables written to:** `festival_safety`

**Status logic:**
- 🟢 Green: all required items present, inspection deadline met
- 🔴 Red: items missing or inspection deadline missed

**Empty state:** "Add safety inventory for inspection"

**Reports:** 📄 **Safety Inventory PDF for Brand Inspection**
- All items, classes, locations, quantities
- Festival info + inspection deadline
- Sent to inspector / kept on-site

---

## CARD 12 — SETUP TIMELINE & DAY PLAN

**Purpose:** Day-by-day action overlay. Pulls from all other cards. The "what we do today" view.

**Hero KPIs:**
- Total action items
- Open / overdue counts
- Setup date → breakdown date range
- Goods delivery deadline (if set)

**Sub-page content:**
- Timeline grouped by day (setup → festival → breakdown)
- Per day: action items with owner, deadline, status
- Filter by category (planning / logistics / operations / safety)
- Filter by owner (Marius, Costel, Alex, etc.)
- Hard deadlines highlighted (linked from `festival_deadlines`)

**Tables read from:** `festival_action_items`, `festival_deadlines`, `staff`

**Tables written to:** `festival_action_items`, `festival_deadlines`

**Status logic:**
- 🟢 Green: all on track, 0 overdue
- 🟡 Yellow: items due within 24h
- 🔴 Red: any overdue items

**Empty state:** "Add setup actions and deadlines"

**Actions:**
- Add action item
- Mark complete
- Reassign owner
- Bulk-create from template (previous festival)

**Reports:** 📄 **Day-by-Day Action Plan PDF**
- Grouped by day
- All open + recently-closed actions
- Hard deadlines flagged
- Internal use, distributed to crew on arrival

---

## 📦 CROSS-CARD DEPENDENCIES

```
Concepts (Card 2)
    ├─→ Equipment (3): equipment per concept
    ├─→ Cooking Equipment (9): cooking gear per concept
    ├─→ BC Trolley (8): trolleys per concept
    ├─→ Menu & Groceries (10): dishes per concept
    └─→ Façade (3.2): façade per concept

Staffing (Card 6)
    └─→ Staff Transportation & Accommodation (Card 7)
        ├─→ vehicles need drivers (from staff)
        └─→ accommodations need bed assignments (per staff)

Cooking Equipment (Card 9)
    └─→ Power (5): power needs derived from equipment
    └─→ Safety (11): gas-using equipment drives gas inspection list

Recipes (10.1) × Forecast (10.2)
    └─→ Grocery List (10.3): computed via v_grocery_list_by_supplier

Trolley Items × Festival Quantities
    └─→ Trolley Order (Card 8 report): computed via v_trolley_order_by_supplier

All Cards
    └─→ Setup Timeline (Card 12): action items reference items from other cards
```

**Data flow rule:** Catalogs (concepts, suppliers, ingredients, equipment, trolley_items, staff) must be populated before festival-specific tables. The 4 concepts are seeded — everything else gets populated via Excel imports.

---

## 🎯 LOVABLE INSTRUCTIONS

When you receive UI change requests for the festival module:

1. **Identify which card is affected** using this document
2. **Confirm the database tables match** what's documented here
3. **Do NOT add new tables** without explicit instruction — propose schema changes first, get approval, then implement
4. **Do NOT consolidate or split cards** — the structure here is locked
5. **Status logic, empty states, hero KPIs** — implement exactly as documented
6. **Reports** — generate as PDF only, branded "The Fish Project / Freek Show"
7. **Catalog vs festival data** — never mix; catalog tables are festival-agnostic

When in doubt, refer back to this document. If something isn't covered here, ask before implementing.
