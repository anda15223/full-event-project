import { useParams } from "react-router-dom";
import { useDocuments } from "@/hooks/useDocuments";
import DocumentList from "@/components/documents/DocumentList";
import { DocumentRow } from "@/components/documents/DocumentDrawer";

const SUBCATEGORIES = ["Contracts", "Menus", "Production plans", "Invoices", "Maps", "Correspondence", "Other"];

function classify(doc: DocumentRow): string {
  const text = `${doc.filename} ${doc.subject || ""} ${doc.ai_summary || ""}`.toLowerCase();
  if (/(contract|kontrakt|aftale|agreement)/.test(text)) return "Contracts";
  if (/(menu|menukort|food list)/.test(text)) return "Menus";
  if (/(production|plan|setup|opbygning|rigger|build)/.test(text)) return "Production plans";
  if (/(invoice|faktura|kvittering|regning|kreditnota|pbs|opkr)/.test(text)) return "Invoices";
  if (/(map|kort|layout|plot|placement)/.test(text)) return "Maps";
  if (/(re:|fwd:|sv:|vs:)/.test(text) || doc.folder === "sent") return "Correspondence";
  return "Other";
}

export default function DocumentsFestivalDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { documents, reload } = useDocuments({ festival_slug: slug });

  const groups: Record<string, DocumentRow[]> = {};
  SUBCATEGORIES.forEach((s) => (groups[s] = []));
  documents.forEach((d) => groups[classify(d)].push(d));

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold capitalize">🎪 {slug?.replace(/-/g, " ")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{documents.length} documents</p>
      </div>

      {SUBCATEGORIES.map((sub) => {
        if (groups[sub].length === 0) return null;
        return (
          <section key={sub}>
            <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
              {sub} <span className="text-muted-foreground/60">({groups[sub].length})</span>
            </h2>
            <DocumentList documents={groups[sub]} onChanged={reload} />
          </section>
        );
      })}

      {documents.length === 0 && (
        <p className="text-sm text-muted-foreground">No documents tagged for this festival yet.</p>
      )}
    </div>
  );
}
