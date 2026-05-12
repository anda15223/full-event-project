export type AccommodationStatusInfo = {
  status: "green" | "amber" | "red" | "neutral";
  label: string;
};

export function computeBookingStatus(booking: {
  payment_status: string | null;
  room_count: number | null;
  rooms_created: number;
  beds_assigned: number;
  beds_total: number;
}): AccommodationStatusInfo {
  const ps = (booking.payment_status ?? "").toLowerCase();
  const paid = ps === "paid" || ps === "paid_in_full";
  const partial = ps === "deposit_paid" || ps === "invoiced";
  const targetRooms = booking.room_count ?? 0;
  const fullyRoomed = targetRooms > 0 && booking.rooms_created >= targetRooms;
  const fullyAssigned = booking.beds_total > 0 && booking.beds_assigned === booking.beds_total;

  if (paid && fullyRoomed && fullyAssigned) return { status: "green", label: "Confirmed" };
  if (targetRooms > 0 && booking.rooms_created < targetRooms)
    return { status: "red", label: "Rooms not generated" };
  if (paid && fullyRoomed) {
    const missing = booking.beds_total - booking.beds_assigned;
    return { status: "amber", label: `${missing} bed${missing === 1 ? "" : "s"} unassigned` };
  }
  if (paid) return { status: "amber", label: "Paid" };
  if (partial) return { status: "amber", label: ps === "invoiced" ? "Invoiced" : "Deposit paid" };
  return { status: "amber", label: "Reserved" };
}

export const ACC_STATUS_PILL: Record<AccommodationStatusInfo["status"], string> = {
  green: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  red: "bg-destructive/10 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
};
