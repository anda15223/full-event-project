import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ScrollText, ShieldAlert, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Rule = {
  id: string;
  rule_name: string;
  rule_description: string;
  severity: "critical" | "important" | "info";
  category: string | null;
  applies_to_festivals: string[] | null;
  active: boolean;
  effective_from: string | null;
  effective_until: string | null;
};

const ICON = { critical: ShieldAlert, important: AlertTriangle, info: Info };
const COLOR = {
  critical: "border-l-red-500 text-red-700 dark:text-red-300",
  important: "border-l-orange-500 text-orange-700 dark:text-orange-300",
  info: "border-l-blue-500 text-blue-700 dark:text-blue-300",
};

export function FestivalRulesBlock({ slug }: { slug: string }) {
  const [openInfo, setOpenInfo] = useState(false);
  const [openImportant, setOpenImportant] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["festival-rules", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cross_festival_rules")
        .select("*")
        .eq("active", true)
        .eq("visibility", "public");
      if (error) throw error;
      return ((data ?? []) as Rule[]).filter((r) => {
        const f = r.applies_to_festivals;
        if (f && f.length > 0 && !f.includes(slug)) return false;
        if (r.effective_from && r.effective_from > today) return false;
        if (r.effective_until && r.effective_until < today) return false;
        return true;
      });
    },
  });

  if (isLoading) return <Skeleton className="h-12 w-full" />;
  const rules = data ?? [];
  if (rules.length === 0) return null;

  const critical = rules.filter((r) => r.severity === "critical");
  const important = rules.filter((r) => r.severity === "important");
  const info = rules.filter((r) => r.severity === "info");

  const renderRule = (r: Rule) => {
    const Icon = ICON[r.severity];
    return (
      <div key={r.id} className={cn("rounded-md border border-l-4 bg-background p-3", COLOR[r.severity])}>
        <div className="flex items-start gap-2">
          <Icon className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{r.rule_name}</div>
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{r.rule_description}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Active rules at this festival</h2>
          <span className="text-xs text-muted-foreground">({rules.length})</span>
        </div>
        <Link to={`/rules?festival=${slug}`} className="text-xs text-primary hover:underline">
          → All rules
        </Link>
      </div>

      {critical.length > 0 && (
        <div className="space-y-2 mb-2">
          {critical.map(renderRule)}
        </div>
      )}

      {important.length > 0 && (
        <Collapsible open={openImportant} onOpenChange={setOpenImportant}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2">
            <ChevronDown className={cn("h-3 w-3 transition", openImportant && "rotate-180")} />
            {important.length} important rule{important.length === 1 ? "" : "s"}
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            {important.map(renderRule)}
          </CollapsibleContent>
        </Collapsible>
      )}

      {info.length > 0 && (
        <Collapsible open={openInfo} onOpenChange={setOpenInfo}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2">
            <ChevronDown className={cn("h-3 w-3 transition", openInfo && "rotate-180")} />
            {info.length} info / background rule{info.length === 1 ? "" : "s"}
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            {info.map(renderRule)}
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}
