import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ConceptCardGrid } from "@/components/concept/ConceptCardGrid";
import { ConceptExportMenu } from "@/components/concept/ConceptExportMenu";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";

export default function ConceptTest() {
  const { slug } = useParams<{ slug: string }>();
  const [festivalId, setFestivalId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    supabase.from("festivals").select("id").eq("slug", slug).maybeSingle()
      .then(({ data }) => setFestivalId(data?.id ?? null));
  }, [slug]);

  if (!festivalId) return <div className="p-6">Loading festival…</div>;

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Link to={`/festivals/${slug}`} className="text-sm text-muted-foreground hover:underline">
            ← Back to festival
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Concept scaffolding test</h1>
          <p className="text-sm text-muted-foreground">
            Verifies ConceptCardGrid renders 4 concepts in order with working manager dropdowns.
          </p>
        </div>
        <ConceptExportMenu basePath={`/festivals/${slug}/concept-test/export`} />
      </div>

      <ConceptCardGrid
        festivalId={festivalId}
        conceptData={{}}
        renderConceptBody={(concept) => (
          <div className="text-sm text-muted-foreground">
            Body for {concept.name}
          </div>
        )}
      />
    </div>
  );
}
