import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  BedDouble, Upload, FileText, Download, Loader2, Trash2, Plus, Pencil, Sparkles,
  Eye, EyeOff, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  computeBookingStatus, ACC_STATUS_PILL,
} from "@/lib/accommodationStatus";
import { toIsoDate } from "@/lib/parseDate";
import { jsPDF } from "jspdf";

const sb = supabase as any;

export interface AccommodationRow {
  id: string;
  festival_id: string;
  provider_name: string | null;
  accommodation_type: string;
  address: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  cost_dkk: number | null;
  currency: string | null;
  payment_status: string;
  confirmation_number: string | null;
  booking_file_path: string | null;
  notes: string | null;
  room_count: number | null;
  beds_per_room: number | null;
  confirmation_pdf_uploaded_at: string | null;
  last_parsed_at: string | null;
  parse_summary: string | null;
  parsed_data: {
    _extraction_evidence?: {
      evidence_type: "explicit_label" | "room_descriptions" | "none_found";
      matched_text: string;
      matched_sections: string[];
    };
    [key: string]: unknown;
  } | null;
}

export interface AccommodationRoomRow {
  id: string;
  accommodation_id: string;
  room_label: string;
  bed_count: number;
  bed_1_assignee: string | null;
  bed_2_assignee: string | null;
  bed_3_assignee: string | null;
  bed_4_assignee: string | null;
  notes: string | null;
  position: number;
}

export interface StaffPickOption {
  id: string;
  name: string;
  home_location: string | null;
  confirmed: boolean | null;
}

interface Props {
  festivalId: string;
  festivalSlug: string;
  booking: AccommodationRow;
  rooms: AccommodationRoomRow[];
  staffList?: StaffPickOption[];
  /** lowercased assignee name -> "Booking · Room X · Bed Y" */
  assignmentMap?: Map<string, string>;
}

const PAYMENT_OPTIONS = [
  { value: "not_paid", label: "Not paid" },
  { value: "deposit_paid", label: "Deposit paid" },
  { value: "paid_in_full", label: "Paid" },
  { value: "invoiced", label: "Invoiced" },
];

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function nightsBetween(a: string | null, b: string | null) {
  if (!a || !b) return 0;
  const d1 = new Date(a + "T00:00:00").getTime();
  const d2 = new Date(b + "T00:00:00").getTime();
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}

function InlineText({
  value, onSave, placeholder, className,
}: { value: string | null; onSave: (v: string | null) => void; placeholder?: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? "");
  if (!editing) {
    return (
      <button onClick={() => { setV(value ?? ""); setEditing(true); }}
        className={cn("hover:underline text-left truncate w-full", className)}>
        {value || <span className="text-muted-foreground">{placeholder ?? "—"}</span>}
      </button>
    );
  }
  return (
    <Input autoFocus value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); onSave(v.trim() === "" ? null : v.trim()); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={cn("h-7 text-sm", className)} />
  );
}

function InlineDate({
  value, onSave,
}: { value: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? "");
  if (!editing) {
    return (
      <button onClick={() => { setV(value ?? ""); setEditing(true); }}
        className="hover:underline text-left tabular-nums">
        {fmtDate(value)}
      </button>
    );
  }
  return (
    <Input type="date" autoFocus value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); onSave(v === "" ? null : v); }}
      className="h-7 text-sm" />
  );
}

function InlineNumber({
  value, onSave, suffix,
}: { value: number | null; onSave: (v: number | null) => void; suffix?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value?.toString() ?? "");
  if (!editing) {
    return (
      <button onClick={() => { setV(value?.toString() ?? ""); setEditing(true); }}
        className="hover:underline text-left">
        {value != null ? `${value}${suffix ?? ""}` : "—"}
      </button>
    );
  }
  return (
    <Input type="number" step="1" autoFocus value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); onSave(v === "" ? null : parseFloat(v)); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-7 text-sm" />
  );
}

function BedInput({
  value, onSave, label,
}: { value: string | null; onSave: (v: string | null) => void; label: string }) {
  const [v, setV] = useState(value ?? "");
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const next = v.trim() === "" ? null : v.trim();
          if ((next ?? "") !== (value ?? "")) onSave(next);
        }}
        placeholder="Assign…"
        className="bg-transparent border-0 focus:bg-muted px-2 py-0.5 rounded text-sm w-28 outline-none"
      />
    </div>
  );
}

function BedPicker({
  value, onSave, label, staffList, assignmentMap,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  label: string;
  staffList: StaffPickOption[];
  assignmentMap: Map<string, string>;
}) {
  const current = value?.trim() || "";
  const currentLower = current.toLowerCase();
  const matchesStaff = staffList.some((s) => s.name.trim().toLowerCase() === currentLower);
  const orphan = current && !matchesStaff;

  // collect non-staff assignees across all bookings (e.g. legacy free-text names)
  const nonStaffAssigned = Array.from(assignmentMap.keys()).filter(
    (k) => !staffList.some((s) => s.name.trim().toLowerCase() === k)
  );

  const selectValue = current ? `__name__:${current}` : "__empty__";

  return (
    <div className="flex items-center gap-1 text-sm min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "__empty__") return onSave(null);
          const name = v.startsWith("__name__:") ? v.slice(9) : v;
          onSave(name);
        }}
      >
        <SelectTrigger
          className={cn(
            "h-7 text-sm min-w-[7rem] max-w-[10rem] border-0 bg-transparent focus:bg-muted px-2 py-0",
            !current && "text-muted-foreground",
            orphan && "text-destructive font-medium"
          )}
        >
          <SelectValue placeholder="Assign…">
            {current ? (
              <span className={cn("truncate", orphan && "line-through")}>{current}</span>
            ) : (
              <span className="italic">Assign…</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="__empty__">
            <span className="italic text-muted-foreground">— Clear —</span>
          </SelectItem>
          {staffList.map((s) => {
            const lower = s.name.trim().toLowerCase();
            const assignedTo = assignmentMap.get(lower);
            const isCurrent = lower === currentLower;
            const isElsewhere = !!assignedTo && !isCurrent;
            return (
              <SelectItem key={s.id} value={`__name__:${s.name}`}>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full shrink-0",
                      s.confirmed ? "bg-emerald-500" : "bg-amber-400"
                    )}
                  />
                  <span className={isElsewhere ? "text-destructive line-through" : ""}>
                    {s.name}
                  </span>
                  {isElsewhere && (
                    <span className="text-[10px] text-destructive ml-1">({assignedTo})</span>
                  )}
                  {s.home_location && !isElsewhere && (
                    <span className="text-[10px] text-muted-foreground ml-1">{s.home_location}</span>
                  )}
                </span>
              </SelectItem>
            );
          })}
          {nonStaffAssigned.length > 0 && (
            <>
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-destructive border-t mt-1">
                Outside staff list
              </div>
              {nonStaffAssigned.map((n) => {
                const display = n; // already lowercased; use raw mapped value
                return (
                  <SelectItem key={`other:${n}`} value={`__name__:${display}`}>
                    <span className="text-destructive">{display}</span>
                    <span className="text-[10px] text-destructive ml-2">
                      ({assignmentMap.get(n)})
                    </span>
                  </SelectItem>
                );
              })}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AccommodationBookingCard({
  festivalId, festivalSlug, booking, rooms, staffList = [], assignmentMap,
}: Props) {
  const effectiveAssignmentMap = assignmentMap ?? new Map<string, string>();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [notesDraft, setNotesDraft] = useState(booking.notes ?? "");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const beds_total = rooms.reduce((s, r) => s + (r.bed_count ?? 0), 0);
  const beds_assigned = rooms.reduce((s, r) => {
    const c = r.bed_count ?? 0;
    let n = 0;
    if (c >= 1 && r.bed_1_assignee) n++;
    if (c >= 2 && r.bed_2_assignee) n++;
    if (c >= 3 && r.bed_3_assignee) n++;
    if (c >= 4 && r.bed_4_assignee) n++;
    return s + n;
  }, 0);

  const status = computeBookingStatus({
    payment_status: booking.payment_status,
    room_count: booking.room_count,
    rooms_created: rooms.length,
    beds_assigned,
    beds_total,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["accommodation-page", festivalSlug] });
  };

  const updateBooking = useMutation({
    mutationFn: async (patch: Partial<AccommodationRow>) => {
      const { error } = await sb.from("festival_accommodation").update(patch).eq("id", booking.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const updateRoom = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AccommodationRoomRow> }) => {
      const { error } = await sb.from("festival_accommodation_room").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const generateRooms = useMutation({
    mutationFn: async () => {
      const target = booking.room_count ?? 0;
      const existing = rooms.length;
      const beds = booking.beds_per_room ?? 2;
      const toMake = Math.max(0, target - existing);
      if (toMake === 0) return;
      const inserts = Array.from({ length: toMake }, (_, i) => ({
        accommodation_id: booking.id,
        room_label: `Room ${existing + i + 1}`,
        bed_count: beds,
        position: existing + i,
      }));
      const { error } = await sb.from("festival_accommodation_room").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rooms generated"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const addRoom = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("festival_accommodation_room").insert({
        accommodation_id: booking.id,
        room_label: `Room ${rooms.length + 1}`,
        bed_count: booking.beds_per_room ?? 2,
        position: rooms.length,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const deleteRoom = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("festival_accommodation_room").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("festival_accommodation").delete().eq("id", booking.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Booking deleted"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${festivalId}/${booking.id}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("festival-accommodation-docs").upload(path, file);
      if (upErr) throw upErr;
      await sb.from("festival_accommodation").update({
        booking_file_path: path,
        confirmation_pdf_uploaded_at: new Date().toISOString(),
      }).eq("id", booking.id);
      toast.success("Uploaded — parsing with AI…");
      invalidate();

      try {
        const { data: signed } = await supabase.storage.from("festival-accommodation-docs").createSignedUrl(path, 600);
        if (signed?.signedUrl) {
          // Fetch festival dates so the AI can resolve year-less dates correctly
          const { data: fest } = await sb.from("festivals")
            .select("start_date,end_date,name").eq("id", festivalId).maybeSingle();
          const { data: parsed } = await supabase.functions.invoke("parse-document", {
            body: {
              fileUrl: signed.signedUrl,
              documentType: "accommodation",
              context: fest ? {
                festival_name: fest.name,
                festival_start: fest.start_date,
                festival_end: fest.end_date,
              } : undefined,
            },
          });
          if (parsed?.ok && parsed.parsed) {
            const p = parsed.parsed as any;
            const upd: any = { last_parsed_at: new Date().toISOString() };
            if (!booking.provider_name && p.hotel_name) upd.provider_name = p.hotel_name;
            if (!booking.address && p.address) upd.address = p.address;
            const ci = toIsoDate(p.checkin_date);
            const co = toIsoDate(p.checkout_date);
            if (ci && (!booking.check_in_date || booking.check_in_date !== ci)) upd.check_in_date = ci;
            if (co && (!booking.check_out_date || booking.check_out_date !== co)) upd.check_out_date = co;
            // Overwrite room_count when AI returns a higher/different valid value (default of 1 should not block real extractions)
            if (p.room_count != null && p.room_count > 0 && p.room_count !== booking.room_count) {
              upd.room_count = p.room_count;
            }
            if (p.beds_per_room != null && p.beds_per_room > 0) {
              // Floor at 2 — every room has at least 2 beds in our operation
              const beds = Math.max(2, Number(p.beds_per_room));
              if (beds !== booking.beds_per_room) upd.beds_per_room = beds;
            }
            if (!booking.confirmation_number && p.booking_reference) upd.confirmation_number = p.booking_reference;
            if (booking.cost_dkk == null && p.cost_total != null) upd.cost_dkk = p.cost_total;
            if (!booking.currency && p.currency) upd.currency = p.currency;
            const summaryParts: string[] = [];
            if (Array.isArray(p.guest_names) && p.guest_names.length > 0) {
              summaryParts.push(`Guests: ${p.guest_names.join(", ")}`);
            }
            if (p.raw_notes) summaryParts.push(String(p.raw_notes));
            if (summaryParts.length > 0) upd.parse_summary = summaryParts.join(" · ").slice(0, 800);
            // Store full parsed data including AI evidence for verification panel
            upd.parsed_data = p;
            await sb.from("festival_accommodation").update(upd).eq("id", booking.id);
            toast.success("AI parse complete — please review");
            invalidate();
          }
        }
      } catch (pe: any) {
        console.warn("parse-document failed", pe);
        toast.message("Uploaded — AI parse skipped");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const openDoc = async () => {
    if (!booking.booking_file_path) return;
    const { data } = await supabase.storage.from("festival-accommodation-docs")
      .createSignedUrl(booking.booking_file_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const targetRooms = booking.room_count ?? 0;
  const needsGeneration = targetRooms > 0 && rooms.length === 0;
  const partialGeneration = targetRooms > rooms.length && rooms.length > 0;
  const nights = nightsBetween(booking.check_in_date, booking.check_out_date);
  const currency = booking.currency || "DKK";

  const printAllocation = () => {
    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
      );
    const title = booking.provider_name?.trim() || "Accommodation booking";
    const subtitle = [
      booking.address,
      [fmtDate(booking.check_in_date), fmtDate(booking.check_out_date)].filter(Boolean).join(" → "),
      nights ? `${nights} night${nights === 1 ? "" : "s"}` : "",
      booking.confirmation_number ? `Ref ${booking.confirmation_number}` : "",
    ].filter(Boolean).join(" · ");

    const sorted = [...rooms].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const rowsHtml = sorted.map((r) => {
      const beds = Array.from({ length: r.bed_count }).map((_, i) => {
        const key = (`bed_${i + 1}_assignee`) as keyof AccommodationRoomRow;
        const v = (r[key] as string | null)?.trim() || "—";
        return `<div class="bed"><span class="bedlbl">Bed ${i + 1}</span><span class="bedval">${esc(v)}</span></div>`;
      }).join("");
      return `
        <tr>
          <td class="rmlbl">${esc(r.room_label || "Room")}</td>
          <td class="beds">${beds}</td>
        </tr>`;
    }).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — Room allocation</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #555; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; border-bottom: 2px solid #333; }
  .rmlbl { font-weight: 600; width: 120px; }
  .beds { display: flex; flex-wrap: wrap; gap: 8px 24px; }
  .bed { display: flex; flex-direction: column; min-width: 140px; }
  .bedlbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; }
  .bedval { font-size: 14px; }
  .summary { margin-top: 20px; font-size: 11px; color: #555; }
  @media print { body { margin: 16mm; } button { display: none; } }
</style></head><body>
  <h1>${esc(title)} — Room allocation</h1>
  <div class="sub">${esc(subtitle)}</div>
  <table>
    <thead><tr><th>Room</th><th>Bed assignments</th></tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="2" style="color:#888;padding:20px;text-align:center">No rooms yet</td></tr>`}</tbody>
  </table>
  <div class="summary">${beds_assigned} of ${beds_total} beds assigned · ${sorted.length} room${sorted.length === 1 ? "" : "s"}</div>
  <script>window.onload=()=>{window.print();}</script>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { toast.error("Pop-up blocked — allow pop-ups to print"); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };


  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
            <BedDouble className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <InlineText
              value={booking.provider_name}
              onSave={(v) => updateBooking.mutate({ provider_name: v })}
              placeholder="Untitled booking"
              className="!text-xl !font-bold"
            />
            <p className="text-xs text-muted-foreground capitalize">{booking.accommodation_type.replace(/_/g, " ")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn(
            "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border",
            ACC_STATUS_PILL[status.status],
          )}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Check-in</div>
          <InlineDate value={booking.check_in_date} onSave={(v) => updateBooking.mutate({ check_in_date: v })} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Check-out</div>
          <InlineDate value={booking.check_out_date} onSave={(v) => updateBooking.mutate({ check_out_date: v })} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Nights</div>
          <div className="tabular-nums">{nights || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Cost</div>
          <div className="tabular-nums flex items-baseline gap-1">
            <InlineNumber value={booking.cost_dkk} onSave={(v) => updateBooking.mutate({ cost_dkk: v })} />
            {booking.cost_dkk != null && <span className="text-xs text-muted-foreground">{currency}</span>}
          </div>
        </div>
      </div>

      {/* Address + ref */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="md:col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Address</div>
          <InlineText value={booking.address} onSave={(v) => updateBooking.mutate({ address: v })} placeholder="Add address…" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Booking ref</div>
          <InlineText value={booking.confirmation_number} onSave={(v) => updateBooking.mutate({ confirmation_number: v })} placeholder="—" />
        </div>
      </div>

      {/* Rooms section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">
            Rooms ({rooms.length}{targetRooms > 0 ? ` / ${targetRooms}` : ""})
          </h4>
          <div className="flex gap-1">
            {rooms.length > 0 && (
              <Button size="sm" variant="outline" className="h-7" onClick={printAllocation}>
                <Printer className="h-3 w-3" /> Print
              </Button>
            )}
            {partialGeneration && (
              <Button size="sm" variant="outline" className="h-7" onClick={() => generateRooms.mutate()} disabled={generateRooms.isPending}>
                <Plus className="h-3 w-3" /> Generate {targetRooms - rooms.length} more
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7" onClick={() => addRoom.mutate()} disabled={addRoom.isPending}>
              <Plus className="h-3 w-3" /> Add room
            </Button>
          </div>

        </div>

        {needsGeneration ? (
          <button
            onClick={() => generateRooms.mutate()}
            disabled={generateRooms.isPending}
            className="w-full rounded-xl border-2 border-dashed border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10 p-4 text-sm text-blue-700 dark:text-blue-300 transition flex items-center justify-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Generate {targetRooms} rooms with {booking.beds_per_room ?? 2} beds each
          </button>
        ) : rooms.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
            No rooms yet. Set "Rooms expected" below or click "Add room".
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <div key={room.id} className="group rounded-lg border p-3 flex items-center gap-3 hover:bg-muted/30">
                <div className="font-medium text-sm w-20 shrink-0">
                  <InlineText value={room.room_label} onSave={(v) => updateRoom.mutate({ id: room.id, patch: { room_label: v ?? "Room" } })} />
                </div>
                <div className="flex flex-wrap gap-3 flex-1">
                  {Array.from({ length: room.bed_count }).map((_, i) => {
                    const key = (`bed_${i + 1}_assignee`) as keyof AccommodationRoomRow;
                    return (
                      <BedPicker
                        key={i}
                        label={`Bed ${i + 1}`}
                        value={(room[key] as string | null) ?? null}
                        onSave={(v) => updateRoom.mutate({ id: room.id, patch: { [key]: v } as any })}
                        staffList={staffList}
                        assignmentMap={effectiveAssignmentMap}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    title="Adjust bed count"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const nextStr = window.prompt("Bed count for this room (1-4)", String(room.bed_count));
                      if (!nextStr) return;
                      const n = Math.max(1, Math.min(4, parseInt(nextStr, 10) || room.bed_count));
                      updateRoom.mutate({ id: room.id, patch: { bed_count: n } });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Delete room"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteRoom.mutate(room.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Room expectations */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Rooms expected</div>
          <InlineNumber value={booking.room_count} onSave={(v) => updateBooking.mutate({ room_count: v ?? 0 })} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Beds per room</div>
          <InlineNumber value={booking.beds_per_room} onSave={(v) => updateBooking.mutate({ beds_per_room: v ?? 2 })} />
        </div>
      </div>

      {/* AI extraction evidence panel */}
      {booking.parsed_data?._extraction_evidence && (
        <div className="rounded-lg border border-blue-200/60 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800/40">
          <button
            onClick={() => setShowEvidence((s) => !s)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-blue-800 dark:text-blue-300">
                AI matched {booking.parsed_data._extraction_evidence.evidence_type === "explicit_label"
                  ? "an explicit label"
                  : booking.parsed_data._extraction_evidence.evidence_type === "room_descriptions"
                    ? "room descriptions"
                    : "no room count signal"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                → room_count = {booking.room_count ?? "null"}
              </span>
            </div>
            {showEvidence ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {showEvidence && (
            <div className="px-3 pb-3 space-y-2 text-sm">
              {booking.parsed_data._extraction_evidence.matched_text && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Matched text</div>
                  <code className="block bg-white dark:bg-black/30 rounded px-2 py-1 text-xs font-mono text-blue-800 dark:text-blue-300 border border-blue-200/50">
                    {booking.parsed_data._extraction_evidence.matched_text}
                  </code>
                </div>
              )}
              {booking.parsed_data._extraction_evidence.matched_sections && booking.parsed_data._extraction_evidence.matched_sections.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Counted sections</div>
                  <ul className="space-y-1">
                    {booking.parsed_data._extraction_evidence.matched_sections.map((section, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                        <span className="font-mono text-blue-800 dark:text-blue-300">{section}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setShowEvidence(false)}
                >
                  <EyeOff className="h-3 w-3 mr-1" /> Hide
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload zone */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Booking confirmation PDF / email</h4>
        {booking.booking_file_path ? (
          <div className="rounded-lg border p-2 flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{booking.booking_file_path.split("/").pop()}</span>
              {booking.last_parsed_at && (
                <span className="text-[10px] text-muted-foreground italic">· AI parsed {timeAgo(booking.last_parsed_at)}</span>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={openDoc}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2"
                onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace"}
              </Button>
            </div>
            <input ref={fileRef} type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.eml,application/pdf,image/*"
              className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        ) : (
          <label
            className="block border-2 border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); }}
          >
            <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
            {uploading ? "Uploading…" : "Drop confirmation — AI extracts hotel, dates, room count, cost, booking reference"}
            <input type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.eml,application/pdf,image/*"
              className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        )}
      </div>

      {/* Payment + notes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Payment status</div>
          <Select value={booking.payment_status} onValueChange={(v) => updateBooking.mutate({ payment_status: v })}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => {
              if (notesDraft !== (booking.notes ?? "")) updateBooking.mutate({ notes: notesDraft || null });
            }}
            placeholder="Special requests, breakfast included, parking, etc."
            rows={2}
          />
        </div>
      </div>

      {booking.parse_summary && (
        <div className="text-[11px] text-muted-foreground italic border-l-2 border-blue-500/40 pl-2">
          AI summary: {booking.parse_summary}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t text-xs">
        <span className="text-muted-foreground italic">
          {booking.last_parsed_at ? `AI parsed ${timeAgo(booking.last_parsed_at)}` : ""}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7" disabled={!booking.booking_file_path} onClick={openDoc}>
            Download confirmation
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also remove all rooms and bed assignments for "{booking.provider_name ?? "this booking"}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => del.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
