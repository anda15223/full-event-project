import { useDocuments } from "@/hooks/useDocuments";
import DocumentList from "@/components/documents/DocumentList";
import { Badge } from "@/components/ui/badge";

export default function DocumentsInvoices() {
  const { documents, reload } = useDocuments({ category: "invoice" });
  const inboxCount = documents.filter((d) => d.folder === "inbox").length;
  const sentCount = documents.filter((d) => d.folder === "sent").length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Invoices & receipts</h1>
        <div className="flex gap-2 mt-2">
          <Badge variant="outline">Inbox: {inboxCount}</Badge>
          <Badge variant="outline">Sent: {sentCount}</Badge>
        </div>
      </div>
      <DocumentList documents={documents} onChanged={reload} />
    </div>
  );
}
