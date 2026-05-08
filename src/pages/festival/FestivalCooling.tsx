import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";

type Festival = { id: string; slug: string; name: string; start_date: string; end_date: string };

type CoolingModel = "container" | "pallet_rental" | "festival_provided";
type Status = "not_ordered" | "ordered" | "confirmed" | "delivered" | "returned";

type CoolingUnit = {
  id: string;
  festival_id: string;
  unit_label: string;
  cooling_model: CoolingModel;
  container_type: string | null;
  container_count: number | null;
  pallet_count_kol: number | null;
  pallet_count_frys: number | null;
  supplier: string | null;
  delivery_date: string | null;
  pickup_date: string | null;
  cost_dkk: number | null;
  status: Status;
  notes: string | null;
};

type ContractRow = {
  id: string;
  concept_id: string;
  concept_alias: string | null;
  concept: { slug: ConceptSlug; name: string; display_order: number | null } | null;
};

const STATUS_OPTIONS: Status[] = ["not_ordered", "ordered", "confirmed", "delivered", "returned"];
const MODEL_OPTIONS: { value: CoolingModel; label: string }[] = [
  { value: "container", label: "Container" },
  { value: "pallet_rental", label: "Pallet rental" },
  { value: "festival_provided", label: "Festival provided" },
];

function statusClasses(s: Status) {
  switch (s) {
    case "confirmed":
    case "delivered":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300";
    case "ordered":
      return "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300";
    case "returned":
      return "bg-muted text-muted-foreground border-border";
    case "not_ordered":
    default:
      return "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-300";
  }
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function contractLabel(c: ContractRow) {
  const slug = c.concept?.slug;
  const emoji = slug ? CONCEPT_EMOJI[slug] ?? "" : "";
  const base = c.concept?.name ?? "—";
  return c.concept_alias ? `${emoji} ${base} — ${c.concept_alias}` : `${emoji} ${base}`;
}

export default function FestivalCooling() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: festival } = useQuery({
    queryKey: ["festival", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id,slug,name,start_date,end_date")
        .eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });

  const festivalId = festival?.id;

  const { data: units = [] } = useQuery({
    queryKey: ["cooling-units", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_cooling_unit")
        .select("*")
        .eq("festival_id", festivalId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as CoolingUnit[];
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["festival-contracts-cooling", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select("id, concept_id, concept_alias, concept:concepts(slug, name, display_order)")
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

  const unitIds = units.map((u) => u.id);
  const { data: links = [] } = useQuery({
    queryKey: ["cooling-links", unitIds.join(",")],
    enabled: unitIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_cooling_unit_concepts")
        .select("id, cooling_unit_id, festival_contract_id")
        .in("cooling_unit_id", unitIds);
      if (error) throw error;
      return (data ?? []) as { id: string; cooling_unit_id: string; festival_contract_id: string }[];
    },
  });

  const linksByUnit = useMemo(() => {
    const map = new Map<string, Set<string>>();
    links.forEach((l) => {
      if (!map.has(l.cooling_unit_id)) map.set(l.cooling_unit_id, new Set());
      map.get(l.cooling_unit_id)!.add(l.festival_contract_id);
    });
    return map;
  }, [links]);

  // contracts that have NO cooling assigned
  const unservedContracts = useMemo(() => {
    const served = new Set<string>();
    links.forEach((l) => served.add(l.festival_contract_id));
    return contracts.filter((c) => !served.has(c.id));
  }, [links, contracts]);

  const toggleLink = useMutation({
    mutationFn: async (args: { unitId: string; contractId: string; checked: boolean }) => {
      if (args.checked) {
        const { error } = await supabase
          .from("festival_cooling_unit_concepts")
          .insert({ cooling_unit_id: args.unitId, festival_contract_id: args.contractId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("festival_cooling_unit_concepts")
          .delete()
          .eq("cooling_unit_id", args.unitId)
          .eq("festival_contract_id", args.contractId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cooling-links"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const nextLabel = useMemo(() => {
    const used = units.filter((u) => /^Container \d+$/i.test(u.unit_label))
      .map((u) => parseInt(u.unit_label.replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
    const n = used.length ? Math.max(...used) + 1 : units.length + 1;
    return `Container ${n}`;
  }, [units]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link to={`/festivals/${slug}`} className="text-xs text-muted-foreground hover:underline">
          ← Back to festival
        </Link>
        <CoolingExportMenu slug={slug} contracts={contracts} />
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h1 className="text-2xl font-bold tracking-tight">{festival?.name ?? slug}</h1>
        <p className="text-sm text-muted-foreground">Cooling plan</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Stat label="Units" value={units.length} />
          <Stat label="Contracts" value={contracts.length} />
          <Stat label="Unserved" value={unservedContracts.length} />
        </div>
      </div>

      {unservedContracts.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-destructive">No cooling assigned for:</div>
            <div className="text-muted-foreground mt-0.5">
              {unservedContracts.map(contractLabel).join(" · ")}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {units.map((u) => (
          <UnitCard
            key={u.id}
            unit={u}
            contracts={contracts}
            linkedContractIds={linksByUnit.get(u.id) ?? new Set()}
            onToggle={(contractId, checked) =>
              toggleLink.mutate({ unitId: u.id, contractId, checked })
            }
          />
        ))}
        {units.length === 0 && festival && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No cooling units yet.
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Cooling Unit
        </Button>
      </div>

      {festivalId && (
        <UnitDrawer
          open={addOpen}
          onOpenChange={setAddOpen}
          festivalId={festivalId}
          defaultLabel={nextLabel}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function CoolingExportMenu({ slug, contracts }: { slug: string; contracts: ContractRow[] }) {
  const base = `/festivals/${slug}/cooling/export`;
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
function UnitCard({
  unit, contracts, linkedContractIds, onToggle,
}: {
  unit: CoolingUnit;
  contracts: ContractRow[];
  linkedContractIds: Set<string>;
  onToggle: (contractId: string, checked: boolean) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("festival_cooling_unit").delete().eq("id", unit.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cooling unit deleted");
      qc.invalidateQueries({ queryKey: ["cooling-units"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const noConcepts = linkedContractIds.size === 0;

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", noConcepts && "border-destructive/40")}>
      <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">{unit.unit_label}</h3>
            <span className={cn("text-[10px] uppercase font-semibold px-2 py-0.5 rounded border", statusClasses(unit.status))}>
              {unit.status.replace("_", " ")}
            </span>
            <span className="text-xs text-muted-foreground border px-2 py-0.5 rounded">
              {MODEL_OPTIONS.find((o) => o.value === unit.cooling_model)?.label ?? unit.cooling_model}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">⋮</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {unit.cooling_model === "container" && (
            <>
              <Field label="Type" value={unit.container_type ?? "—"} />
              <Field label="Count" value={unit.container_count?.toString() ?? "—"} />
            </>
          )}
          {unit.cooling_model === "pallet_rental" && (
            <>
              <Field label="Køl pallets" value={unit.pallet_count_kol?.toString() ?? "—"} />
              <Field label="Frys pallets" value={unit.pallet_count_frys?.toString() ?? "—"} />
            </>
          )}
          <Field label="Supplier" value={unit.supplier ?? "—"} />
          {unit.cooling_model !== "festival_provided" && (
            <>
              <Field label="Delivery" value={fmtDate(unit.delivery_date)} />
              <Field label="Pickup" value={fmtDate(unit.pickup_date)} />
              <Field label="Cost (DKK)" value={unit.cost_dkk != null ? unit.cost_dkk.toLocaleString("da-DK") : "—"} />
            </>
          )}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Concepts served</div>
          {contracts.length === 0 ? (
            <div className="text-xs text-muted-foreground">No contracts at this festival.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {contracts.map((c) => {
                const checked = linkedContractIds.has(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm rounded border p-2 hover:bg-muted/40">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => onToggle(c.id, !!v)}
                    />
                    <span>{contractLabel(c)}</span>
                  </label>
                );
              })}
            </div>
          )}
          {noConcepts && (
            <div className="mt-2 text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> No concepts assigned
            </div>
          )}
        </div>

        {unit.notes && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
            <p className="text-sm whitespace-pre-wrap">{unit.notes}</p>
          </div>
        )}
      </div>

      <UnitDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        festivalId={unit.festival_id}
        unit={unit}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cooling unit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also remove all concept assignments for "{unit.unit_label}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

// ============================================================
function UnitDrawer({
  open, onOpenChange, festivalId, unit, defaultLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  festivalId: string;
  unit?: CoolingUnit;
  defaultLabel?: string;
}) {
  const qc = useQueryClient();
  const isEdit = !!unit;
  const [form, setForm] = useState<Partial<CoolingUnit>>(() => ({
    unit_label: unit?.unit_label ?? defaultLabel ?? "Container 1",
    cooling_model: unit?.cooling_model ?? "container",
    container_type: unit?.container_type ?? null,
    container_count: unit?.container_count ?? null,
    pallet_count_kol: unit?.pallet_count_kol ?? null,
    pallet_count_frys: unit?.pallet_count_frys ?? null,
    supplier: unit?.supplier ?? null,
    delivery_date: unit?.delivery_date ?? null,
    pickup_date: unit?.pickup_date ?? null,
    cost_dkk: unit?.cost_dkk ?? null,
    status: unit?.status ?? "not_ordered",
    notes: unit?.notes ?? null,
  }));

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        festival_id: festivalId,
        unit_label: form.unit_label?.trim() || "Container",
        cooling_model: form.cooling_model,
        container_type: form.container_type || null,
        container_count: form.container_count != null ? Number(form.container_count) : null,
        pallet_count_kol: form.pallet_count_kol != null ? Number(form.pallet_count_kol) : null,
        pallet_count_frys: form.pallet_count_frys != null ? Number(form.pallet_count_frys) : null,
        supplier: form.supplier || null,
        delivery_date: form.delivery_date || null,
        pickup_date: form.pickup_date || null,
        cost_dkk: form.cost_dkk != null && form.cost_dkk !== ("" as any) ? Number(form.cost_dkk) : null,
        status: form.status,
        notes: form.notes || null,
      };
      if (isEdit) {
        const { error } = await supabase.from("festival_cooling_unit").update(payload).eq("id", unit!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("festival_cooling_unit").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Unit updated" : "Unit created");
      qc.invalidateQueries({ queryKey: ["cooling-units"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const model = form.cooling_model as CoolingModel;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit cooling unit" : "Add cooling unit"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div>
            <Label>Label</Label>
            <Input
              value={form.unit_label ?? ""}
              onChange={(e) => setForm({ ...form, unit_label: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Model</Label>
              <Select
                value={model}
                onValueChange={(v) => setForm({ ...form, cooling_model: v as CoolingModel })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as Status })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {model === "container" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Container type</Label>
                <Input
                  value={form.container_type ?? ""}
                  placeholder="e.g. 20ft Godik reefer"
                  onChange={(e) => setForm({ ...form, container_type: e.target.value })}
                />
              </div>
              <div>
                <Label>Count</Label>
                <Input
                  type="number" min={0}
                  value={form.container_count ?? ""}
                  onChange={(e) => setForm({ ...form, container_count: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
            </div>
          )}

          {model === "pallet_rental" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Køl pallets</Label>
                <Input
                  type="number" min={0}
                  value={form.pallet_count_kol ?? ""}
                  onChange={(e) => setForm({ ...form, pallet_count_kol: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Frys pallets</Label>
                <Input
                  type="number" min={0}
                  value={form.pallet_count_frys ?? ""}
                  onChange={(e) => setForm({ ...form, pallet_count_frys: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
            </div>
          )}

          <div>
            <Label>Supplier</Label>
            <Input
              value={form.supplier ?? ""}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            />
          </div>

          {model !== "festival_provided" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Delivery date</Label>
                <Input
                  type="date"
                  value={form.delivery_date ?? ""}
                  onChange={(e) => setForm({ ...form, delivery_date: e.target.value || null })}
                />
              </div>
              <div>
                <Label>Pickup date</Label>
                <Input
                  type="date"
                  value={form.pickup_date ?? ""}
                  onChange={(e) => setForm({ ...form, pickup_date: e.target.value || null })}
                />
              </div>
              <div className="col-span-2">
                <Label>Cost (DKK)</Label>
                <Input
                  type="number" step="0.01"
                  value={form.cost_dkk ?? ""}
                  onChange={(e) => setForm({ ...form, cost_dkk: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
