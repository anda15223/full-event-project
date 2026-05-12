import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Trash2, Flame, HeartPulse, FileCheck, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { computeZoneSafetyStatus, type SafetyZoneFields } from "@/lib/safetyStatus";

const sb = supabase as any;

export type SafetyZoneRow = SafetyZoneFields & {
  id: string;
  festival_id: string;
  zone_label: string;
  zone_type: string | null;
  responsible_person: string | null;
  emergency_exits_count: number | null;
  permits_notes: string | null;
  briefing_date: string | null;
  notes: string | null;
};

interface Props {
  festivalId: string;
  festivalSlug: string;
  zone: SafetyZoneRow;
}

export function SafetyZoneCard({ festivalSlug, zone }: Props) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<SafetyZoneRow>(zone);
  const status = computeZoneSafetyStatus(local);

  const update = useMutation({
    mutationFn: async (patch: Partial<SafetyZoneRow>) => {
      const { error } = await sb.from("festival_safety_zone").update(patch).eq("id", zone.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["safety-zones", festivalSlug] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("festival_safety_zone").delete().eq("id", zone.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zone deleted");
      qc.invalidateQueries({ queryKey: ["safety-zones", festivalSlug] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  function patch(p: Partial<SafetyZoneRow>) {
    setLocal((s) => ({ ...s, ...p }));
    update.mutate(p);
  }

  function patchLocalOnly(p: Partial<SafetyZoneRow>) {
    setLocal((s) => ({ ...s, ...p }));
  }

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <Shield className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <input
              className="w-full bg-transparent text-xl font-bold tracking-tight outline-none focus:bg-muted/40 rounded px-1 -mx-1"
              value={local.zone_label}
              onChange={(e) => patchLocalOnly({ zone_label: e.target.value })}
              onBlur={(e) => e.target.value !== zone.zone_label && update.mutate({ zone_label: e.target.value })}
            />
            <div className="text-xs text-muted-foreground mt-0.5 capitalize">{local.zone_type ?? "tent"}</div>
          </div>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold whitespace-nowrap", status.classes)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
          {status.label}
        </span>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Responsible">
          <Input
            value={local.responsible_person ?? ""}
            onChange={(e) => patchLocalOnly({ responsible_person: e.target.value })}
            onBlur={(e) => e.target.value !== (zone.responsible_person ?? "") && update.mutate({ responsible_person: e.target.value || null })}
            placeholder="Name"
            className="h-9"
          />
        </Field>
        <Field label="Emergency exits">
          <Input
            type="number"
            value={local.emergency_exits_count ?? ""}
            onChange={(e) => patchLocalOnly({ emergency_exits_count: e.target.value ? Number(e.target.value) : null })}
            onBlur={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              if (v !== zone.emergency_exits_count) update.mutate({ emergency_exits_count: v });
            }}
            className="h-9"
          />
        </Field>
        <Field label="Briefing date">
          <Input
            type="date"
            value={local.briefing_date ? local.briefing_date.slice(0, 10) : ""}
            onChange={(e) => patch({ briefing_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="h-9"
          />
        </Field>
      </div>

      {/* Fire safety */}
      <Section icon={<Flame className="h-4 w-4 text-orange-500" />} title="Fire safety">
        <CountRow
          label="Fire extinguishers"
          count={local.fire_extinguisher_count ?? 0}
          checked={!!local.fire_extinguisher_checked}
          onCount={(n) => patch({ fire_extinguisher_count: n })}
          onCheck={(v) => patch({ fire_extinguisher_checked: v })}
        />
        <CountRow
          label="Fire blankets"
          count={local.fire_blanket_count ?? 0}
          checked={!!local.fire_blanket_checked}
          onCount={(n) => patch({ fire_blanket_count: n })}
          onCheck={(v) => patch({ fire_blanket_checked: v })}
        />
      </Section>

      {/* First aid */}
      <Section icon={<HeartPulse className="h-4 w-4 text-rose-500" />} title="First aid">
        <ToggleRow
          label="First aid kit present"
          checked={!!local.first_aid_kit}
          onChange={(v) => patch({ first_aid_kit: v, ...(v ? {} : { first_aid_checked: false }) })}
        />
        <ToggleRow
          label="Kit contents verified"
          checked={!!local.first_aid_checked}
          disabled={!local.first_aid_kit}
          onChange={(v) => patch({ first_aid_checked: v })}
        />
      </Section>

      {/* Permits */}
      <Section icon={<FileCheck className="h-4 w-4 text-blue-500" />} title="Permits">
        <ToggleRow
          label="All permits obtained"
          checked={!!local.permits_obtained}
          onChange={(v) => patch({ permits_obtained: v })}
        />
        <Textarea
          rows={2}
          placeholder="BR18 compliance, food authority sign-off, fire inspection..."
          value={local.permits_notes ?? ""}
          onChange={(e) => patchLocalOnly({ permits_notes: e.target.value })}
          onBlur={(e) => e.target.value !== (zone.permits_notes ?? "") && update.mutate({ permits_notes: e.target.value || null })}
          className="text-sm"
        />
      </Section>

      {/* Briefing */}
      <Section icon={<Users className="h-4 w-4 text-purple-500" />} title="Staff briefing">
        <ToggleRow
          label="Staff briefing completed"
          checked={!!local.briefing_done}
          onChange={(v) => patch({ briefing_done: v, briefing_date: v && !local.briefing_date ? new Date().toISOString() : local.briefing_date })}
        />
      </Section>

      {/* Notes */}
      <div>
        <div className="text-xs text-muted-foreground mb-1">General notes</div>
        <Textarea
          rows={2}
          value={local.notes ?? ""}
          onChange={(e) => patchLocalOnly({ notes: e.target.value })}
          onBlur={(e) => e.target.value !== (zone.notes ?? "") && update.mutate({ notes: e.target.value || null })}
          className="text-sm"
        />
      </div>

      {/* Footer */}
      <div className="flex justify-end pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm(`Delete zone "${zone.zone_label}"?`)) del.mutate();
          }}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete zone
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
      {children}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CountRow({ label, count, checked, onCount, onCheck }: { label: string; count: number; checked: boolean; onCount: (n: number) => void; onCheck: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm flex-1">{label}</span>
      <Input
        type="number"
        value={count}
        onChange={(e) => onCount(Number(e.target.value) || 0)}
        className="h-8 w-16 text-sm"
      />
      <label className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded border cursor-pointer", checked ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "bg-background border-border text-muted-foreground")}>
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} className="h-3 w-3" />
        Verified
      </label>
    </div>
  );
}

function ToggleRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1", disabled && "opacity-50")}>
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
