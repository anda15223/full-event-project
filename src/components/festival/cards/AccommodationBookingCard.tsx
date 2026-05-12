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

interface Props {
  festivalId: string;
  festivalSlug: string;
  booking: AccommodationRow;
  rooms: AccommodationRoomRow[];
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

export function AccommodationBookingCard({
  festivalId, festivalSlug, booking, rooms,
}: Props) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [notesDraft, setNotesDraft] = useState(booking.notes ?? "");
  const [deleteOpen, setDeleteOpen] = useState(false);
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
          const { data: parsed } = await supabase.functions.invoke("parse-document", {
            body: { fileUrl: signed.signedUrl, documentType: "accommodation" },
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
            if ((!booking.room_count || booking.room_count === 0) && p.room_count) upd.room_count = p.room_count;
            if ((!booking.beds_per_room || booking.beds_per_room === 0) && p.beds_per_room) upd.beds_per_room = p.beds_per_room;
            if (!booking.confirmation_number && p.booking_reference) upd.confirmation_number = p.booking_reference;
            if (booking.cost_dkk == null && p.cost_total != null) upd.cost_dkk = p.cost_total;
            if (!booking.currency && p.currency) upd.currency = p.currency;
            const summaryParts: string[] = [];
            if (Array.isArray(p.guest_names) && p.guest_names.length > 0) {
              summaryParts.push(`Guests: ${p.guest_names.join(", ")}`);
            }
            if (p.raw_notes) summaryParts.push(String(p.raw_notes));
            if (summaryParts.length > 0) upd.parse_summary = summaryParts.join(" · ").slice(0, 800);
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
                      <BedInput
                        key={i}
                        label={`Bed ${i + 1}`}
                        value={(room[key] as string | null) ?? null}
                        onSave={(v) => updateRoom.mutate({ id: room.id, patch: { [key]: v } as any })}
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
          <Button asChild size="sm" variant="outline" className="h-7">
            <a href={`/festivals/${festivalSlug}/accommodation/export`} target="_blank" rel="noopener noreferrer">Export report</a>
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
