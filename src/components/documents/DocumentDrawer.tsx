import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Mail, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export type DocumentRow = {
  id: string;
  filename: string;
  mime_type: string | null;
  storage_path: string;
  size_bytes: number | null;
  folder: string;
  received_at: string | null;
  sender: string | null;
  subject: string | null;
  category: "invoice" | "festival" | "contract" | "hr" | "supplier" | "authority" | "other";
  festival_slug: string | null;
  ai_summary: string | null;
  email_id: string | null;
  manual_override: boolean;
  amount: number | null;
  currency: string | null;
};

const CATEGORIES = ["invoice", "festival", "contract", "hr", "supplier", "authority", "other"] as const;

export default function DocumentDrawer({
  doc, open, onOpenChange, onUpdated,
}: {
  doc: DocumentRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUpdated?: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [updating, setUpdating] = useState(false);

  const loadPreview = async () => {
    if (!doc) return;
    setLoadingPreview(true);
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 3600);
    setLoadingPreview(false);
    if (error || !data) toast.error("Could not load file");
    else setPreviewUrl(data.signedUrl);
  };

  const handleRecategorize = async (newCategory: string) => {
    if (!doc) return;
    setUpdating(true);
    const { error } = await supabase
      .from("extracted_documents")
      .update({ category: newCategory as DocumentRow["category"], manual_override: true })
      .eq("id", doc.id);
    setUpdating(false);
    if (error) toast.error(error.message);
    else { toast.success("Re-categorized"); onUpdated?.(); }
  };

  if (!doc) return null;

  const isImage = doc.mime_type?.startsWith("image/");
  const isPdf = doc.mime_type === "application/pdf";

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (o) loadPreview(); else setPreviewUrl(null); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{doc.filename}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{doc.category}</Badge>
            <Badge variant="outline">{doc.folder}</Badge>
            {doc.festival_slug && <Badge variant="outline">🎪 {doc.festival_slug}</Badge>}
            {doc.manual_override && <Badge variant="outline">Manual</Badge>}
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <div><span className="font-medium">From:</span> {doc.sender || "—"}</div>
            <div><span className="font-medium">Subject:</span> {doc.subject || "—"}</div>
            <div><span className="font-medium">Received:</span> {doc.received_at ? new Date(doc.received_at).toLocaleString() : "—"}</div>
          </div>

          {doc.ai_summary && (
            <div className="rounded-lg bg-violet-50 border border-violet-200 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-violet-900 mb-1">
                <Sparkles className="h-3 w-3" /> AI Summary
              </div>
              <p className="text-sm text-violet-900/90">{doc.ai_summary}</p>
            </div>
          )}

          <div className="flex gap-2">
            {previewUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={previewUrl} download={doc.filename}>
                  <Download className="h-3 w-3 mr-1" /> Download
                </a>
              </Button>
            )}
            {doc.email_id && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/emails`}>
                  <Mail className="h-3 w-3 mr-1" /> Open source email
                </Link>
              </Button>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Re-categorize</label>
            <Select value={doc.category} onValueChange={handleRecategorize} disabled={updating}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg overflow-hidden bg-muted/30 min-h-[400px]">
            {loadingPreview && <div className="p-8 text-center text-sm text-muted-foreground">Loading preview...</div>}
            {previewUrl && isImage && <img src={previewUrl} alt={doc.filename} className="w-full" />}
            {previewUrl && isPdf && <iframe src={previewUrl} className="w-full h-[600px]" title={doc.filename} />}
            {previewUrl && !isImage && !isPdf && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Preview not supported for this file type. Use Download.
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
