import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, BedDouble, FileText, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AccommodationBookingCard,
  type AccommodationRow,
  type AccommodationRoomRow,
} from "@/components/festival/cards/AccommodationBookingCard";

const sb = supabase as any;

type Festival = { id: string; slug: string; name: string; start_date: string; end_date: string };

export default function FestivalAccommodation() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals")
        .select("id,slug,name,start_date,end_date").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });

  const festival = festivalQ.data;
  const festivalId = festival?.id ?? "";

  const pageQ = useQuery({
    queryKey: ["accommodation-page", slug],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: bookings, error: be } = await sb.from("festival_accommodation")
        .select("*").eq("festival_id", festivalId)
        .order("check_in_date", { ascending: true, nullsFirst: false });
      if (be) throw be;
      const ids = (bookings ?? []).map((b: any) => b.id);
      let rooms: AccommodationRoomRow[] = [];
      if (ids.length > 0) {
        const { data, error } = await sb.from("festival_accommodation_room")
          .select("*").in("accommodation_id", ids).order("position", { ascending: true });
        if (error) throw error;
        rooms = (data ?? []) as AccommodationRoomRow[];
      }
      return { bookings: (bookings ?? []) as AccommodationRow[], rooms };
    },
  });

  const staffQ = useQuery({
    queryKey: ["accommodation-staff", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await sb.from("festival_staff")
        .select("id, name, home_location, confirmed")
        .eq("festival_id", festivalId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((s: any) => (s.name ?? "").trim()) as {
        id: string; name: string; home_location: string | null; confirmed: boolean | null;
      }[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("festival_accommodation").insert({
        festival_id: festivalId,
        accommodation_type: "hotel",
        payment_status: "not_paid",
        room_count: 1,
        beds_per_room: 2,
        currency: "DKK",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking added");
      qc.invalidateQueries({ queryKey: ["accommodation-page", slug] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add"),
  });

  const groupedRooms = useMemo(() => {
    const map = new Map<string, AccommodationRoomRow[]>();
    (pageQ.data?.rooms ?? []).forEach((r) => {
      const arr = map.get(r.accommodation_id) ?? [];
      arr.push(r);
      map.set(r.accommodation_id, arr);
    });
    return map;
  }, [pageQ.data]);

  // Build a name -> "Room X · Bed Y" map across ALL bookings
  const bookingLabelById = useMemo(() => {
    const m = new Map<string, string>();
    (pageQ.data?.bookings ?? []).forEach((b, i) => {
      m.set(b.id, b.provider_name?.trim() || `Booking ${i + 1}`);
    });
    return m;
  }, [pageQ.data]);

  const assignmentMap = useMemo(() => {
    const m = new Map<string, string>(); // lowercased name -> location label
    (pageQ.data?.rooms ?? []).forEach((r) => {
      const c = r.bed_count ?? 0;
      for (let i = 1; i <= 4; i++) {
        if (i > c) break;
        const key = `bed_${i}_assignee` as keyof AccommodationRoomRow;
        const v = (r[key] as string | null)?.trim();
        if (!v) continue;
        const where = `${bookingLabelById.get(r.accommodation_id) ?? ""} · ${r.room_label} · Bed ${i}`;
        m.set(v.toLowerCase(), where);
      }
    });
    return m;
  }, [pageQ.data, bookingLabelById]);

  const summary = useMemo(() => {
    const bookings = pageQ.data?.bookings ?? [];
    const rooms = pageQ.data?.rooms ?? [];
    const totalNights = bookings.reduce((s, b) => {
      if (!b.check_in_date || !b.check_out_date) return s;
      const d1 = new Date(b.check_in_date + "T00:00:00").getTime();
      const d2 = new Date(b.check_out_date + "T00:00:00").getTime();
      return s + Math.max(0, Math.round((d2 - d1) / 86400000));
    }, 0);
    const beds_total = rooms.reduce((s, r) => s + (r.bed_count ?? 0), 0);
    const beds_assigned = rooms.reduce((s, r) => {
      let n = 0;
      const c = r.bed_count ?? 0;
      if (c >= 1 && r.bed_1_assignee) n++;
      if (c >= 2 && r.bed_2_assignee) n++;
      if (c >= 3 && r.bed_3_assignee) n++;
      if (c >= 4 && r.bed_4_assignee) n++;
      return s + n;
    }, 0);
    const paid_count = bookings.filter((b) => {
      const p = (b.payment_status ?? "").toLowerCase();
      return p === "paid" || p === "paid_in_full";
    }).length;
    const total_cost = bookings.reduce((s, b) => s + Number(b.cost_dkk ?? 0), 0);
    const currency = (bookings.find((b) => b.currency)?.currency) ?? "DKK";

    // Sweep-line: beds per distinct date segment (concurrent occupancy)
    type Seg = { start: string; end: string; beds: number };
    const segments: Seg[] = [];
    const dated = bookings.filter((b) => b.check_in_date && b.check_out_date);
    const breakpoints = Array.from(
      new Set(dated.flatMap((b) => [b.check_in_date!, b.check_out_date!]))
    ).sort();
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const start = breakpoints[i];
      const end = breakpoints[i + 1];
      const beds = dated.reduce((s, b) => {
        const overlaps = b.check_in_date! <= start && b.check_out_date! >= end;
        if (!overlaps) return s;
        const rc = Math.max(1, Number(b.room_count ?? 1));
        const bpr = Math.max(1, Number(b.beds_per_room ?? 2));
        return s + rc * bpr;
      }, 0);
      if (beds > 0) segments.push({ start, end, beds });
    }
    const peak_beds = segments.reduce((m, s) => Math.max(m, s.beds), 0);

    return {
      bookings: bookings.length, totalNights, beds_total, beds_assigned, paid_count, total_cost, currency,
      segments, peak_beds,
    };
  }, [pageQ.data]);

  const fmtRange = (start: string, end: string) => {
    const f = (d: string) => {
      const dt = new Date(d + "T00:00:00");
      return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    };
    return `${f(start)}–${f(end)}`;
  };

  if (festivalQ.isLoading) {
    return <div className="p-6 max-w-6xl mx-auto"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!festival) return <div className="p-6">Festival not found.</div>;

  const daysUntil = (() => {
    if (!festival.start_date) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(festival.start_date + "T00:00:00");
    return Math.ceil((start.getTime() - today.getTime()) / 86400000);
  })();

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> {festival.name}
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <BedDouble className="h-7 w-7 text-blue-500" />
            <h1 className="text-3xl font-bold tracking-tight">Accommodation</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Hotel bookings and bed assignments. AI-parses confirmations and auto-generates rooms. Bed assignment is free-text for now — the upcoming Staff app will replace this with a person picker.
          </p>
        </div>
        {summary.bookings > 0 && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href={`/festivals/${slug}/accommodation/export`} target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4" /> Export full report ({summary.bookings})
            </a>
          </Button>
        )}
      </div>

      {/* Summary pills */}
      {summary.bookings > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
            {summary.bookings} booking{summary.bookings === 1 ? "" : "s"}
          </span>
          {summary.totalNights > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
              🌙 {summary.totalNights} night{summary.totalNights === 1 ? "" : "s"}
            </span>
          )}
          <span
            className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30"
            title="Peak concurrent beds across overlapping bookings (not a sum of sequential periods)"
          >
            🛏 peak {summary.peak_beds || summary.beds_total} bed{(summary.peak_beds || summary.beds_total) === 1 ? "" : "s"}
          </span>
          <span className={
            "px-2.5 py-1 rounded-full border " +
            (summary.beds_total > 0 && summary.beds_assigned === summary.beds_total
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30")
          }>
            ✓ {summary.beds_assigned} / {summary.beds_total} assigned
          </span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            💳 {summary.paid_count} paid
          </span>
          {summary.total_cost > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
              {summary.total_cost.toLocaleString("en-GB")} {summary.currency}
            </span>
          )}
        </div>
      )}

      {/* Per-period bed breakdown */}
      {summary.bookings > 0 && summary.segments.length > 1 && (
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Beds per period (concurrent occupancy — these are sequential, not added together)
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {summary.segments.map((s) => (
              <span
                key={s.start + s.end}
                className={
                  "px-2.5 py-1 rounded-full border " +
                  (s.beds === summary.peak_beds
                    ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40 font-medium"
                    : "bg-background text-foreground/80 border-border")
                }
              >
                {fmtRange(s.start, s.end)}: {s.beds} bed{s.beds === 1 ? "" : "s"}
              </span>
            ))}
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              peak: {summary.peak_beds} bed{summary.peak_beds === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}

      {/* Body */}
      {pageQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map((i) => <Skeleton key={i} className="h-96 w-full" />)}
        </div>
      ) : summary.bookings === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center space-y-4">
          <BedDouble className="h-10 w-10 mx-auto text-muted-foreground" />
          <div>
            <h2 className="text-xl font-bold">No accommodation booked yet</h2>
            {daysUntil != null && (
              <p className="text-sm text-muted-foreground mt-1">
                Festival is in {daysUntil} day{daysUntil === 1 ? "" : "s"}.
              </p>
            )}
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending} size="lg">
            <Plus className="h-4 w-4" /> Add booking
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {pageQ.data!.bookings.map((b) => (
              <AccommodationBookingCard
                key={b.id}
                festivalId={festivalId}
                festivalSlug={slug}
                booking={b}
                rooms={groupedRooms.get(b.id) ?? []}
                staffList={staffQ.data ?? []}
                assignmentMap={assignmentMap}
              />
            ))}
          </div>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="w-full rounded-2xl border-2 border-dashed border-border py-4 text-sm text-muted-foreground hover:bg-muted/30 transition flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add booking
          </button>
        </>
      )}
    </div>
  );
}
