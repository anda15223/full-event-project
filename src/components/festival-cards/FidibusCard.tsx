import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Download,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  Phone,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { CardUploadZone } from "./shared";

interface Props {
  festivalId: string;
}

const CATEGORY = "fidibus";
const KEYS = {
  overview: "fidibus:overview",
  setup: "fidibus:setup_plan",
  electrical: "fidibus:electrical_plan",
  cooling: "fidibus:cooling_plan",
  other: "fidibus:other_details",
  stands: "fidibus:stand_count",
  contacts: "fidibus:contacts",
} as const;

type Contact = { id: string; name: string; role: string; phone: string; email: string };
type Attachment = { id: string; storage_path: string; filename: string; uploaded_at: string };

type SectionKey = "setup" | "electrical";

export function FidibusCard({ festivalId }: Props) {
  const qc = useQueryClient();

  // ---------- Festival header ----------
  const { data: festival } = useQuery({
    queryKey: ["festival_header", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("name, start_date, end_date, location")
        .eq("id", festivalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ---------- Brain entries for this card ----------
  const { data: brainRows = [] } = useQuery({
    queryKey: ["fidibus_brain", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("id, key_name, content, structured_data")
        .eq("festival_id", festivalId)
        .eq("category", CATEGORY);
      if (error) throw error;
      return data ?? [];
    },
  });

  const brainByKey = useMemo(() => {
    const m: Record<string, { id: string; content: string; structured_data: any }> = {};
    for (const r of brainRows as any[]) m[r.key_name] = r;
    return m;
  }, [brainRows]);

  // Form state
  const [overview, setOverview] = useState("");
  const [setupPlan, setSetupPlan] = useState("");
  const [electricalPlan, setElectricalPlan] = useState("");
  const [coolingPlan, setCoolingPlan] = useState("");
  const [otherDetails, setOtherDetails] = useState("");
  const [standCount, setStandCount] = useState<string>("");
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Hydrate from brain
  useEffect(() => {
    setOverview(brainByKey[KEYS.overview]?.content ?? "");
    setSetupPlan(brainByKey[KEYS.setup]?.content ?? "");
    setElectricalPlan(brainByKey[KEYS.electrical]?.content ?? "");
    setCoolingPlan(brainByKey[KEYS.cooling]?.content ?? "");
    setOtherDetails(brainByKey[KEYS.other]?.content ?? "");
    setStandCount(brainByKey[KEYS.stands]?.content ?? "");
    const c = brainByKey[KEYS.contacts]?.structured_data?.contacts;
    setContacts(Array.isArray(c) ? c : []);
  }, [brainByKey]);

  // ---------- Pulled context ----------
  // Power Requirements (brain category 'electric' / 'power_requirements')
  const { data: powerBrain = [] } = useQuery({
    queryKey: ["fidibus_power_brain", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("display_name, content, category")
        .eq("festival_id", festivalId)
        .in("category", ["electric", "power_requirements"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Cooling brain context
  const { data: coolingBrain = [] } = useQuery({
    queryKey: ["fidibus_cooling_brain", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("display_name, content")
        .eq("festival_id", festivalId)
        .eq("category", "cooling_storage");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Equipment "by us"
  const { data: equipment = [] } = useQuery({
    queryKey: ["fidibus_equipment", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_db")
        .select("item_name, quantity, status, card_origin, notes")
        .eq("festival_id", festivalId)
        .eq("source", "by_us")
        .order("card_origin", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Concept-derived power baseline (used as fallback for electrical context)
  const { data: concepts = [] } = useQuery({
    queryKey: ["fidibus_concepts", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_concepts")
        .select("name, power_baseline")
        .eq("festival_id", festivalId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---------- Attachments (setup + electrical plans) ----------
  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ["fidibus_attachments", festivalId],
    queryFn: async () => {
      const prefix = `fidibus/${festivalId}`;
      const out: { section: SectionKey; files: Attachment[] }[] = [];
      for (const section of ["setup", "electrical"] as SectionKey[]) {
        const { data, error } = await supabase.storage
          .from("festival-photos")
          .list(`${prefix}/${section}`, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
        if (error) continue;
        out.push({
          section,
          files: (data ?? [])
            .filter((f) => !f.name.startsWith("."))
            .map((f) => ({
              id: f.id ?? f.name,
              storage_path: `${prefix}/${section}/${f.name}`,
              filename: f.name,
              uploaded_at: f.created_at ?? "",
            })),
        });
      }
      return out;
    },
  });

  const filesFor = (section: SectionKey) =>
    attachments.find((a) => a.section === section)?.files ?? [];

  // ---------- Mutations ----------
  const upsertBrain = async (
    key: string,
    content: string,
    displayName: string,
    structured?: Record<string, any>,
  ) => {
    const existing = brainByKey[key];
    const payload = {
      key_name: key,
      display_name: displayName,
      content,
      category: CATEGORY,
      scope: "festival",
      festival_id: festivalId,
      source: "manual",
      structured_data: structured ?? {},
      tags: ["fidibus"],
    };
    if (existing?.id) {
      const { error } = await supabase.from("brain_entries").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("brain_entries").insert(payload);
      if (error) throw error;
    }
  };

  const [saving, setSaving] = useState(false);
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await Promise.all([
        upsertBrain(KEYS.overview, overview, "Festival Plan Overview"),
        upsertBrain(KEYS.setup, setupPlan, "Setup Plan"),
        upsertBrain(KEYS.electrical, electricalPlan, "Electrical Plan"),
        upsertBrain(KEYS.cooling, coolingPlan, "Cooling Space Plan"),
        upsertBrain(KEYS.other, otherDetails, "Other Details"),
        upsertBrain(KEYS.stands, String(standCount ?? ""), "Number of Stands"),
        upsertBrain(KEYS.contacts, `${contacts.length} contacts`, "Fidibus Contacts", {
          contacts,
        }),
      ]);
      toast.success("Fidibus plan saved");
      qc.invalidateQueries({ queryKey: ["fidibus_brain", festivalId] });
    } catch (e: any) {
      toast.error(`Save failed: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  // Contact CRUD (local state; persisted on Save)
  const addContact = () =>
    setContacts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", role: "", phone: "", email: "" },
    ]);
  const updateContact = (id: string, patch: Partial<Contact>) =>
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeContact = (id: string) =>
    setContacts((prev) => prev.filter((c) => c.id !== id));

  // File upload (per section)
  const [uploadingSection, setUploadingSection] = useState<SectionKey | null>(null);
  const handleFileUpload = async (section: SectionKey, file: File) => {
    setUploadingSection(section);
    try {
      const path = `fidibus/${festivalId}/${section}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("festival-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      toast.success(`Uploaded ${file.name}`);
      refetchAttachments();
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message ?? e}`);
    } finally {
      setUploadingSection(null);
    }
  };

  const handleDeleteFile = async (path: string) => {
    const { error } = await supabase.storage.from("festival-photos").remove([path]);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    toast.success("File removed");
    refetchAttachments();
  };

  const publicUrl = (path: string) =>
    supabase.storage.from("festival-photos").getPublicUrl(path).data.publicUrl;

  // ---------- PDF generation ----------
  const buildPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    let y = margin;

    const ensureSpace = (h: number) => {
      if (y + h > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    const writeWrapped = (text: string, size = 10, leading = 14, bold = false) => {
      if (!text || !text.trim()) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(size);
        ensureSpace(leading);
        doc.setTextColor(140);
        doc.text("(not provided)", margin, y);
        doc.setTextColor(0);
        y += leading;
        return;
      }
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
      for (const line of lines) {
        ensureSpace(leading);
        doc.text(line, margin, y);
        y += leading;
      }
    };

    const sectionHeader = (title: string) => {
      ensureSpace(36);
      y += 8;
      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 18;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(title, margin, y);
      y += 16;
    };

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Fidibus Setup Report", margin, y);
    y += 24;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const fest = festival?.name ?? "Festival";
    const dates =
      festival?.start_date && festival?.end_date
        ? `${festival.start_date} → ${festival.end_date}`
        : "";
    const loc = festival?.location ?? "";
    doc.text(fest, margin, y);
    y += 14;
    if (dates) {
      doc.text(dates, margin, y);
      y += 14;
    }
    if (loc) {
      doc.text(loc, margin, y);
      y += 14;
    }
    y += 6;

    // 1. Overview
    sectionHeader("1. Festival Plan Overview");
    writeWrapped(overview);

    // 2. Contacts
    sectionHeader("2. Contact Persons");
    if (contacts.length === 0) {
      writeWrapped("");
    } else {
      contacts.forEach((c) => {
        ensureSpace(60);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(c.name || "(unnamed)", margin, y);
        y += 13;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        if (c.role) {
          doc.text(c.role, margin, y);
          y += 13;
        }
        if (c.phone) {
          doc.text(`Phone: ${c.phone}`, margin, y);
          y += 13;
        }
        if (c.email) {
          doc.text(`Email: ${c.email}`, margin, y);
          y += 13;
        }
        y += 4;
      });
    }

    // 3. Stands
    sectionHeader("3. Number of Stands");
    writeWrapped(standCount || "");

    // 4. Setup Plan
    sectionHeader("4. Setup Plan");
    writeWrapped(setupPlan);
    const setupFiles = filesFor("setup");
    if (setupFiles.length) {
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      ensureSpace(14);
      doc.text("Attachments:", margin, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      setupFiles.forEach((f) => {
        ensureSpace(13);
        doc.text(`• ${f.filename}`, margin, y);
        y += 13;
      });
    }

    // 5. Electrical
    sectionHeader("5. Electrical Plan");
    writeWrapped(electricalPlan);
    if (powerBrain.length || concepts.length) {
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      ensureSpace(14);
      doc.text("Pulled from Power Requirements:", margin, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      powerBrain.forEach((p: any) => {
        writeWrapped(`• ${p.display_name ?? "Power"}: ${p.content ?? ""}`);
      });
      concepts.forEach((c: any) => {
        if (c.power_baseline) writeWrapped(`• ${c.name}: ${c.power_baseline}`);
      });
    }
    const electricalFiles = filesFor("electrical");
    if (electricalFiles.length) {
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      ensureSpace(14);
      doc.text("Attachments:", margin, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      electricalFiles.forEach((f) => {
        ensureSpace(13);
        doc.text(`• ${f.filename}`, margin, y);
        y += 13;
      });
    }

    // 6. Equipment
    sectionHeader("6. Equipment Plan (provided by us)");
    if (!equipment.length) {
      writeWrapped("");
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      equipment.forEach((e: any) => {
        const qty = e.quantity ? ` × ${e.quantity}` : "";
        const origin = e.card_origin ? ` [${e.card_origin}]` : "";
        ensureSpace(13);
        doc.text(`• ${e.item_name}${qty}${origin}`, margin, y);
        y += 13;
      });
    }

    // 7. Cooling
    sectionHeader("7. Cooling Space Plan");
    writeWrapped(coolingPlan);
    if (coolingBrain.length) {
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      ensureSpace(14);
      doc.text("Pulled from Cooling & Storage:", margin, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      coolingBrain.forEach((c: any) => {
        writeWrapped(`• ${c.display_name ?? "Cooling"}: ${c.content ?? ""}`);
      });
    }

    // 8. Other
    sectionHeader("8. Other Details");
    writeWrapped(otherDetails);

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(
        `Generated ${new Date().toLocaleDateString()} • Page ${i} / ${pageCount}`,
        pageWidth / 2,
        pageHeight - 24,
        { align: "center" },
      );
    }

    const filename = `Fidibus-${(festival?.name ?? "festival").replace(/\s+/g, "_")}.pdf`;
    doc.save(filename);
  };

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      // Save first so PDF reflects latest edits
      await handleSaveAll();
      buildPdf();
      toast.success("Fidibus report generated");
    } catch (e: any) {
      toast.error(`Export failed: ${e.message ?? e}`);
    } finally {
      setExporting(false);
    }
  };

  // ---------- UI ----------
  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Fidibus Setup Plan
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Detailed plan for the external Fidibus setup team. All edits are saved to Brain and
              included in the exported PDF.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSaveAll} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
            <Button size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Generate Fidibus Report
            </Button>
          </div>
        </div>

        {/* 1. Overview */}
        <section className="space-y-2">
          <Label className="text-sm font-semibold">1. Festival Plan Overview</Label>
          <Textarea
            value={overview}
            onChange={(e) => setOverview(e.target.value)}
            rows={4}
            placeholder="High-level description of the festival, our footprint, our concepts on site, expected volumes…"
          />
        </section>

        {/* 2. Contacts */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              2. Contact Persons
            </Label>
            <Button size="sm" variant="outline" onClick={addContact}>
              <Plus className="h-4 w-4" /> Add contact
            </Button>
          </div>
          {contacts.length === 0 && (
            <p className="text-xs text-muted-foreground">No contacts added yet.</p>
          )}
          <div className="space-y-2">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-md border p-3"
              >
                <Input
                  className="md:col-span-3"
                  placeholder="Name"
                  value={c.name}
                  onChange={(e) => updateContact(c.id, { name: e.target.value })}
                />
                <Input
                  className="md:col-span-3"
                  placeholder="Role"
                  value={c.role}
                  onChange={(e) => updateContact(c.id, { role: e.target.value })}
                />
                <div className="md:col-span-3 relative">
                  <Phone className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7"
                    placeholder="Phone"
                    value={c.phone}
                    onChange={(e) => updateContact(c.id, { phone: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2 relative">
                  <Mail className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7"
                    placeholder="Email"
                    value={c.email}
                    onChange={(e) => updateContact(c.id, { email: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:col-span-1 justify-self-end"
                  onClick={() => removeContact(c.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Stands */}
        <section className="space-y-2">
          <Label className="text-sm font-semibold">3. Number of Stands</Label>
          <Input
            type="number"
            min={0}
            className="max-w-[180px]"
            value={standCount}
            onChange={(e) => setStandCount(e.target.value)}
            placeholder="e.g. 4"
          />
        </section>

        {/* 4. Setup Plan */}
        <section className="space-y-2">
          <Label className="text-sm font-semibold">4. Setup Plan</Label>
          <Textarea
            value={setupPlan}
            onChange={(e) => setSetupPlan(e.target.value)}
            rows={5}
            placeholder="Schedule, sequence, who does what, vehicle routing, build order…"
          />
          <FileSection
            label="Setup attachments"
            section="setup"
            files={filesFor("setup")}
            uploading={uploadingSection === "setup"}
            onUpload={(f) => handleFileUpload("setup", f)}
            onDelete={handleDeleteFile}
            urlFor={publicUrl}
          />
        </section>

        {/* 5. Electrical */}
        <section className="space-y-2">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" />
            5. Electrical Plan
          </Label>
          <Textarea
            value={electricalPlan}
            onChange={(e) => setElectricalPlan(e.target.value)}
            rows={5}
            placeholder="Power distribution, panel locations, cable runs, total kW required…"
          />
          {(powerBrain.length > 0 || concepts.some((c: any) => c.power_baseline)) && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
              <div className="font-semibold text-muted-foreground">
                From Power Requirements card
              </div>
              {powerBrain.map((p: any, i: number) => (
                <div key={`pb-${i}`}>
                  <span className="font-medium">{p.display_name ?? "Power"}:</span> {p.content}
                </div>
              ))}
              {concepts
                .filter((c: any) => c.power_baseline)
                .map((c: any, i: number) => (
                  <div key={`pc-${i}`}>
                    <span className="font-medium">{c.name}:</span> {c.power_baseline}
                  </div>
                ))}
            </div>
          )}
          <FileSection
            label="Electrical attachments"
            section="electrical"
            files={filesFor("electrical")}
            uploading={uploadingSection === "electrical"}
            onUpload={(f) => handleFileUpload("electrical", f)}
            onDelete={handleDeleteFile}
            urlFor={publicUrl}
          />
        </section>

        {/* 6. Equipment */}
        <section className="space-y-2">
          <Label className="text-sm font-semibold">6. Equipment Plan (provided by us)</Label>
          <p className="text-xs text-muted-foreground">
            Auto-populated from Equipment List (source = by us). Edit those cards to update.
          </p>
          {equipment.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No equipment marked as “by us” yet.
            </p>
          ) : (
            <div className="rounded-md border divide-y max-h-64 overflow-auto">
              {equipment.map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex-1">
                    <span className="font-medium">{e.item_name}</span>
                    {e.quantity && (
                      <span className="text-muted-foreground"> × {e.quantity}</span>
                    )}
                  </div>
                  {e.card_origin && (
                    <span className="text-xs text-muted-foreground">{e.card_origin}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 7. Cooling */}
        <section className="space-y-2">
          <Label className="text-sm font-semibold">7. Cooling Space Plan</Label>
          <Textarea
            value={coolingPlan}
            onChange={(e) => setCoolingPlan(e.target.value)}
            rows={4}
            placeholder="Cooling units placement, capacity, power, access for restocking…"
          />
          {coolingBrain.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
              <div className="font-semibold text-muted-foreground">
                From Cooling & Storage card
              </div>
              {coolingBrain.map((c: any, i: number) => (
                <div key={i}>
                  <span className="font-medium">{c.display_name ?? "Cooling"}:</span> {c.content}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 8. Other */}
        <section className="space-y-2">
          <Label className="text-sm font-semibold">8. Other Details</Label>
          <Textarea
            value={otherDetails}
            onChange={(e) => setOtherDetails(e.target.value)}
            rows={4}
            placeholder="Anything else Fidibus needs to know…"
          />
        </section>
      </Card>

      <CardUploadZone
        festivalId={festivalId}
        cardName="fidibus"
        title="Fidibus reference docs"
        subtitle="Drop site maps, contracts, organiser briefs, etc."
      />
    </div>
  );
}

// ---------- File subcomponent ----------
function FileSection({
  label,
  section,
  files,
  uploading,
  onUpload,
  onDelete,
  urlFor,
}: {
  label: string;
  section: SectionKey;
  files: Attachment[];
  uploading: boolean;
  onUpload: (f: File) => void;
  onDelete: (path: string) => void;
  urlFor: (path: string) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.currentTarget.value = "";
            }}
          />
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent">
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Upload file
          </span>
        </label>
      </div>
      {files.length > 0 && (
        <div className="rounded-md border divide-y">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <a
                href={urlFor(f.storage_path)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 hover:underline truncate"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                {f.filename}
              </a>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDelete(f.storage_path)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FidibusCard;
