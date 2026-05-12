import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CONCEPT_LABELS, ConceptSlug, CONCEPT_SLUGS } from "@/components/concept/types";
import { computeContractStatus } from "@/lib/contractStatus";
import {
  ContractConceptSubCard,
  type ContractRow,
} from "./ContractConceptSubCard";

interface Props {
  festivalId: string;
  festivalSlug: string;
  defaultOpen?: boolean;
}

export function FestivalContractCard({ festivalId, festivalSlug, defaultOpen = false }: Props) {
  const storageKey = `festival-contract-card-open:${festivalSlug}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch {}
    return defaultOpen;
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, open ? "1" : "0"); } catch {}
  }, [open, storageKey]);

  const { data, isLoading } = useQuery({
    queryKey: ["festival-contract-card", festivalId],
    queryFn: async () => {
      const { data: contracts, error } = await supabase
        .from("festival_contracts")
        .select("id, festival_id, concept_id, contract_status, contract_signed_date, contract_expires_at, contract_pdf_path, contract_pdf_uploaded_at, bracelet_count, key_obligations, parse_summary, last_parsed_at, counterparty_name, is_active")
        .eq("festival_id", festivalId)
        .eq("is_active", true);
      if (error) throw error;
      const ids = (contracts ?? []).map((c: any) => c.concept_id);
      const { data: concepts } = await supabase
        .from("concepts")
        .select("id, slug, name")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const cmap = new Map<string, { slug: ConceptSlug; name: string }>();
      (concepts ?? []).forEach((c: any) => cmap.set(c.id, { slug: c.slug, name: c.name }));
      return (contracts ?? []).map((c: any) => ({
        contract: c as ContractRow,
        slug: cmap.get(c.concept_id)?.slug as ConceptSlug | undefined,
        name: cmap.get(c.concept_id)?.name ?? "Unknown",
      })).filter((r) => !!r.slug);
    },
  });

  const ordered = useMemo(() => {
    const order: Record<string, number> = {};
    CONCEPT_SLUGS.forEach((s, i) => (order[s] = i));
    return (data ?? []).slice().sort((a, b) => (order[a.slug!] ?? 99) - (order[b.slug!] ?? 99));
  }, [data]);

  const rollup = useMemo(() => {
    if (!ordered.length) return null;
    const statuses = ordered.map((r) => computeContractStatus({
      contract_status: r.contract.contract_status,
      signed_at: r.contract.contract_signed_date,
      contract_pdf_path: r.contract.contract_pdf_path,
      expires_at: r.contract.contract_expires_at,
    }).status);
    const reds = statuses.filter((s) => s === "red").length;
    const greens = statuses.filter((s) => s === "green").length;
    if (greens === statuses.length) return { tone: "green" as const, label: "All signed" };
    if (reds > 0) return { tone: "red" as const, label: `${reds} unsigned` };
    return { tone: "amber" as const, label: `${statuses.length - greens} pending` };
  }, [ordered]);

  return (
    <section className={cn("rounded-2xl border bg-card overflow-hidden transition", !open && "hover:bg-muted/50")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-primary" />
          <span className="font-heading text-base font-semibold">Contract</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Per-concept contracts, AI-parsed from uploads
          </span>
        </div>
        <div className="flex items-center gap-2">
          {rollup && (
            <span className={cn(
              "rounded-full px-3 py-1 text-xs font-medium border",
              rollup.tone === "green" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
              rollup.tone === "amber" && "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
              rollup.tone === "red" && "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
            )}>
              {rollup.label}
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        </div>
      </button>

      <div className={cn("grid transition-all duration-300 ease-in-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="p-4 border-t">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : ordered.length === 0 ? (
              <div className="text-sm text-muted-foreground">No active concepts at this festival</div>
            ) : (
              ordered.map((r) => (
                <ContractConceptSubCard
                  key={r.contract.id}
                  festivalId={festivalId}
                  festivalSlug={festivalSlug}
                  conceptSlug={r.slug!}
                  conceptName={CONCEPT_LABELS[r.slug!] ?? r.name}
                  contract={r.contract}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default FestivalContractCard;
