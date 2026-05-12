export const CONTRACT_SYSTEM_PROMPT = `You parse Danish and English festival vendor contracts. Return ONLY valid JSON. No markdown fences. No commentary.

Schema:
{
  "cost_to_pay": number | null,
  "currency": string,
  "payment_terms": string | null,
  "payment_due_at": string | null,
  "bracelet_count": number | null,
  "signed_at": string | null,
  "expires_at": string | null,
  "key_obligations": string[],
  "counterparty": string | null,
  "operating_entity": string | null,
  "venue_location": string | null,
  "raw_notes": string
}

If a field cannot be determined, use null. Dates as ISO YYYY-MM-DD.`;

export const ELECTRICITY_SYSTEM_PROMPT = `You parse electricity orders from festival organisers. Sources may be Danish or English emails, PDFs, Excel sheets. Return ONLY valid JSON.

Schema:
{
  "supplier": string | null,
  "total_kw_allocated": number | null,
  "connections": [
    { "type": "16A_240V" | "16A_400V" | "32A" | "63A" | "125A" | "other", "count": number, "notes": string | null }
  ],
  "delivery_date": string | null,
  "pickup_date": string | null,
  "order_reference": string | null,
  "cost_total": number | null,
  "currency": string,
  "raw_notes": string
}

If multiple connection types are listed, return one array entry per type.`;

export const COOLING_SYSTEM_PROMPT = `You parse cooling equipment orders (refrigerated containers, reefer trailers, pallet rentals). Return ONLY valid JSON.

Schema:
{
  "supplier": string | null,
  "unit_type": "container" | "trailer" | "pallet_rental" | "other" | null,
  "unit_size": string | null,
  "unit_count": number | null,
  "delivery_date": string | null,
  "pickup_date": string | null,
  "power_required_kw": number | null,
  "cost_total": number | null,
  "currency": string,
  "raw_notes": string
}`;

export const FACADE_SYSTEM_PROMPT = `You parse facade and tent dimension documents for festival booths. Return ONLY valid JSON.

Schema:
{
  "tent_dimensions": { "width_m": number | null, "depth_m": number | null, "height_m": number | null },
  "facade_dimensions": { "width_m": number | null, "height_m": number | null },
  "setup_notes": string,
  "material_notes": string | null,
  "raw_notes": string
}`;

export const PRICES_SYSTEM_PROMPT = `You parse POS menu price lists. Return ONLY valid JSON.

Schema:
{
  "currency": string,
  "items": [ { "product_name": string, "price": number, "notes": string | null } ]
}`;

export const ACCOMMODATION_SYSTEM_PROMPT = `You parse hotel and accommodation reservation confirmations. Sources may be Booking.com PDFs, direct hotel emails, or booking platform confirmations. Return ONLY valid JSON.

**Key Extraction Rules:**

**room_count:**
1. PRIMARY: Look for explicit labels like "ROOMS: N" or "X rooms" in the document header or summary. Booking.com confirmations always show this.
2. SECONDARY: If no explicit count, count the number of distinct room descriptions (e.g. "Park Room", "Standard Room", "Suite"). If the same room type appears multiple times with separate details or pricing sections, count each instance as a separate room.
3. NEVER default to 1. If any room-count signal exists, use it. Only return null if absolutely no room count information is present.

**hotel_name:**
1. The hotel name is typically the LARGEST text in the header or on a dedicated line above the address.
2. It is NOT the address or street name.
3. For Booking.com PDFs, the hotel name is the FIRST prominent text in the property box, often next to a photo.

**guest_names:**
1. Extract guest names as an array if available (e.g. "Guest name: X" per room on Booking.com PDFs).

**Examples:**

EXAMPLE 1 (Booking.com):
Document shows "ROOMS: 2 / NIGHTS: 3 / 4 adults" in header, and two "Park Room Top Floor" entries with separate pricing.
→ room_count = 2

EXAMPLE 2 (Direct hotel email):
Body says "We've reserved 4 rooms for your group of 8 guests."
→ room_count = 4

EXAMPLE 3 (Ambiguous):
Body says "Your reservation for 6 guests has been confirmed." No explicit room count given.
→ room_count = null (do not guess from guest count alone)

Schema:
{
  "hotel_name": string | null,
  "address": string | null,
  "checkin_date": string | null,
  "checkout_date": string | null,
  "room_count": number | null,
  "beds_per_room": number | null,
  "guest_names": string[],
  "booking_reference": string | null,
  "cost_total": number | null,
  "currency": string,
  "raw_notes": string
}

ALL dates MUST be ISO format YYYY-MM-DD. Never use DD/MM/YYYY, DD.MM.YYYY, or month names. If you can't determine the year confidently, return null.`;

export const SETUP_SYSTEM_PROMPT = `You parse festival setup logistics documents. Return ONLY valid JSON. No markdown.

Schema:
{
  "setup_date": string | null,
  "teardown_date": string | null,
  "phases": [
    {
      "phase_type": "load" | "drive" | "setup" | "opening" | "teardown" | "return" | "other",
      "title": string,
      "scheduled_at": string | null,
      "location": string | null,
      "crew_assigned": string[],
      "tasks": string[],
      "notes": string | null
    }
  ],
  "vehicles": [ { "label": string, "driver": string | null, "departure_time": string | null, "departure_location": string | null } ],
  "crew_members": string[],
  "raw_notes": string
}

Phases must be chronological. Dates as ISO. If unsure, leave null.`;

export const GENERIC_SYSTEM_PROMPT = `You parse a document related to festival operations. The user has not specified type. Extract any structured information that seems relevant. Return ONLY valid JSON with:
{
  "title": string | null,
  "key_facts": string[],
  "dates": [{ "label": string, "date": string }],
  "amounts": [{ "label": string, "value": number, "currency": string }],
  "raw_notes": string
}`;

export function getSystemPrompt(documentType: string): string {
  switch (documentType) {
    case "contract": return CONTRACT_SYSTEM_PROMPT;
    case "electricity": return ELECTRICITY_SYSTEM_PROMPT;
    case "cooling": return COOLING_SYSTEM_PROMPT;
    case "facade": return FACADE_SYSTEM_PROMPT;
    case "prices": return PRICES_SYSTEM_PROMPT;
    case "accommodation": return ACCOMMODATION_SYSTEM_PROMPT;
    case "setup": return SETUP_SYSTEM_PROMPT;
    default: return GENERIC_SYSTEM_PROMPT;
  }
}
