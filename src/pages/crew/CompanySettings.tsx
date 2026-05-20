import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Settings = {
  id: string;
  company_name: string;
  cvr: string;
  address: string;
  phone: string | null;
  email: string;
  insurance_company: string | null;
  sick_contact_name: string | null;
  sick_contact_phone: string | null;
  default_hourly_rate: number;
  contract_cc_email: string | null;
};

type Template = { id: string; name: string; file_path: string; is_active: boolean };

export default function CompanySettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [original, setOriginal] = useState<Settings | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from("fep_company_settings").select("*").maybeSingle(),
      supabase.from("fep_contract_template").select("id,name,file_path,is_active")
        .eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (s) { setSettings(s as Settings); setOriginal(s as Settings); }
    if (t) setTemplate(t as Template);
  };

  useEffect(() => { load(); }, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!settings) return;
    const required: (keyof Settings)[] = ["company_name", "cvr", "address", "email"];
    for (const k of required) {
      if (!String(settings[k] ?? "").trim()) {
        toast.error(`${k.replace("_", " ")} is required`);
        return;
      }
    }
    if (!(settings.default_hourly_rate > 0)) {
      toast.error("Default hourly rate must be > 0");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("fep_company_settings")
      .update({
        company_name: settings.company_name,
        cvr: settings.cvr,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        insurance_company: settings.insurance_company,
        sick_contact_name: settings.sick_contact_name,
        sick_contact_phone: settings.sick_contact_phone,
        default_hourly_rate: settings.default_hourly_rate,
        contract_cc_email: settings.contract_cc_email,
      })
      .eq("id", settings.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved");
    setOriginal(settings);
  };

  const replaceTemplate = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Only .docx files are accepted");
      return;
    }
    setUploading(true);
    try {
      const newId = crypto.randomUUID();
      const path = `templates/${newId}.docx`;
      const { error: upErr } = await supabase.storage.from("crew-contracts").upload(path, file, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      if (upErr) throw upErr;

      // Deactivate current
      await supabase.from("fep_contract_template").update({ is_active: false }).eq("is_active", true);

      const { error: insErr } = await supabase.from("fep_contract_template").insert({
        name: `Festival hire — uploaded ${new Date().toISOString().slice(0, 10)}`,
        file_path: path,
        is_active: true,
        language: "da",
        notes: `Replaced via admin UI — original filename: ${file.name}`,
      });
      if (insErr) throw insErr;

      toast.success("Replaced template. Existing contracts unaffected.");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!settings) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Company Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">These values are used in every contract.</p>
      </header>

      <Section title="Company identity">
        <Field label="Company name" value={settings.company_name} onChange={(v) => set("company_name", v)} />
        <Field label="CVR" value={settings.cvr} onChange={(v) => set("cvr", v)} />
        <Field label="Address" value={settings.address} onChange={(v) => set("address", v)} />
        <Field label="Phone" value={settings.phone ?? ""} onChange={(v) => set("phone", v)} />
        <Field label="Email" value={settings.email} onChange={(v) => set("email", v)} type="email" />
      </Section>

      <Section title="Contract defaults">
        <Field label="Insurance company" value={settings.insurance_company ?? ""} onChange={(v) => set("insurance_company", v)} />
        <Field label="Sick contact name" value={settings.sick_contact_name ?? ""} onChange={(v) => set("sick_contact_name", v)} />
        <Field label="Sick contact phone" value={settings.sick_contact_phone ?? ""} onChange={(v) => set("sick_contact_phone", v)} />
        <div className="grid grid-cols-3 items-center gap-3">
          <Label className="text-sm">Default hourly rate</Label>
          <Input
            type="number" step="0.01" min="0"
            className="col-span-1"
            value={settings.default_hourly_rate}
            onChange={(e) => set("default_hourly_rate", parseFloat(e.target.value || "0"))}
          />
          <span className="text-sm text-muted-foreground">DKK</span>
        </div>
      </Section>

      <Section title="Notifications">
        <Field label="Contract CC email" value={settings.contract_cc_email ?? ""} onChange={(v) => set("contract_cc_email", v)} type="email" />
      </Section>

      <Section title="Active contract template">
        <div className="text-sm">
          {template ? template.name : <span className="text-muted-foreground">No active template</span>}
        </div>
        <input
          ref={fileRef} type="file" accept=".docx" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) replaceTemplate(f); }}
        />
        <Button variant="outline" size="sm" disabled={uploading}
          onClick={() => fileRef.current?.click()}>
          {uploading ? "Uploading…" : "Replace template"}
        </Button>
      </Section>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="ghost" onClick={() => original && setSettings(original)}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="grid grid-cols-3 items-center gap-3">
      <Label className="text-sm">{label}</Label>
      <Input className="col-span-2" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
