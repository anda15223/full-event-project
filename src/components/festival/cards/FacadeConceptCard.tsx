import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Upload, FileText, Download, Image as ImageIcon, X, Loader2,
} from "lucide-react";
import { computeFacadeStatus, FACADE_STATUS_PILL } from "@/lib/facadeStatus";
import { FACADE_STATUSES, FACADE_STATUS_META } from "@/lib/facade";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface FacadeRow {
  id: string;
  festival_contract_id: string;
  design_status: string | null;
  material_type: string | null;
  print_deadline: string | null;
  tent_width_m: number | null;
  tent_depth_m: number | null;
  tent_height_m: number | null;
  facade_width_m: number | null;
  facade_height_m: number | null;
  setup_notes: string | null;
  spec_pdf_path: string | null;
  spec_pdf_uploaded_at: string | null;
  last_parsed_at: string | null;
  parse_summary: string | null;
}

export interface FacadePhotoRow {
  id: string;
  festival_facade_id: string;
  file_path: string;
  file_name: string;
  caption: string | null;
}

interface Props {
  festivalId: string;
  festivalSlug: string;
  conceptId: string;
  conceptSlug: string;
  conceptName: string;
  facade: FacadeRow;
  photos: FacadePhotoRow[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtDim(v: number | null) {
  if (v == null) return null;
  return Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1);
}

function InlineNumber({
  value, onSave, suffix,
}: { value: number | null; onSave: (v: number | null) => void; suffix?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value?.toString() ?? "");
  if (!editing) {
    return (
      <button onClick={() => { setV(value?.toString() ?? ""); setEditing(true); }}
        className="hover:underline text-left">
        {value != null ? `${fmtDim(value)}${suffix ?? ""}` : "—"}
      </button>
    );
  }
  return (
    <Input
      type="number" autoFocus value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); onSave(v === "" ? null : parseFloat(v)); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-7 text-sm"
    />
  );
}

export function FacadeConceptCard({
  festivalId, festivalSlug, conceptId, conceptSlug, conceptName, facade, photos,
}: Props) {
  const qc = useQueryClient();
  const [uploadingSpec, setUploadingSpec] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [notesDraft, setNotesDraft] = useState(facade.setup_notes ?? "");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const specInputRef = useRef<HTMLInputElement>(null);

  const status = computeFacadeStatus(facade);
  const emoji = CONCEPT_EMOJI[conceptSlug as ConceptSlug] ?? "🎪";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["facade-page", festivalSlug] });
    qc.invalidateQueries({ queryKey: ["facade-photos", festivalSlug] });
  };

  const updateFacade = useMutation({
    mutationFn: async (patch: Partial<FacadeRow>) => {
      const { error } = await supabase.from("festival_facade")
        .update(patch as any).eq("id", facade.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  // Equipment for this concept at this festival — name + qty + dimensions/notes.
  const equipmentQ = useQuery({
    queryKey: ["facade-concept-equipment", festivalId, conceptId],
    enabled: !!festivalId && !!conceptId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_equipment")
        .select("id,name,category,quantity,qty,notes,position_zone,zone")
        .eq("festival_id", festivalId)
        .eq("concept_id", conceptId)
        .eq("is_draft", false)
        .order("category", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const equipment = equipmentQ.data ?? [];
  const [equipOpen, setEquipOpen] = useState(false);
  const equipMutation = useMutation({
    mutationFn: async ({ id, qty }: { id: string; qty: number }) => {
      const { error } = await supabase.from("festival_equipment")
        .update({ quantity: qty, qty } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facade-concept-equipment", festivalId, conceptId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const updateCaption = async (id: string, caption: string) => {
    await supabase.from("festival_facade_photos").update({ caption } as any).eq("id", id);
    invalidate();
  };
  const setCover = async (id: string) => {
    // Set chosen photo to display_order 0, push others down by 1.
    await supabase.from("festival_facade_photos").update({ display_order: 0 } as any).eq("id", id);
    let idx = 1;
    for (const p of photos.filter((x) => x.id !== id)) {
      await supabase.from("festival_facade_photos").update({ display_order: idx } as any).eq("id", p.id);
      idx++;
    }
    invalidate();
  };

  const uploadSpec = async (file: File) => {
    setUploadingSpec(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${festivalId}/${conceptSlug}/specs/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from("facade-designs").upload(path, file);
      if (error) throw error;
      await supabase.from("festival_facade").update({
        spec_pdf_path: path,
        spec_pdf_uploaded_at: new Date().toISOString(),
      } as any).eq("id", facade.id);
      toast.success("Uploaded — parsing with AI…");
      invalidate();

      try {
        const { data: signed } = await supabase.storage.from("facade-designs").createSignedUrl(path, 600);
        if (signed?.signedUrl) {
          const { data: parsed } = await supabase.functions.invoke("parse-document", {
            body: { fileUrl: signed.signedUrl, documentType: "facade" },
          });
          if (parsed?.ok && parsed.parsed) {
            const p = parsed.parsed as any;
            const upd: any = { last_parsed_at: new Date().toISOString() };
            if (facade.tent_width_m == null && p.tent_dimensions?.width_m != null) upd.tent_width_m = p.tent_dimensions.width_m;
            if (facade.tent_depth_m == null && p.tent_dimensions?.depth_m != null) upd.tent_depth_m = p.tent_dimensions.depth_m;
            if (facade.tent_height_m == null && p.tent_dimensions?.height_m != null) upd.tent_height_m = p.tent_dimensions.height_m;
            if (facade.facade_width_m == null && p.facade_dimensions?.width_m != null) upd.facade_width_m = p.facade_dimensions.width_m;
            if (facade.facade_height_m == null && p.facade_dimensions?.height_m != null) upd.facade_height_m = p.facade_dimensions.height_m;
            if (p.setup_notes) {
              upd.setup_notes = facade.setup_notes
                ? `${facade.setup_notes}\n\n[AI] ${p.setup_notes}`
                : p.setup_notes;
            }
            if (p.raw_notes || p.summary) upd.parse_summary = String(p.raw_notes ?? p.summary).slice(0, 500);
            await supabase.from("festival_facade").update(upd).eq("id", facade.id);
            toast.success("AI parse complete — please review");
            invalidate();
          }
        }
      } catch (pe: any) {
        console.warn("parse-document failed", pe);
        toast.message("Uploaded — AI parse skipped");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploadingSpec(false);
    }
  };

  const uploadPhotos = async (files: FileList | File[]) => {
    setUploadingPhotos(true);
    try {
      const list = Array.from(files);
      for (const file of list) {
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${festivalId}/${conceptSlug}/photos/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from("facade-designs").upload(path, file);
        if (error) throw error;
        await supabase.from("festival_facade_photos").insert({
          festival_facade_id: facade.id,
          file_path: path,
          file_name: file.name,
        } as any);
      }
      toast.success(`${list.length} photo${list.length === 1 ? "" : "s"} uploaded`);
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Photo upload failed");
    } finally {
      setUploadingPhotos(false);
    }
  };

  const deletePhoto = async (p: FacadePhotoRow) => {
    try {
      await supabase.storage.from("facade-designs").remove([p.file_path]);
      await supabase.from("festival_facade_photos").delete().eq("id", p.id);
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  };

  const openSpec = async () => {
    if (!facade.spec_pdf_path) return;
    const { data } = await supabase.storage.from("facade-designs")
      .createSignedUrl(facade.spec_pdf_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl">{emoji}</span>
          <h3 className="text-xl font-bold truncate">{conceptName}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={facade.design_status ?? "not_started"}
            onValueChange={(v) => updateFacade.mutate({ design_status: v })}
          >
            <SelectTrigger className={cn(
              "h-auto py-1 px-3 rounded-full text-sm font-medium border w-auto gap-1.5",
              FACADE_STATUS_PILL[status.status],
            )}>
              <span aria-hidden>{status.emoji}</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FACADE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {FACADE_STATUS_META[s].emoji} {FACADE_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2 py-0.5">
            Reusable
          </span>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tent</div>
          <div className="flex items-center gap-1 tabular-nums">
            <InlineNumber value={facade.tent_width_m} onSave={(v) => updateFacade.mutate({ tent_width_m: v })} />
            <span className="text-muted-foreground">×</span>
            <InlineNumber value={facade.tent_depth_m} onSave={(v) => updateFacade.mutate({ tent_depth_m: v })} />
            <span className="text-muted-foreground">×</span>
            <InlineNumber value={facade.tent_height_m} onSave={(v) => updateFacade.mutate({ tent_height_m: v })} />
            <span className="text-muted-foreground ml-1">m</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Facade</div>
          <div className="flex items-center gap-1 tabular-nums">
            <InlineNumber value={facade.facade_width_m} onSave={(v) => updateFacade.mutate({ facade_width_m: v })} />
            <span className="text-muted-foreground">×</span>
            <InlineNumber value={facade.facade_height_m} onSave={(v) => updateFacade.mutate({ facade_height_m: v })} />
            <span className="text-muted-foreground ml-1">m</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Material</div>
          <div className="truncate">{facade.material_type ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Print deadline</div>
          <div className="tabular-nums">{facade.print_deadline ?? "—"}</div>
        </div>
      </div>

      {/* Photos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">
            Photos {photos.length > 0 && <span className="text-muted-foreground font-normal">· {photos.length}</span>}
          </h4>
          <Button size="sm" variant="ghost" className="h-7 text-xs"
            onClick={() => photoInputRef.current?.click()} disabled={uploadingPhotos}>
            {uploadingPhotos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "+ Add photos"}
          </Button>
          <input ref={photoInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp"
            className="hidden" onChange={(e) => e.target.files && uploadPhotos(e.target.files)} />
        </div>
        {photos.length === 0 ? (
          <label
            className="block border-2 border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/30 transition"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) uploadPhotos(e.dataTransfer.files); }}
          >
            <ImageIcon className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <div className="font-medium text-foreground/70">Drop facade photos or click to upload</div>
            <div className="text-[11px] mt-1">JPG · PNG · WebP · multiple files supported</div>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp"
              className="hidden" onChange={(e) => e.target.files && uploadPhotos(e.target.files)} />
          </label>
        ) : (
          <div
            className="space-y-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) uploadPhotos(e.dataTransfer.files); }}
          >
            {/* Hero photo — first in display order */}
            <HeroPhotoTile
              photo={photos[0]}
              onDelete={() => deletePhoto(photos[0])}
              onCaption={(c) => updateCaption(photos[0].id, c)}
            />
            {photos.length > 1 && (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {photos.slice(1).map((p) => (
                  <PhotoTile
                    key={p.id}
                    photo={p}
                    onDelete={() => deletePhoto(p)}
                    onSetCover={() => setCover(p.id)}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="w-full text-[11px] text-muted-foreground hover:text-foreground border border-dashed rounded-md py-1.5 hover:bg-muted/30 transition"
            >
              + Drop more photos here or click to add
            </button>
          </div>
        )}
      </div>

      {/* Equipment linked to this concept */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">
            Equipment for {conceptName}{" "}
            <span className="text-muted-foreground font-normal">· {equipment.length}</span>
          </h4>
          <div className="flex gap-1">
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
              <a href={`/festivals/${festivalSlug}/equipment`}>Open list →</a>
            </Button>
            {equipment.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs"
                onClick={() => setEquipOpen((v) => !v)}>
                {equipOpen ? "Hide" : "Show"}
              </Button>
            )}
          </div>
        </div>
        {equipmentQ.isLoading ? (
          <div className="text-[11px] text-muted-foreground italic">Loading…</div>
        ) : equipment.length === 0 ? (
          <div className="text-[11px] text-muted-foreground italic">
            No equipment items assigned to this concept yet.
          </div>
        ) : equipOpen ? (
          <div className="rounded-lg border divide-y text-xs">
            {equipment.map((it) => {
              const dims = [it.position_zone, it.zone].filter(Boolean).join(" · ");
              const qty = it.quantity ?? it.qty ?? 1;
              return (
                <div key={it.id} className="flex items-center gap-2 px-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{it.name ?? "—"}</div>
                    {(it.category || dims || it.notes) && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        {[it.category, dims, it.notes].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <InlineNumber
                    value={qty}
                    suffix="×"
                    onSave={(v) => equipMutation.mutate({ id: it.id, qty: v ?? 1 })}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            {equipment.reduce((s, it) => s + (it.quantity ?? it.qty ?? 1), 0)} pieces across{" "}
            {new Set(equipment.map((it) => it.category ?? "other")).size} categor
            {new Set(equipment.map((it) => it.category ?? "other")).size === 1 ? "y" : "ies"}
            {" · "}
            <button className="underline hover:text-foreground" onClick={() => setEquipOpen(true)}>
              show details
            </button>
          </div>
        )}
      </div>


      {/* Spec doc */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Specs / setup PDF</h4>
        {facade.spec_pdf_path ? (
          <div className="rounded-lg border p-2 flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{facade.spec_pdf_path.split("/").pop()}</span>
              {facade.last_parsed_at && (
                <span className="text-[10px] text-muted-foreground italic">· AI parsed {timeAgo(facade.last_parsed_at)}</span>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={openSpec}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2"
                onClick={() => specInputRef.current?.click()} disabled={uploadingSpec}>
                {uploadingSpec ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace"}
              </Button>
            </div>
            <input ref={specInputRef} type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.eml,application/pdf,image/*"
              className="hidden" onChange={(e) => e.target.files?.[0] && uploadSpec(e.target.files[0])} />
          </div>
        ) : (
          <label
            className="block border-2 border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) uploadSpec(e.dataTransfer.files[0]); }}
          >
            <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
            {uploadingSpec ? "Uploading…" : "Drop setup PDF / email / spec sheet — AI will extract dimensions"}
            <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.eml,application/pdf,image/*"
              className="hidden" onChange={(e) => e.target.files?.[0] && uploadSpec(e.target.files[0])} />
          </label>
        )}
      </div>

      {/* Setup notes */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Setup notes</h4>
        <Textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            if (notesDraft !== (facade.setup_notes ?? ""))
              updateFacade.mutate({ setup_notes: notesDraft || null });
          }}
          placeholder="Installation notes, anchoring, lighting, etc."
          rows={3}
        />
        {facade.parse_summary && (
          <div className="text-[11px] text-muted-foreground italic mt-1">
            AI summary: {facade.parse_summary}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t text-xs">
        <span className="text-muted-foreground italic">
          {facade.last_parsed_at ? `AI parsed ${timeAgo(facade.last_parsed_at)}` : ""}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7" disabled={!facade.spec_pdf_path} onClick={openSpec}>
            Download spec
          </Button>
          <Button asChild size="sm" variant="outline" className="h-7">
            <a href={`/festivals/${festivalSlug}/facade/export`} target="_blank" rel="noopener noreferrer">Export report</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function PhotoTile({
  photo, onDelete, onSetCover,
}: { photo: FacadePhotoRow; onDelete: () => void; onSetCover?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.storage.from("facade-designs")
      .createSignedUrl(photo.file_path, 3600)
      .then(({ data }) => { if (alive && data?.signedUrl) setUrl(data.signedUrl); });
    return () => { alive = false; };
  }, [photo.file_path]);

  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={photo.caption ?? photo.file_name}
            className="h-full w-full object-cover" loading="lazy" />
        </a>
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin opacity-50" />
        </div>
      )}
      <button
        onClick={onDelete}
        className="absolute top-1 right-1 p-1 rounded-full bg-background/80 opacity-0 group-hover:opacity-100 transition hover:bg-destructive hover:text-destructive-foreground"
        aria-label="Delete photo"
      >
        <X className="h-3 w-3" />
      </button>
      {onSetCover && (
        <button
          onClick={onSetCover}
          className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-background/80 text-[9px] opacity-0 group-hover:opacity-100 transition hover:bg-primary hover:text-primary-foreground"
          aria-label="Set as cover"
        >
          Set cover
        </button>
      )}
      {photo.caption && !onSetCover && (
        <div className="absolute bottom-0 inset-x-0 bg-background/80 text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100">
          {photo.caption}
        </div>
      )}
    </div>
  );
}

function HeroPhotoTile({
  photo, onDelete, onCaption,
}: { photo: FacadePhotoRow; onDelete: () => void; onCaption: (c: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState(photo.caption ?? "");
  useEffect(() => setCaption(photo.caption ?? ""), [photo.caption]);
  useEffect(() => {
    let alive = true;
    supabase.storage.from("facade-designs")
      .createSignedUrl(photo.file_path, 3600)
      .then(({ data }) => { if (alive && data?.signedUrl) setUrl(data.signedUrl); });
    return () => { alive = false; };
  }, [photo.file_path]);

  return (
    <div className="relative rounded-xl overflow-hidden border bg-muted group">
      <div className="aspect-[16/9] w-full">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={photo.caption ?? photo.file_name}
              className="h-full w-full object-cover" loading="lazy" />
          </a>
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin opacity-50" />
          </div>
        )}
      </div>
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 opacity-0 group-hover:opacity-100 transition hover:bg-destructive hover:text-destructive-foreground"
        aria-label="Delete photo"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-background/80 text-[10px] font-medium uppercase tracking-wider">
        Cover
      </div>
      <Input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => { if (caption !== (photo.caption ?? "")) onCaption(caption); }}
        placeholder="Add caption…"
        className="border-0 rounded-none bg-background/70 backdrop-blur h-8 text-xs"
      />
    </div>
  );
}

