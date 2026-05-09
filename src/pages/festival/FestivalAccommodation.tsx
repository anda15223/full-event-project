import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileDown, Plus, MapPin, Phone, Mail, Pencil, Copy, Trash2, Upload, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateRange } from "@/lib/dateFormat";
import {
  ACC_TYPES, ACC_TYPE_LABEL, ACC_TYPE_ICON, PAYMENT_STATUSES, PAYMENT_LABEL, paymentClasses,
  AMENITIES, AMENITY_LABEL, nightsBetween, type AccType, type PaymentStatus,
} from "@/lib/accommodation";

const sb = supabase as any;

export default function FestivalAccommodation() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();

  const { data: festival } = useQuery({
    queryKey: ["festival", slug],
    queryFn: async () => {
      const { data } = await supabase.from("festivals")
        .select("id,slug,name,start_date,end_date").eq("slug", slug).maybeSingle();
      return data;
    },
  });
  const festivalId = festival?.id ?? "";

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["festival-accommodation", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data } = await sb.from("festival_accommodation").select("*").eq("festival_id", festivalId).order("check_in_date", { ascending: true });
      return data ?? [];
    },
  });

  const [filterType, setFilterType] = useState<string>("all");
  const [filterPay, setFilterPay] = useState<string>("all");
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r: any) =>
      (filterType === "all" || r.accommodation_type === filterType) &&
      (filterPay === "all" || r.payment_status === filterPay)
    );
  }, [rows, filterType, filterPay]);

  const totals = useMemo(() => {
    const cap = rows.reduce((s: number, r: any) => s + (r.capacity ?? 0), 0);
    const assigned = rows.reduce((s: number, r: any) => s + (r.assigned_staff_count ?? r.assigned_staff?.length ?? 0), 0);
    const cost = rows.reduce((s: number, r: any) => s + Number(r.cost_dkk ?? 0), 0);
    const unpaid = rows.filter((r: any) => r.payment_status === "not_paid").length;
    return { cap, assigned, cost, unpaid };
  }, [rows]);

  const updateRow = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await sb.from("festival_accommodation").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["festival-accommodation", festivalId] }); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const createRow = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await sb.from("festival_accommodation").insert({ ...patch, festival_id: festivalId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Added"); qc.invalidateQueries({ queryKey: ["festival-accommodation", festivalId] }); setCreating(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const dupRow = async (r: any) => {
    const { id, created_at, updated_at, ...rest } = r;
    await sb.from("festival_accommodation").insert({ ...rest, provider_name: (r.provider_name ?? "") + " (copy)" });
    toast.success("Duplicated");
    refetch();
  };
  const deleteRow = async (id: string) => {
    if (!confirm("Delete this booking?")) return;
    await sb.from("festival_accommodation").delete().eq("id", id);
    toast.success("Deleted");
    refetch();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link to={`/festivals/${slug}`} className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />Back to overview
        </Link>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline"><Link to={`/festivals/${slug}/accommodation/export`}><FileDown className="h-4 w-4 mr-1"/>Export PDF</Link></Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1"/>Add accommodation</Button>
        </div>
      </div>

      <header className="rounded-2xl border bg-card p-5">
        <h1 className="text-2xl font-semibold">Accommodation — {festival?.name}</h1>
        <p className="text-sm text-muted-foreground">{festival && formatDateRange(festival.start_date, festival.end_date)}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Stat label="Bookings" value={rows.length} />
          <Stat label="Total beds/capacity" value={totals.cap} />
          <Stat label="Assigned staff" value={totals.assigned} warn={totals.assigned > totals.cap} />
          <Stat label="Total cost" value={`${totals.cost.toLocaleString("da-DK")} DKK`} />
          <Stat label="Unpaid" value={totals.unpaid} warn={totals.unpaid > 0} />
        </div>
      </header>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ACC_TYPES.map(t => <SelectItem key={t} value={t}>{ACC_TYPE_ICON[t]} {ACC_TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Payment</Label>
          <Select value={filterPay} onValueChange={setFilterPay}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment</SelectItem>
              {PAYMENT_STATUSES.map(p => <SelectItem key={p} value={p}>{PAYMENT_LABEL[p]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filtered.map((r: any) => <BookingCard key={r.id} r={r} festival={festival}
          onEdit={() => setEditing(r)} onDup={() => dupRow(r)} onDelete={() => deleteRow(r.id)}
          onPaid={() => updateRow.mutate({ id: r.id, patch: { payment_status: "paid_in_full" } })}
          onRefresh={refetch}
        />)}
        {filtered.length === 0 && <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">No bookings.</CardContent></Card>}
      </div>

      {(editing || creating) && (
        <BookingDrawer
          row={editing ?? {}}
          festival={festival}
          isNew={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={(patch) => editing ? updateRow.mutate({ id: editing.id, patch }) : createRow.mutate(patch)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: any; warn?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2 bg-card", warn && "border-amber-300 bg-amber-50")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

function BookingCard({ r, festival, onEdit, onDup, onDelete, onPaid, onRefresh }: {
  r: any; festival: any; onEdit: () => void; onDup: () => void; onDelete: () => void; onPaid: () => void; onRefresh: () => void;
}) {
  const nights = nightsBetween(r.check_in_date, r.check_out_date);
  const fileRef = useRef<HTMLInputElement>(null);

  const warnings: string[] = [];
  if (festival?.start_date && r.check_in_date && r.check_in_date > festival.start_date) warnings.push("Booking starts after festival opens");
  if (festival?.end_date && r.check_out_date && r.check_out_date < festival.end_date) warnings.push("Booking ends before festival ends");
  if ((r.assigned_staff_count ?? r.assigned_staff?.length ?? 0) > (r.capacity ?? 0) && r.capacity) warnings.push("Assigned exceeds capacity");
  if (r.payment_status === "not_paid" && r.check_in_date) {
    const days = Math.ceil((new Date(r.check_in_date).getTime() - Date.now())/(1000*60*60*24));
    if (days >= 0 && days <= 30) warnings.push(`Unpaid — check-in in ${days}d`);
  }

  const uploadConf = async (f: File) => {
    if (!festival) return;
    if (f.size > 10*1024*1024) { toast.error("Max 10MB"); return; }
    const path = `${festival.slug}/${r.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g,"_")}`;
    const { error } = await supabase.storage.from("festival-accommodation-docs").upload(path, f, { upsert: true });
    if (error) { toast.error(error.message); return; }
    await sb.from("festival_accommodation").update({ booking_file_path: path }).eq("id", r.id);
    toast.success("Uploaded");
    onRefresh();
  };
  const viewConf = async () => {
    const { data } = await supabase.storage.from("festival-accommodation-docs").createSignedUrl(r.booking_file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl">{ACC_TYPE_ICON[r.accommodation_type as AccType]}</span>
              <h3 className="font-semibold text-lg">{r.provider_name || "—"}</h3>
              <Badge variant="outline" className="text-[10px]">{ACC_TYPE_LABEL[r.accommodation_type as AccType]}</Badge>
              <span className={cn("inline-flex items-center text-[10px] uppercase font-semibold px-2 py-0.5 rounded border", paymentClasses(r.payment_status))}>
                {PAYMENT_LABEL[r.payment_status as PaymentStatus]}
              </span>
            </div>
            {r.address && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent(r.address)}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1">
                <MapPin className="h-3 w-3" />{r.address}
              </a>
            )}
            <div className="text-sm mt-1">
              {r.check_in_date && r.check_out_date ? formatDateRange(r.check_in_date, r.check_out_date) : "Dates TBD"}
              {nights > 0 && <span className="text-muted-foreground"> · {nights} nights</span>}
              {(r.check_in_time || r.check_out_time) && <span className="text-muted-foreground text-xs"> · in {r.check_in_time ?? "?"} / out {r.check_out_time ?? "?"}</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm">Cap: <strong>{r.capacity ?? "—"}</strong></div>
            <div className="text-sm">Cost: <strong>{r.cost_dkk ? `${Number(r.cost_dkk).toLocaleString("da-DK")} DKK` : "—"}</strong></div>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {warnings.map(w => <div key={w}>⚠️ {w}</div>)}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Booking</div>
            <div>Conf #: {r.confirmation_number || "—"}</div>
            <div>By: {r.booking_made_by || "—"}</div>
            <div className="flex items-center gap-2 mt-1">
              {r.booking_file_path
                ? <Button size="sm" variant="outline" onClick={viewConf}><FileText className="h-3 w-3 mr-1"/>View confirmation</Button>
                : <span className="text-xs text-muted-foreground italic">No confirmation file</span>}
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => e.target.files?.[0] && uploadConf(e.target.files[0])} />
              <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}><Upload className="h-3 w-3 mr-1"/>{r.booking_file_path ? "Replace" : "Upload"}</Button>
              {r.payment_status !== "paid_in_full" && <Button size="sm" variant="outline" onClick={onPaid}>Mark paid</Button>}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Contact</div>
            <div>{r.contact_name || "—"}</div>
            <div className="flex gap-3 text-xs mt-1">
              {r.contact_phone && <a href={`tel:${r.contact_phone}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Phone className="h-3 w-3"/>{r.contact_phone}</a>}
              {r.contact_email && <a href={`mailto:${r.contact_email}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Mail className="h-3 w-3"/>{r.contact_email}</a>}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1">Assigned staff ({r.assigned_staff_count ?? r.assigned_staff?.length ?? 0})</div>
          <div className="flex flex-wrap gap-1">
            {(r.assigned_staff ?? []).map((n: string) => <Badge key={n} variant="secondary" className="text-xs">{n}</Badge>)}
            {(!r.assigned_staff || r.assigned_staff.length === 0) && <span className="text-xs text-muted-foreground italic">No names yet — full Staff app coming soon</span>}
          </div>
        </div>

        {(r.amenities?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {r.amenities.map((a: string) => <Badge key={a} variant="outline" className="text-xs">{AMENITY_LABEL[a] ?? a}</Badge>)}
          </div>
        )}

        {r.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap border-t pt-2">{r.notes}</p>}

        <div className="flex justify-end gap-1 border-t pt-2">
          <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3 w-3 mr-1"/>Edit</Button>
          {r.contact_phone && <Button size="sm" variant="ghost" asChild><a href={`tel:${r.contact_phone}`}><Phone className="h-3 w-3 mr-1"/>Call</a></Button>}
          {r.contact_email && <Button size="sm" variant="ghost" asChild><a href={`mailto:${r.contact_email}`}><Mail className="h-3 w-3 mr-1"/>Email</a></Button>}
          <Button size="sm" variant="ghost" onClick={onDup}><Copy className="h-3 w-3 mr-1"/>Duplicate</Button>
          <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3 w-3 mr-1 text-red-600"/>Delete</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BookingDrawer({ row, festival, isNew, onClose, onSave }: {
  row: any; festival: any; isNew: boolean; onClose: () => void; onSave: (patch: any) => void;
}) {
  const [d, setD] = useState<any>(row);
  const set = (p: any) => setD({ ...d, ...p });
  const nights = nightsBetween(d.check_in_date, d.check_out_date);
  const perNight = d.cost_dkk && nights > 0 ? Math.round(Number(d.cost_dkk) / nights) : null;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>{isNew ? "Add accommodation" : "Edit accommodation"}</SheetTitle></SheetHeader>
        <div className="space-y-3 py-4">
          <FRow>
            <FF label="Type">
              <Select value={d.accommodation_type ?? "hotel"} onValueChange={(v) => set({ accommodation_type: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{ACC_TYPES.map(t => <SelectItem key={t} value={t}>{ACC_TYPE_ICON[t]} {ACC_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </FF>
            <FF label="Payment">
              <Select value={d.payment_status ?? "not_paid"} onValueChange={(v) => set({ payment_status: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_STATUSES.map(p => <SelectItem key={p} value={p}>{PAYMENT_LABEL[p]}</SelectItem>)}</SelectContent>
              </Select>
            </FF>
          </FRow>
          <FF label="Provider"><Input value={d.provider_name ?? ""} onChange={e => set({ provider_name: e.target.value })} /></FF>
          <FF label="Address"><Input value={d.address ?? ""} onChange={e => set({ address: e.target.value })} /></FF>
          <FRow>
            <FF label="Check-in date"><Input type="date" value={d.check_in_date ?? ""} onChange={e => set({ check_in_date: e.target.value || null })} /></FF>
            <FF label="Check-in time"><Input type="time" value={d.check_in_time ?? ""} onChange={e => set({ check_in_time: e.target.value || null })} /></FF>
          </FRow>
          <FRow>
            <FF label="Check-out date"><Input type="date" value={d.check_out_date ?? ""} onChange={e => set({ check_out_date: e.target.value || null })} /></FF>
            <FF label="Check-out time"><Input type="time" value={d.check_out_time ?? ""} onChange={e => set({ check_out_time: e.target.value || null })} /></FF>
          </FRow>
          <FRow>
            <FF label="Capacity"><Input type="number" value={d.capacity ?? ""} onChange={e => set({ capacity: e.target.value ? Number(e.target.value) : null })} /></FF>
            <FF label="Assigned count"><Input type="number" value={d.assigned_staff_count ?? ""} onChange={e => set({ assigned_staff_count: e.target.value ? Number(e.target.value) : null })} /></FF>
            <FF label="Cost (DKK)">
              <Input type="number" value={d.cost_dkk ?? ""} onChange={e => set({ cost_dkk: e.target.value ? Number(e.target.value) : null })} />
              {perNight && <p className="text-[10px] text-muted-foreground mt-1">≈ {perNight} DKK/night × {nights}</p>}
            </FF>
          </FRow>
          <FF label="Assigned staff (comma-separated)">
            <Input value={(d.assigned_staff ?? []).join(", ")} onChange={e => set({ assigned_staff: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} />
          </FF>
          <FRow>
            <FF label="Confirmation #"><Input value={d.confirmation_number ?? ""} onChange={e => set({ confirmation_number: e.target.value })} /></FF>
            <FF label="Booking made by"><Input value={d.booking_made_by ?? ""} onChange={e => set({ booking_made_by: e.target.value })} /></FF>
          </FRow>
          <FRow>
            <FF label="Contact name"><Input value={d.contact_name ?? ""} onChange={e => set({ contact_name: e.target.value })} /></FF>
            <FF label="Contact phone"><Input value={d.contact_phone ?? ""} onChange={e => set({ contact_phone: e.target.value })} /></FF>
            <FF label="Contact email"><Input type="email" value={d.contact_email ?? ""} onChange={e => set({ contact_email: e.target.value })} /></FF>
          </FRow>
          <div>
            <Label className="text-xs">Amenities</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {AMENITIES.map(a => {
                const on = (d.amenities ?? []).includes(a);
                return (
                  <button key={a} type="button"
                    onClick={() => set({ amenities: on ? d.amenities.filter((x: string) => x !== a) : [...(d.amenities ?? []), a] })}
                    className={cn("text-xs px-2 py-1 rounded border", on ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border")}>
                    {AMENITY_LABEL[a]}
                  </button>
                );
              })}
            </div>
          </div>
          <FF label="Notes"><Textarea rows={3} value={d.notes ?? ""} onChange={e => set({ notes: e.target.value })} /></FF>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(d)}>{isNew ? "Create" : "Save"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FRow({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>; }
function FF({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>; }
