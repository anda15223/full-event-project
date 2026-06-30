import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, RefreshCw, Plane, LogOut, ShieldAlert, Clock, KeyRound, Car, Tent, UtensilsCrossed, Siren, Phone, MoreHorizontal, Upload, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Summary = Record<string, string[]>;

interface Props {
  festivalId: string;
}

const CATEGORIES: Array<{ key: string; label: string; Icon: typeof Plane }> = [
  { key: "arriving", label: "Arriving", Icon: Plane },
  { key: "leaving", label: "Leaving", Icon: LogOut },
  { key: "rules", label: "Rules", Icon: ShieldAlert },
  { key: "schedule", label: "Schedule", Icon: Clock },
  { key: "access_credentials", label: "Access & credentials", Icon: KeyRound },
  { key: "parking_vehicles", label: "Parking & vehicles", Icon: Car },
  { key: "accommodation_camping", label: "Accommodation & camping", Icon: Tent },
  { key: "food_drink", label: "Food & drink", Icon: UtensilsCrossed },
  { key: "safety_emergency", label: "Safety & emergency", Icon: Siren },
  { key: "contacts", label: "Contacts", Icon: Phone },
  { key: "other", label: "Other", Icon: MoreHorizontal },
];

export function FestivalInfoSummary({ festivalId }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [parsedAt, setParsedAt] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("festival_info_summaries")
      .select("summary, raw_text, parsed_at")
      .eq("festival_id", festivalId)
      .maybeSingle();
    if (data) {
      setSummary(data.summary as Summary);
      setRawText(data.raw_text ?? "");
      setParsedAt(data.parsed_at);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [festivalId]);

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        const idx = res.indexOf(",");
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });

  const parse = async () => {
    if (!file && !rawText.trim()) {
      toast.error("Upload a PDF or paste the festival info");
      return;
    }
    setParsing(true);
    try {
      const body: Record<string, unknown> = { festivalId };
      if (file) {
        body.fileBase64 = await fileToBase64(file);
        body.fileName = file.name;
      } else {
        body.rawText = rawText;
      }
      const { data, error } = await supabase.functions.invoke("parse-festival-info", { body });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary as Summary);
      setParsedAt(new Date().toISOString());
      toast.success("Info parsed");
      setOpen(false);
      setFile(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse");
    } finally {
      setParsing(false);
    }
  };

  const reparseFromDocs = async () => {
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-festival-info", {
        body: { festivalId, useLocationDocs: true },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary as Summary);
      setParsedAt(new Date().toISOString());
      toast.success("Info re-parsed from uploaded documents");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse");
    } finally {
      setParsing(false);
    }
  };

  const hasAny = summary && CATEGORIES.some(c => (summary[c.key] ?? []).length > 0);

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-sm font-semibold">AI summary</h3>
          {parsedAt && (
            <span className="text-[11px] text-muted-foreground">
              · updated {new Date(parsedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="default" onClick={reparseFromDocs} disabled={parsing} title="Re-parse using all documents uploaded in Location documents">
            {parsing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Re-parse from documents
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Parse from file / text
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Parse festival info</DialogTitle>
              <DialogDescription>
                Upload the PDF/Word doc the festival sent, or paste the text below. The AI groups it into bullet points by category.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Choose file
                </Button>
                {file && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[260px]">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="text-destructive hover:underline ml-1"
                    >remove</button>
                  </div>
                )}
                <span className="text-[11px] text-muted-foreground ml-auto">PDF, DOCX or TXT</span>
              </div>

              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">or paste text</div>
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste festival info here…"
                className="min-h-[220px] text-sm"
                disabled={!!file}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={parsing}>Cancel</Button>
              <Button onClick={parse} disabled={parsing}>
                {parsing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Parse with AI
              </Button>
            </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : !hasAny ? (
          <div className="text-xs text-muted-foreground">
            No AI summary yet. Click <b>Parse festival info</b> and paste what the festival sent — arrival,
            leaving, rules, schedule, contacts, etc.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {CATEGORIES.map(({ key, label, Icon }) => {
              const items = summary?.[key] ?? [];
              if (items.length === 0) return null;
              return (
                <div key={key} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <h4 className="text-xs font-semibold uppercase tracking-wide">{label}</h4>
                  </div>
                  <ul className="list-disc list-outside pl-4 space-y-1 text-[12.5px] leading-snug">
                    {items.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default FestivalInfoSummary;
