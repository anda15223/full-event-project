import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { isValidEmail } from "@/lib/validation";
import { lookupDanishCity } from "@/lib/danish-postal-codes";
import { ArrowLeft, ArrowRight, CheckCircle2, Fish, Upload } from "lucide-react";

type Profile = {
  id: string;
  festival_staff_id: string;
  magic_token: string;
  full_legal_name: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  eu_status: "eu_eea" | "non_eu" | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  cpr: string | null;
  phone: string | null;
  email: string | null;
  bank_type: "dk" | "iban" | "nemkonto" | null;
  reg_nr: string | null;
  account_nr: string | null;
  iban: string | null;
  swift: string | null;
  work_permit_file_path: string | null;
  privacy_accepted_at: string | null;
  terms_accepted_at: string | null;
  onboarding_status: string;
  profile_completed_at: string | null;
};

type FestivalInfo = { id: string; name: string; slug: string };

const STEP_TITLES = [
  "Personal info",
  "Address",
  "Identity & contact",
  "Bank details",
  "Work permit",
  "Consent",
  "Done",
];

function highestReachable(p: Profile): number {
  if (!p.full_legal_name || !p.date_of_birth || !p.nationality || !p.eu_status) return 1;
  if (!p.address_line1 || !p.postal_code || !p.city || !p.country) return 2;
  if (!p.cpr || !p.phone || !p.email) return 3;
  if (!p.bank_type) return 4;
  if (p.eu_status === "non_eu" && !p.work_permit_file_path) return 5;
  if (!p.privacy_accepted_at || !p.terms_accepted_at) return 6;
  return 7;
}

function ExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="flex justify-center"><Fish className="h-12 w-12 text-primary" /></div>
        <h1 className="text-2xl font-semibold">Link expired or invalid</h1>
        <p className="text-muted-foreground">
          This onboarding link is no longer valid. Please ask Alexandra for a new one.
        </p>
        <p className="text-sm text-muted-foreground">— The Fish Project</p>
      </div>
    </div>
  );
}

function CompletedPage({ festivalName, signedPdfPath }: { festivalName: string; signedPdfPath?: string | null }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="flex justify-center"><CheckCircle2 className="h-12 w-12 text-green-600" /></div>
        <h1 className="text-2xl font-semibold">You're all set!</h1>
        <p className="text-muted-foreground">
          Your contract has been signed. Welcome to {festivalName}.
        </p>
        {signedPdfPath && (
          <a className="text-primary underline" href="#" onClick={(e) => e.preventDefault()}>
            Download your signed contract
          </a>
        )}
      </div>
    </div>
  );
}

export default function OnboardWizard() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [festival, setFestival] = useState<FestivalInfo | null>(null);
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [notFound, setNotFound] = useState(false);
  const [signed, setSigned] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // form state mirrors profile
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [confirmCpr, setConfirmCpr] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setNotFound(true); setLoading(false); return; }
      const { data: prof } = await supabase
        .from("fep_employee_profile")
        .select("*")
        .eq("magic_token", token)
        .gt("magic_token_expires_at", new Date().toISOString())
        .maybeSingle();
      if (cancelled) return;
      if (!prof) { setNotFound(true); setLoading(false); return; }
      if (prof.onboarding_status === "contract_signed") {
        setSigned(true);
        // fetch festival name for nicer copy
        const { data: staff } = await supabase
          .from("festival_staff").select("festival_id").eq("id", prof.festival_staff_id).maybeSingle();
        if (staff?.festival_id) {
          const { data: fest } = await supabase.from("festivals").select("id,name,slug").eq("id", staff.festival_id).maybeSingle();
          if (fest) setFestival(fest as any);
        }
        setLoading(false);
        return;
      }
      const { data: staff } = await supabase
        .from("festival_staff").select("festival_id").eq("id", prof.festival_staff_id).maybeSingle();
      let fest: FestivalInfo | null = null;
      if (staff?.festival_id) {
        const { data: f } = await supabase.from("festivals").select("id,name,slug").eq("id", staff.festival_id).maybeSingle();
        if (f) fest = f as any;
      }
      const p = prof as Profile;
      const start = highestReachable(p);
      setProfile(p);
      setDraft(p);
      setConfirmCpr(p.cpr ?? "");
      setFestival(fest);
      setStep(start);
      setMaxStep(start);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  const updateDraft = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }));

  const saveStep = async (patch: Partial<Profile>) => {
    if (!token) return false;
    setSaving(true);
    const { error } = await supabase
      .from("fep_employee_profile")
      .update(patch)
      .eq("magic_token", token);
    setSaving(false);
    if (error) { toast.error(error.message || "Save failed"); return false; }
    setProfile((p) => p ? ({ ...p, ...patch } as Profile) : p);
    return true;
  };

  // ---- per-step validation
  const stepValid = useMemo(() => {
    const d = draft;
    switch (step) {
      case 1: {
        const name = (d.full_legal_name ?? "").trim();
        const dob = d.date_of_birth ?? "";
        const nat = (d.nationality ?? "").trim();
        if (!name || name.length > 200 || !dob || !nat || !d.eu_status) return false;
        const age = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000);
        return age >= 18 && age < 120;
      }
      case 2:
        return !!(d.address_line1?.trim() && d.postal_code?.trim() && d.city?.trim() && d.country?.trim());
      case 3: {
        const cpr = (d.cpr ?? "").replace(/-/g, "");
        if (!/^\d{10}$/.test(cpr)) return false;
        if (confirmCpr.replace(/-/g, "") !== cpr) return false;
        if (!(d.phone ?? "").trim()) return false;
        if (!isValidEmail(d.email ?? "")) return false;
        return true;
      }
      case 4: {
        if (!d.bank_type) return false;
        if (d.bank_type === "dk") return /^\d{4}$/.test(d.reg_nr ?? "") && /^\d{6,10}$/.test(d.account_nr ?? "");
        if (d.bank_type === "iban") {
          const iban = (d.iban ?? "").replace(/\s/g, "");
          return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i.test(iban);
        }
        return true; // nemkonto
      }
      case 5:
        return !!(d.work_permit_file_path);
      case 6:
        return !!(d.privacy_accepted_at && d.terms_accepted_at);
      case 7:
        return true;
    }
    return false;
  }, [step, draft, confirmCpr]);

  const handleContinue = async () => {
    if (!stepValid || !profile) return;
    let patch: Partial<Profile> = {};
    let nextStep = step + 1;

    switch (step) {
      case 1:
        patch = {
          full_legal_name: draft.full_legal_name!.trim(),
          date_of_birth: draft.date_of_birth!,
          nationality: draft.nationality!.trim(),
          eu_status: draft.eu_status!,
        };
        break;
      case 2:
        patch = {
          address_line1: draft.address_line1!.trim(),
          address_line2: draft.address_line2?.trim() || null,
          postal_code: draft.postal_code!.trim(),
          city: draft.city!.trim(),
          country: draft.country!.trim(),
        };
        break;
      case 3:
        patch = {
          cpr: (draft.cpr ?? "").replace(/-/g, ""),
          phone: draft.phone!.trim(),
          email: draft.email!.trim(),
        };
        break;
      case 4: {
        const bt = draft.bank_type!;
        patch = {
          bank_type: bt,
          reg_nr: bt === "dk" ? draft.reg_nr! : null,
          account_nr: bt === "dk" ? draft.account_nr! : null,
          iban: bt === "iban" ? (draft.iban ?? "").replace(/\s/g, "") : null,
          swift: bt === "iban" ? (draft.swift?.trim() || null) : null,
        };
        // Skip step 5 for EU
        const eu = (draft.eu_status ?? profile.eu_status);
        if (eu === "eu_eea") nextStep = 6;
        break;
      }
      case 5:
        // already uploaded; nothing else to save
        break;
      case 6: {
        patch = {
          privacy_accepted_at: new Date().toISOString(),
          terms_accepted_at: new Date().toISOString(),
          profile_completed_at: new Date().toISOString(),
          onboarding_status: "completed" as any,
        };
        break;
      }
    }

    if (Object.keys(patch).length) {
      const ok = await saveStep(patch);
      if (!ok) return;
      setDraft((d) => ({ ...d, ...patch }));
    }
    setStep(nextStep);
    setMaxStep((m) => Math.max(m, nextStep));
  };

  const handleBack = () => {
    if (step <= 1) return;
    let prev = step - 1;
    // EU skips 5 going back too
    if (prev === 5 && (draft.eu_status ?? profile?.eu_status) === "eu_eea") prev = 4;
    setStep(prev);
  };

  // ---- File upload (step 5)
  const handleFile = async (file: File) => {
    if (!file || !profile || !token) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File too large (max 10MB)"); return; }
    const okTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!okTypes.includes(file.type)) { toast.error("Unsupported file type"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${profile.festival_staff_id}/work_permit.${ext}`;
    const { error: upErr } = await supabase.storage.from("crew-documents").upload(path, file, { upsert: true });
    if (upErr) { setUploading(false); toast.error(upErr.message); return; }
    const ok = await saveStep({ work_permit_file_path: path });
    setUploading(false);
    if (ok) {
      updateDraft({ work_permit_file_path: path });
      toast.success("Work permit uploaded");
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (notFound) return <ExpiredPage />;
  if (signed) return <CompletedPage festivalName={festival?.name ?? "the festival"} />;
  if (!profile) return <ExpiredPage />;

  const totalSteps = 7;
  const stepLabel = STEP_TITLES[step - 1];
  const progressPct = Math.round(((step - 1) / (totalSteps - 1)) * 100);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b">
        <div className="max-w-xl mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Fish className="h-5 w-5 text-primary" />
            <span className="font-semibold">Fish Project</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Onboarding · {festival?.name ?? "Festival"}
          </div>
          <div className="text-xs font-medium">Step {step} of {totalSteps} · {stepLabel}</div>
          <Progress value={progressPct} className="h-1.5" />
        </div>
      </header>

      {/* Body */}
      <main className="flex-1">
        <div className="max-w-xl mx-auto px-4 py-6 pb-32 space-y-6">
          {step === 1 && (
            <section className="space-y-4">
              <h1 className="text-xl font-semibold">Let's start with the basics</h1>
              <div className="space-y-2">
                <Label>Full legal name *</Label>
                <Input value={draft.full_legal_name ?? ""} onChange={(e) => updateDraft({ full_legal_name: e.target.value })} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label>Date of birth *</Label>
                <Input type="date" value={draft.date_of_birth ?? ""} onChange={(e) => updateDraft({ date_of_birth: e.target.value })} />
                <p className="text-xs text-muted-foreground">You must be 18 or older.</p>
              </div>
              <div className="space-y-2">
                <Label>Nationality *</Label>
                <Input placeholder="e.g. Dansk, Romanian, Polish" value={draft.nationality ?? ""} onChange={(e) => updateDraft({ nationality: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Citizenship status *</Label>
                <RadioGroup value={draft.eu_status ?? ""} onValueChange={(v) => updateDraft({ eu_status: v as any })}>
                  <div className="flex items-center gap-2"><RadioGroupItem value="eu_eea" id="eu" /><Label htmlFor="eu" className="font-normal">EU / EEA citizen</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="non_eu" id="non" /><Label htmlFor="non" className="font-normal">Non-EU / EEA citizen</Label></div>
                </RadioGroup>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4">
              <h1 className="text-xl font-semibold">Where do you live?</h1>
              <div className="space-y-2">
                <Label>Address line 1 *</Label>
                <Input value={draft.address_line1 ?? ""} onChange={(e) => updateDraft({ address_line1: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Address line 2</Label>
                <Input value={draft.address_line2 ?? ""} onChange={(e) => updateDraft({ address_line2: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Postal code *</Label>
                  <Input
                    inputMode="numeric"
                    value={draft.postal_code ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const next: Partial<Profile> = { postal_code: v };
                      if ((draft.country ?? "Denmark") === "Denmark" && /^\d{4}$/.test(v)) {
                        const city = lookupDanishCity(v);
                        if (city) next.city = city;
                      }
                      updateDraft(next);
                    }}
                    maxLength={10}
                  />
                </div>
                <div className="space-y-2">
                  <Label>City *</Label>
                  <Input value={draft.city ?? ""} onChange={(e) => updateDraft({ city: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Country *</Label>
                <Select value={draft.country ?? "Denmark"} onValueChange={(v) => updateDraft({ country: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Denmark","Sweden","Norway","Germany","Poland","Romania","Bulgaria","Lithuania","Latvia","Estonia","Netherlands","France","Spain","Italy","Other"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4">
              <h1 className="text-xl font-semibold">Identity and contact</h1>
              <div className="space-y-2">
                <Label>CPR number *</Label>
                <Input
                  placeholder="DDMMYY-XXXX"
                  value={draft.cpr ?? ""}
                  onChange={(e) => updateDraft({ cpr: e.target.value })}
                  maxLength={11}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">Format: 10 digits (with or without dash).</p>
              </div>
              <div className="space-y-2">
                <Label>Confirm CPR *</Label>
                <Input
                  placeholder="DDMMYY-XXXX"
                  value={confirmCpr}
                  onChange={(e) => setConfirmCpr(e.target.value)}
                  maxLength={11}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input placeholder="+45 XXXXXXXX" value={draft.phone ?? ""} onChange={(e) => updateDraft({ phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={draft.email ?? ""} onChange={(e) => updateDraft({ email: e.target.value })} />
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="space-y-4">
              <h1 className="text-xl font-semibold">Where should we pay you?</h1>
              <RadioGroup value={draft.bank_type ?? ""} onValueChange={(v) => updateDraft({ bank_type: v as any })}>
                <div className="flex items-center gap-2"><RadioGroupItem value="dk" id="bdk" /><Label htmlFor="bdk" className="font-normal">Danish bank</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="iban" id="biban" /><Label htmlFor="biban" className="font-normal">International (IBAN)</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="nemkonto" id="bnem" /><Label htmlFor="bnem" className="font-normal">NemKonto</Label></div>
              </RadioGroup>

              {draft.bank_type === "dk" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Registreringsnummer *</Label>
                    <Input inputMode="numeric" maxLength={4} value={draft.reg_nr ?? ""} onChange={(e) => updateDraft({ reg_nr: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Kontonummer *</Label>
                    <Input inputMode="numeric" maxLength={10} value={draft.account_nr ?? ""} onChange={(e) => updateDraft({ account_nr: e.target.value })} />
                  </div>
                </div>
              )}

              {draft.bank_type === "iban" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>IBAN *</Label>
                    <Input placeholder="e.g. RO49AAAA1B31007593840000" value={draft.iban ?? ""} onChange={(e) => updateDraft({ iban: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="space-y-2">
                    <Label>SWIFT / BIC</Label>
                    <Input value={draft.swift ?? ""} onChange={(e) => updateDraft({ swift: e.target.value.toUpperCase() })} />
                  </div>
                </div>
              )}

              {draft.bank_type === "nemkonto" && (
                <p className="text-sm text-muted-foreground rounded-md bg-muted p-3">
                  We'll send your salary via NemKonto using your CPR.
                </p>
              )}
            </section>
          )}

          {step === 5 && (
            <section className="space-y-4">
              <h1 className="text-xl font-semibold">Upload your work permit</h1>
              <p className="text-sm text-muted-foreground">
                As a non-EU citizen, we need a copy of your valid Danish work permit
                (opholdstilladelse med arbejdstilladelse) to legally employ you.
              </p>
              <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer hover:bg-accent">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm">{uploading ? "Uploading…" : "Tap to select a file"}</span>
                <span className="text-xs text-muted-foreground">PDF, JPG, PNG · max 10MB</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </label>
              {draft.work_permit_file_path && (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" /> Uploaded: {draft.work_permit_file_path.split("/").pop()}
                </div>
              )}
            </section>
          )}

          {step === 6 && (
            <section className="space-y-4">
              <h1 className="text-xl font-semibold">Almost done — just consent</h1>
              <div className="rounded-md border p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="privacy"
                    checked={!!draft.privacy_accepted_at}
                    onCheckedChange={(c) => updateDraft({ privacy_accepted_at: c ? new Date().toISOString() : null })}
                  />
                  <Label htmlFor="privacy" className="font-normal leading-snug">
                    I have read and accept the Privacy Notice (GDPR / Persondataforordning).{" "}
                    <button type="button" className="text-primary underline" onClick={() => setShowPrivacy(true)}>
                      Read Privacy Notice
                    </button>
                  </Label>
                </div>
              </div>
              <div className="rounded-md border p-4">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="terms"
                    checked={!!draft.terms_accepted_at}
                    onCheckedChange={(c) => updateDraft({ terms_accepted_at: c ? new Date().toISOString() : null })}
                  />
                  <Label htmlFor="terms" className="font-normal leading-snug">
                    I confirm that the information above is true and accurate, and I agree to the
                    employment terms outlined in the contract I will sign next.
                  </Label>
                </div>
              </div>
            </section>
          )}

          {step === 7 && (
            <section className="space-y-4 text-center pt-8">
              <div className="flex justify-center"><CheckCircle2 className="h-12 w-12 text-green-600" /></div>
              <h1 className="text-2xl font-semibold">Onboarding complete! 🎉</h1>
              <p className="text-muted-foreground">
                Thanks {profile.full_legal_name ?? draft.full_legal_name}! Your information is saved.
                The next step is to review and sign your employment contract.
              </p>
              <Button
                className="w-full"
                onClick={() => toast("Contract signing coming next step")}
              >
                Continue to contract <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      {step < 7 && (
        <footer className="sticky bottom-0 bg-card border-t">
          <div className="max-w-xl mx-auto px-4 py-3 flex gap-3">
            {step > 1 ? (
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            ) : <div className="flex-1" />}
            <Button onClick={handleContinue} disabled={!stepValid || saving || uploading} className="flex-1">
              {saving ? "Saving…" : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </div>
        </footer>
      )}

      <Dialog open={showPrivacy} onOpenChange={setShowPrivacy}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Privacy Notice</DialogTitle></DialogHeader>
          <div className="text-sm space-y-3 text-muted-foreground">
            <p><strong>Data controller:</strong> MCA Trading ApS / The Fish Project.</p>
            <p><strong>Purpose:</strong> We collect your personal information solely to employ you for the festival, pay your salary, and meet Danish employer obligations.</p>
            <p><strong>Categories of data:</strong> Name, address, CPR, contact details, bank details, and (for non-EU citizens) a copy of your work permit.</p>
            <p><strong>Legal basis:</strong> Employment contract (GDPR art. 6(1)(b)) and statutory obligations under Danish tax and labour law (art. 6(1)(c)).</p>
            <p><strong>Retention:</strong> Employment and payroll records are kept for 5 years after the end of the financial year, in accordance with skattekontrolloven and bogføringsloven.</p>
            <p><strong>Your rights:</strong> You have the right to access, correct, or request deletion of your data, to restrict processing, and to data portability. Contact aa@thefishproject.dk to exercise these rights.</p>
            <p><strong>Supervisory authority:</strong> You can file a complaint with Datatilsynet (datatilsynet.dk).</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
