import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Upload, FileText, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GAS_STATUSES, FOOD_STATUSES, ELEC_STATUSES, STATUS_LABEL, statusClasses } from "@/lib/safety";
import { computeFestivalCertStatus } from "@/lib/safetyStatus";

const sb = supabase as any;

interface Props {
  festivalId: string;
  festivalSlug: string;
  row: any;
}

export function FestivalSafetyCard({ festivalSlug, row }: Props) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<any>(row);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadField, setUploadField] = useState<string>("gas_safety_certificate_path");
  const status = computeFestivalCertStatus(local);

  const update = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await sb.from("festival_safety").update(patch).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["safety-festival", festivalSlug] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  function patch(p: Record<string, any>) {
    setLocal((s: any) => ({ ...s, ...p }));
    update.mutate(p);
  }
  function patchLocal(p: Record<string, any>) {
    setLocal((s: any) => ({ ...s, ...p }));
  }
  function commitIfChanged(field: string, value: any) {
    if (value !== row[field]) update.mutate({ [field]: value });
  }

  async function uploadDoc(field: string, file: File) {
    if (file.size > 25 * 1024 * 1024) { toast.error("Max 25MB"); return; }
    const path = `${row.festival_id}/festival/${field}-${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("festival-safety-docs").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    update.mutate({ [field]: path });
    toast.success("Uploaded");
  }

  async function viewDoc(path: string | null) {
    if (!path) return;
    const { data, error } = await supabase.storage.from("festival-safety-docs").createSignedUrl(path, 3600);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Festival-wide certifications</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Gas, food authority, electrical, insurance</p>
          </div>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold", status.classes)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />{status.label}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gas */}
        <Block title="🔥 Gas safety">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>Required</span>
            <Switch checked={!!local.gas_safety_required} onCheckedChange={(v) => patch({ gas_safety_required: v })} />
          </div>
          {local.gas_safety_required && (
            <>
              <StatusSelect value={local.gas_safety_status} options={GAS_STATUSES} onChange={(v) => patch({ gas_safety_status: v })} />
              <Input type="date" value={local.gas_safety_date ?? ""} onChange={(e) => patch({ gas_safety_date: e.target.value || null })} className="h-8 text-sm" />
              <Input placeholder="Inspector" value={local.gas_safety_inspector ?? ""}
                onChange={(e) => patchLocal({ gas_safety_inspector: e.target.value })}
                onBlur={(e) => commitIfChanged("gas_safety_inspector", e.target.value || null)} className="h-8 text-sm" />
              <DocBtn path={local.gas_safety_certificate_path} field="gas_safety_certificate_path" onView={viewDoc} onUpload={(f) => { setUploadField("gas_safety_certificate_path"); fileRef.current?.click(); }} />
            </>
          )}
        </Block>

        {/* Food */}
        <Block title="🍽 Food authority (Fødevarestyrelsen)">
          <StatusSelect value={local.food_authority_status} options={FOOD_STATUSES} onChange={(v) => patch({ food_authority_status: v })} />
          <Input type="date" value={local.food_authority_inspection_date ?? ""} onChange={(e) => patch({ food_authority_inspection_date: e.target.value || null })} className="h-8 text-sm" />
          <Input placeholder="Lead" value={local.food_authority_lead ?? ""}
            onChange={(e) => patchLocal({ food_authority_lead: e.target.value })}
            onBlur={(e) => commitIfChanged("food_authority_lead", e.target.value || null)} className="h-8 text-sm" />
          <DocBtn path={local.food_authority_certificate_path} field="food_authority_certificate_path" onView={viewDoc} onUpload={() => { setUploadField("food_authority_certificate_path"); fileRef.current?.click(); }} />
        </Block>

        {/* Electrical */}
        <Block title="⚡ Electrical certification">
          <StatusSelect value={local.electrical_certification_status} options={ELEC_STATUSES} onChange={(v) => patch({ electrical_certification_status: v })} />
          <Input type="date" value={local.electrical_certification_date ?? ""} onChange={(e) => patch({ electrical_certification_date: e.target.value || null })} className="h-8 text-sm" />
          <Input placeholder="Certifier" value={local.electrical_certifier ?? ""}
            onChange={(e) => patchLocal({ electrical_certifier: e.target.value })}
            onBlur={(e) => commitIfChanged("electrical_certifier", e.target.value || null)} className="h-8 text-sm" />
          <DocBtn path={local.electrical_certification_path} field="electrical_certification_path" onView={viewDoc} onUpload={() => { setUploadField("electrical_certification_path"); fileRef.current?.click(); }} />
        </Block>

        {/* Insurance */}
        <Block title="🛡️ Public liability insurance">
          <Input placeholder="Provider" value={local.insurance_provider ?? ""}
            onChange={(e) => patchLocal({ insurance_provider: e.target.value })}
            onBlur={(e) => commitIfChanged("insurance_provider", e.target.value || null)} className="h-8 text-sm" />
          <Input placeholder="Policy number" value={local.insurance_policy_number ?? ""}
            onChange={(e) => patchLocal({ insurance_policy_number: e.target.value })}
            onBlur={(e) => commitIfChanged("insurance_policy_number", e.target.value || null)} className="h-8 text-sm" />
          <Textarea rows={2} placeholder="Coverage summary" value={local.insurance_coverage_summary ?? ""}
            onChange={(e) => patchLocal({ insurance_coverage_summary: e.target.value })}
            onBlur={(e) => commitIfChanged("insurance_coverage_summary", e.target.value || null)} className="text-sm" />
          <DocBtn path={local.insurance_certificate_path} field="insurance_certificate_path" onView={viewDoc} onUpload={() => { setUploadField("insurance_certificate_path"); fileRef.current?.click(); }} />
        </Block>
      </div>

      {/* Emergency contacts + evacuation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Block title="🚨 Emergency contacts">
          <Textarea rows={3} value={local.emergency_contacts_text ?? ""}
            onChange={(e) => patchLocal({ emergency_contacts_text: e.target.value })}
            onBlur={(e) => commitIfChanged("emergency_contacts_text", e.target.value || null)}
            placeholder="Festival HQ, ambulance, fire warden..." className="text-sm" />
        </Block>
        <Block title="🗺 Evacuation plan">
          <DocBtn path={local.fire_safety_evacuation_plan_path} field="fire_safety_evacuation_plan_path"
            onView={viewDoc}
            onUpload={() => { setUploadField("fire_safety_evacuation_plan_path"); fileRef.current?.click(); }} />
        </Block>
      </div>

      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(uploadField, f); e.target.value = ""; }} />
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}
function StatusSelect({ value, options, onChange }: { value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("inline-flex items-center text-[10px] uppercase font-semibold px-2 py-0.5 rounded border", statusClasses(value))}>{STATUS_LABEL[value] ?? value}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm flex-1"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
function DocBtn({ path, onView, onUpload }: { path: string | null; field: string; onView: (p: string | null) => void; onUpload: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {path ? (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onView(path)}>
          <FileText className="h-3 w-3 mr-1" />View<ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      ) : <span className="text-xs italic text-muted-foreground">No document</span>}
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onUpload}>
        <Upload className="h-3 w-3 mr-1" />{path ? "Replace" : "Upload"}
      </Button>
    </div>
  );
}
