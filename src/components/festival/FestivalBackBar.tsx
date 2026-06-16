import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Sticky top back-to-festival bar. Drop in as the FIRST child of any
 * festival sub-page so the back link is always visible above all cards.
 */
export function FestivalBackBar({ label }: { label?: string }) {
  const { slug = "" } = useParams();
  const { data: festival } = useQuery({
    queryKey: ["festival-backbar", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data } = await supabase
        .from("festivals")
        .select("name, slug")
        .eq("slug", slug)
        .maybeSingle();
      return data as { name: string; slug: string } | null;
    },
  });

  const name = label ?? festival?.name ?? slug;
  if (!slug) return null;

  return (
    <div className="sticky top-0 z-40 -mx-3 sm:-mx-6 md:-mx-8 px-3 sm:px-6 md:px-8 py-2 bg-background/85 backdrop-blur border-b border-border/60 print:hidden">
      <Link
        to={`/festivals/${slug}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {name}
      </Link>
    </div>
  );
}

export default FestivalBackBar;
