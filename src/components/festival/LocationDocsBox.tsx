import React, { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText, Image as ImageIcon, FileSpreadsheet, FileBox, Download,
  Trash2, UploadCloud, HelpCircle, Loader2, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BUCKET = "festival-location-docs";
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,application/pdf,image/*";

interface LocationDoc {
  id: string;
  festival_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  description: string | null;
  uploaded_at: string;
}

export interface LocationDocsBoxProps {
  festivalId: string;
  festivalSlug: string;
}

function formatBytes(n: number | null): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mime: string | null, name: string) {
  const m = (mime ?? "").toLowerCase();
  const n = name.toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(n)) return ImageIcon;
  if (m.includes("sheet") || /\.(xlsx?|csv)$/.test(n)) return FileSpreadsheet;
  if (m.includes("pdf") || n.endsWith(".pdf")) return FileText;
  return FileBox;
}

export function LocationDocsBox({ festivalId, festivalSlug }: LocationDocsBoxProps) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<LocationDoc | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["location-docs", festivalSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_location_documents" as any)
        .select("*")
        .eq("festival_id", festivalId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LocationDoc[];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["location-docs", festivalSlug] });

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    try {
      for (const file of arr) {
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${festivalId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: userData } = await supabase.auth.getUser();
        const { error: insErr } = await supabase
          .from("festival_location_documents" as any)
          .insert({
            festival_id: festivalId,
            file_name: file.name,
            file_path: path,
            mime_type: file.type || null,
            file_size_bytes: file.size,
            uploaded_by: userData.user?.id ?? null,
          });
        if (insErr) throw insErr;
      }
      toast.success(`Uploaded ${arr.length} file${arr.length > 1 ? "s" : ""}`);
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDownload = async (d: LocationDoc) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(d.file_path, 300);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not generate link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const doDelete = useMutation({
    mutationFn: async (d: LocationDoc) => {
      await supabase.storage.from(BUCKET).remove([d.file_path]);
      const { error } = await supabase
        .from("festival_location_documents" as any)
        .delete()
        .eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File deleted");
      invalidate();
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const saveDescription = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      const { error } = await supabase
        .from("festival_location_documents" as any)
        .update({ description: description || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const isEmpty = !isLoading && docs.length === 0;

  return (
    <TooltipProvider>
      <div
        className={cn(
          "rounded-2xl border bg-card p-4 h-64 flex flex-col shadow-sm",
          isDragging && "ring-2 ring-primary",
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            Location documents
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Site plans, venue maps, food authority docs, parking permits,
                anything about the place itself.
              </TooltipContent>
            </Tooltip>
          </h4>
          {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="text-xs text-muted-foreground p-2">Loading…</div>
          ) : isEmpty ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full h-full rounded-xl border-2 border-dashed border-border hover:border-primary/60 hover:bg-muted/40 transition flex flex-col items-center justify-center gap-2 text-muted-foreground"
            >
              <UploadCloud className="h-8 w-8" />
              <span className="text-sm">Drop files here or click to upload</span>
              <span className="text-xs">PDF, DOCX, XLSX, PNG, JPG, WEBP</span>
            </button>
          ) : (
            <ul className="space-y-1">
              {docs.map((d) => {
                const Icon = iconFor(d.mime_type, d.file_name);
                const isEditing = editingId === d.id;
                return (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/60"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" title={d.file_name}>
                        {d.file_name}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span>{formatBytes(d.file_size_bytes)}</span>
                        <span>·</span>
                        {isEditing ? (
                          <Input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveDescription.mutate({ id: d.id, description: editValue })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveDescription.mutate({ id: d.id, description: editValue });
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            placeholder="Add description"
                            className="h-6 text-xs px-1 py-0"
                          />
                        ) : (
                          <button
                            type="button"
                            className={cn(
                              "truncate text-left hover:underline",
                              !d.description && "italic",
                            )}
                            onClick={() => {
                              setEditingId(d.id);
                              setEditValue(d.description ?? "");
                            }}
                          >
                            {d.description || "No description"}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => onDownload(d)}
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(d)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!isEmpty && !isLoading && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Plus className="h-4 w-4" /> Upload document
          </Button>
        )}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.file_name} will be permanently removed from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && doDelete.mutate(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

export default LocationDocsBox;
