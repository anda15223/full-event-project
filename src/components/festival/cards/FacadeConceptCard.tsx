import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";

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
  festivalId, festivalSlug, conceptSlug, conceptName, facade, photos,
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
          <span className={cn(
            "inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border",
            FACADE_STATUS_PILL[status.status],
          )}>
            <span aria-hidden>{status.emoji}</span>{status.label}
          </span>
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
          <h4 className="text-sm font-semibold">Photos</h4>
          <Button size="sm" variant="ghost" className="h-7 text-xs"
            onClick={() => photoInputRef.current?.click()} disabled={uploadingPhotos}>
            {uploadingPhotos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "+ Add photos"}
          </Button>
          <input ref={photoInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden" onChange={(e) => e.target.files && uploadPhotos(e.target.files)} />
        </div>
        {photos.length === 0 ? (
          <label
            className="block border-2 border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) uploadPhotos(e.dataTransfer.files); }}
          >
            <ImageIcon className="h-5 w-5 mx-auto mb-1 opacity-50" />
            Drop facade photos or click to upload
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden" onChange={(e) => e.target.files && uploadPhotos(e.target.files)} />
          </label>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {photos.map((p) => <PhotoTile key={p.id} photo={p} onDelete={() => deletePhoto(p)} />)}
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
          <Button size="sm" variant="outline" className="h-7" disabled title="Coming in Block 8">
            Export report
          </Button>
        </div>
      </div>
    </div>
  );
}

function PhotoTile({ photo, onDelete }: { photo: FacadePhotoRow; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const load = async () => {
    if (url) return;
    const { data } = await supabase.storage.from("facade-designs")
      .createSignedUrl(photo.file_path, 3600);
    if (data?.signedUrl) setUrl(data.signedUrl);
  };
  // Lazy-load on mount
  useState(() => { load(); return null; });

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
      {photo.caption && (
        <div className="absolute bottom-0 inset-x-0 bg-background/80 text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100">
          {photo.caption}
        </div>
      )}
    </div>
  );
}
