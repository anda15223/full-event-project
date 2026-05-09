import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateRange } from "@/lib/dateFormat";
import {
  ArrowLeft, FileSignature, Plus, Pencil, Trash2, Upload, FileDown,
  ExternalLink, AlertTriangle, FileText,
} from "lucide-react";
import {
  ContractStatus, PaymentStatus, STATUS_META, PAYMENT_META, SIGNING_PLATFORMS,
  formatDKK, daysBetween, pushStatusEntry,
} from "@/lib/contracts";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";

interface Concept { id: string; name: string; slug: string; color_hex: string | null; }
interface Festival { id: string; name: string; slug: string; start_date: string; end_date: string; }
interface Contract {
  id: string;
  festival_id: string;
  concept_id: string;
  concept_alias: string | null;
  concept_variation_note: string | null;
  operating_entity: string | null;
  operating_entity_cvr: string | null;
  contract_status: ContractStatus;
  contract_signed_date: string | null;
  signing_platform: string | null;
  contract_signed_by: string | null;
  contract_expires_at: string | null;
  contract_file_path: string | null;
  contract_value_dkk: number | null;
  payment_terms: string | null;
  payment_status: PaymentStatus | null;
  counterparty_name: string | null;
  counterparty_cvr: string | null;
  counterparty: string | null;
  stall_count: number | null;
  contract_terms_summary: string | null;
  key_obligations: string | null;
  sent_to_counterparty_at: string | null;
  expected_signing_by: string | null;
  stalled_reason: string | null;
  stalled_since: string | null;
  cancelled_reason: string | null;
  status_changed_at: string | null;
  status_history: any[] | null;
  updated_at: string;
}

const STATUS_FILTERS: (ContractStatus | "all")[] = ["all", "signed", "pending_signature", "in_negotiation", "not_started", "stalled"];

function ConceptDot({ hex }: { hex: string | null }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hex ?? "hsl(var(--muted-foreground))" }} />;
}

function StatusPill({ status }: { status: ContractStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border", m.chipClass)}>
      <span>{m.emoji}</span>{m.label}
    </span>
  );
}

function PaymentPill({ status }: { status: PaymentStatus | null }) {
  const m = PAYMENT_META[status ?? "not_invoiced"];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border", m.chipClass)}>
      {m.label}
    </span>
  );
}

export default function FestivalContracts() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const focusContractId = searchParams.get("contract");
  const qc = useQueryClient();

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug], enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from("festivals")
        .select("id, name, slug, start_date, end_date").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Festival;
    },
  });
  const festival = festivalQ.data;

  const conceptsQ = useQuery({
    queryKey: ["concepts-all"],
    queryFn: async () => {
      const { data } = await supabase.from("concepts").select("id, name, slug, color_hex").order("display_order");
      return (data ?? []) as Concept[];
    },
  });
  const conceptById = useMemo(() => new Map((conceptsQ.data ?? []).map(c => [c.id, c])), [conceptsQ.data]);

  const contractsQ = useQuery({
    queryKey: ["festival-contracts", festival?.id], enabled: !!festival?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("festival_contracts")
        .select("*").eq("festival_id", festival!.id);
      if (error) throw error;
      // Phase 1: operating_entity / counterparty / payment_* moved to festival_contracts_finance.
      // Stub them as null on the public Contract shape until Phase 3 cleanup.
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        operating_entity: null,
        counterparty: null,
        payment_terms: null,
        payment_status: null,
      })) as unknown as Contract[];
    },
  });

  const [filterStatus, setFilterStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [filterConcept, setFilterConcept] = useState<string>("all");

  const allEntities = useMemo(() => {
    const s = new Set<string>();
    (contractsQ.data ?? []).forEach(c => c.operating_entity && s.add(c.operating_entity));
    return Array.from(s).sort();
  }, [contractsQ.data]);

  const filtered = useMemo(() => {
    return (contractsQ.data ?? []).filter(c => {
      if (filterStatus !== "all" && c.contract_status !== filterStatus) return false;
      if (filterEntity !== "all" && c.operating_entity !== filterEntity) return false;
      if (filterConcept !== "all" && c.concept_id !== filterConcept) return false;
      return true;
    }).sort((a, b) => {
      const aw = a.contract_status === "stalled" ? 0 : 1;
      const bw = b.contract_status === "stalled" ? 0 : 1;
      if (aw !== bw) return aw - bw;
      const an = conceptById.get(a.concept_id)?.name ?? "";
      const bn = conceptById.get(b.concept_id)?.name ?? "";
      return an.localeCompare(bn);
    });
  }, [contractsQ.data, filterStatus, filterEntity, filterConcept, conceptById]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { signed: 0, pending_signature: 0, in_negotiation: 0, not_started: 0, stalled: 0, cancelled: 0 };
    (contractsQ.data ?? []).forEach(x => { c[x.contract_status] = (c[x.contract_status] ?? 0) + 1; });
    return c;
  }, [contractsQ.data]);

  const totalValue = useMemo(
    () => (contractsQ.data ?? []).filter(c => c.contract_status !== "cancelled")
      .reduce((s, c) => s + (Number(c.contract_value_dkk) || 0), 0),
    [contractsQ.data]
  );

  const stalled = (contractsQ.data ?? []).filter(c => c.contract_status === "stalled");

  // ---- mutations ----
  const [editing, setEditing] = useState<Contract | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusFor, setStatusFor] = useState<Contract | null>(null);
  const [deleteFor, setDeleteFor] = useState<Contract | null>(null);

  const saveContract = useMutation({
    mutationFn: async (payload: Partial<Contract> & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { error } = await supabase.from("festival_contracts").update(rest as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("festival_contracts").insert([rest as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["festival-contracts", festival?.id] });
      qc.invalidateQueries({ queryKey: ["contracts-overview"] });
      toast.success("Saved");
      setEditing(null);
      setCreating(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const deleteContract = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["festival-contracts", festival?.id] });
      toast.success("Contract deleted");
      setDeleteFor(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  // Focus contract from URL
  useEffect(() => {
    if (focusContractId) {
      const el = document.getElementById(`contract-${focusContractId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2200);
      }
    }
  }, [focusContractId, contractsQ.data]);

  if (!festival && !festivalQ.isLoading) {
    return <div className="p-8">Festival not found.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" /> Festival</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <FileSignature className="h-6 w-6 text-primary" /> Contracts
            </h1>
            {festival && (
              <p className="text-sm text-muted-foreground">
                {festival.name} · {formatDateRange(festival.start_date, festival.end_date)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/festivals/${slug}/contracts/export`} target="_blank"><FileDown className="h-4 w-4 mr-1" /> PDF</Link>
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" /> Add contract</Button>
        </div>
      </div>

      {/* Status pie summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {(["signed", "pending_signature", "in_negotiation", "not_started", "stalled", "cancelled"] as ContractStatus[]).map(s => (
          <button key={s}
            onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
            className={cn("rounded-xl border p-3 text-left transition-all hover:border-primary/50",
              filterStatus === s && "border-primary ring-1 ring-primary/30")}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{STATUS_META[s].label}</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{statusCounts[s] ?? 0}</div>
          </button>
        ))}
      </div>
      <div className="rounded-xl border p-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Total contract value (active)</span>
        <span className="text-lg font-semibold tabular-nums">{formatDKK(totalValue)}</span>
      </div>

      {/* Stalled banner */}
      {stalled.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-red-700 dark:text-red-300">
              {stalled.length} stalled contract{stalled.length > 1 ? "s" : ""}
            </div>
            <ul className="mt-1 text-sm space-y-1">
              {stalled.map(s => {
                const c = conceptById.get(s.concept_id);
                const days = s.stalled_since ? daysBetween(s.stalled_since, new Date()) : null;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span>{c?.name ?? "?"} {s.concept_alias && <span className="text-muted-foreground">({s.concept_alias})</span>} — {s.stalled_reason ?? "no reason given"}{days != null && ` · ${days}d`}</span>
                    <Button size="sm" variant="outline" onClick={() => setStatusFor(s)}>Update status</Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map(s => (
            <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"}
              onClick={() => setFilterStatus(s)}>
              {s === "all" ? "All" : STATUS_META[s as ContractStatus].label}
            </Button>
          ))}
        </div>
        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Operating entity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {allEntities.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterConcept} onValueChange={setFilterConcept}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Concept" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All concepts</SelectItem>
            {(conceptsQ.data ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Contract cards */}
      {contractsQ.isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-64" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border p-12 text-center text-muted-foreground">
          No contracts match these filters.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map(c => {
            const concept = conceptById.get(c.concept_id);
            return (
              <ContractCard key={c.id} contract={c} concept={concept ?? null}
                festivalSlug={slug}
                onEdit={() => setEditing(c)}
                onStatus={() => setStatusFor(c)}
                onDelete={() => setDeleteFor(c)}
              />
            );
          })}
        </div>
      )}

      {/* Add/Edit drawer */}
      <ContractEditDrawer
        open={!!editing || creating}
        contract={editing}
        festivalId={festival?.id ?? ""}
        concepts={conceptsQ.data ?? []}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSave={(payload) => saveContract.mutate(payload)}
        saving={saveContract.isPending}
      />

      <StatusFlowDrawer
        contract={statusFor}
        festivalSlug={slug}
        onClose={() => setStatusFor(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["festival-contracts", festival?.id] })}
      />

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contract?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFor?.contract_status === "signed"
                ? "Cannot delete a signed contract. Cancel it instead."
                : "This permanently removes the contract row."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteFor?.contract_status === "signed"}
              onClick={() => deleteFor && deleteContract.mutate(deleteFor.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Contract card ----
function ContractCard({ contract: c, concept, festivalSlug, onEdit, onStatus, onDelete }: {
  contract: Contract; concept: Concept | null; festivalSlug: string;
  onEdit: () => void; onStatus: () => void; onDelete: () => void;
}) {
  const qc = useQueryClient();
  const fileUrl = useFileUrl(c.contract_file_path);
  const [uploading, setUploading] = useState(false);
  const hasFinanceAccess = useFinanceAccess();

  const handleFile = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${festivalSlug}/${c.id}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from("festival-contracts").upload(path, file, { upsert: false });
      if (error) throw error;
      const { error: e2 } = await supabase.from("festival_contracts").update({ contract_file_path: path }).eq("id", c.id);
      if (e2) throw e2;
      toast.success("Contract uploaded");
      qc.invalidateQueries({ queryKey: ["festival-contracts"] });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const setPayment = async (status: PaymentStatus) => {
    // Phase 1: payment_status moved to festival_contracts_finance (RBAC). Update there instead.
    const { error } = await (supabase as any).from("festival_contracts_finance")
      .upsert({ contract_id: c.id, payment_status: status }, { onConflict: "contract_id" });
    if (error) toast.error(error.message);
    else { toast.success("Payment status updated"); qc.invalidateQueries({ queryKey: ["festival-contracts"] }); }
  };

  return (
    <div id={`contract-${c.id}`} className="rounded-2xl border bg-card p-4 space-y-3 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ConceptDot hex={concept?.color_hex ?? null} />
          <div className="min-w-0">
            <div className="font-semibold truncate">
              {concept?.name ?? "Unknown concept"}
              {c.concept_alias && <span className="text-muted-foreground font-normal ml-1">· {c.concept_alias}</span>}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {c.operating_entity ?? "—"}{c.operating_entity_cvr && ` · CVR ${c.operating_entity_cvr}`}
            </div>
          </div>
        </div>
        <StatusPill status={c.contract_status} />
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
        <div>
          <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Counterparty</div>
          <div className="truncate">{c.counterparty_name ?? c.counterparty ?? "—"}</div>
          {c.counterparty_cvr && <div className="text-[10px] text-muted-foreground">CVR {c.counterparty_cvr}</div>}
        </div>
        <div>
          <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Signed</div>
          <div>{c.contract_signed_date ?? "—"}{c.signing_platform && <span className="text-muted-foreground"> · {c.signing_platform}</span>}</div>
          {c.contract_signed_by && <div className="text-[10px] text-muted-foreground">By {c.contract_signed_by}</div>}
        </div>
        <div>
          <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Stalls</div>
          <div>{c.stall_count ?? 1}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Expires</div>
          <div>{c.contract_expires_at ?? "—"}</div>
        </div>
      </div>

      {c.concept_variation_note && (
        <div className="text-[12px] italic text-muted-foreground">{c.concept_variation_note}</div>
      )}

      {/* Financials */}
      <div className="rounded-lg bg-muted/30 p-2 flex items-center justify-between flex-wrap gap-2">
        <div className="text-[12px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Value · Payment</div>
          <div className="font-semibold tabular-nums">{formatDKK(c.contract_value_dkk)}</div>
          {c.payment_terms && <div className="text-[11px] text-muted-foreground">{c.payment_terms}</div>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <PaymentPill status={c.payment_status} />
          <div className="flex gap-1">
            {c.payment_status !== "invoiced" && c.payment_status !== "paid" && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setPayment("invoiced")}>Mark invoiced</Button>
            )}
            {c.payment_status !== "paid" && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setPayment("paid")}>Mark paid</Button>
            )}
          </div>
        </div>
      </div>

      {/* File */}
      <div className="rounded-lg border p-2">
        {c.contract_file_path ? (
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{c.contract_file_path.split("/").pop()}</span>
            </div>
            <div className="flex gap-1 shrink-0">
              {fileUrl && (
                <Button asChild size="sm" variant="ghost" className="h-6 px-2"><a href={fileUrl} target="_blank" rel="noreferrer">View</a></Button>
              )}
              <label className="cursor-pointer">
                <Button asChild size="sm" variant="ghost" className="h-6 px-2"><span>Replace</span></Button>
                <input type="file" accept="application/pdf,image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
            </div>
          </div>
        ) : (
          <label className="block text-center text-[12px] text-muted-foreground py-2 cursor-pointer hover:bg-muted/30 rounded">
            <Upload className="h-4 w-4 inline mr-1" />
            {uploading ? "Uploading…" : "Upload contract PDF"}
            <input type="file" accept="application/pdf,image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        )}
      </div>

      {/* Terms + obligations */}
      {c.contract_terms_summary && (
        <div className="text-[12px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Terms summary</div>
          <ul className="list-disc list-inside space-y-0.5">
            {c.contract_terms_summary.split(/\n+/).filter(Boolean).map((l, i) => <li key={i}>{l.replace(/^[-•]\s*/, "")}</li>)}
          </ul>
        </div>
      )}
      {c.key_obligations && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-[12px]">
          <div className="font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Key obligation</div>
          <div>{c.key_obligations}</div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1 pt-1 border-t">
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onStatus}>Update status</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>
      </div>
    </div>
  );
}

function useFileUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    supabase.storage.from("festival-contracts").createSignedUrl(path, 60 * 30).then(r => {
      if (!cancelled) setUrl(r.data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);
  return url;
}

// ---- Edit/create drawer ----
function ContractEditDrawer({ open, contract, festivalId, concepts, onClose, onSave, saving }: {
  open: boolean; contract: Contract | null; festivalId: string; concepts: Concept[];
  onClose: () => void;
  onSave: (p: Partial<Contract> & { id?: string }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (open) {
      setForm(contract ? { ...contract } : {
        festival_id: festivalId,
        concept_id: concepts[0]?.id ?? "",
        contract_status: "not_started",
        stall_count: 1,
      });
    }
  }, [open, contract, festivalId, concepts]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.festival_id || !form.concept_id) {
      toast.error("Concept is required"); return;
    }
    if (!form.contracting_entity && !form.operating_entity) {
      // contracting_entity is NOT NULL in schema — fall back to operating_entity
      form.contracting_entity = form.operating_entity ?? "Unknown";
    }
    if (!form.counterparty) form.counterparty = form.counterparty_name ?? "Unknown";
    onSave(form);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>{contract ? "Edit contract" : "Add contract"}</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <div>
            <Label>Concept</Label>
            <Select value={form.concept_id ?? ""} onValueChange={(v) => set("concept_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select concept" /></SelectTrigger>
              <SelectContent>{concepts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Concept alias</Label><Input value={form.concept_alias ?? ""} onChange={(e) => set("concept_alias", e.target.value)} placeholder='e.g. "Fish 1"' /></div>
            <div><Label>Stalls</Label><Input type="number" value={form.stall_count ?? 1} onChange={(e) => set("stall_count", parseInt(e.target.value) || 1)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Operating entity</Label><Input value={form.operating_entity ?? ""} onChange={(e) => set("operating_entity", e.target.value)} /></div>
            <div><Label>CVR</Label><Input value={form.operating_entity_cvr ?? ""} onChange={(e) => set("operating_entity_cvr", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Counterparty name</Label><Input value={form.counterparty_name ?? ""} onChange={(e) => set("counterparty_name", e.target.value)} /></div>
            <div><Label>Counterparty CVR</Label><Input value={form.counterparty_cvr ?? ""} onChange={(e) => set("counterparty_cvr", e.target.value)} /></div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.contract_status ?? "not_started"} onValueChange={(v) => set("contract_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(STATUS_META) as ContractStatus[]).map(s => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Contract value (DKK)</Label><Input type="number" value={form.contract_value_dkk ?? ""} onChange={(e) => set("contract_value_dkk", e.target.value === "" ? null : parseFloat(e.target.value))} /></div>
            <div><Label>Payment terms</Label><Input value={form.payment_terms ?? ""} onChange={(e) => set("payment_terms", e.target.value)} /></div>
          </div>
          <div>
            <Label>Variation note</Label>
            <Textarea value={form.concept_variation_note ?? ""} onChange={(e) => set("concept_variation_note", e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Terms summary (one per line)</Label>
            <Textarea value={form.contract_terms_summary ?? ""} onChange={(e) => set("contract_terms_summary", e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Key obligations</Label>
            <Textarea value={form.key_obligations ?? ""} onChange={(e) => set("key_obligations", e.target.value)} rows={2} />
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---- Status flow drawer ----
function StatusFlowDrawer({ contract, festivalSlug, onClose, onSaved }: {
  contract: Contract | null; festivalSlug: string; onClose: () => void; onSaved: () => void;
}) {
  const [target, setTarget] = useState<ContractStatus>("signed");
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (contract) {
      setTarget(contract.contract_status === "stalled" ? "in_negotiation" : "signed");
      setForm({
        date: new Date().toISOString().slice(0, 10),
        signing_platform: contract.signing_platform ?? "ADDO Sign",
        contract_signed_by: contract.contract_signed_by ?? "Marius Artimon",
        sent_to_counterparty_at: contract.sent_to_counterparty_at ?? new Date().toISOString().slice(0, 10),
        expected_signing_by: contract.expected_signing_by ?? "",
        reason: "",
        decision_owner: "Marius Artimon",
      });
    }
  }, [contract]);

  if (!contract) return null;

  const submit = async () => {
    setSaving(true);
    try {
      const update: any = {
        contract_status: target,
        status_changed_at: new Date().toISOString(),
        status_history: pushStatusEntry(contract.status_history, {
          from: contract.contract_status, to: target, reason: form.reason || undefined,
        }),
      };
      const sideEffects: any[] = [];

      if (target === "signed") {
        update.contract_signed_date = form.date;
        update.signing_platform = form.signing_platform;
        update.contract_signed_by = form.contract_signed_by;
        if (contract.key_obligations) {
          sideEffects.push({
            type: "action",
            payload: {
              festival_id: contract.festival_id,
              contract_id: contract.id,
              concept_id: contract.concept_id,
              title: `Confirm obligation: ${contract.key_obligations.slice(0, 80)}`,
              description: contract.key_obligations,
              priority: "high",
              status: "open",
              source: "contract_signed",
            },
          });
        }
      } else if (target === "pending_signature") {
        update.sent_to_counterparty_at = form.sent_to_counterparty_at;
        update.expected_signing_by = form.expected_signing_by || null;
        if (form.expected_signing_by) {
          sideEffects.push({
            type: "action",
            payload: {
              festival_id: contract.festival_id,
              contract_id: contract.id,
              concept_id: contract.concept_id,
              title: `Chase signature on contract`,
              description: `Counterparty hasn't returned signed contract.`,
              due_date: form.expected_signing_by,
              priority: "high",
              status: "open",
              source: "contract_pending",
            },
          });
        }
      } else if (target === "in_negotiation") {
        sideEffects.push({
          type: "question",
          payload: {
            festival_id: contract.festival_id,
            contract_id: contract.id,
            concept_id: contract.concept_id,
            question: form.reason || "Negotiation point unspecified",
            status: "open",
            priority: "high",
            decision_owner: form.decision_owner,
            deadline: form.expected_signing_by || null,
            raised_date: new Date().toISOString().slice(0, 10),
          },
        });
      } else if (target === "stalled") {
        if (!form.reason) { toast.error("Reason required"); setSaving(false); return; }
        update.stalled_reason = form.reason;
        update.stalled_since = new Date().toISOString().slice(0, 10);
        sideEffects.push({
          type: "question",
          payload: {
            festival_id: contract.festival_id,
            contract_id: contract.id,
            concept_id: contract.concept_id,
            question: `Contract stalled: ${form.reason}`,
            status: "open",
            priority: "critical",
            decision_owner: form.decision_owner,
            raised_date: new Date().toISOString().slice(0, 10),
          },
        });
      } else if (target === "cancelled") {
        if (!form.reason) { toast.error("Reason required"); setSaving(false); return; }
        update.cancelled_reason = form.reason;
      }

      const { error } = await supabase.from("festival_contracts").update(update).eq("id", contract.id);
      if (error) throw error;

      for (const eff of sideEffects) {
        if (eff.type === "action") {
          await supabase.from("festival_action_items").insert([eff.payload]);
        } else if (eff.type === "question") {
          await (supabase as any).from("festival_open_questions").insert([eff.payload]);
        }
      }

      toast.success(`Status → ${STATUS_META[target].label}`);
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Update failed");
    } finally { setSaving(false); }
  };

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <Sheet open={!!contract} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Update contract status</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <div className="text-sm text-muted-foreground">
            Current: <StatusPill status={contract.contract_status} />
          </div>
          <div>
            <Label>New status</Label>
            <Select value={target} onValueChange={(v) => setTarget(v as ContractStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(STATUS_META) as ContractStatus[]).filter(s => s !== contract.contract_status).map(s => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {target === "signed" && (
            <>
              <div><Label>Date signed</Label><Input type="date" value={form.date ?? ""} onChange={(e) => set("date", e.target.value)} /></div>
              <div><Label>Signing platform</Label>
                <Select value={form.signing_platform} onValueChange={(v) => set("signing_platform", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SIGNING_PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Signed by</Label>
                <Select value={form.contract_signed_by} onValueChange={(v) => set("contract_signed_by", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Marius Artimon", "Alexandra Artimon", "Filip", "Other"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {target === "pending_signature" && (
            <>
              <div><Label>Sent to counterparty on</Label><Input type="date" value={form.sent_to_counterparty_at ?? ""} onChange={(e) => set("sent_to_counterparty_at", e.target.value)} /></div>
              <div><Label>Expected signing by</Label><Input type="date" value={form.expected_signing_by ?? ""} onChange={(e) => set("expected_signing_by", e.target.value)} /></div>
            </>
          )}

          {target === "in_negotiation" && (
            <>
              <div><Label>Negotiation point</Label><Textarea value={form.reason ?? ""} onChange={(e) => set("reason", e.target.value)} /></div>
              <div><Label>Decision needed by</Label><Input type="date" value={form.expected_signing_by ?? ""} onChange={(e) => set("expected_signing_by", e.target.value)} /></div>
              <div><Label>Decision owner</Label>
                <Select value={form.decision_owner} onValueChange={(v) => set("decision_owner", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Marius Artimon", "Alexandra Artimon", "Filip"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}

          {target === "stalled" && (
            <>
              <div><Label>Reason (required)</Label><Textarea value={form.reason ?? ""} onChange={(e) => set("reason", e.target.value)} /></div>
              <div><Label>Decision owner</Label>
                <Select value={form.decision_owner} onValueChange={(v) => set("decision_owner", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Marius Artimon", "Alexandra Artimon", "Filip"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}

          {target === "cancelled" && (
            <div><Label>Cancellation reason (required)</Label><Textarea value={form.reason ?? ""} onChange={(e) => set("reason", e.target.value)} /></div>
          )}
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Confirm"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
