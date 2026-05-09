import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, FileDown, Upload, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateRange } from "@/lib/dateFormat";
import {
  GAS_STATUSES, FOOD_STATUSES, ELEC_STATUSES,
  STATUS_LABEL, statusClasses, computeReadiness, READINESS_META, pushHistory,
} from "@/lib/safety";

const sb = supabase as any;

export default function FestivalSafety() {
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

  const { data: row, refetch } = useQuery({
    queryKey: ["festival-safety", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data } = await sb.from("festival_safety").select("*").eq("festival_id", festivalId).maybeSingle();
      if (data) return data;
      // ensure row exists
      const { data: created } = await sb.from("festival_safety").insert({ festival_id: festivalId }).select().single();
      return created;
    },
  });

  const [draft, setDraft] = useState<any>(null);
  const current = draft ?? row ?? {};

  const set = (patch: Record<string, any>) => setDraft({ ...current, ...patch });

  const save = useMutation({
    mutationFn: async () => {
      if (!row?.id) return;
      const changed: Record<string, any> = {};
      const keys = Object.keys(current).filter(k => k !== "id" && k !== "created_at" && k !== "updated_at" && k !== "status_history");
      for (const k of keys) {
        if (JSON.stringify((current as any)[k]) !== JSON.stringify((row as any)[k])) changed[k] = (current as any)[k];
      }
      if (Object.keys(changed).length === 0) return;
      const history = pushHistory(row.status_history, { field: "bulk_update", from: null, to: Object.keys(changed) });
      const { error } = await sb.from("festival_safety").update({ ...changed, status_history: history }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["festival-safety", festivalId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const quickStatus = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string }) => {
      if (!row?.id) return;
      const history = pushHistory(row.status_history, { field, from: row[field], to: value });
      const { error } = await sb.from("festival_safety").update({ [field]: value, status_history: history }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["festival-safety", festivalId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  async function uploadDoc(field: string, file: File) {
    if (!file || !festival) return;
    if (file.size > 25 * 1024 * 1024) { toast.error("Max 25MB"); return; }
    const path = `${festival.slug}/${field}/${Date.now()}-${file.name.replace(/[^\w.\-]/g,"_")}`;
    const { error } = await supabase.storage.from("festival-safety-docs").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    await sb.from("festival_safety").update({ [field]: path }).eq("id", row.id);
    toast.success("Uploaded");
    refetch();
  }

  async function viewDoc(path: string | null) {
    if (!path) return;
    const { data, error } = await supabase.storage.from("festival-safety-docs").createSignedUrl(path, 3600);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  const readiness = useMemo(() => computeReadiness(row, festival?.start_date ?? null), [row, festival]);
  const rmeta = READINESS_META[readiness];

  const daysLeft = festival?.start_date
    ? Math.ceil((new Date(festival.start_date).getTime() - Date.now())/(1000*60*60*24))
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link to={`/festivals/${slug}`} className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />Back to overview
        </Link>
        <div className="flex gap-2">
          {draft && <>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard</Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
          </>}
          <Button asChild size="sm" variant="outline"><Link to={`/festivals/${slug}/safety/export`}><FileDown className="h-4 w-4 mr-1"/>Export PDF</Link></Button>
        </div>
      </div>

      <header className="rounded-2xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Safety — {festival?.name}</h1>
            <p className="text-sm text-muted-foreground">
              {festival && formatDateRange(festival.start_date, festival.end_date)}
              {daysLeft !== null && daysLeft >= 0 && <> · {daysLeft} days to opening</>}
            </p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <span className={cn("inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold", rmeta.classes)}>
              <span className={cn("w-2 h-2 rounded-full", rmeta.dot)} />{rmeta.label.toUpperCase()}
            </span>
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full border",
              row?.safety_briefing_completed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200")}>
              Briefing: {row?.safety_briefing_completed ? "completed" : "pending"}
            </span>
          </div>
        </div>
      </header>

      {/* Gas */}
      <Section title="🔥 Gas Safety">
        <div className="flex items-center gap-3">
          <Switch checked={!!current.gas_safety_required} onCheckedChange={(v) => set({ gas_safety_required: v })} />
          <span className="text-sm">Gas safety required <span className="text-xs text-muted-foreground">(disable if all-electric)</span></span>
        </div>
        <Field label="Status">
          <div className="flex items-center gap-2">
            <StatusPill s={current.gas_safety_status} />
            <Select value={current.gas_safety_status} onValueChange={(v) => set({ gas_safety_status: v })}>
              <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{GAS_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </Field>
        <Row>
          <Field label="Date"><Input type="date" value={current.gas_safety_date ?? ""} onChange={e=>set({gas_safety_date: e.target.value || null})}/></Field>
          <Field label="Time"><Input type="time" value={current.gas_safety_time ?? ""} onChange={e=>set({gas_safety_time: e.target.value || null})}/></Field>
          <Field label="Inspector"><Input value={current.gas_safety_inspector ?? ""} onChange={e=>set({gas_safety_inspector: e.target.value})}/></Field>
        </Row>
        <Field label="Notes"><Textarea rows={2} value={current.gas_safety_notes ?? ""} onChange={e=>set({gas_safety_notes: e.target.value})}/></Field>
        <DocRow path={current.gas_safety_certificate_path} onUpload={(f)=>uploadDoc("gas_safety_certificate_path", f)} onView={()=>viewDoc(current.gas_safety_certificate_path)} />
        <QuickActions>
          <Button size="sm" variant="outline" onClick={()=>quickStatus.mutate({field:"gas_safety_status", value:"passed"})}>Mark passed</Button>
          <Button size="sm" variant="outline" onClick={()=>quickStatus.mutate({field:"gas_safety_status", value:"scheduled"})}>Schedule</Button>
          <Button size="sm" variant="outline" onClick={()=>quickStatus.mutate({field:"gas_safety_status", value:"not_required"})}>Not required</Button>
        </QuickActions>
      </Section>

      {/* Food */}
      <Section title="🍽 Food Authority">
        <Row>
          <Field label="Lead"><Input value={current.food_authority_lead ?? ""} onChange={e=>set({food_authority_lead: e.target.value})}/></Field>
          <Field label="Inspection date"><Input type="date" value={current.food_authority_inspection_date ?? ""} onChange={e=>set({food_authority_inspection_date: e.target.value || null})}/></Field>
          <Field label="Status">
            <Select value={current.food_authority_status} onValueChange={(v) => set({ food_authority_status: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{FOOD_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </Row>
        <Field label="Notes"><Textarea rows={2} value={current.food_authority_notes ?? ""} onChange={e=>set({food_authority_notes: e.target.value})}/></Field>
        <DocRow path={current.food_authority_certificate_path} onUpload={(f)=>uploadDoc("food_authority_certificate_path", f)} onView={()=>viewDoc(current.food_authority_certificate_path)} />
        <QuickActions>
          <Button size="sm" variant="outline" onClick={()=>quickStatus.mutate({field:"food_authority_status", value:"passed"})}>Mark passed</Button>
          <Button size="sm" variant="outline" onClick={()=>quickStatus.mutate({field:"food_authority_status", value:"scheduled"})}>Schedule</Button>
        </QuickActions>
      </Section>

      {/* Electrical */}
      <Section title="⚡ Electrical Certification">
        <p className="text-xs text-muted-foreground">Required when total power load is high or festival mandates.</p>
        <Row>
          <Field label="Status">
            <Select value={current.electrical_certification_status} onValueChange={(v) => set({ electrical_certification_status: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{ELEC_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Certifier"><Input value={current.electrical_certifier ?? ""} onChange={e=>set({electrical_certifier: e.target.value})}/></Field>
          <Field label="Certification date"><Input type="date" value={current.electrical_certification_date ?? ""} onChange={e=>set({electrical_certification_date: e.target.value || null})}/></Field>
        </Row>
        <DocRow path={current.electrical_certification_path} onUpload={(f)=>uploadDoc("electrical_certification_path", f)} onView={()=>viewDoc(current.electrical_certification_path)} />
        <QuickActions>
          <Button size="sm" variant="outline" onClick={()=>quickStatus.mutate({field:"electrical_certification_status", value:"certified"})}>Mark certified</Button>
        </QuickActions>
      </Section>

      {/* Fire */}
      <Section title="🧯 Fire Safety">
        <Row>
          <Field label="Extinguishers"><Input type="number" value={current.fire_safety_extinguishers_count ?? ""} onChange={e=>set({fire_safety_extinguishers_count: e.target.value ? Number(e.target.value): null})}/></Field>
          <Field label="Inspection date"><Input type="date" value={current.fire_safety_extinguishers_inspection_date ?? ""} onChange={e=>set({fire_safety_extinguishers_inspection_date: e.target.value || null})}/></Field>
          <Field label="Fire blankets"><Input type="number" value={current.fire_safety_blanket_count ?? ""} onChange={e=>set({fire_safety_blanket_count: e.target.value ? Number(e.target.value): null})}/></Field>
        </Row>
        <DocRow label="Evacuation plan" path={current.fire_safety_evacuation_plan_path} onUpload={(f)=>uploadDoc("fire_safety_evacuation_plan_path", f)} onView={()=>viewDoc(current.fire_safety_evacuation_plan_path)} />
      </Section>

      {/* First aid */}
      <Section title="🩹 First Aid">
        <Row>
          <Field label="Kit count"><Input type="number" value={current.first_aid_kit_count ?? ""} onChange={e=>set({first_aid_kit_count: e.target.value ? Number(e.target.value): null})}/></Field>
          <Field label="Certified staff"><Input type="number" value={current.first_aid_certified_staff_count ?? ""} onChange={e=>set({first_aid_certified_staff_count: e.target.value ? Number(e.target.value): null})}/></Field>
          <Field label="Responsible"><Input value={current.first_aid_responsible ?? ""} onChange={e=>set({first_aid_responsible: e.target.value})}/></Field>
        </Row>
        <Field label="Kit locations"><Textarea rows={2} value={current.first_aid_kit_locations ?? ""} onChange={e=>set({first_aid_kit_locations: e.target.value})} placeholder="e.g. 1 per stall + main HQ"/></Field>
      </Section>

      {/* Insurance */}
      <Section title="🛡️ Insurance">
        <Row>
          <Field label="Provider"><Input value={current.insurance_provider ?? ""} onChange={e=>set({insurance_provider: e.target.value})}/></Field>
          <Field label="Policy number"><Input value={current.insurance_policy_number ?? ""} onChange={e=>set({insurance_policy_number: e.target.value})}/></Field>
        </Row>
        <Field label="Coverage summary"><Textarea rows={2} value={current.insurance_coverage_summary ?? ""} onChange={e=>set({insurance_coverage_summary: e.target.value})}/></Field>
        <DocRow path={current.insurance_certificate_path} onUpload={(f)=>uploadDoc("insurance_certificate_path", f)} onView={()=>viewDoc(current.insurance_certificate_path)} />
      </Section>

      {/* Emergency */}
      <Section title="🚨 Emergency Contacts">
        <Field label="On-festival emergency numbers">
          <Textarea rows={4} value={current.emergency_contacts_text ?? ""} onChange={e=>set({emergency_contacts_text: e.target.value})}
            placeholder="Festival HQ, ambulance, fire warden..."/>
        </Field>
      </Section>

      {/* Briefing */}
      <Section title="📢 Safety Briefing">
        <div className="flex items-center gap-3">
          <Switch checked={!!current.safety_briefing_completed} onCheckedChange={(v) => set({ safety_briefing_completed: v })} />
          <span className="text-sm">Briefing completed</span>
        </div>
        <Row>
          <Field label="Date"><Input type="date" value={current.safety_briefing_date ?? ""} onChange={e=>set({safety_briefing_date: e.target.value || null})}/></Field>
          <Field label="Attendees (comma-separated)" wide>
            <Input value={(current.safety_briefing_attendees ?? []).join(", ")}
              onChange={e=>set({safety_briefing_attendees: e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}/>
          </Field>
        </Row>
      </Section>

      <Section title="📝 Additional Notes">
        <Textarea rows={3} value={current.additional_notes ?? ""} onChange={e=>set({additional_notes: e.target.value})}/>
      </Section>

      {draft && (
        <div className="sticky bottom-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDraft(null)}>Discard</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save all changes</Button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>;
}
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("space-y-1", wide && "md:col-span-2")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
function StatusPill({ s }: { s: string }) {
  return <span className={cn("inline-flex items-center text-[10px] uppercase font-semibold px-2 py-0.5 rounded border", statusClasses(s))}>{STATUS_LABEL[s] ?? s}</span>;
}
function QuickActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2 pt-1">{children}</div>;
}
function DocRow({ label = "Certificate", path, onUpload, onView }: { label?: string; path: string | null; onUpload: (f: File) => void; onView: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-xs text-muted-foreground w-28">{label}:</span>
      {path ? (
        <Button size="sm" variant="outline" onClick={onView}><FileText className="h-4 w-4 mr-1"/>View</Button>
      ) : <span className="text-xs text-muted-foreground italic">none</span>}
      <input ref={ref} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
      <Button size="sm" variant="ghost" onClick={() => ref.current?.click()}><Upload className="h-4 w-4 mr-1"/>{path?"Replace":"Upload"}</Button>
    </div>
  );
}
