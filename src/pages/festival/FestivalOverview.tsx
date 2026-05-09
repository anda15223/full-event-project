import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AttentionSummaryWidget } from "@/components/attention/AttentionSummaryWidget";
import { FestivalActionItemsStrip } from "@/components/attention/FestivalActionItemsStrip";
import { FestivalQuestionsStrip } from "@/components/attention/FestivalQuestionsStrip";
import { ConceptCardGrid } from "@/components/concept/ConceptCardGrid";
import { ConceptExportMenu } from "@/components/concept/ConceptExportMenu";
import { FestivalRulesBlock } from "@/components/rules/FestivalRulesBlock";
import { FestivalTimelineNextEvents } from "@/components/timeline/FestivalTimelineNextEvents";
import { CONCEPT_EMOJI, ConceptSlug, CONCEPT_LABELS } from "@/components/concept/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Truck, FileText, Calendar, Snowflake, Wrench, Image as ImageIcon, Zap,
  ShieldAlert, FileSignature, BedDouble, Users, ListChecks, UserCog, ShoppingCart,
  Plus, Mail, Phone,
} from "lucide-react";
import { formatDueDate, priorityChipClasses } from "@/lib/attention";
import { getSoborgLoadingManifest } from "@/lib/soborgLoading";

// ---------- helpers ----------

function fmtDateShort(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}
function fmtRange(start: string, end: string) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameYear = s.getFullYear() === e.getFullYear();
  const sFmt = s.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const eFmt = e.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
  return `${sFmt} — ${eFmt}${sameYear ? "" : ""}`;
}
function dateDiffDays(iso: string): number {
  const d = new Date(iso + "T00:00:00");
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}
function dateChipColor(iso: string): string {
  const diff = dateDiffDays(iso);
  if (diff < 0) return "border-destructive/40 bg-destructive/10 text-destructive";
  if (diff <= 7) return "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  if (diff <= 30) return "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300";
  return "border-border bg-muted/40 text-muted-foreground";
}
function fmtTime(t: string | null) {
  if (!t) return "—";
  return t.slice(0, 5);
}

// ---------- Block 3: key dates ----------

interface KeyDate { iso: string; label: string; }

function useKeyDates(festivalId: string | null) {
  return useQuery({
    queryKey: ["festival-key-dates", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const fid = festivalId!;
      const [contracts, facade, setup, actions] = await Promise.all([
        supabase.from("festival_contracts")
          .select("inspection_date, site_clearance_deadline").eq("festival_id", fid),
        supabase.from("festival_facade_status")
          .select("design_deadline, print_deadline, concept:concepts(name)").eq("festival_id", fid),
        supabase.from("festival_setup")
          .select("scheduled_start_at, description").eq("festival_id", fid)
          .not("scheduled_start_at", "is", null)
          .order("scheduled_start_at", { ascending: true }).limit(1),
        supabase.from("festival_action_items")
          .select("title, due_date, priority").eq("festival_id", fid)
          .neq("status", "closed").not("due_date", "is", null)
          .in("priority", ["critical", "high"])
          .order("due_date", { ascending: true }).limit(3),
      ]);

      const out: KeyDate[] = [];
      (contracts.data ?? []).forEach((r: any) => {
        if (r.inspection_date) out.push({ iso: r.inspection_date, label: "Inspection" });
        if (r.site_clearance_deadline) {
          const d = String(r.site_clearance_deadline).slice(0, 10);
          out.push({ iso: d, label: "Site clearance" });
        }
      });
      (facade.data ?? []).forEach((r: any) => {
        const cn = r.concept?.name ? ` (${r.concept.name})` : "";
        if (r.design_deadline) out.push({ iso: r.design_deadline, label: `Facade design${cn}` });
        if (r.print_deadline) out.push({ iso: r.print_deadline, label: `Facade print${cn}` });
      });
      (setup.data ?? []).forEach((r: any) => {
        if (r.scheduled_start_at) {
          out.push({ iso: String(r.scheduled_start_at).slice(0, 10), label: `Setup: ${r.description ?? "start"}` });
        }
      });
      (actions.data ?? []).forEach((r: any) => {
        out.push({ iso: r.due_date, label: r.title });
      });
      return out.sort((a, b) => a.iso.localeCompare(b.iso));
    },
  });
}

// ---------- Block 4: service hours ----------

interface ServiceHourRow {
  id: string;
  service_date: string;
  open_time: string | null;
  close_time: string | null;
  concept_id: string | null;
}

function useServiceHours(festivalId: string | null) {
  return useQuery({
    queryKey: ["festival-service-hours", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_service_hours")
        .select("id, service_date, open_time, close_time, concept_id")
        .eq("festival_id", festivalId!)
        .order("service_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ServiceHourRow[];
    },
  });
}

function ServiceHoursBlock({
  festivalId,
  concepts,
}: {
  festivalId: string;
  concepts: { id: string; slug: ConceptSlug; name: string }[];
}) {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useServiceHours(festivalId);

  const dates = useMemo(() => {
    const set = new Set<string>();
    (rows ?? []).forEach((r) => set.add(r.service_date));
    return Array.from(set).sort();
  }, [rows]);

  const lookup = useMemo(() => {
    const m = new Map<string, ServiceHourRow>();
    (rows ?? []).forEach((r) => m.set(`${r.service_date}|${r.concept_id ?? "__fest"}`, r));
    return m;
  }, [rows]);

  const [addOpen, setAddOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newOpen, setNewOpen] = useState("16:00");
  const [newClose, setNewClose] = useState("02:00");
  const [editing, setEditing] = useState<{
    service_date: string; concept_id: string | null; existingId?: string;
    open_time: string; close_time: string;
  } | null>(null);

  const upsertRow = useMutation({
    mutationFn: async (row: {
      id?: string; service_date: string; concept_id: string | null;
      open_time: string; close_time: string;
    }) => {
      if (row.id) {
        const { error } = await supabase
          .from("festival_service_hours")
          .update({
            open_time: row.open_time, close_time: row.close_time,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("festival_service_hours")
          .insert({
            festival_id: festivalId,
            service_date: row.service_date,
            concept_id: row.concept_id,
            open_time: row.open_time,
            close_time: row.close_time,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["festival-service-hours", festivalId] });
      toast.success("Service hours saved");
      setEditing(null); setAddOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold">Service hours</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="h-4 w-4" /> Add day</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add festival-wide service day</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Date</Label><Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Open</Label><Input type="time" value={newOpen} onChange={(e) => setNewOpen(e.target.value)} /></div>
                <div><Label>Close</Label><Input type="time" value={newClose} onChange={(e) => setNewClose(e.target.value)} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!newDate}
                onClick={() => upsertRow.mutate({
                  service_date: newDate, concept_id: null,
                  open_time: newOpen, close_time: newClose,
                })}
              >Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : dates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No service hours set yet.{" "}
          <button className="text-primary hover:underline" onClick={() => setAddOpen(true)}>
            + Add first day
          </button>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Festival-wide</th>
                {concepts.map((c) => (
                  <th key={c.id} className="py-2 pr-3">
                    {CONCEPT_EMOJI[c.slug]} {CONCEPT_LABELS[c.slug] ?? c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => {
                const fest = lookup.get(`${d}|__fest`);
                return (
                  <tr key={d} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium tabular-nums">{fmtDateShort(d)}</td>
                    <td className="py-2 pr-3">
                      <button
                        className="hover:underline"
                        onClick={() => setEditing({
                          service_date: d, concept_id: null, existingId: fest?.id,
                          open_time: fest?.open_time ?? "16:00",
                          close_time: fest?.close_time ?? "02:00",
                        })}
                      >
                        {fest ? `${fmtTime(fest.open_time)}–${fmtTime(fest.close_time)}` : "+ set"}
                      </button>
                    </td>
                    {concepts.map((c) => {
                      const r = lookup.get(`${d}|${c.id}`);
                      return (
                        <td key={c.id} className="py-2 pr-3">
                          <button
                            className={cn("hover:underline", !r && "text-muted-foreground")}
                            onClick={() => setEditing({
                              service_date: d, concept_id: c.id, existingId: r?.id,
                              open_time: r?.open_time ?? fest?.open_time ?? "16:00",
                              close_time: r?.close_time ?? fest?.close_time ?? "02:00",
                            })}
                          >
                            {r ? `${fmtTime(r.open_time)}–${fmtTime(r.close_time)} (override)` : "(default)"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.concept_id ? "Concept override" : "Festival-wide hours"} — {editing && fmtDateShort(editing.service_date)}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Open</Label><Input type="time" value={editing.open_time} onChange={(e) => setEditing({ ...editing, open_time: e.target.value })} /></div>
              <div><Label>Close</Label><Input type="time" value={editing.close_time} onChange={(e) => setEditing({ ...editing, close_time: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => editing && upsertRow.mutate({
              id: editing.existingId,
              service_date: editing.service_date,
              concept_id: editing.concept_id,
              open_time: editing.open_time,
              close_time: editing.close_time,
            })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------- Block 5: contacts ----------

interface Contact {
  id: string; full_name: string; role: string; organization: string | null;
  email: string | null; phone: string | null; is_primary: boolean;
}

function ContractsMiniBlock({ festivalId, slug }: { festivalId: string; slug: string }) {
  const { data } = useQuery({
    queryKey: ["festival-contracts-mini", festivalId],
    queryFn: async () => {
      const { data } = await supabase.from("festival_contracts")
        .select("contract_status, contract_value_dkk").eq("festival_id", festivalId);
      return data ?? [];
    },
  });
  const counts: Record<string, number> = { signed: 0, pending_signature: 0, in_negotiation: 0, not_started: 0, stalled: 0 };
  let total = 0;
  (data ?? []).forEach((c: any) => {
    counts[c.contract_status] = (counts[c.contract_status] ?? 0) + 1;
    if (c.contract_status !== "cancelled") total += Number(c.contract_value_dkk) || 0;
  });
  const fmt = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(total);
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><FileSignature className="h-4 w-4 text-primary" /> Contracts</h2>
        <Link to={`/festivals/${slug}/contracts`} className="text-xs text-primary hover:underline">View all →</Link>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">✅ {counts.signed} signed</span>
        <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">⏳ {counts.pending_signature} pending</span>
        <span className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300">🔄 {counts.in_negotiation} negotiation</span>
        <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">🆕 {counts.not_started} not started</span>
        {counts.stalled > 0 && <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-700 dark:text-red-300">🚨 {counts.stalled} stalled</span>}
        {total > 0 && <span className="ml-auto text-muted-foreground">Total active value: <b className="text-foreground">{fmt} kr</b></span>}
      </div>
    </section>
  );
}

function ContactsBlock({ festivalId, slug }: { festivalId: string; slug: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["festival-contacts-primary", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contacts")
        .select("id, full_name, role, organization, email, phone, is_primary")
        .eq("festival_id", festivalId).eq("is_primary", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    role: "", full_name: "", organization: "", email: "", phone: "", is_primary: true,
  });

  const addContact = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("festival_contacts").insert({
        festival_id: festivalId,
        role: form.role, full_name: form.full_name,
        organization: form.organization || null,
        email: form.email || null, phone: form.phone || null,
        is_primary: form.is_primary,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["festival-contacts-primary", festivalId] });
      toast.success("Contact added");
      setOpen(false);
      setForm({ role: "", full_name: "", organization: "", email: "", phone: "", is_primary: true });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add"),
  });

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold">Primary contacts</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="h-4 w-4" /> Add contact</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div><Label>Role *</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Operations lead" /></div>
              <div><Label>Full name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Organization</Label><Input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_primary} onCheckedChange={(c) => setForm({ ...form, is_primary: !!c })} />
                Primary contact
              </label>
            </div>
            <DialogFooter>
              <Button disabled={!form.role || !form.full_name} onClick={() => addContact.mutate()}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No primary contacts marked yet.{" "}
          <button className="text-primary hover:underline" onClick={() => setOpen(true)}>
            + Add contact
          </button>
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {(data ?? []).map((c) => (
            <div key={c.id} className="rounded-md border p-3">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">{c.role}</div>
              <div className="font-medium text-foreground mt-0.5">{c.full_name}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="h-3 w-3" /> {c.email}</a>}
                {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3 w-3" /> {c.phone}</a>}
              </div>
              {c.organization && <div className="text-xs text-muted-foreground mt-1">{c.organization}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        <Link to={`/festivals/${slug}/contacts`} className="text-xs text-primary hover:underline">→ See all contacts</Link>
      </div>
    </section>
  );
}

// ---------- Block 6: concept stats ----------

function useConceptStats(festivalId: string | null) {
  return useQuery({
    queryKey: ["festival-concept-stats", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const fid = festivalId!;
      const [contracts, setup, equip, cooling, actions] = await Promise.all([
        supabase.from("festival_contracts").select("concept_id, contract_signed_date").eq("festival_id", fid),
        supabase.from("festival_setup").select("concept_id").eq("festival_id", fid),
        supabase.from("festival_equipment").select("concept_id, qty").eq("festival_id", fid),
        supabase.from("festival_cooling_unit").select("id").eq("festival_id", fid),
        supabase.from("festival_action_items").select("priority, status").eq("festival_id", fid).neq("status", "closed"),
      ]);
      const byConcept: Record<string, any> = {};
      const get = (id: string | null) => {
        const k = id ?? "__none";
        if (!byConcept[k]) byConcept[k] = {
          contractSigned: null as boolean | null,
          setupCount: 0, equipQty: 0, coolingCount: 0,
          critical: 0, high: 0, normal: 0,
        };
        return byConcept[k];
      };
      (contracts.data ?? []).forEach((r: any) => {
        const s = get(r.concept_id);
        s.contractSigned = !!r.contract_signed_date;
      });
      (setup.data ?? []).forEach((r: any) => get(r.concept_id).setupCount++);
      (equip.data ?? []).forEach((r: any) => get(r.concept_id).equipQty += (r.qty ?? 1));
      // cooling has no concept_id reliably — just total
      const totalCooling = (cooling.data ?? []).length;
      // attribute action priorities by ... no concept on action items? It has no concept_id col reliably.
      // Just keep festival-wide totals on each concept for the simple view.
      let crit = 0, high = 0, normal = 0;
      (actions.data ?? []).forEach((r: any) => {
        if (r.priority === "critical") crit++;
        else if (r.priority === "high") high++;
        else normal++;
      });
      return { byConcept, totalCooling, actionTotals: { crit, high, normal } };
    },
  });
}

// ---------- main ----------

type CardTile = { key: string; name: string; icon: typeof Truck; route?: (s: string) => string };
const CARD_TILES: CardTile[] = [
  { key: "transport", name: "Transport", icon: Truck, route: (s: string) => `/festivals/${s}/transport` },
  { key: "soborg-loading", name: "Soborg Loading", icon: Truck, route: (s: string) => `/festivals/${s}/soborg-loading` },
  { key: "topskilt", name: "Topskilt", icon: FileText },
  { key: "setup", name: "Setup", icon: Calendar },
  { key: "cooling", name: "Cooling", icon: Snowflake },
  { key: "equipment", name: "Equipment", icon: Wrench },
  { key: "facade", name: "Facade", icon: ImageIcon, route: (s: string) => `/festivals/${s}/facade` },
  { key: "power", name: "Power", icon: Zap },
  { key: "safety", name: "Safety", icon: ShieldAlert, route: (s: string) => `/festivals/${s}/safety` },
  { key: "contracts", name: "Contracts", icon: FileSignature },
  { key: "accommodation", name: "Accommodation", icon: BedDouble, route: (s: string) => `/festivals/${s}/accommodation` },
  { key: "contacts", name: "Contacts", icon: Users },
  { key: "action-items", name: "Action Items", icon: ListChecks, route: (s: string) => `/festivals/${s}/actions` },
  { key: "staff", name: "Staff", icon: UserCog },
  { key: "groceries", name: "Groceries", icon: ShoppingCart },
];

export default function FestivalOverview() {
  const { slug = "" } = useParams();

  const festivalQ = useQuery({
    queryKey: ["festival-overview", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, name, slug, start_date, end_date, city, address")
        .eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const conceptsQ = useQuery({
    queryKey: ["concepts-ordered"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concepts")
        .select("id, slug, name, display_order")
        .not("display_order", "is", null)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; slug: ConceptSlug; name: string; display_order: number }[];
    },
  });

  const festivalId = festivalQ.data?.id ?? null;

  const keyDatesQ = useKeyDates(festivalId);
  const statsQ = useConceptStats(festivalId);

  const transportSummaryQ = useQuery({
    queryKey: ["overview-transport-summary", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data: vehicles } = await supabase.from("festival_transport").select("id").eq("festival_id", festivalId!);
      return { vehicleCount: vehicles?.length ?? 0 };
    },
  });

  const topActionsQ = useQuery({
    queryKey: ["festival-action-items", festivalId, "top5"],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_action_items")
        .select("id, title, description, due_date, priority, status, owner")
        .eq("festival_id", festivalId!).neq("status", "closed")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      const order = { critical: 1, high: 2, normal: 3 } as Record<string, number>;
      return (data ?? []).slice().sort((a: any, b: any) =>
        ((order[a.priority] ?? 4) - (order[b.priority] ?? 4)) ||
        ((a.due_date ?? "") > (b.due_date ?? "") ? 1 : -1)
      ).slice(0, 5);
    },
  });

  if (festivalQ.isLoading) return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;
  if (!festivalQ.data) return <div className="p-6">Festival not found</div>;

  const f = festivalQ.data;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <Link to="/festivals" className="text-xs text-muted-foreground hover:underline">← Festivals</Link>

      {/* BLOCK 1 — header */}
      <section className="rounded-lg border bg-card p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">{f.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{fmtRange(f.start_date, f.end_date)}</p>
          {(f.city || f.address) && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {[f.address, f.city].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/festivals/${slug}/binder`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-secondary"
          >
            📘 Binder
          </Link>
          <ConceptExportMenu basePath={`/festivals/${slug}/export`} />
        </div>
      </section>

      {/* BLOCK 2 — attention */}
      {festivalId && <FestivalActionItemsStrip festivalId={festivalId} slug={slug} />}
      {festivalId && <FestivalQuestionsStrip festivalId={festivalId} slug={slug} />}
      <AttentionSummaryWidget festivalSlug={slug} />
      {festivalId && <FestivalTimelineNextEvents festivalId={festivalId} slug={slug} />}

      {/* BLOCK 3 — key dates */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-heading text-lg font-semibold mb-3">Key dates</h2>
        {keyDatesQ.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (keyDatesQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No key dates set.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(keyDatesQ.data ?? []).map((kd, i) => (
              <div
                key={i}
                className={cn(
                  "shrink-0 rounded-md border px-3 py-2 text-xs font-medium whitespace-nowrap",
                  dateChipColor(kd.iso),
                )}
              >
                <div className="tabular-nums">{fmtDateShort(kd.iso)}</div>
                <div className="font-normal opacity-80">{kd.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BLOCK 4 — service hours */}
      {festivalId && conceptsQ.data && (
        <ServiceHoursBlock festivalId={festivalId} concepts={conceptsQ.data} />
      )}

      {/* BLOCK 5 — contacts */}
      {festivalId && <ContactsBlock festivalId={festivalId} slug={slug} />}

      {/* BLOCK 5b — contracts mini-grid */}
      {festivalId && <ContractsMiniBlock festivalId={festivalId} slug={slug} />}

      {/* BLOCK 6 — concept lineup */}
      {festivalId && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="font-heading text-lg font-semibold mb-3">Concept lineup</h2>
          <ConceptCardGrid
            festivalId={festivalId}
            conceptData={statsQ.data?.byConcept ?? {}}
            renderConceptBody={(concept, data) => {
              const s = data ?? {};
              const signed = s.contractSigned;
              const contractLabel =
                signed === true ? "signed" : signed === false ? "pending" : "missing";
              const contractCls =
                signed === true
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : signed === false
                  ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
                  : "border-destructive/40 bg-destructive/10 text-destructive";
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className={cn("px-2 py-0.5 rounded border font-medium", contractCls)}>
                      Contract: {contractLabel}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Setup phases: {s.setupCount ?? 0} · Equipment: {s.equipQty ?? 0} items · Cooling: {statsQ.data?.totalCooling ?? 0} units (festival)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Open actions (festival-wide): 🔴 {statsQ.data?.actionTotals.crit ?? 0} critical · 🟠 {statsQ.data?.actionTotals.high ?? 0} high · 🟡 {statsQ.data?.actionTotals.normal ?? 0} normal
                  </div>
                </div>
              );
            }}
          />
        </section>
      )}

      {/* BLOCK 7 — card tiles */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-heading text-lg font-semibold mb-3">Cards</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CARD_TILES.map((t) => {
            const Icon = t.icon;
            const route = t.route ? t.route(slug) : `/festivals/${slug}/${t.key}`;
            const summary =
              t.key === "transport"
                ? `${transportSummaryQ.data?.vehicleCount ?? 0} vehicles`
                : t.key === "contracts"
                ? `${conceptsQ.data?.length ?? 0} concepts`
                : t.key === "contacts"
                ? "Directory"
                : "—";
            return (
              <Link
                key={t.key} to={route}
                className="rounded-md border bg-background p-3 hover:bg-accent transition flex items-start gap-3"
              >
                <Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{summary}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* BLOCK 8 — top action items */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-heading text-lg font-semibold mb-3">Open action items</h2>
        {topActionsQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (topActionsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No open action items.</p>
        ) : (
          <ul className="space-y-2">
            {topActionsQ.data!.map((a: any) => {
              const due = formatDueDate(a.due_date);
              return (
                <li key={a.id} className="rounded-md border p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-[10px] uppercase font-semibold px-2 py-0.5 rounded border", priorityChipClasses(a.priority))}>
                      {a.priority ?? "normal"}
                    </span>
                    <span className={cn("text-xs tabular-nums", due.overdue && "text-destructive font-medium")}>
                      {due.text}
                    </span>
                    {a.owner && <span className="text-xs text-muted-foreground">· {a.owner}</span>}
                  </div>
                  <div className="text-sm font-medium mt-1">{a.title}</div>
                  {a.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.description}</div>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3">
          <Link to={`/festivals/${slug}/action-items`} className="text-xs text-primary hover:underline">→ See all action items</Link>
        </div>
      </section>

      {/* BLOCK 9 — applicable rules */}
      <FestivalRulesBlock slug={slug} />
    </div>
  );
}
