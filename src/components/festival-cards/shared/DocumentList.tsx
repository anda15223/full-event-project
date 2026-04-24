import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download, Eye, FileText, FileImage, FileSpreadsheet, File as FileIcon,
  Loader2, Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  festivalId: string;
  /** SmartCard `card_key` for this card. */
  cardName: string;
  className?: string;
}

type SmartFileRow = {
  id: string;
  filename: string | null;
  mime_type: string | null;
  size: number | null;
  url: string | null;
  storage_path: string;
  ai_summary: string | null;
  parse_status: string;
  uploaded_at: string;
};

function iconFor(mime: string | null) {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return FileSpreadsheet;
  return FileText;
}

function fmtSize(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Lists all files uploaded to a specific festival card (smart_files for the
 * matching smart_cards row). View / download / delete actions per file.
 */
export function DocumentList({ festivalId, cardName, className }: Props) {
  const qc = useQueryClient();

  const { data: cardRow } = useQuery({
    queryKey: ["smart_card_for_doclist", festivalId, cardName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("smart_cards")
        .select("id")
        .eq("festival_id", festivalId)
        .eq("card_key", cardName)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!festivalId && !!cardName,
  });

  const { data: files = [], isLoading } = useQuery<SmartFileRow[]>({
    queryKey: ["smart_files_for_card", cardRow?.id],
    queryFn: async () => {
      if (!cardRow?.id) return [];
      const { data, error } = await supabase
        .from("smart_files")
        .select("id, filename, mime_type, size, url, storage_path, ai_summary, parse_status, uploaded_at")
        .eq("card_id", cardRow.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SmartFileRow[];
    },
    enabled: !!cardRow?.id,
  });

  const deleteMut = useMutation({
    mutationFn: async (file: SmartFileRow) => {
      // best-effort storage delete (bucket: festival-photos, used by SmartCard)
      await supabase.storage.from("festival-photos").remove([file.storage_path]);
      const { error } = await supabase.from("smart_files").delete().eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart_files_for_card", cardRow?.id] });
      toast.success("File deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const view = async (file: SmartFileRow) => {
    if (file.url) {
      window.open(file.url, "_blank", "noopener");
      return;
    }
    const { data, error } = await supabase.storage
      .from("festival-photos")
      .createSignedUrl(file.storage_path, 3600);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  const download = async (file: SmartFileRow) => {
    const { data, error } = await supabase.storage
      .from("festival-photos")
      .download(file.storage_path);
    if (error || !data) {
      toast.error(error?.message ?? "Download failed");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename ?? "download";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading documents…
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <Card className={`p-8 text-center text-sm text-muted-foreground ${className ?? ""}`}>
        No documents uploaded to this card yet.
      </Card>
    );
  }

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {files.map((file) => {
        const Icon = iconFor(file.mime_type);
        return (
          <Card key={file.id} className="p-3 hover:bg-muted/40 transition-colors">
            <div className="flex items-start gap-3">
              <Icon className="h-7 w-7 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm truncate">{file.filename ?? "Untitled"}</p>
                  {file.parse_status && file.parse_status !== "done" && (
                    <Badge variant="outline" className="text-[10px]">{file.parse_status}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{fmtSize(file.size)}</span>
                </div>
                {file.ai_summary && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{file.ai_summary}</p>
                )}
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  {new Date(file.uploaded_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => view(file)} title="View">
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => download(file)} title="Download">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Delete "${file.filename}"?`)) deleteMut.mutate(file);
                  }}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default DocumentList;
