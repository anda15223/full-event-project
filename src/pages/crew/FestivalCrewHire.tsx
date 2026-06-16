import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/lib/clipboard";
import { ArrowLeft, Copy } from "lucide-react";
import { isValidEmail } from "@/lib/validation";

type Hire = {
  staff_id: string;
  name: string;
  employee_code: string | null;
  profile_id: string | null;
  email: string | null;
  phone: string | null;
  magic_token: string | null;
  magic_token_expires_at: string | null;
  onboarding_status: string | null;
  full_legal_name: string | null;
  cpr: string | null;
  contract_status: string | null;
};

type StatusKey = "not_invited" | "link_generated" | "in_progress" | "onboarded" | "contract_signed";

const STATUS_META: Record<StatusKey, { label: string; cls: string }> = {
  not_invited:     { label: "Not invited",     cls: "bg-destructive text-destructive-foreground" },
  link_generated:  { label: "Link generated",  cls: "bg-secondary text-secondary-foreground" },
  in_progress:     { label: "In progress",     cls: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-300 border border-yellow-500/40" },
  onboarded:       { label: "Onboarded",       cls: "bg-blue-500/20 text-blue-800 dark:text-blue-300 border border-blue-500/40" },
  contract_signed: { label: "Contract signed", cls: "bg-green-500/20 text-green-800 dark:text-green-300 border border-green-500/40" },
};

function computeStatus(h: Hire): StatusKey {
  if (h.contract_status === "signed") return "contract_signed";
  if (h.onboarding_status === "completed") return "onboarded";
  if (!h.profile_id) return "not_invited";
  if (h.full_legal_name || h.cpr) return "in_progress";
  return "link_generated";
}

function magicLink(token: string) {
  return `${window.location.origin}/onboard/${token}`;
}

export default function FestivalCrewHire() {
  const { slug } = useParams<{ slug: string }>();
  const [festival, setFestival] = useState<{ id: string; name: string } | null>(null);
  const [hires, setHires] = useState<Hire[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("local");
  const [submitting, setSubmitting] = useState(false);

  const [linkModal, setLinkModal] = useState<{ name: string; link: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Hire | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);

  const loadFestival = async () => {
    if (!slug) return;
    const { data } = await supabase.from("festivals").select("id,name").eq("slug", slug).maybeSingle();
    if (data) setFestival(data as any);
  };

  const loadHires = async (festivalId: string) => {
    setLoading(true);
    const { data: staff } = await supabase
      .from("festival_staff")
      .select("id,name,employee_id")
      .eq("festival_id", festivalId)
      .order("name");

    const staffList = (staff ?? []) as { id: string; name: string | null; employee_id: string | null }[];
    const ids = staffList.map((s) => s.id);
    const empIds = staffList.map((s) => s.employee_id).filter((x): x is string => !!x);

    const [{ data: profiles }, { data: contracts }, { data: employees }] = await Promise.all([
      ids.length
        ? supabase.from("fep_employee_profile").select("*").in("festival_staff_id", ids)
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabase.from("fep_contract").select("festival_staff_id,status").in("festival_staff_id", ids)
        : Promise.resolve({ data: [] as any[] }),
      empIds.length
        ? supabase.from("employees").select("id,email,phone,employee_code").in("id", empIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profMap = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => profMap.set(p.festival_staff_id, p));
    const contractMap = new Map<string, string>();
    (contracts ?? []).forEach((c: any) => {
      const prev = contractMap.get(c.festival_staff_id);
      if (c.status === "signed" || !prev) contractMap.set(c.festival_staff_id, c.status);
    });
    const empMap = new Map<string, any>();
    (employees ?? []).forEach((e: any) => empMap.set(e.id, e));

    const rows: Hire[] = staffList.map((s) => {
      const p = profMap.get(s.id);
      const emp = s.employee_id ? empMap.get(s.employee_id) : null;
      return {
        staff_id: s.id,
        name: s.name ?? "(unnamed)",
        profile_id: p?.id ?? null,
        email: p?.email ?? emp?.email ?? null,
        phone: p?.phone ?? emp?.phone ?? null,
        magic_token: p?.magic_token ?? null,
        magic_token_expires_at: p?.magic_token_expires_at ?? null,
        onboarding_status: p?.onboarding_status ?? null,
        full_legal_name: p?.full_legal_name ?? null,
        cpr: p?.cpr ?? null,
        contract_status: contractMap.get(s.id) ?? null,
      };
    });
    setHires(rows.sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  };

  useEffect(() => { loadFestival(); }, [slug]);
  useEffect(() => { if (festival) loadHires(festival.id); }, [festival]);

  const generateForProfile = async (profileId: string): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke("send-onboarding-link", {
      body: { employee_profile_id: profileId, app_url: window.location.origin },
    });
    if (error || !data?.link) {
      toast.error(error?.message || data?.error || "Failed to generate link");
      return null;
    }
    return data.link as string;
  };

  const addHire = async () => {
    if (!festival) return;
    if (!name.trim()) { toast.error("Name is required"); return; }
    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) { toast.error("Valid email is required"); return; }

    setSubmitting(true);
    try {
      const { data: staffRow, error: sErr } = await supabase
        .from("festival_staff")
        .insert({
          festival_id: festival.id,
          name: name.trim(),
          role: "Crew",
          staff_source: source,
          confirmed: false,
        })
        .select("id")
        .single();
      if (sErr || !staffRow) throw new Error(sErr?.message || "Failed to create staff");

      const { data: profileRow, error: pErr } = await supabase
        .from("fep_employee_profile")
        .insert({
          festival_staff_id: staffRow.id,
          email: trimmedEmail,
          phone: phone.trim() || null,
        })
        .select("id")
        .single();
      if (pErr || !profileRow) throw new Error(pErr?.message || "Failed to create profile");

      const link = await generateForProfile(profileRow.id);
      if (!link) throw new Error("Link generation failed");

      setLinkModal({ name: name.trim(), link });
      toast.success("Hire added. Link ready to copy.");
      setName(""); setEmail(""); setPhone(""); setSource("Local");
      await loadHires(festival.id);
    } catch (e: any) {
      toast.error(e.message || "Failed to add hire");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (link: string) => {
    const ok = await copyTextToClipboard(link);
    if (ok) toast.success("Link copied");
    else toast.error("Couldn't copy. Long-press the link to copy manually.");
  };

  const handleResend = async (h: Hire) => {
    if (!h.profile_id) return;
    const link = await generateForProfile(h.profile_id);
    if (link) {
      setLinkModal({ name: h.name, link });
      if (festival) loadHires(festival.id);
    }
  };

  const handleGenerate = async (h: Hire) => {
    if (!h.email) {
      const emailInput = prompt(`Enter email for ${h.name}:`);
      if (!emailInput) return;
      const trimmed = emailInput.trim();
      if (!isValidEmail(trimmed)) { toast.error("Valid email is required"); return; }
      const { data: profileRow, error } = await supabase
        .from("fep_employee_profile")
        .insert({ festival_staff_id: h.staff_id, email: trimmed })
        .select("id")
        .single();
      if (error || !profileRow) { toast.error(error?.message || "Failed"); return; }
      const link = await generateForProfile(profileRow.id);
      if (link) setLinkModal({ name: h.name, link });
      if (festival) loadHires(festival.id);
      return;
    }
    handleResend(h);
  };

  const confirmRemove = async () => {
    if (!removeTarget?.profile_id || !festival) return;
    const { error } = await supabase
      .from("fep_employee_profile")
      .delete()
      .eq("id", removeTarget.profile_id);
    setRemoveTarget(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile removed (staff row kept)");
    loadHires(festival.id);
  };

  const handleViewProfile = async (h: Hire) => {
    if (!h.profile_id) return;
    const { data } = await supabase
      .from("fep_employee_profile")
      .select("*")
      .eq("id", h.profile_id)
      .maybeSingle();
    setViewing(data);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <Link to={`/festivals/${slug}`} className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to festival
          </Link>
          <h1 className="font-heading text-2xl font-semibold mt-1">
            {festival?.name ?? slug} — Crew & Hire Contracts
          </h1>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border bg-card">
          <div className="px-4 py-3 border-b">
            <h2 className="font-medium">Hires</h2>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : hires.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No staff yet for this festival.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Email</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Link</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {hires.map((h) => {
                    const st = computeStatus(h);
                    const meta = STATUS_META[st];
                    const hasLink = !!h.magic_token;
                    return (
                      <tr key={h.staff_id} className="border-t">
                        <td className="px-3 py-2 font-medium">{h.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{h.email ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block text-[11px] px-2 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>
                        </td>
                        <td className="px-3 py-2">
                          {hasLink ? (
                            <div className="space-y-0.5">
                              <Button size="sm" variant="outline" onClick={() => handleCopy(magicLink(h.magic_token!))}>
                                <Copy className="h-3 w-3 mr-1" /> Copy link
                              </Button>
                              {h.magic_token_expires_at && (
                                <div className="text-[10px] text-muted-foreground">
                                  expires {new Date(h.magic_token_expires_at).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => handleGenerate(h)}>Generate link</Button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {h.profile_id && (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => handleResend(h)}>Resend</Button>
                                <Button size="sm" variant="ghost" onClick={() => handleViewProfile(h)}>View</Button>
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoveTarget(h)}>Remove</Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-3 h-fit">
          <h2 className="font-medium">Add a new hire</h2>
          <div className="space-y-2">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+45 …" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local hire</SelectItem>
                <SelectItem value="soborg">Søborg crew</SelectItem>
                <SelectItem value="fidibus">Fidibus</SelectItem>
                <SelectItem value="unknown">Other / unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={addHire} disabled={submitting} className="w-full">
            {submitting ? "Adding…" : "Add and generate"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Status flow: Not invited → Link generated → In progress → Onboarded → Contract signed
      </p>

      <Dialog open={!!linkModal} onOpenChange={(o) => !o && setLinkModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link generated</DialogTitle>
          </DialogHeader>
          {linkModal && (
            <div className="space-y-3">
              <p className="text-sm">Send this link to <strong>{linkModal.name}</strong> via WhatsApp/SMS:</p>
              <div className="rounded-md border bg-muted/40 p-3 text-xs font-mono break-all">{linkModal.link}</div>
              <p className="text-xs text-muted-foreground">Expires in 14 days.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkModal(null)}>Close</Button>
            {linkModal && (
              <Button onClick={() => handleCopy(linkModal.link)}>
                <Copy className="h-4 w-4 mr-1" /> Copy link
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Profile data</DialogTitle></DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {Object.entries(viewing)
                .filter(([k]) => !["magic_token"].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-mono text-xs break-all">{v == null ? "—" : String(v)}</dd>
                  </div>
                ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove onboarding profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the onboarding profile for <strong>{removeTarget?.name}</strong>. The staff row is kept and any unsigned link will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
