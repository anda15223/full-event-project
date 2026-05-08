import { useMemo, useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, AlertTriangle, Upload, Download, Trash2, FileText, Plus, Link2, CheckCircle2, AlertCircle, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeGap, computeTentGap, POWER_TYPE_LABEL,
  type GapRow, type PowerEquipmentRow, type PowerType,
} from "@/lib/powerGapAnalysis";
import { seedEquipmentFromTemplate } from "@/lib/seedPowerEquipment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";

type Festival = { id: string; slug: string; name: string };
type Status = "drawing" | "submitted" | "ordered" | "confirmed" | "installed" | "tested";

type ContractRow = {
  id: string;
  concept_id: string;
  concept_alias: string | null;
  concept: { slug: ConceptSlug; name: string; display_order: number | null } | null;
};

type PowerRow = {
  id: string;
  festival_contract_id: string;
  connections_16a_240v: number | null;
  connections_16a_400v: number | null;
  connections_32a: number | null;
  connections_63a: number | null;
  connections_125a: number | null;
  tableau_required: boolean | null;
  tableau_count: number | null;
  total_kw_estimate: number | null;
  total_amp_estimate: number | null;
  equipment_breakdown: string | null;
  status: Status;
  power_drawing_file_path: string | null;
  power_drawing_uploaded_at: string | null;
  submission_deadline: string | null;
  ordered_date: string | null;
  cost_dkk: number | null;
  notes: string | null;
  tent_location: string | null;
  shared_tent_with_contracts: string[] | null;
  equipment_variant: "standalone" | "inside_tent_shared" | null;
};

const STATUS_FLOW: Status[] = ["drawing", "submitted", "ordered", "confirmed", "installed", "tested"];

function nextStatus(s: Status): Status | null {
  const i = STATUS_FLOW.indexOf(s);
  return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null;
}

function statusClasses(s: Status) {
  switch (s) {
    case "tested":
    case "installed":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300";
    case "confirmed":
      return "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300";
    case "ordered":
      return "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300";
    case "submitted":
      return "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-300";
    case "drawing":
    default:
      return "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-300";
  }
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(d: string): number {
  const ms = new Date(d + "T00:00:00").getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function contractLabel(c: ContractRow) {
  const slug = c.concept?.slug;
  const emoji = slug ? CONCEPT_EMOJI[slug] ?? "" : "";
  const base = c.concept?.name ?? "—";
  return c.concept_alias ? `${emoji} ${base} — ${c.concept_alias}` : `${emoji} ${base}`;
}

export default function FestivalPower() {
  const { slug = "" } = useParams();

  const { data: festival } = useQuery({
    queryKey: ["festival", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals").select("id,slug,name").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });

  const festivalId = festival?.id;

  const { data: contracts = [] } = useQuery({
    queryKey: ["festival-contracts-power", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select("id, concept_id, concept_alias, concept:concepts!concept_id(slug, name, display_order)")
        .eq("festival_id", festivalId!);
      if (error) throw error;
      const sorted = (data ?? []).slice().sort((a: any, b: any) => {
        const ao = a.concept?.display_order ?? 999;
        const bo = b.concept?.display_order ?? 999;
        if (ao !== bo) return ao - bo;
        return (a.concept_alias ?? "").localeCompare(b.concept_alias ?? "");
      });
      return sorted as unknown as ContractRow[];
    },
  });

  const contractIds = contracts.map((c) => c.id);
  const { data: powers = [] } = useQuery({
    queryKey: ["festival-power", festivalId, contractIds.join(",")],
    enabled: contractIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_power").select("*").in("festival_contract_id", contractIds);
      if (error) throw error;
      return (data ?? []) as PowerRow[];
    },
  });

  const powerByContract = useMemo(() => {
    const m = new Map<string, PowerRow>();
    powers.forEach((p) => m.set(p.festival_contract_id, p));
    return m;
  }, [powers]);

  const powerIds = powers.map((p) => p.id);
  const { data: equipment = [] } = useQuery({
    queryKey: ["festival-power-equipment", powerIds.join(",")],
    enabled: powerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_power_equipment")
        .select("*")
        .in("festival_power_id", powerIds)
        .order("position");
      if (error) throw error;
      return (data ?? []) as unknown as PowerEquipmentRow[];
    },
  });

  const equipmentByPower = useMemo(() => {
    const m = new Map<string, PowerEquipmentRow[]>();
    equipment.forEach((e) => {
      const arr = m.get(e.festival_power_id) ?? [];
      arr.push(e);
      m.set(e.festival_power_id, arr);
    });
    return m;
  }, [equipment]);

  const contractById = useMemo(() => {
    const m = new Map<string, ContractRow>();
    contracts.forEach((c) => m.set(c.id, c));
    return m;
  }, [contracts]);

  // Group powers by tent_location
  const tentGroups = useMemo(() => {
    const m = new Map<string, { powers: PowerRow[]; contractIds: string[] }>();
    powers.forEach((p) => {
      if (!p.tent_location) return;
      const g = m.get(p.tent_location) ?? { powers: [], contractIds: [] };
      g.powers.push(p);
      g.contractIds.push(p.festival_contract_id);
      m.set(p.tent_location, g);
    });
    return m;
  }, [powers]);

  const tentGaps = useMemo(() => {
    const out = new Map<string, GapRow[]>();
    tentGroups.forEach((g, tent) => {
      out.set(tent, computeTentGap(g.powers, equipmentByPower, g.contractIds));
    });
    return out;
  }, [tentGroups, equipmentByPower]);

  const warnings = useMemo(() => {
    const out: { kind: "due" | "overdue"; label: string; days: number; date: string }[] = [];
    contracts.forEach((c) => {
      const p = powerByContract.get(c.id);
      if (!p || p.status !== "drawing" || !p.submission_deadline) return;
      const d = daysUntil(p.submission_deadline);
      if (d < 0) out.push({ kind: "overdue", label: contractLabel(c), days: d, date: p.submission_deadline });
      else if (d <= 7) out.push({ kind: "due", label: contractLabel(c), days: d, date: p.submission_deadline });
    });
    return out;
  }, [contracts, powerByContract]);

  const totals = useMemo(() => {
    const t = {
      c16_240: 0, c16_400: 0, c32: 0, c63: 0, c125: 0,
      kw: 0, amp: 0, cost: 0,
    };
    powers.forEach((p) => {
      t.c16_240 += p.connections_16a_240v ?? 0;
      t.c16_400 += p.connections_16a_400v ?? 0;
      t.c32 += p.connections_32a ?? 0;
      t.c63 += p.connections_63a ?? 0;
      t.c125 += p.connections_125a ?? 0;
      t.kw += Number(p.total_kw_estimate ?? 0);
      t.amp += Number(p.total_amp_estimate ?? 0);
      t.cost += Number(p.cost_dkk ?? 0);
    });
    return t;
  }, [powers]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link to={`/festivals/${slug}`} className="text-xs text-muted-foreground hover:underline">
          ← Back to festival
        </Link>
        <PowerExportMenu slug={slug} contracts={contracts} />
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h1 className="text-2xl font-bold tracking-tight">{festival?.name ?? slug}</h1>
        <p className="text-sm text-muted-foreground">Power plan</p>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg border p-3 text-sm flex items-start gap-2",
                w.kind === "overdue"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-yellow-500/40 bg-yellow-500/5 text-yellow-800 dark:text-yellow-200",
              )}
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                {w.kind === "overdue"
                  ? <>🚨 OVERDUE: {w.label} drawing was due {fmtDate(w.date)}</>
                  : <>⚠️ {w.label} power drawing due in {w.days} day{w.days === 1 ? "" : "s"}</>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tentGroups.size > 0 && (
        <FestivalOverview tentGaps={tentGaps} totals={totals} />
      )}

      <div className="space-y-4">
        {contracts.map((c) => {
          const p = powerByContract.get(c.id);
          return (
            <PowerCard
              key={c.id}
              contract={c}
              power={p}
              equipment={p ? equipmentByPower.get(p.id) ?? [] : []}
              allContracts={contracts}
              festivalSlug={slug}
            />
          );
        })}
        {contracts.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No contracts at this festival.
          </div>
        )}
      </div>

      {Array.from(tentGroups.entries()).map(([tent, g]) => (
        <TentRollup
          key={tent}
          tent={tent}
          gap={tentGaps.get(tent) ?? []}
          contracts={g.contractIds.map((id) => contractById.get(id)).filter(Boolean) as ContractRow[]}
        />
      ))}

      {powers.length > 0 && (
        <div className="rounded-xl border bg-muted/30 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Festival total power requirement
          </h2>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="16A 240V" value={totals.c16_240} />
            <Stat label="16A 400V" value={totals.c16_400} />
            <Stat label="32A" value={totals.c32} />
            <Stat label="63A" value={totals.c63} />
            <Stat label="125A" value={totals.c125} />
            <Stat label="Total kW" value={totals.kw} />
            <Stat label="Total Amp" value={totals.amp} />
            <Stat label="Total cost (DKK)" value={totals.cost.toLocaleString("da-DK")} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xl font-bold tabular-nums leading-none">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function PowerExportMenu({ slug, contracts }: { slug: string; contracts: ContractRow[] }) {
  const base = `/festivals/${slug}/power/export`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">Export PDF ▾</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to={base}>📄 Full plan</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {contracts.map((c) => (
          <DropdownMenuItem key={c.id} asChild>
            <Link to={`${base}?contract=${c.id}`}>{contractLabel(c)}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================
function PowerCard({
  contract, power, equipment, allContracts, festivalSlug,
}: {
  contract: ContractRow;
  power: PowerRow | undefined;
  equipment: PowerEquipmentRow[];
  allContracts: ContractRow[];
  festivalSlug: string;
}) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const upsertEmpty = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("festival_power")
        .insert({ festival_contract_id: contract.id, status: "drawing" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival-power"] }),
  });

  const advance = useMutation({
    mutationFn: async (next: Status) => {
      if (!power) return;
      const patch: Partial<PowerRow> = { status: next };
      if (next === "ordered" && !power.ordered_date) patch.ordered_date = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("festival_power").update(patch).eq("id", power.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status advanced");
      qc.invalidateQueries({ queryKey: ["festival-power"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const updateField = useMutation({
    mutationFn: async (patch: Partial<PowerRow>) => {
      if (!power) return;
      const { error } = await supabase.from("festival_power").update(patch).eq("id", power.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival-power"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const uploadDrawing = async (file: File) => {
    if (!power) return;
    const ext = file.name.split(".").pop() || "pdf";
    const path = `${festivalSlug}/${power.festival_contract_id}.${ext}`;
    const up = await supabase.storage.from("power-drawings").upload(path, file, { upsert: true });
    if (up.error) { toast.error(up.error.message); return; }
    await updateField.mutateAsync({
      power_drawing_file_path: path,
      power_drawing_uploaded_at: new Date().toISOString(),
    });
    toast.success("Drawing uploaded");
  };

  const removeDrawing = async () => {
    if (!power?.power_drawing_file_path) return;
    await supabase.storage.from("power-drawings").remove([power.power_drawing_file_path]);
    await updateField.mutateAsync({ power_drawing_file_path: null, power_drawing_uploaded_at: null });
    toast.success("Drawing removed");
  };

  const downloadDrawing = async () => {
    if (!power?.power_drawing_file_path) return;
    const { data } = await supabase.storage.from("power-drawings").createSignedUrl(power.power_drawing_file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (!power) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{contractLabel(contract)}</h3>
          <Button size="sm" variant="outline" onClick={() => upsertEmpty.mutate()}>
            Initialize power record
          </Button>
        </div>
      </div>
    );
  }

  const next = nextStatus(power.status);
  const dueDays = power.submission_deadline ? daysUntil(power.submission_deadline) : null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">{contractLabel(contract)}</h3>
            <span className={cn("text-[10px] uppercase font-semibold px-2 py-0.5 rounded border", statusClasses(power.status))}>
              {power.status}
            </span>
            {dueDays !== null && power.status === "drawing" && (
              <span className={cn(
                "text-[10px] uppercase font-semibold px-2 py-0.5 rounded border",
                dueDays < 0
                  ? "bg-destructive/10 text-destructive border-destructive/40"
                  : dueDays <= 7
                    ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/30"
                    : "bg-muted text-muted-foreground border-border",
              )}>
                {dueDays < 0 ? `Overdue ${Math.abs(dueDays)}d` : `Due in ${dueDays}d`}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-5">
        {/* Connections */}
        <Section title="Connections">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <Field label="16A 240V" value={power.connections_16a_240v ?? 0} />
            <Field label="16A 400V" value={power.connections_16a_400v ?? 0} />
            <Field label="32A" value={power.connections_32a ?? 0} />
            <Field label="63A" value={power.connections_63a ?? 0} />
            <Field label="125A" value={power.connections_125a ?? 0} />
            <Field
              label="Strømtavle"
              value={power.tableau_required ? `☑ ${power.tableau_count ?? 0}` : "☐ none"}
            />
          </div>
        </Section>

        {/* Power profile */}
        <Section title="Power profile">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Total kW" value={power.total_kw_estimate ?? "—"} />
            <Field label="Total Amp" value={power.total_amp_estimate ?? "—"} />
          </div>
        </Section>

        {/* Equipment list (structured) */}
        <EquipmentSection power={power} equipment={equipment} contractsAll={allContracts} />

        {/* Power match check */}
        <PowerMatchSection power={power} equipment={equipment} />

        {/* Drawing */}
        <Section title="Power drawing">
          {power.power_drawing_file_path ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <FileText className="h-4 w-4" /> Uploaded {fmtDate(power.power_drawing_uploaded_at?.slice(0, 10) ?? null)}
              </span>
              <Button size="sm" variant="outline" onClick={downloadDrawing}>
                <Download className="h-3 w-3" /> View / Download
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3 w-3" /> Replace
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={removeDrawing}>
                <Trash2 className="h-3 w-3" /> Remove
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-yellow-700 dark:text-yellow-300 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> No drawing uploaded
              </span>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3 w-3" /> Upload Drawing
              </Button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadDrawing(f);
              e.target.value = "";
            }}
          />
        </Section>

        {/* Order */}
        <Section title="Order">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Ordered" value={fmtDate(power.ordered_date)} />
            <Field label="Cost (DKK)" value={power.cost_dkk != null ? Number(power.cost_dkk).toLocaleString("da-DK") : "—"} />
          </div>
        </Section>

        {/* Notes */}
        <Section title="Notes">
          <Textarea
            defaultValue={power.notes ?? ""}
            placeholder="Notes…"
            onBlur={(e) => {
              if (e.target.value !== (power.notes ?? "")) {
                updateField.mutate({ notes: e.target.value || null });
              }
            }}
          />
        </Section>

        {next && (
          <div className="pt-2 border-t flex justify-end">
            <Button size="sm" onClick={() => advance.mutate(next)}>
              {next === "submitted" && "Submit drawing"}
              {next === "ordered" && "Mark ordered"}
              {next === "confirmed" && "Mark confirmed"}
              {next === "installed" && "Mark installed"}
              {next === "tested" && "Mark tested"}
            </Button>
          </div>
        )}
      </div>

      <PowerEditDrawer open={editOpen} onOpenChange={setEditOpen} power={power} />
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

// ============================================================
function PowerEditDrawer({
  open, onOpenChange, power,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  power: PowerRow;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<PowerRow>>(power);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("festival_power").update({
        connections_16a_240v: Number(form.connections_16a_240v ?? 0),
        connections_16a_400v: Number(form.connections_16a_400v ?? 0),
        connections_32a: Number(form.connections_32a ?? 0),
        connections_63a: Number(form.connections_63a ?? 0),
        connections_125a: Number(form.connections_125a ?? 0),
        tableau_required: !!form.tableau_required,
        tableau_count: Number(form.tableau_count ?? 0),
        total_kw_estimate: form.total_kw_estimate ?? null,
        total_amp_estimate: form.total_amp_estimate ?? null,
        equipment_breakdown: form.equipment_breakdown ?? null,
        status: form.status ?? "drawing",
        submission_deadline: form.submission_deadline || null,
        ordered_date: form.ordered_date || null,
        cost_dkk: form.cost_dkk ?? null,
        notes: form.notes ?? null,
      }).eq("id", power.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["festival-power"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit power record</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Status</Label>
            <Select
              value={(form.status as Status) ?? "drawing"}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as Status }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FLOW.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumField label="16A 240V" value={form.connections_16a_240v} onChange={(v) => setForm((f) => ({ ...f, connections_16a_240v: v }))} />
            <NumField label="16A 400V" value={form.connections_16a_400v} onChange={(v) => setForm((f) => ({ ...f, connections_16a_400v: v }))} />
            <NumField label="32A" value={form.connections_32a} onChange={(v) => setForm((f) => ({ ...f, connections_32a: v }))} />
            <NumField label="63A" value={form.connections_63a} onChange={(v) => setForm((f) => ({ ...f, connections_63a: v }))} />
            <NumField label="125A" value={form.connections_125a} onChange={(v) => setForm((f) => ({ ...f, connections_125a: v }))} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={!!form.tableau_required}
              onCheckedChange={(v) => setForm((f) => ({ ...f, tableau_required: !!v }))}
            />
            <Label>Strømtavle required</Label>
          </div>
          {form.tableau_required && (
            <NumField label="Tableau count" value={form.tableau_count} onChange={(v) => setForm((f) => ({ ...f, tableau_count: v }))} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <NumField label="Total kW" value={form.total_kw_estimate} onChange={(v) => setForm((f) => ({ ...f, total_kw_estimate: v }))} step="0.1" />
            <NumField label="Total Amp" value={form.total_amp_estimate} onChange={(v) => setForm((f) => ({ ...f, total_amp_estimate: v }))} />
          </div>

          <div>
            <Label>Submission deadline</Label>
            <Input
              type="date"
              value={form.submission_deadline ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, submission_deadline: e.target.value || null }))}
            />
          </div>

          <div>
            <Label>Ordered date</Label>
            <Input
              type="date"
              value={form.ordered_date ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, ordered_date: e.target.value || null }))}
            />
          </div>

          <NumField label="Cost (DKK)" value={form.cost_dkk} onChange={(v) => setForm((f) => ({ ...f, cost_dkk: v }))} step="0.01" />

          <div>
            <Label>Equipment breakdown</Label>
            <Textarea
              value={form.equipment_breakdown ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, equipment_breakdown: e.target.value }))}
            />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function NumField({
  label, value, onChange, step,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  step?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

// ============================================================
// FESTIVAL OVERVIEW
// ============================================================
function FestivalOverview({
  tentGaps,
  totals,
}: {
  tentGaps: Map<string, GapRow[]>;
  totals: { c16_240: number; c16_400: number; c32: number; c63: number; c125: number; kw: number; amp: number };
}) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Power overview</h2>
      <div className="space-y-2">
        {Array.from(tentGaps.entries()).map(([tent, gap]) => {
          const shorts = gap.filter((g) => g.status === "short");
          const spares = gap.filter((g) => g.status === "spare");
          let icon = "✓";
          let cls = "text-emerald-700 dark:text-emerald-300";
          let msg = "all matched";
          if (shorts.length) {
            icon = "⚠";
            cls = "text-destructive";
            msg = shorts.map((s) => `${Math.abs(s.gap)}× ${POWER_TYPE_LABEL[s.power_type]} short`).join(", ");
          } else if (spares.length) {
            icon = "💰";
            cls = "text-yellow-700 dark:text-yellow-300";
            msg = spares.map((s) => `${s.gap}× ${POWER_TYPE_LABEL[s.power_type]} spare`).join(", ") + " (refund opportunity)";
          }
          return (
            <div key={tent} className={cn("text-sm", cls)}>
              <span className="font-semibold">{icon} {tent} tent</span> — {msg}
            </div>
          );
        })}
      </div>
      <div className="pt-2 border-t text-xs text-muted-foreground">
        Festival total ordered: {totals.c125}× 125A · {totals.c63}× 63A · {totals.c32}× 32A · {totals.c16_400}× 16A 400V · {totals.c16_240}× 16A 240V · Total kW {totals.kw} · Total Amp {totals.amp}
      </div>
    </div>
  );
}

// ============================================================
// TENT ROLLUP
// ============================================================
function TentRollup({
  tent,
  gap,
  contracts,
}: {
  tent: string;
  gap: GapRow[];
  contracts: ContractRow[];
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {tent} tent — combined gap analysis
      </h2>
      <p className="text-xs text-muted-foreground mt-1">
        Stalls in tent: {contracts.map(contractLabel).join(" · ") || "—"}
      </p>
      <div className="mt-3">
        <GapTable rows={gap} compact />
      </div>
    </div>
  );
}

// ============================================================
// POWER MATCH SECTION
// ============================================================
function PowerMatchSection({ power, equipment }: { power: PowerRow; equipment: PowerEquipmentRow[] }) {
  const rows = useMemo(() => computeGap(power, equipment), [power, equipment]);
  if (equipment.length === 0) {
    return (
      <Section title="Power match check">
        <div className="text-xs text-muted-foreground italic">No equipment defined.</div>
      </Section>
    );
  }
  const shorts = rows.filter((r) => r.status === "short");
  const spares = rows.filter((r) => r.status === "spare");
  const allGreen = shorts.length === 0 && spares.length === 0;
  return (
    <Section title="Power match check">
      {shorts.length > 0 && (
        <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>⚠️ {shorts.length} power gap{shorts.length === 1 ? "" : "s"} to resolve</span>
        </div>
      )}
      {allGreen && (
        <div className="mb-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> All equipment powered correctly
        </div>
      )}
      {!allGreen && shorts.length === 0 && spares.length > 0 && (
        <div className="mb-2 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-2 text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
          <Coins className="h-4 w-4" /> Refund opportunity: {spares.reduce((a, b) => a + b.gap, 0)} spare circuit{spares.reduce((a, b) => a + b.gap, 0) === 1 ? "" : "s"}
        </div>
      )}
      <GapTable rows={rows} />
      {shorts.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-destructive">
          {shorts.map((s) => {
            const items = equipment.filter((e) => e.power_type === s.power_type);
            const names = items.map((e) => `${e.quantity}× ${e.equipment_name}`).join(", ");
            return (
              <li key={s.power_type}>
                ⚠️ {POWER_TYPE_LABEL[s.power_type]} short by {Math.abs(s.gap)} — needed for {names}.
                Resolve: add {Math.abs(s.gap)}× {POWER_TYPE_LABEL[s.power_type]} to order, or use existing circuit with adapter.
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function GapTable({ rows, compact = false }: { rows: GapRow[]; compact?: boolean }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border", compact && "bg-card")}>
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2 text-right">Need</th>
            <th className="px-3 py-2 text-right">Ordered</th>
            <th className="px-3 py-2 text-right">Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cls =
              r.status === "short" ? "text-destructive font-semibold"
              : r.status === "spare" ? "text-yellow-700 dark:text-yellow-300 font-medium"
              : "text-emerald-700 dark:text-emerald-300";
            const label =
              r.status === "short" ? `${r.gap} SHORT 🔴`
              : r.status === "spare" ? `+${r.gap} spare 🟡`
              : "✓ Match";
            const niceDemand = Number.isInteger(r.demand) ? r.demand : r.demand.toFixed(1);
            return (
              <tr key={r.power_type} className="border-t">
                <td className="px-3 py-2">{POWER_TYPE_LABEL[r.power_type]}</td>
                <td className="px-3 py-2 text-right tabular-nums">{niceDemand}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.supply}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", cls)}>{label}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-3 text-center text-xs text-muted-foreground">No equipment / supply defined.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// EQUIPMENT SECTION (CRUD)
// ============================================================
const POWER_TYPE_OPTIONS: PowerType[] = ["16A_240V", "16A_400V", "32A", "63A", "125A", "230V_socket"];

function EquipmentSection({
  power, equipment, contractsAll,
}: {
  power: PowerRow;
  equipment: PowerEquipmentRow[];
  contractsAll: ContractRow[];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PowerEquipmentRow | null>(null);
  const [adding, setAdding] = useState(false);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_power_equipment").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Equipment removed");
      qc.invalidateQueries({ queryKey: ["festival-power-equipment"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const conceptName = (id: string) => {
    const c = contractsAll.find((x) => x.id === id);
    return c ? contractLabel(c) : id.slice(0, 8);
  };

  return (
    <Section
      title={
        <div className="flex items-center justify-between w-full">
          <span>Equipment powered</span>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add equipment
          </Button>
        </div>
      }
    >
      {equipment.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No equipment defined yet.</div>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {equipment.map((e) => (
            <li key={e.id} className="flex items-start gap-2 group">
              <div className="flex-1 min-w-0">
                <div>
                  <span className="font-medium">{e.quantity}× {e.equipment_name}</span>
                  <span className="text-muted-foreground"> — {POWER_TYPE_LABEL[e.power_type]}</span>
                  {e.power_kw != null && <span className="text-muted-foreground"> · {e.power_kw} kW each</span>}
                </div>
                {e.is_shared && e.shared_with_concepts && e.shared_with_concepts.length > 0 && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Link2 className="h-3 w-3" /> Shared with: {e.shared_with_concepts.map(conceptName).join(", ")}
                  </div>
                )}
                {e.notes && <div className="text-xs text-muted-foreground italic">{e.notes}</div>}
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-50 group-hover:opacity-100" onClick={() => setEditing(e)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-50 group-hover:opacity-100 text-destructive" onClick={() => remove.mutate(e.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {(adding || editing) && (
        <EquipmentEditor
          power={power}
          existing={editing}
          contractsAll={contractsAll}
          nextPosition={(equipment[equipment.length - 1]?.position ?? 0) + 1}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </Section>
  );
}

function EquipmentEditor({
  power, existing, contractsAll, nextPosition, onClose,
}: {
  power: PowerRow;
  existing: PowerEquipmentRow | null;
  contractsAll: ContractRow[];
  nextPosition: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<PowerEquipmentRow>>(
    existing ?? {
      equipment_name: "",
      quantity: 1,
      power_type: "16A_400V",
      power_kw: null,
      is_shared: false,
      shared_with_concepts: [],
      notes: null,
      position: nextPosition,
    }
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        festival_power_id: power.id,
        position: Number(form.position ?? nextPosition),
        equipment_name: form.equipment_name ?? "",
        quantity: Number(form.quantity ?? 1),
        power_type: form.power_type as PowerType,
        power_kw: form.power_kw ?? null,
        is_shared: !!form.is_shared,
        shared_with_concepts: form.is_shared ? (form.shared_with_concepts ?? []) : null,
        notes: form.notes ?? null,
      };
      if (existing) {
        const { error } = await supabase.from("festival_power_equipment").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("festival_power_equipment").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["festival-power-equipment"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const otherContracts = contractsAll.filter((c) => c.id !== power.festival_contract_id);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{existing ? "Edit equipment" : "Add equipment"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Equipment name</Label>
            <Input value={form.equipment_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, equipment_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity</Label>
              <Input type="number" value={form.quantity ?? 1} onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Position</Label>
              <Input type="number" value={form.position ?? 0} onChange={(e) => setForm((f) => ({ ...f, position: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <Label>Power type</Label>
            <Select value={form.power_type as string} onValueChange={(v) => setForm((f) => ({ ...f, power_type: v as PowerType }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {POWER_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{POWER_TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Power (kW each)</Label>
            <Input type="number" step="0.1" value={form.power_kw ?? ""} onChange={(e) => setForm((f) => ({ ...f, power_kw: e.target.value === "" ? null : Number(e.target.value) }))} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={!!form.is_shared} onCheckedChange={(v) => setForm((f) => ({ ...f, is_shared: !!v }))} />
            <Label>Shared with other concepts</Label>
          </div>
          {form.is_shared && otherContracts.length > 0 && (
            <div className="space-y-2">
              <Label>Shared with</Label>
              {otherContracts.map((c) => {
                const checked = (form.shared_with_concepts ?? []).includes(c.id);
                return (
                  <div key={c.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const cur = new Set(form.shared_with_concepts ?? []);
                        if (v) cur.add(c.id); else cur.delete(c.id);
                        setForm((f) => ({ ...f, shared_with_concepts: Array.from(cur) }));
                      }}
                    />
                    <span className="text-sm">{contractLabel(c)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
