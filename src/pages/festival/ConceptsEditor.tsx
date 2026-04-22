import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowLeft, Plus, Trash2, Pencil, Zap, Image as ImageIcon, Download, Upload, FileText, File as FileIcon, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFestival, useConcepts } from "@/hooks/useFestival";

type PowerExtra = { amperage?: string; count?: number; phase?: string; notes?: string };
type SubLine = { label?: string; value?: string };
type Subsection = { title?: string; lines?: SubLine[] };
type Photo = {
  url: string;
  path: string;
  name?: string;
  caption?: string;
  description?: string;
  mime_type?: string;
  size?: number;
};

const isImage = (p: Photo) =>
  (p.mime_type?.startsWith("image/")) ||
  /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/i.test(p.name || p.path || "");

const isPdf = (p: Photo) =>
  p.mime_type === "application/pdf" || /\.pdf$/i.test(p.name || p.path || "");

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = filename || "file";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank");
  }
}

/* -------------------- Read-only summary card -------------------- */

function ReadOnlyCard({ c, onEdit }: { c: any; onEdit: () => void }) {
  const subsections: Subsection[] = Array.isArray(c.subsections) ? c.subsections : [];
  const extras: PowerExtra[] = Array.isArray(c.power_extras) ? c.power_extras : [];
  const photos: Photo[] = Array.isArray(c.photos) ? c.photos : [];

  return (
    <Card className="p-5 space-y-3">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 -m-1 mb-1">
          {photos.slice(0, 6).map((p, i) => (
            <div key={i} className="relative group rounded-md overflow-hidden border border-border/40 aspect-video bg-muted">
              {isImage(p) ? (
                <img
                  src={p.url}
                  alt={p.caption || p.name || "Setup file"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : isPdf(p) ? (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full h-full flex flex-col items-center justify-center gap-1 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 transition"
                  title={p.name || "PDF"}
                >
                  <FileText className="h-6 w-6" />
                  <span className="text-[10px] font-medium px-2 truncate max-w-full">{p.name || "PDF"}</span>
                </a>
              ) : (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full h-full flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground hover:bg-muted/70 transition"
                  title={p.name || "File"}
                >
                  <FileIcon className="h-6 w-6" />
                  <span className="text-[10px] font-medium px-2 truncate max-w-full">{p.name || "File"}</span>
                </a>
              )}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); downloadFile(p.url, p.name || `file-${i + 1}`); }}
                className="absolute top-1 right-1 h-6 w-6 rounded bg-background/80 hover:bg-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm"
                title="Download"
              >
                <Download className="h-3 w-3" />
              </button>
              {(p.caption || p.description) && (
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] px-1.5 py-0.5 truncate">
                  {p.caption || p.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-lg leading-tight truncate">{c.name || "Untitled"}</h3>
          {c.tent_size && <p className="text-sm text-muted-foreground">{c.tent_size}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              "text-sm font-medium " +
              (c.zone === "INSIDE"
                ? "border-primary/40 text-primary bg-primary/5"
                : c.zone === "OUTSIDE"
                ? "border-emerald-500/40 text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40"
                : c.zone === "CAMPING"
                ? "border-amber-500/40 text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40"
                : c.zone === "VIP"
                ? "border-purple-500/40 text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-950/40"
                : c.zone === "BACKSTAGE"
                ? "border-slate-500/40 text-slate-700 bg-slate-100 dark:text-slate-300 dark:bg-slate-800/40"
                : "border-border text-foreground")
            }
          >
            {c.zone || "—"}
          </Badge>
          <Button size="sm" variant="outline" className="h-8 px-2.5 text-sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        </div>
      </div>

      {c.products_sold && (
        <p className="text-sm text-muted-foreground line-clamp-3">{c.products_sold}</p>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-muted-foreground">Thu:</span> {c.sales_hours_thu || "—"}</div>
        <div><span className="text-muted-foreground">Fri:</span> {c.sales_hours_fri || "—"}</div>
        <div><span className="text-muted-foreground">Sat:</span> {c.sales_hours_sat || "—"}</div>
        <div><span className="text-muted-foreground">Sun:</span> {c.sales_hours_sun || "—"}</div>
      </div>

      <div className="border-t border-border/50 pt-3 grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-muted-foreground">Power:</span> {c.power_baseline || "—"}</div>
        <div><span className="text-muted-foreground">Gas:</span> {c.gas_required ? (c.gas_supplier || "Yes") : "No"}</div>
        {c.wristband_max != null && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Wristbands:</span> {c.wristband_max}
            {(c.wristband_black_partout || c.wristband_normal_partout) && (
              <> ({c.wristband_black_partout || 0} black + {c.wristband_normal_partout || 0} normal)</>
            )}
          </div>
        )}
      </div>

      {extras.length > 0 && (
        <div className="bg-secondary/40 rounded-lg p-3 text-sm space-y-1">
          <p className="font-medium text-muted-foreground flex items-center gap-1">
            <Zap className="h-3.5 w-3.5" /> Power extras
          </p>
          {extras.map((p, i) => (
            <p key={i}>• {p.amperage} ×{p.count}{p.phase ? ` ${p.phase}` : ""}{p.notes ? ` — ${p.notes}` : ""}</p>
          ))}
        </div>
      )}

      {subsections.map((s, i) => (
        <div key={i} className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
          <p className="font-medium text-muted-foreground">{s.title || "Untitled"}</p>
          {(s.lines || []).map((l, j) => (
            <p key={j}>
              {l.label && <span className="text-muted-foreground">{l.label}:</span>} {l.value}
            </p>
          ))}
        </div>
      ))}
    </Card>
  );
}

/* -------------------- Edit sheet -------------------- */

function EditSheet({
  concept, open, onOpenChange, onChanged,
}: {
  concept: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [local, setLocal] = useState<any>(concept);
  // Only reset local state when switching to a different concept or reopening the sheet.
  // Do NOT depend on `concept` itself — parent refetches replace the object reference
  // on every save and would clobber in-flight keystrokes.
  useEffect(() => setLocal(concept), [concept.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (patch: Record<string, any>) => {
    setLocal((p: any) => ({ ...p, ...patch }));
    const { error } = await (supabase as any)
      .from("festival_concepts")
      .update(patch)
      .eq("id", concept.id);
    if (error) { toast.error("Save failed"); return; }
    onChanged();
  }, [concept.id, onChanged]);

  // Persist debounce timers across renders so fast typing doesn't spawn
  // multiple stale save() calls that overwrite newer keystrokes.
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debounced = useCallback((field: string, value: any) => {
    setLocal((p: any) => ({ ...p, [field]: value }));
    if (timersRef.current[field]) clearTimeout(timersRef.current[field]);
    timersRef.current[field] = setTimeout(() => save({ [field]: value }), 500);
  }, [save]);

  // Clear pending timers on unmount
  useEffect(() => () => {
    Object.values(timersRef.current).forEach(clearTimeout);
  }, []);

  /* power extras */
  const extras: PowerExtra[] = Array.isArray(local.power_extras) ? local.power_extras : [];
  const setExtras = (n: PowerExtra[]) => save({ power_extras: n });
  const addExtra = () => setExtras([...extras, { amperage: "", count: 1, phase: "", notes: "" }]);
  const updExtra = (i: number, patch: Partial<PowerExtra>) =>
    setExtras(extras.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  const rmExtra = (i: number) => setExtras(extras.filter((_, idx) => idx !== i));

  /* subsections */
  const subs: Subsection[] = Array.isArray(local.subsections) ? local.subsections : [];
  const setSubs = (n: Subsection[]) => save({ subsections: n });
  const addSub = () => setSubs([...subs, { title: "New section", lines: [] }]);
  const updSub = (i: number, patch: Partial<Subsection>) =>
    setSubs(subs.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const rmSub = (i: number) => setSubs(subs.filter((_, idx) => idx !== i));
  const addSubLine = (i: number) => {
    const lines = [...(subs[i].lines || []), { label: "", value: "" }];
    updSub(i, { lines });
  };
  const updSubLine = (i: number, j: number, patch: Partial<SubLine>) => {
    const lines = (subs[i].lines || []).map((l, idx) => idx === j ? { ...l, ...patch } : l);
    updSub(i, { lines });
  };
  const rmSubLine = (i: number, j: number) => {
    const lines = (subs[i].lines || []).filter((_, idx) => idx !== j);
    updSub(i, { lines });
  };

  /* photos */
  const photos: Photo[] = Array.isArray(local.photos) ? local.photos : [];
  const setPhotos = (n: Photo[]) => save({ photos: n });
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const next: Photo[] = [...photos];
    for (const file of Array.from(files)) {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
      const path = `${concept.festival_id}/${concept.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}`;
      const { error } = await supabase.storage.from("festival-photos").upload(path, file, {
        contentType: file.type || `application/octet-stream`,
        upsert: false,
      });
      if (error) { toast.error(`Upload failed: ${file.name}`); continue; }
      const { data: pub } = supabase.storage.from("festival-photos").getPublicUrl(path);
      next.push({
        url: pub.publicUrl,
        path,
        name: file.name,
        mime_type: file.type || `application/octet-stream`,
        size: file.size,
        caption: "",
        description: "",
      });
    }
    await setPhotos(next);
    setUploading(false);
    toast.success("Files uploaded");
  };

  const updPhoto = (i: number, patch: Partial<Photo>) => {
    const current: Photo[] = Array.isArray(local.photos) ? local.photos : [];
    setPhotos(current.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  };

  const rmPhoto = async (i: number) => {
    const current: Photo[] = Array.isArray(local.photos) ? local.photos : [];
    const p = current[i];
    if (p?.path) {
      await supabase.storage.from("festival-photos").remove([p.path]);
    }
    setPhotos(current.filter((_, idx) => idx !== i));
  };

  const remove = async () => {
    if (!confirm(`Delete concept "${concept.name}"?`)) return;
    const { error } = await supabase.from("festival_concepts").delete().eq("id", concept.id);
    if (error) { toast.error("Delete failed"); return; }
    toast.success("Concept removed");
    onOpenChange(false);
    onChanged();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto bg-background">
        <SheetHeader className="space-y-1">
          <SheetTitle className="text-lg">Edit concept</SheetTitle>
          <SheetDescription className="text-[12px]">
            Changes autosave. Add custom subsections at the bottom.
          </SheetDescription>
        </SheetHeader>

        <Accordion type="multiple" defaultValue={["basics", "power"]} className="mt-4">
          {/* BASICS */}
          <AccordionItem value="basics">
            <AccordionTrigger className="text-[13px]">Basics</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Name</Label>
                <Input value={local.name ?? ""} onChange={(e) => debounced("name", e.target.value)} className="h-9 text-[13px]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Tent size</Label>
                  <Input value={local.tent_size ?? ""} onChange={(e) => debounced("tent_size", e.target.value)} className="h-9 text-[13px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Zone</Label>
                  <Select value={local.zone ?? "INSIDE"} onValueChange={(v) => save({ zone: v })}>
                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="INSIDE">INSIDE</SelectItem>
                      <SelectItem value="OUTSIDE">OUTSIDE</SelectItem>
                      <SelectItem value="CAMPING">CAMPING</SelectItem>
                      <SelectItem value="VIP">VIP</SelectItem>
                      <SelectItem value="BACKSTAGE">BACKSTAGE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Products sold</Label>
                <Textarea value={local.products_sold ?? ""} onChange={(e) => debounced("products_sold", e.target.value)} rows={3} className="text-[13px]" />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* SALES HOURS */}
          <AccordionItem value="hours">
            <AccordionTrigger className="text-[13px]">Sales hours</AccordionTrigger>
            <AccordionContent className="grid grid-cols-2 gap-2 pt-2">
              {(["thu", "fri", "sat", "sun"] as const).map(d => (
                <div key={d} className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground uppercase">{d}</Label>
                  <Input value={local[`sales_hours_${d}`] ?? ""} onChange={(e) => debounced(`sales_hours_${d}`, e.target.value)} className="h-9 text-[13px]" />
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          {/* POWER & GAS */}
          <AccordionItem value="power">
            <AccordionTrigger className="text-[13px]">Power & gas</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Baseline</Label>
                  <Input value={local.power_baseline ?? ""} onChange={(e) => debounced("power_baseline", e.target.value)} className="h-9 text-[13px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Gas</Label>
                  <div className="flex items-center gap-2 h-9">
                    <Switch checked={!!local.gas_required} onCheckedChange={(v) => save({ gas_required: v })} />
                    <Input value={local.gas_supplier ?? ""} onChange={(e) => debounced("gas_supplier", e.target.value)} className="h-8 text-[12px] flex-1" placeholder="Supplier" disabled={!local.gas_required} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">Power extras</Label>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={addExtra}>
                    <Plus className="h-3 w-3 mr-0.5" /> Add line
                  </Button>
                </div>
                {extras.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">None</p>
                ) : extras.map((p, i) => (
                  <div key={i} className="grid grid-cols-[80px_60px_70px_1fr_28px] gap-1.5 items-center">
                    <Input value={p.amperage ?? ""} onChange={(e) => updExtra(i, { amperage: e.target.value })} className="h-7 text-[11px]" placeholder="16A" />
                    <Input type="number" value={p.count ?? ""} onChange={(e) => updExtra(i, { count: e.target.value === "" ? undefined : Number(e.target.value) })} className="h-7 text-[11px]" placeholder="×" />
                    <Input value={p.phase ?? ""} onChange={(e) => updExtra(i, { phase: e.target.value })} className="h-7 text-[11px]" placeholder="1P/3P" />
                    <Input value={p.notes ?? ""} onChange={(e) => updExtra(i, { notes: e.target.value })} className="h-7 text-[11px]" placeholder="Notes" />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => rmExtra(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* WRISTBANDS */}
          <AccordionItem value="wristbands">
            <AccordionTrigger className="text-[13px]">Wristbands</AccordionTrigger>
            <AccordionContent className="grid grid-cols-3 gap-2 pt-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Max</Label>
                <Input type="number" value={local.wristband_max ?? ""} onChange={(e) => debounced("wristband_max", e.target.value === "" ? null : Number(e.target.value))} className="h-9 text-[13px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Black partout</Label>
                <Input type="number" value={local.wristband_black_partout ?? ""} onChange={(e) => debounced("wristband_black_partout", e.target.value === "" ? null : Number(e.target.value))} className="h-9 text-[13px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Normal partout</Label>
                <Input type="number" value={local.wristband_normal_partout ?? ""} onChange={(e) => debounced("wristband_normal_partout", e.target.value === "" ? null : Number(e.target.value))} className="h-9 text-[13px]" />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* PHOTOS */}
          <AccordionItem value="photos">
            <AccordionTrigger className="text-[13px]">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Photos {photos.length > 0 && <span className="text-muted-foreground">({photos.length})</span>}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }}
                />
                <div className="flex items-center justify-center gap-2 h-20 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition text-[12px] text-muted-foreground">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Uploading…" : "Click to upload setup photos"}
                </div>
              </label>

              {photos.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="space-y-1.5 bg-muted/40 rounded-lg p-2 border border-border/40">
                      <div className="relative rounded overflow-hidden border border-border/40 aspect-video bg-background">
                        <img src={p.url} alt={p.caption || p.name} className="w-full h-full object-cover" />
                      </div>
                      <Input
                        value={p.caption ?? ""}
                        onChange={(e) => updPhoto(i, { caption: e.target.value })}
                        className="h-7 text-[11px]"
                        placeholder="Caption (optional)"
                      />
                      <div className="flex items-center justify-between gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] flex-1"
                          onClick={() => downloadFile(p.url, p.name || `setup-${i + 1}.jpg`)}
                        >
                          <Download className="h-3 w-3 mr-1" /> Download
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                          onClick={() => rmPhoto(i)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* CUSTOM SUBSECTIONS */}
          <AccordionItem value="custom">
            <AccordionTrigger className="text-[13px]">Custom subsections</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              {subs.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">No custom subsections yet.</p>
              )}
              {subs.map((s, i) => (
                <div key={i} className="bg-muted/40 rounded-lg p-3 space-y-2 border border-border/40">
                  <div className="flex items-center gap-2">
                    <Input
                      value={s.title ?? ""}
                      onChange={(e) => updSub(i, { title: e.target.value })}
                      className="h-8 text-[13px] font-medium flex-1"
                      placeholder="Subsection title (e.g. Cooling needs)"
                    />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => rmSub(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {(s.lines || []).map((l, j) => (
                    <div key={j} className="grid grid-cols-[1fr_1.4fr_28px] gap-1.5 items-center">
                      <Input value={l.label ?? ""} onChange={(e) => updSubLine(i, j, { label: e.target.value })} className="h-7 text-[11px]" placeholder="Label" />
                      <Input value={l.value ?? ""} onChange={(e) => updSubLine(i, j, { value: e.target.value })} className="h-7 text-[11px]" placeholder="Value" />
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => rmSubLine(i, j)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] w-full justify-start" onClick={() => addSubLine(i)}>
                    <Plus className="h-3 w-3 mr-1" /> Add line
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="w-full h-8" onClick={addSub}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add new subsection
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-6 pt-4 border-t border-border/40">
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete concept
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------- Page -------------------- */

function ConceptItem({ concept, onChanged }: { concept: any; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ReadOnlyCard c={concept} onEdit={() => setOpen(true)} />
      <EditSheet concept={concept} open={open} onOpenChange={setOpen} onChanged={onChanged} />
    </>
  );
}

export default function ConceptsEditor() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const { data: festival } = useFestival(slug);
  const { data: concepts = [] } = useConcepts(festival?.id);

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["festival_concepts", festival.id] });

  const addConcept = async () => {
    const nextOrder = concepts.length ? Math.max(...concepts.map((c: any) => c.order_index)) + 1 : 0;
    const { error } = await supabase.from("festival_concepts").insert({
      festival_id: festival.id,
      name: "New concept",
      zone: "INSIDE",
      order_index: nextOrder,
      gas_required: false,
      power_extras: [],
    });
    if (error) { toast.error("Could not add concept"); return; }
    invalidate();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Concepts</h1>
          <p className="text-sm text-muted-foreground mt-1">{concepts.length} concepts at {festival.name}</p>
        </div>
        <Button onClick={addConcept} size="sm" className="h-8">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add concept
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {concepts.map((c: any) => (
          <ConceptItem key={c.id} concept={c} onChanged={invalidate} />
        ))}
      </div>
    </div>
  );
}
