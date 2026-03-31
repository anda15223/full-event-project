import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ShieldCheck, ExternalLink, Copy, Check, CreditCard,
  AlertTriangle, Trash2, Mail, Save,
} from "lucide-react";
import PdfViewer from "./PdfViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Invoice } from "@/hooks/useInvoices";
import { useMarkAsPaid, useUpdateInvoiceField } from "@/hooks/useInvoices";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const COMPANIES = [
  "M.C.A. Holding ApS",
  "MCA Trading ApS",
  "The Fish Project ApS",
  "Blue Fish ApS",
  "Aegean ApS",
  "Athos ApS",
  "Romania",
];

const LOCATIONS = [
  "Copenhagen Storage",
  "The Fish Project Reffen",
  "The Fish Project Helsingør",
  "The Fish Project Aarhus",
  "Fish Bistro",
  "Gaia",
  "Gaia Aarhus",
  "Gentofte",
  "Søborg Storage",
  "Central Storage — The Fish Project",
];

interface Props {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function InvoiceReviewPanel({ invoice, open, onOpenChange }: Props) {
  const inv = invoice;
  const qc = useQueryClient();
  const markPaid = useMarkAsPaid();
  const updateField = useUpdateInvoiceField();
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Editable form state
  const [form, setForm] = useState({
    supplier_name: inv.supplier_name || "",
    invoice_number: inv.invoice_number || "",
    invoice_date: inv.invoice_date || "",
    due_date: inv.due_date || "",
    amount: inv.amount?.toString() || "",
    vat_amount: inv.vat_amount?.toString() || "",
    currency: inv.currency || "DKK",
    company: inv.company || "",
    location: inv.location || "",
    what_was_bought: inv.what_was_bought || "",
    payment_account: inv.payment_account || "",
    payment_reference: inv.payment_reference || "",
    notes: inv.notes || "",
  });

  const [customLocation, setCustomLocation] = useState("");
  const [useCustomLocation, setUseCustomLocation] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [pdfStoragePath, setPdfStoragePath] = useState<string | null>(null);
  const [pdfAttachmentId, setPdfAttachmentId] = useState<string | null>(null);
  const [emailInfo, setEmailInfo] = useState<{ sender: string; subject: string; received_at?: string; body_html?: string; body_clean_text?: string } | null>(null);

  // Reset form when invoice changes
  useEffect(() => {
    setForm({
      supplier_name: inv.supplier_name || "",
      invoice_number: inv.invoice_number || "",
      invoice_date: inv.invoice_date || "",
      due_date: inv.due_date || "",
      amount: inv.amount?.toString() || "",
      vat_amount: inv.vat_amount?.toString() || "",
      currency: inv.currency || "DKK",
      company: inv.company || "",
      location: inv.location || "",
      what_was_bought: inv.what_was_bought || "",
      payment_account: inv.payment_account || "",
      payment_reference: inv.payment_reference || "",
      notes: inv.notes || "",
    });
    setConfirmStep(false);
    setUseCustomLocation(!LOCATIONS.includes(inv.location || ""));
    setCustomLocation(LOCATIONS.includes(inv.location || "") ? "" : (inv.location || ""));
  }, [inv.id]);

  // Resolve PDF source — find storage path or attachment ID
  useEffect(() => {
    if (!open) return;
    setPdfStoragePath(null);
    setPdfAttachmentId(null);
    
    const loadPdfSource = async () => {
      // If invoice has a pdf_url, extract storage path from it
      if (inv.pdf_url) {
        if (inv.pdf_url.startsWith("http")) {
          // Extract storage path from full URL
          const match = inv.pdf_url.match(/email-attachments\/(.+)$/);
          if (match) {
            setPdfStoragePath(match[1]);
          } else {
            // Fallback: use full URL as storage path (might be a different format)
            setPdfStoragePath(inv.pdf_url);
          }
        } else {
          setPdfStoragePath(inv.pdf_url);
        }
        return;
      }
      
      // No pdf_url — try to find attachment via email_id
      if (inv.email_id) {
        const { data } = await supabase
          .from("email_attachments")
          .select("id, storage_path")
          .eq("email_id", inv.email_id!)
          .ilike("mime_type", "%pdf%")
          .limit(1);
        if (data?.[0]) {
          if (data[0].storage_path) {
            setPdfStoragePath(data[0].storage_path);
          } else {
            setPdfAttachmentId(data[0].id);
          }
        }
      }
    };
    
    loadPdfSource();
    
    // Load email info
    if (inv.email_id) {
      (async () => {
        const { data } = await supabase
          .from("emails")
          .select("sender, subject, received_at, body_html, body_clean_text")
          .eq("id", inv.email_id!)
          .single();
        if (data) setEmailInfo(data);
      })();
    }
  }, [open, inv.id, inv.pdf_url, inv.email_id]);

  // Focus first input on open
  useEffect(() => {
    if (open) setTimeout(() => firstInputRef.current?.focus(), 300);
  }, [open]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onOpenChange(false); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleApprove(); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, form]);

  const totalWithVat = (() => {
    const a = parseFloat(form.amount) || 0;
    const v = parseFloat(form.vat_amount) || 0;
    return a + v;
  })();

  const confidencePercent = inv.confidence != null ? Math.round(inv.confidence * 100) : null;
  const confidenceColor = confidencePercent == null ? "bg-muted" :
    confidencePercent >= 80 ? "bg-success" : confidencePercent >= 60 ? "bg-warning" : "bg-destructive";

  const sl = inv.status === "overdue" || inv.overdue_flag ? "OVERDUE"
    : inv.status === "paid" ? "PAID"
    : inv.status === "approved" ? "APPROVED" : "PENDING";

  const statusBadgeClass = sl === "OVERDUE" ? "bg-destructive/10 text-destructive border-destructive/20"
    : sl === "PAID" ? "bg-success/10 text-success border-success/20"
    : sl === "APPROVED" ? "bg-agent-green/10 text-agent-green border-agent-green/20"
    : "bg-warning/10 text-warning border-warning/20";

  const handleSave = useCallback(async () => {
    const original: Record<string, any> = {
      supplier_name: inv.supplier_name, invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date, due_date: inv.due_date,
      amount: inv.amount?.toString(), vat_amount: inv.vat_amount?.toString(),
      currency: inv.currency, company: inv.company, location: inv.location,
      what_was_bought: inv.what_was_bought, payment_account: inv.payment_account,
      payment_reference: inv.payment_reference, notes: inv.notes,
    };

    const effectiveLocation = useCustomLocation ? customLocation : form.location;
    const updates: Record<string, any> = {};
    const corrections: { field: string; old_value: string; new_value: string }[] = [];

    const formWithLocation = { ...form, location: effectiveLocation };

    for (const [key, val] of Object.entries(formWithLocation)) {
      const origVal = original[key] || "";
      if (val !== origVal && val !== undefined) {
        const dbVal = (key === "amount" || key === "vat_amount") ? parseFloat(val) || null : val;
        updates[key] = dbVal;
        corrections.push({ field: key, old_value: origVal || "", new_value: val });
      }
    }
    // Also set total_with_vat
    updates.total_with_vat = totalWithVat;

    if (Object.keys(updates).length === 0) {
      toast.info("No changes to save");
      return;
    }

    const { error } = await supabase.from("invoices").update(updates).eq("id", inv.id);
    if (error) { toast.error("Failed to save"); return; }

    // Write corrections
    for (const c of corrections) {
      await supabase.from("supplier_corrections").insert({
        supplier_name: formWithLocation.supplier_name || inv.supplier_name,
        field_corrected: c.field,
        old_value: c.old_value,
        new_value: c.new_value,
        invoice_id: inv.id,
      });
    }

    qc.invalidateQueries({ queryKey: ["invoices"] });
    toast.success(`Saved — I'll remember this for ${formWithLocation.supplier_name || inv.supplier_name} next time`);
  }, [form, customLocation, useCustomLocation, inv, totalWithVat, qc]);

  const handleApprove = async () => {
    await handleSave();
    await supabase.from("invoices").update({ status: "approved" }).eq("id", inv.id);
    qc.invalidateQueries({ queryKey: ["invoices"] });
    toast.success("Invoice approved");
    onOpenChange(false);
  };

  const handleNotInvoice = async () => {
    await supabase.from("invoices").update({ status: "ignored", notes: "Marked as not an invoice by user" }).eq("id", inv.id);
    if (inv.email_id) {
      await supabase.from("emails").update({ classification: "ignored" }).eq("id", inv.email_id);
    }
    qc.invalidateQueries({ queryKey: ["invoices"] });
    toast.success("Removed — email marked as ignored");
    onOpenChange(false);
  };

  const handleMarkPaid = () => {
    markPaid.mutate(inv, {
      onSuccess: () => { setConfirmStep(false); onOpenChange(false); },
    });
  };

  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60"
            onClick={() => onOpenChange(false)}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-6xl bg-background border-l border-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card shrink-0">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="gap-1.5 h-8 rounded-xl">
                  <X className="h-4 w-4" /> Close
                </Button>
                <span className="text-sm font-heading font-semibold text-foreground">Invoice Review</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${statusBadgeClass}`}>{sl}</span>
              </div>
              <div className="flex items-center gap-2">
                {confidencePercent != null && (
                  <span className="text-xs text-muted-foreground">Confidence: <span className="font-bold">{confidencePercent}%</span></span>
                )}
                <span className="text-xs text-muted-foreground/50">Esc to close · Ctrl+S save · Ctrl+Enter approve</span>
              </div>
            </div>

            {/* Body — two columns */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left — PDF (55%) */}
              <div className="w-[55%] border-r border-border/30 flex flex-col bg-secondary/10">
                {emailInfo && (
                  <div className="px-5 py-3 border-b border-border/20 bg-card/50 space-y-0.5 shrink-0">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">From:</span> {emailInfo.sender}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Subject:</span> {emailInfo.subject}
                    </div>
                    {emailInfo.received_at && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Date:</span> {new Date(emailInfo.received_at).toLocaleDateString("da-DK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex-1 p-4 overflow-hidden">
                  {(pdfStoragePath || pdfAttachmentId) ? (
                    <div className="h-full rounded-xl border border-border/40 overflow-hidden flex flex-col">
                      <div className="px-4 py-2 bg-secondary/40 border-b border-border/30 flex items-center justify-between shrink-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PDF Document</span>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <PdfViewer storagePath={pdfStoragePath || undefined} attachmentId={pdfAttachmentId || undefined} />
                      </div>
                    </div>
                  ) : emailInfo?.body_html || emailInfo?.body_clean_text ? (
                    <div className="h-full rounded-xl border border-border/40 overflow-hidden flex flex-col">
                      <div className="px-4 py-2 bg-secondary/40 border-b border-border/30 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email Source — No PDF</span>
                        </div>
                        {inv.source_type === "web_order" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-warning/10 text-warning border border-warning/20">Web Order</span>
                        )}
                      </div>

                      {inv.source_type === "web_order" && (
                        <div className="mx-4 mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10 text-sm space-y-1">
                          <p className="font-semibold text-primary text-xs">Web order — key fields</p>
                          {inv.invoice_number && <p className="text-xs text-muted-foreground">Order number: <span className="font-mono font-medium text-foreground">{inv.invoice_number}</span></p>}
                          {inv.location && <p className="text-xs text-muted-foreground">Delivery location: <span className="font-medium text-foreground">{inv.location}</span></p>}
                          <p className="text-xs text-muted-foreground">VAT added: <span className="font-medium text-foreground">25% on top of order total</span></p>
                        </div>
                      )}

                      <div className="flex-1 overflow-auto px-4 py-3">
                        {emailInfo.body_html ? (
                          <div
                            className="text-sm prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-a:text-primary"
                            dangerouslySetInnerHTML={{ __html: emailInfo.body_html }}
                          />
                        ) : (
                          <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/80 leading-relaxed">
                            {emailInfo.body_clean_text}
                          </pre>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full rounded-xl border border-border/40 bg-secondary/20 flex items-center justify-center">
                      <div className="text-center p-8">
                        <ShieldCheck className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground font-medium">No PDF attached</p>
                        <p className="text-xs text-muted-foreground mt-1">Upload or fetch the source document to verify</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right — Editable fields (45%) */}
              <div className="w-[45%] overflow-y-auto overscroll-contain p-6 space-y-5" style={{ maxHeight: '100%' }}>
                {/* Supplier */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Supplier</Label>
                  <Input ref={firstInputRef} value={form.supplier_name} onChange={e => setField("supplier_name", e.target.value)} className="rounded-xl" />
                </div>

                {/* Invoice Number */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Invoice Number</Label>
                  <Input value={form.invoice_number} onChange={e => setField("invoice_number", e.target.value)} className="rounded-xl font-mono" />
                </div>

                {/* Dates row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Invoice Date</Label>
                    <Input type="date" value={form.invoice_date} onChange={e => setField("invoice_date", e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Due Date</Label>
                    <Input type="date" value={form.due_date} onChange={e => setField("due_date", e.target.value)} className="rounded-xl" />
                  </div>
                </div>

                {/* Amounts */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Amount (ex VAT)</Label>
                    <Input type="number" step="0.01" value={form.amount} onChange={e => setField("amount", e.target.value)} className="rounded-xl font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">VAT Amount</Label>
                    <Input type="number" step="0.01" value={form.vat_amount} onChange={e => setField("vat_amount", e.target.value)} className="rounded-xl font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total with VAT</Label>
                    <div className="h-10 px-3 rounded-xl border border-border bg-secondary/30 flex items-center">
                      <span className="text-sm font-mono font-bold text-agent-green">{totalWithVat.toLocaleString("da-DK")} {form.currency}</span>
                    </div>
                  </div>
                </div>

                {/* Company */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Company</Label>
                  <Select value={form.company} onValueChange={v => setField("company", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {COMPANIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Location</Label>
                  {!useCustomLocation ? (
                    <Select value={form.location} onValueChange={v => {
                      if (v === "__custom__") { setUseCustomLocation(true); return; }
                      setField("location", v);
                    }}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select location" /></SelectTrigger>
                      <SelectContent>
                        {LOCATIONS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                        <SelectItem value="__custom__">Other — type manually</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-2">
                      <Input value={customLocation} onChange={e => setCustomLocation(e.target.value)} placeholder="Type location..." className="rounded-xl flex-1" />
                      <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { setUseCustomLocation(false); setField("location", ""); }}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                {/* What was bought */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">What Was Bought</Label>
                  <Textarea value={form.what_was_bought} onChange={e => setField("what_was_bought", e.target.value)} className="rounded-xl" rows={3} />
                </div>

                {/* Payment */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Payment Account</Label>
                    <Input value={form.payment_account} onChange={e => setField("payment_account", e.target.value)} className="rounded-xl font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Payment Reference</Label>
                    <Input value={form.payment_reference} onChange={e => setField("payment_reference", e.target.value)} className="rounded-xl font-mono" />
                  </div>
                </div>

                {/* Confidence */}
                {confidencePercent != null && (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Confidence Score</Label>
                    <div className="flex items-center gap-3">
                      <Progress value={confidencePercent} className={`h-2.5 flex-1 [&>div]:${confidenceColor}`} />
                      <span className={`text-sm font-bold font-mono ${confidencePercent >= 80 ? "text-success" : confidencePercent >= 60 ? "text-warning" : "text-destructive"}`}>
                        {confidencePercent}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Extraction Notes</Label>
                  <Input value={form.notes} onChange={e => setField("notes", e.target.value)} className="rounded-xl" placeholder="AI extraction notes..." />
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-border/30 space-y-3">
                  <div className="flex gap-2">
                    <Button onClick={handleSave} className="flex-1 rounded-xl gap-1.5 h-10" variant="outline">
                      <Save className="h-4 w-4" /> Save corrections
                    </Button>
                    <Button onClick={handleApprove} className="flex-1 rounded-xl gap-1.5 h-10 bg-agent-green hover:bg-agent-green/90 text-white">
                      <Check className="h-4 w-4" /> Confirm & approve
                    </Button>
                  </div>

                  {inv.status !== "paid" && (
                    <>
                      {!confirmStep ? (
                        <Button onClick={() => setConfirmStep(true)} className="w-full rounded-xl gap-1.5 h-10 bg-success hover:bg-success/90 text-success-foreground">
                          <CreditCard className="h-4 w-4" /> Mark as paid
                        </Button>
                      ) : (
                        <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 space-y-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-foreground">Confirm payment</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Marking <span className="font-mono font-bold">{inv.invoice_number}</span> from{" "}
                                <span className="font-semibold">{inv.supplier_name}</span> as paid.
                              </p>
                              <p className="text-xs text-destructive mt-1 font-medium">This moves the invoice to the ledger.</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={handleMarkPaid} disabled={markPaid.isPending} className="flex-1 rounded-xl bg-success hover:bg-success/90 text-success-foreground gap-1.5">
                              <Check className="h-4 w-4" /> Yes, paid
                            </Button>
                            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmStep(false)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={handleNotInvoice} variant="ghost" className="flex-1 rounded-xl gap-1.5 h-9 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" /> Not an invoice
                    </Button>
                    {inv.email_id && (
                      <Button variant="ghost" className="flex-1 rounded-xl gap-1.5 h-9 text-xs" asChild>
                        <a href={`/email-memory?id=${inv.email_id}`}>
                          <Mail className="h-3.5 w-3.5" /> Open original email
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
