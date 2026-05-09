import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ArrowLeft, Check, X, Pencil, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Decision = "approve" | "edit" | "reject" | null;

interface Update {
  table: string;
  action: string;
  festival_slug?: string;
  concept_slug?: string;
  match_by?: any;
  fields: Record<string, any>;
  confidence?: number;
  reasoning?: string;
}

function confidenceColor(c?: number) {
  if (c == null) return "text-muted-foreground";
  if (c >= 0.85) return "text-emerald-600";
  if (c >= 0.65) return "text-amber-600";
  return "text-red-600";
}

function statusPill(status: string) {
  const map: Record<string,string> = {
    uploaded: "bg-slate-100 text-slate-700",
    parsing: "bg-blue-100 text-blue-700 animate-pulse",
    parsed: "bg-amber-100 text-amber-700",
    reviewing: "bg-amber-100 text-amber-700",
    applied: "bg-emerald-100 text-emerald-700",
    rejected: "bg-zinc-100 text-zinc-600",
    failed: "bg-red-100 text-red-700",
  };
  return map[status] || "bg-slate-100 text-slate-700";
}

export default function IngestReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [edits, setEdits] = useState<Record<number, Record<string, any>>>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await (supabase as any).from("intelligence_ingestion").select("*").eq("id", id).single();
      setRow(data);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel(`ingest-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "intelligence_ingestion", filter: `id=eq.${id}` },
        (payload) => setRow(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const updates: Update[] = useMemo(() => Array.isArray(row?.ai_proposed_updates) ? row.ai_proposed_updates : [], [row]);

  const allDecided = updates.length > 0 && updates.every((_, i) => decisions[i] && decisions[i] !== "edit") || updates.length === 0;
  const anyApproved = Object.values(decisions).some(d => d === "approve" || d === "edit");

  const setAll = (d: Decision) => {
    const obj: Record<number, Decision> = {};
    updates.forEach((_, i) => { obj[i] = d; });
    setDecisions(obj);
  };

  const apply = async () => {
    if (!row) return;
    const approvedUpdates = updates
      .map((u, i) => ({ u, i }))
      .filter(({ i }) => decisions[i] === "approve" || decisions[i] === "edit")
      .map(({ u, i }) => decisions[i] === "edit"
        ? { ...u, fields: { ...u.fields, ...(edits[i] || {}) } }
        : u);

    if (approvedUpdates.length === 0) {
      toast({ title: "Nothing to apply", description: "Approve at least one update", variant: "destructive" });
      return;
    }

    setApplying(true);
    try {
      const { data, error } = await (supabase as any).rpc("apply_ingestion", {
        p_id: row.id,
        p_updates: approvedUpdates,
      });
      if (error) throw error;
      toast({ title: "Applied", description: `${(data?.successes?.length ?? approvedUpdates.length)} update(s) applied.` });
      navigate("/ingest");
    } catch (e: any) {
      toast({ title: "Apply failed", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const reject = async () => {
    await (supabase as any).from("intelligence_ingestion").update({
      status: "rejected", human_decision: "rejected", human_reviewed_at: new Date().toISOString(),
    }).eq("id", row.id);
    navigate("/ingest");
  };

  const reparse = async () => {
    await (supabase as any).from("intelligence_ingestion").update({ status: "uploaded", error_log: null }).eq("id", row.id);
    supabase.functions.invoke("parse-ingestion", { body: { ingestion_id: row.id } });
    toast({ title: "Re-parsing…" });
  };

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;
  if (!row) return <div className="p-8 text-center text-sm text-muted-foreground">Not found.</div>;

  const isParsing = row.status === "uploaded" || row.status === "parsing";

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-32">
      <Link to="/ingest" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> Back to ingest
      </Link>

      <Card>
        <CardContent className="p-5 flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">{row.source_type}</div>
            <h1 className="font-heading font-semibold text-lg truncate">{row.source_subject || row.source_filename || "Pasted content"}</h1>
            {row.source_sender && <div className="text-xs text-muted-foreground mt-0.5">From: {row.source_sender}</div>}
          </div>
          <div className="flex items-center gap-3">
            {row.parse_confidence != null && (
              <div className={`text-sm font-mono ${confidenceColor(row.parse_confidence)}`}>
                {Math.round(row.parse_confidence * 100)}%
              </div>
            )}
            <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${statusPill(row.status)}`}>{row.status}</span>
          </div>
        </CardContent>
      </Card>

      {isParsing && (
        <Card><CardContent className="p-8 text-center space-y-2">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Claude is parsing this content…</p>
        </CardContent></Card>
      )}

      {row.status === "failed" && (
        <Card className="border-red-300 bg-red-50/40">
          <CardContent className="p-5 space-y-2">
            <div className="font-medium text-red-700">Parse failed</div>
            <pre className="text-xs whitespace-pre-wrap text-red-700/80">{row.error_log}</pre>
            <Button size="sm" variant="outline" onClick={reparse}>Retry parse</Button>
          </CardContent>
        </Card>
      )}

      {row.ai_summary && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">AI summary</CardTitle></CardHeader>
          <CardContent className="text-sm">{row.ai_summary}</CardContent>
        </Card>
      )}

      {Array.isArray(row.ai_warnings) && row.ai_warnings.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-2 font-medium text-amber-700"><AlertTriangle className="h-4 w-4" /> AI flagged potential issues</div>
            <ul className="list-disc pl-6 text-sm text-amber-800">
              {row.ai_warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {row.raw_content && (
        <Collapsible open={showRaw} onOpenChange={setShowRaw}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1"><ChevronDown className="h-4 w-4" /> Original content</Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="text-xs whitespace-pre-wrap bg-muted/40 p-4 rounded-lg max-h-[400px] overflow-auto">{row.raw_content}</pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {updates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Proposed updates ({updates.length})</h2>
          {updates.map((u, idx) => {
            const dec = decisions[idx];
            const editVals = edits[idx] || {};
            return (
              <Card key={idx} className={dec === "reject" ? "opacity-50" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">{u.action}</Badge>
                      <span className="font-mono text-sm">{u.table}</span>
                      {u.festival_slug && <Badge variant="secondary">{u.festival_slug}</Badge>}
                      {u.concept_slug && <Badge variant="secondary">{u.concept_slug}</Badge>}
                    </div>
                    {u.confidence != null && (
                      <span className={`text-xs font-mono ${confidenceColor(u.confidence)}`}>{Math.round(u.confidence * 100)}%</span>
                    )}
                  </div>

                  <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-sm">
                    {Object.entries(u.fields).map(([k, v]) => (
                      <>
                        <div key={`k-${k}`} className="text-xs text-muted-foreground font-mono py-1">{k}</div>
                        <div key={`v-${k}`} className="py-1">
                          {editingIdx === idx ? (
                            <input
                              className="border rounded px-2 py-1 text-sm w-full"
                              defaultValue={String(editVals[k] ?? v ?? "")}
                              onBlur={(e) => setEdits({ ...edits, [idx]: { ...editVals, [k]: e.target.value } })}
                            />
                          ) : (
                            <span className="font-mono text-xs bg-emerald-50 text-emerald-900 px-1.5 py-0.5 rounded">{String(editVals[k] ?? v ?? "—")}</span>
                          )}
                        </div>
                      </>
                    ))}
                  </div>

                  {u.reasoning && <p className="text-xs italic text-muted-foreground">Reasoning: {u.reasoning}</p>}

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button size="sm" variant={dec === "approve" ? "default" : "outline"} onClick={() => { setDecisions({ ...decisions, [idx]: "approve" }); setEditingIdx(null); }}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant={editingIdx === idx ? "default" : "outline"} onClick={() => { setEditingIdx(editingIdx === idx ? null : idx); setDecisions({ ...decisions, [idx]: "edit" }); }}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant={dec === "reject" ? "destructive" : "outline"} onClick={() => setDecisions({ ...decisions, [idx]: "reject" })}>
                      <X className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {row.status === "parsed" && updates.length === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
          No proposed updates — content was too ambiguous. Try adding hints and re-parsing.
        </CardContent></Card>
      )}

      {row.status === "applied" && (
        <Card className="border-emerald-300 bg-emerald-50/40">
          <CardContent className="p-4 text-sm text-emerald-800">✅ This ingestion has been applied.</CardContent>
        </Card>
      )}

      {row.status === "parsed" && updates.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t p-4 z-40">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setAll("approve")}>Approve all</Button>
              <Button size="sm" variant="outline" onClick={() => setAll("reject")}>Reject all</Button>
              <Button size="sm" variant="ghost" onClick={reject}>Discard ingestion</Button>
            </div>
            <Button onClick={apply} disabled={applying || !anyApproved}>
              {applying ? "Applying…" : `Apply changes`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
