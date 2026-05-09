import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ConceptCardGrid } from "@/components/concept/ConceptCardGrid";
import { CONCEPT_SLUGS } from "@/components/concept/types";
import { Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Festival = { id: string; slug: string; name: string; start_date: string };
type ContractRow = {
  id: string;
  festival_id: string;
  concept_alias: string | null;
  operating_entity: string | null;
  operating_entity_cvr: string | null;
  contract_status: string | null;
  concept: { slug: string; name: string } | null;
};

type Status = "ok" | "warning" | "error";

interface FestivalSummary {
  festival: Festival;
  contracts: ContractRow[];
  status: Status;
  issues: string[];
}

const VALID_SLUGS = new Set<string>(CONCEPT_SLUGS as readonly string[]);

export default function ConceptGridVerify() {
  const [summaries, setSummaries] = useState<FestivalSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: festivals } = await supabase
        .from("festivals")
        .select("id, slug, name, start_date")
        .order("start_date", { ascending: true });
      const { data: contractsRaw } = await supabase
        .from("festival_contracts")
        .select(
          "id, festival_id, concept_alias, operating_entity_cvr, contract_status, concept:concepts!concept_id(slug, name)",
        );
      const { data: financeRows } = await (supabase as any)
        .from("festival_contracts_finance")
        .select("contract_id, operating_entity");
      const financeMap = new Map<string, string | null>();
      (financeRows ?? []).forEach((r: any) => financeMap.set(r.contract_id, r.operating_entity));
      const fests = (festivals ?? []) as Festival[];
      const allContracts = ((contractsRaw ?? []) as any[]).map((c) => ({
        ...c,
        operating_entity: financeMap.get(c.id) ?? null,
      })) as unknown as ContractRow[];
      const result: FestivalSummary[] = fests.map((f) => {
        const cs = allContracts.filter((c) => c.festival_id === f.id);
        const issues: string[] = [];
        if (cs.length === 0) {
          issues.push("No contracts in DB");
        }
        cs.forEach((c, i) => {
          const slug = c.concept?.slug;
          if (!slug || !VALID_SLUGS.has(slug)) {
            issues.push(`Row ${i + 1}: invalid concept slug "${slug ?? "null"}"`);
          }
          if (!c.operating_entity) {
            issues.push(`Row ${i + 1} (${slug ?? "?"}): missing operating_entity`);
          }
        });
        const status: Status = cs.length === 0
          ? "error"
          : issues.length === 0 ? "ok" : "warning";
        return { festival: f, contracts: cs, status, issues };
      });
      setSummaries(result);
      setLoading(false);
    })();
  }, []);

  if (loading || !summaries) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading diagnostic…
      </div>
    );
  }

  const statusIcon = (s: Status) =>
    s === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    : s === "warning" ? <AlertTriangle className="h-4 w-4 text-yellow-600" />
    : <XCircle className="h-4 w-4 text-destructive" />;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Concept grid verification</h1>
        <p className="text-sm text-muted-foreground">
          Diagnostic: verifies <code>ConceptCardGrid</code> renders correctly across all festivals
          after Sprint 4 per-stall refactor.
        </p>
      </header>

      {/* SUMMARY TABLE */}
      <section className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Festival</th>
              <th className="text-right px-3 py-2 font-medium">Contracts</th>
              <th className="text-left px-3 py-2 font-medium">Concepts</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.festival.id} className={cn("border-t", s.status === "error" && "bg-destructive/5", s.status === "warning" && "bg-yellow-500/5")}>
                <td className="px-3 py-2">
                  <Link to={`/festivals/${s.festival.slug}`} className="hover:underline">
                    {s.festival.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{s.festival.slug}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.contracts.length}</td>
                <td className="px-3 py-2 text-xs">
                  {s.contracts.map((c) => c.concept_alias || c.concept?.slug || "?").join(", ") || "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {statusIcon(s.status)}
                    <span className="text-xs uppercase tracking-wide">{s.status}</span>
                  </div>
                  {s.issues.length > 0 && (
                    <ul className="mt-1 list-disc ml-4 text-xs text-muted-foreground">
                      {s.issues.map((iss, i) => <li key={i}>{iss}</li>)}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* PER-FESTIVAL GRIDS */}
      <section className="space-y-10">
        {summaries.map((s) => (
          <div key={s.festival.id} className="space-y-2">
            <div className="flex items-baseline justify-between border-b pb-2">
              <h2 className="font-heading text-lg font-semibold">
                {s.festival.name}{" "}
                <span className="text-xs font-normal text-muted-foreground">({s.festival.slug})</span>
              </h2>
              <span className="text-xs text-muted-foreground">
                {s.contracts.length} contract{s.contracts.length === 1 ? "" : "s"}
              </span>
            </div>
            <div
              className={cn(
                "rounded-md p-3",
                s.status === "error" && "bg-destructive/5 border border-destructive/40",
                s.status === "warning" && "bg-yellow-500/5 border border-yellow-500/40",
              )}
            >
              <ConceptCardGrid
                festivalId={s.festival.id}
                conceptData={{}}
                enableManagerEdit={false}
                renderConceptBody={(_concept, _data, _manager, contract) => (
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-muted-foreground">Contract status: </span>
                      <span className="font-mono">{contract?.contract_status ?? "—"}</span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">
                      contract_id: {contract?.contract_id}
                    </div>
                  </div>
                )}
              />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
