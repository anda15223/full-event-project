import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Inbox, Upload, ChevronDown, FileText, Mail, Image as ImageIcon, FileType } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const CARD_TYPES = ["contract","cooling","power","facade","topskilt","transport","safety","accommodation","contacts","action_items","questions","timeline","other"];

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

function detectSourceType(file: File | null, hasText: boolean): string {
  if (!file && hasText) return "text_paste";
  if (!file) return "text_paste";
  const n = file.name.toLowerCase();
  if (n.endsWith(".eml") || n.endsWith(".msg")) return "email_forward";
  if (n.endsWith(".pdf")) return "pdf_upload";
  if (/\.(png|jpg|jpeg|heic)$/.test(n)) return "photo_upload";
  return "text_paste";
}

export default function IngestDropzone() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [festivalId, setFestivalId] = useState<string>("");
  const [conceptIds, setConceptIds] = useState<string[]>([]);
  const [cardTypes, setCardTypes] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: festivals = [] } = useQuery({
    queryKey: ["all-festivals-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("festivals").select("id, slug, name, start_date").order("start_date");
      return data || [];
    },
  });
  const { data: concepts = [] } = useQuery({
    queryKey: ["all-concepts-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("concepts").select("id, slug, name").order("display_order");
      return data || [];
    },
  });
  const { data: recent = [], refetch: refetchRecent } = useQuery({
    queryKey: ["ingest-recent"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("intelligence_ingestion")
        .select("id, source_type, source_subject, source_filename, ai_summary, status, created_at, parse_confidence")
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("ingest-list-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "intelligence_ingestion" }, () => refetchRecent())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetchRecent]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      if (f.size > 25 * 1024 * 1024) {
        toast({ title: "File too large", description: "Max 25 MB", variant: "destructive" });
        return;
      }
      setFile(f);
    }
  }, []);

  const sourceType = useMemo(() => detectSourceType(file, text.length > 0), [file, text]);

  const canSubmit = (file || text.trim().length > 0) && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      const id = crypto.randomUUID();
      let filePath: string | null = null;
      let rawContent: string | null = text.trim() || null;

      if (file) {
        const now = new Date();
        const path = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,"0")}/${id}/${file.name}`;
        const { error: upErr } = await supabase.storage.from("intelligence-uploads").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        filePath = path;
        // Read text content for text-friendly files client-side
        if (/\.(eml|msg|txt)$/i.test(file.name)) {
          rawContent = await file.text();
        }
      }

      const { error: insErr } = await (supabase as any).from("intelligence_ingestion").insert({
        id,
        source_type: sourceType,
        source_filename: file?.name ?? null,
        raw_content: rawContent,
        file_path: filePath,
        hint_festival_id: festivalId || null,
        hint_concept_ids: conceptIds.length ? conceptIds : null,
        hint_card_types: cardTypes.length ? cardTypes : null,
        hint_notes: notes || null,
        status: "uploaded",
      });
      if (insErr) throw insErr;

      // Trigger parse
      supabase.functions.invoke("parse-ingestion", { body: { ingestion_id: id } }).catch((e) => {
        console.error("parse-ingestion invoke error", e);
      });

      toast({ title: "Uploaded", description: "Claude is parsing — opening review…" });
      navigate(`/ingest/${id}`);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const conceptOptions = concepts;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2"><Inbox className="h-6 w-6" /> Ingest intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">Drop an email, PDF, photo, or paste text. Claude will parse it into proposed DB updates for your review.</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Drop a file here</p>
            <p className="text-xs text-muted-foreground mt-1">.eml, .msg, .pdf, .png, .jpg, .txt, .docx — max 25 MB</p>
            <div className="mt-3">
              <input
                id="file-input"
                type="file"
                className="hidden"
                accept=".eml,.msg,.pdf,.png,.jpg,.jpeg,.heic,.txt,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 25 * 1024 * 1024) {
                    toast({ title: "File too large", description: "Max 25 MB", variant: "destructive" });
                    return;
                  }
                  setFile(f);
                }}
              />
              <label htmlFor="file-input">
                <Button type="button" variant="outline" size="sm" asChild>
                  <span>Or choose a file</span>
                </Button>
              </label>
            </div>
            {file && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                <FileType className="h-4 w-4" />
                <span>{file.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Remove</Button>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Or paste text directly</Label>
            <Textarea
              placeholder="Paste an email body, SMS, PDF text, etc."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="mt-1"
            />
          </div>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <ChevronDown className="h-4 w-4" /> Add hints (optional)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Festival</Label>
                  <Select value={festivalId} onValueChange={setFestivalId}>
                    <SelectTrigger><SelectValue placeholder="Select festival" /></SelectTrigger>
                    <SelectContent>
                      {festivals.map((f: any) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Concepts</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {conceptOptions.map((c: any) => {
                      const sel = conceptIds.includes(c.id);
                      return (
                        <Badge
                          key={c.id}
                          variant={sel ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => setConceptIds(sel ? conceptIds.filter(x => x !== c.id) : [...conceptIds, c.id])}
                        >{c.name}</Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Card types affected</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {CARD_TYPES.map((t) => {
                    const sel = cardTypes.includes(t);
                    return (
                      <Badge
                        key={t}
                        variant={sel ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setCardTypes(sel ? cardTypes.filter(x => x !== t) : [...cardTypes, t])}
                      >{t}</Badge>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. forwarded by Marius" />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-xs text-muted-foreground">Detected: <span className="font-medium">{sourceType}</span></div>
            <Button onClick={submit} disabled={!canSubmit}>{submitting ? "Uploading…" : "Parse now"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">Recent ingestions</CardTitle>
          <Link to="/ingest/inbox" className="text-xs text-primary hover:underline">Open full inbox →</Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No ingestions yet — drop something above.</p>}
          {recent.map((r: any) => (
            <Link
              key={r.id}
              to={`/ingest/${r.id}`}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/40 transition-colors"
            >
              <div className="shrink-0">
                {r.source_type?.startsWith("email") ? <Mail className="h-4 w-4 text-muted-foreground" /> :
                  r.source_type === "pdf_upload" ? <FileText className="h-4 w-4 text-muted-foreground" /> :
                  r.source_type === "photo_upload" ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> :
                  <FileType className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.source_subject || r.source_filename || r.ai_summary || "Untitled"}</div>
                <div className="text-xs text-muted-foreground truncate">{r.ai_summary || "Awaiting parse…"}</div>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusPill(r.status)}`}>{r.status}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
