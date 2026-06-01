import React, { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CheckSquare, Download, FileUp, Lock, Pencil, Save, X, Loader2 } from "lucide-react";
import { CONCEPT_EMOJI, ConceptSlug } from "@/components/concept/types";
import { computeContractStatus, statusBadgeClasses } from "@/lib/contractStatus";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { cn } from "@/lib/utils";

const BUCKET = "festival-contracts";

export interface ContractRow {
  id: string;
  festival_id: string;
  concept_id: string;
  contract_status: string | null;
  contract_signed_date: string | null;
  contract_expires_at: string | null;
  contract_pdf_path: string | null;
  contract_pdf_uploaded_at: string | null;
  bracelet_count: number | null;
  key_obligations: string | null;
  parse_summary: string | null;
  last_parsed_at: string | null;
  counterparty_name: string | null;
}

interface FinanceRow {
  id?: string;
  contract_id: string;
  payment_amount: number | null;
  payment_currency: string | null;
  payment_terms: string | null;
  payment_status: string | null;
  operating_entity: string | null;
  counterparty: string | null;
}

interface Props {
  festivalId: string;
  festivalSlug: string;
  conceptSlug: ConceptSlug;
  conceptName: string;
  contract: ContractRow;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ContractConceptSubCard({
  festivalId, festivalSlug, conceptSlug, conceptName, contract,
}: Props) {
  const qc = useQueryClient();
  const hasFinance = useFinanceAccess();
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({
    signed: contract.contract_signed_date ?? "",
    expires: contract.contract_expires_at ?? "",
    bracelets: contract.bracelet_count?.toString() ?? "",
    obligations: contract.key_obligations ?? "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const status = computeContractStatus({
    contract_status: contract.contract_status,
    signed_at: contract.contract_signed_date,
    contract_pdf_path: contract.contract_pdf_path,
    expires_at: contract.contract_expires_at,
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["festival-contract-card", festivalId] });

  // ---------- finance ----------
  const financeQ = supabase; // placeholder for typecheck only
  const [finance, setFinance] = useState<FinanceRow | null>(null);
  React.useEffect(() => {
    if (!hasFinance) return;
    (async () => {
      const { data } = await supabase
        .from("festival_contracts_finance")
        .select("id, contract_id, payment_amount, payment_currency, payment_terms, payment_status, operating_entity, counterparty")
        .eq("contract_id", contract.id)
        .maybeSingle();
      setFinance(
        data ?? {
          contract_id: contract.id,
          payment_amount: null, payment_currency: "DKK",
          payment_terms: null, payment_status: "pending",
          operating_entity: null, counterparty: null,
        },
      );
    })();
  }, [hasFinance, contract.id]);

  // ---------- upload + parse ----------
  async function handleFile(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const uuid = crypto.randomUUID();
      const path = `${festivalId}/${conceptSlug}/${uuid}-${file.name}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false, contentType: file.type || undefined,
      });
      if (up.error) throw up.error;

      await supabase.from("festival_contracts").update({
        contract_pdf_path: path,
        contract_pdf_uploaded_at: new Date().toISOString(),
      }).eq("id", contract.id);

      toast.success("Uploaded. Parsing with AI…");
      refresh();
      setUploading(false);
      setParsing(true);

      const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
      if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error("signed url");

      const { data, error } = await supabase.functions.invoke("parse-document", {
        body: { fileUrl: signed.data.signedUrl, documentType: "contract", festivalId, conceptSlug },
      });
      if (error) throw error;
      const parsed = (data as any)?.parsed ?? {};

      const update: Record<string, any> = {
        last_parsed_at: new Date().toISOString(),
      };
      if (parsed.bracelet_count != null) update.bracelet_count = Number(parsed.bracelet_count);
      if (parsed.signed_at) update.contract_signed_date = String(parsed.signed_at).slice(0, 10);
      if (parsed.expires_at) update.contract_expires_at = String(parsed.expires_at).slice(0, 10);
      if (parsed.key_obligations) {
        update.key_obligations = Array.isArray(parsed.key_obligations)
          ? parsed.key_obligations.join("\n")
          : String(parsed.key_obligations);
      }
      if (parsed.raw_notes || parsed.summary) {
        update.parse_summary = String(parsed.raw_notes ?? parsed.summary);
      }
      if (parsed.counterparty) update.counterparty_name = String(parsed.counterparty);

      await supabase.from("festival_contracts").update(update as any).eq("id", contract.id);

      // finance write (RBAC-gated)
      if (hasFinance && (parsed.cost_to_pay != null || parsed.payment_terms || parsed.operating_entity || parsed.counterparty)) {
        const finUpdate: Record<string, any> = {
          contract_id: contract.id,
        };
        if (parsed.cost_to_pay != null) finUpdate.payment_amount = Number(parsed.cost_to_pay);
        if (parsed.currency) finUpdate.payment_currency = String(parsed.currency);
        if (parsed.payment_terms) finUpdate.payment_terms = String(parsed.payment_terms);
        if (parsed.operating_entity) finUpdate.operating_entity = String(parsed.operating_entity);
        if (parsed.counterparty) finUpdate.counterparty = String(parsed.counterparty);
        const { data: existing } = await supabase
          .from("festival_contracts_finance").select("id").eq("contract_id", contract.id).maybeSingle();
        if (existing?.id) {
          await supabase.from("festival_contracts_finance").update(finUpdate as any).eq("id", existing.id);
        } else {
          await supabase.from("festival_contracts_finance").insert(finUpdate as any);
        }
      }

      toast.success("AI parse complete — fields populated, please review");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload/parse failed");
    } finally {
      setUploading(false);
      setParsing(false);
    }
  }

  // ---------- save manual edits ----------
  const saveEdits = useMutation({
    mutationFn: async () => {
      const upd: Record<string, any> = {
        contract_signed_date: edit.signed || null,
        contract_expires_at: edit.expires || null,
        bracelet_count: edit.bracelets ? Number(edit.bracelets) : null,
        key_obligations: edit.obligations || null,
      };
      const { error } = await supabase.from("festival_contracts").update(upd as any).eq("id", contract.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setEditing(false); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  // ---------- finance save ----------
  async function saveFinance() {
    if (!finance) return;
    const payload = { ...finance };
    delete (payload as any).id;
    const { data: existing } = await supabase
      .from("festival_contracts_finance").select("id").eq("contract_id", contract.id).maybeSingle();
    if (existing?.id) {
      const { error } = await supabase.from("festival_contracts_finance").update(payload).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("festival_contracts_finance").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Finance saved");
  }

  async function downloadPdf() {
    if (!contract.contract_pdf_path) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(contract.contract_pdf_path, 300);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Could not get URL");
    window.open(data.signedUrl, "_blank");
  }

  const obligationsList = (contract.key_obligations ?? "")
    .split("\n").map((s) => s.trim()).filter(Boolean);
  const fileName = contract.contract_pdf_path?.split("/").pop() ?? null;

  return (
    <div className="rounded-xl border bg-card p-4 mb-3">
      {/* header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{CONCEPT_EMOJI[conceptSlug]}</span>
          <span className="text-base font-semibold">{conceptName}</span>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-xs font-medium", statusBadgeClasses(status.status))}>
          {status.label}
        </span>
      </div>

      {/* Missing-contract notice */}
      {!contract.contract_pdf_path && (
        <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300 font-medium">
          ⚠ No contract uploaded — please upload the signed contract PDF
        </div>
      )}

      {/* SECTION A — upload */}
      <div className="mb-4">
        {fileName && (
          <div className="flex items-center justify-between text-xs bg-muted/40 rounded-md px-3 py-2 mb-2">
            <div className="truncate">
              <span className="font-medium">{fileName}</span>
              {contract.contract_pdf_uploaded_at && (
                <span className="text-muted-foreground ml-2">
                  · uploaded {timeAgo(contract.contract_pdf_uploaded_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={downloadPdf}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                Replace
              </Button>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || parsing}
          className={cn(
            "w-full border-2 border-dashed rounded-lg p-4 text-center transition",
            "hover:bg-muted/40 hover:border-primary/40",
            (uploading || parsing) && "opacity-60 cursor-wait",
          )}
        >
          <div className="flex items-center justify-center gap-2 text-sm font-medium">
            {(uploading || parsing) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : parsing ? "Parsing with AI…" : fileName ? "Upload new contract PDF" : "Upload contract PDF"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            PDF, email, image, or Word — we'll extract details automatically
          </div>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.eml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* SECTION B — details */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Details</h4>
          {editing ? (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={() => saveEdits.mutate()} disabled={saveEdits.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <Label className="text-xs">Signed</Label>
            {editing ? (
              <Input type="date" value={edit.signed} onChange={(e) => setEdit({ ...edit, signed: e.target.value })} />
            ) : (
              <div className="py-1 text-muted-foreground">{contract.contract_signed_date ?? "—"}</div>
            )}
          </div>
          <div>
            <Label className="text-xs">Expires</Label>
            {editing ? (
              <Input type="date" value={edit.expires} onChange={(e) => setEdit({ ...edit, expires: e.target.value })} />
            ) : (
              <div className="py-1 text-muted-foreground">{contract.contract_expires_at ?? "—"}</div>
            )}
          </div>
          <div>
            <Label className="text-xs">Bracelets</Label>
            {editing ? (
              <Input type="number" value={edit.bracelets} onChange={(e) => setEdit({ ...edit, bracelets: e.target.value })} />
            ) : (
              <div className="py-1 text-muted-foreground">{contract.bracelet_count ?? "—"}</div>
            )}
          </div>
          <div>
            <Label className="text-xs">Last parsed</Label>
            <div className="py-1 text-xs text-muted-foreground italic">
              {contract.last_parsed_at ? `AI parsed ${timeAgo(contract.last_parsed_at)}` : "—"}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <Label className="text-xs">Key obligations</Label>
          {editing ? (
            <Textarea
              rows={4}
              value={edit.obligations}
              onChange={(e) => setEdit({ ...edit, obligations: e.target.value })}
              placeholder="One obligation per line"
            />
          ) : obligationsList.length === 0 ? (
            <div className="py-1 text-sm text-muted-foreground">—</div>
          ) : (
            <ul className="mt-1 space-y-1">
              {obligationsList.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckSquare className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {contract.parse_summary && (
          <div className="mt-3 text-xs italic text-muted-foreground">
            <span className="font-medium not-italic">AI summary: </span>
            {contract.parse_summary}
          </div>
        )}
      </div>

      {/* SECTION C — finance (RBAC) */}
      {hasFinance && finance && (
        <div className="mb-4 rounded-md bg-muted/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Finance</h4>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label className="text-xs">Cost</Label>
              <Input
                type="number"
                value={finance.payment_amount ?? ""}
                onChange={(e) => setFinance({ ...finance, payment_amount: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Input
                value={finance.payment_currency ?? "DKK"}
                onChange={(e) => setFinance({ ...finance, payment_currency: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Payment terms</Label>
              <Input
                value={finance.payment_terms ?? ""}
                onChange={(e) => setFinance({ ...finance, payment_terms: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Payment status</Label>
              <Select
                value={finance.payment_status ?? "pending"}
                onValueChange={(v) => setFinance({ ...finance, payment_status: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operating entity</Label>
              <Input
                value={finance.operating_entity ?? ""}
                onChange={(e) => setFinance({ ...finance, operating_entity: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Counterparty</Label>
              <Input
                value={finance.counterparty ?? ""}
                onChange={(e) => setFinance({ ...finance, counterparty: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <Button size="sm" onClick={saveFinance}>
              <Save className="h-3.5 w-3.5 mr-1" /> Save finance
            </Button>
          </div>
        </div>
      )}

      {/* SECTION E — footer */}
      <div className="flex items-center gap-2 pt-2 border-t">
        <Button
          size="sm" variant="outline"
          onClick={downloadPdf}
          disabled={!contract.contract_pdf_path}
        >
          <Download className="h-3.5 w-3.5 mr-1" /> Download contract
        </Button>
        <Button size="sm" variant="outline" disabled title="Export coming in Block 8">
          Export contract report
        </Button>
      </div>
    </div>
  );
}

export default ContractConceptSubCard;
