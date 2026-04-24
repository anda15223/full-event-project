import { useDocuments } from "@/hooks/useDocuments";
import DocumentList from "@/components/documents/DocumentList";

export default function DocumentsCategoryPage({ category, title }: { category: string; title: string }) {
  const { documents, reload } = useDocuments({ category });
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{documents.length} documents</p>
      </div>
      <DocumentList documents={documents} onChanged={reload} />
    </div>
  );
}
