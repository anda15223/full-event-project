export const ACC_TYPES = [
  "festival_camping","festival_caravan","festival_provided_room","hotel","airbnb","private_house","company_van",
] as const;
export type AccType = typeof ACC_TYPES[number];

export const ACC_TYPE_LABEL: Record<AccType, string> = {
  festival_camping: "Festival camping",
  festival_caravan: "Festival caravan",
  festival_provided_room: "Festival room",
  hotel: "Hotel",
  airbnb: "Airbnb",
  private_house: "Private house",
  company_van: "Company van",
};

export const ACC_TYPE_ICON: Record<AccType, string> = {
  festival_camping: "⛺",
  festival_caravan: "🚐",
  festival_provided_room: "🏠",
  hotel: "🏨",
  airbnb: "🏡",
  private_house: "🏘️",
  company_van: "🚌",
};

export const PAYMENT_STATUSES = ["not_paid","deposit_paid","paid_in_full","invoiced"] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];
export const PAYMENT_LABEL: Record<PaymentStatus,string> = {
  not_paid:"Not paid", deposit_paid:"Deposit paid", paid_in_full:"Paid", invoiced:"Invoiced",
};
export function paymentClasses(s: PaymentStatus): string {
  if (s==="paid_in_full") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s==="not_paid") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export const AMENITIES = ["wifi","parking","kitchen","breakfast","shower","laundry","ac","pets_ok"] as const;
export const AMENITY_LABEL: Record<string,string> = {
  wifi:"📶 Wi-Fi", parking:"🅿️ Parking", kitchen:"🍳 Kitchen", breakfast:"🥐 Breakfast",
  shower:"🚿 Shower", laundry:"🧺 Laundry", ac:"❄️ A/C", pets_ok:"🐾 Pets OK",
};

export function nightsBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const d1 = new Date(a), d2 = new Date(b);
  return Math.max(0, Math.round((d2.getTime() - d1.getTime())/(1000*60*60*24)));
}
