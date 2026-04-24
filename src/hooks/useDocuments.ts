import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DocumentRow } from "@/components/documents/DocumentDrawer";

type Filter = {
  category?: string;
  festival_slug?: string;
  search?: string;
};

export function useDocuments(filter: Filter = {}) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("extracted_documents")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(500);

    if (filter.category) q = q.eq("category", filter.category);
    if (filter.festival_slug) q = q.eq("festival_slug", filter.festival_slug);
    if (filter.search) {
      q = q.or(`filename.ilike.%${filter.search}%,subject.ilike.%${filter.search}%,sender.ilike.%${filter.search}%`);
    }

    const { data } = await q;
    setDocuments((data as unknown as DocumentRow[]) || []);

    const { data: countRows } = await supabase
      .from("extracted_documents")
      .select("category");
    const c: Record<string, number> = {};
    (countRows || []).forEach((r: { category: string }) => {
      c[r.category] = (c[r.category] || 0) + 1;
    });
    setCounts(c);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.category, filter.festival_slug, filter.search]);

  return { documents, loading, counts, reload: load };
}
