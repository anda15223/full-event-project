import { useState } from "react";
import DocumentDrawer, { DocumentRow } from "./DocumentDrawer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, FileImage, FileSpreadsheet, File } from "lucide-react";

function iconFor(mime: string | null) {
  if (!mime) return File;
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return FileSpreadsheet;
  return FileText;
}

export default function DocumentList({ documents, onChanged }: { documents: DocumentRow[]; onChanged?: () => void }) {
  const [selected, setSelected] = useState<DocumentRow | null>(null);
  const [open, setOpen] = useState(false);

  if (documents.length === 0) {
    return (
      <Card className="p-12 text-center text-sm text-muted-foreground">
        No documents yet. They'll appear here as emails are synced.
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {documents.map((doc) => {
          const Icon = iconFor(doc.mime_type);
          return (
            <Card
              key={doc.id}
              className="p-4 hover:bg-muted/40 cursor-pointer transition-colors"
              onClick={() => { setSelected(doc); setOpen(true); }}
            >
              <div className="flex items-start gap-3">
                <Icon className="h-8 w-8 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{doc.filename}</p>
                    <Badge variant="outline" className="text-[10px]">{doc.folder}</Badge>
                    {doc.festival_slug && <Badge variant="outline" className="text-[10px]">🎪 {doc.festival_slug}</Badge>}
                    {doc.manual_override && <Badge variant="outline" className="text-[10px]">Manual</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {doc.sender || "—"} · {doc.subject || "(no subject)"}
                  </p>
                  {doc.ai_summary && (
                    <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">{doc.ai_summary}</p>
                  )}
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {doc.received_at ? new Date(doc.received_at).toLocaleDateString() : ""}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <DocumentDrawer doc={selected} open={open} onOpenChange={setOpen} onUpdated={onChanged} />
    </>
  );
}
