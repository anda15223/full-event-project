import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  RefreshCw, Mail, FileText, CheckSquare, Search, ArrowLeft,
  Clock, Building2, User, Paperclip, Download, Globe, RotateCcw,
  Loader2, File, Image as ImageIcon, Eye, X,
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  useEmails, useSyncAndClassify, useFetchEmailBody,
  useEmailAttachments, useReparseEmail, useFetchAttachment,
  type Email, type EmailAttachment,
} from "@/hooks/useEmailAgent";

const classificationConfig: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  invoice: { label: "Invoice", color: "bg-primary/10 text-primary border-primary/20", icon: FileText },
  task: { label: "Task", color: "bg-accent/10 text-accent border-accent/20", icon: CheckSquare },
  waiting: { label: "Waiting", color: "bg-chart-3/10 text-chart-3 border-chart-3/20", icon: Clock },
  information: { label: "Info", color: "bg-muted text-muted-foreground border-border", icon: Mail },
  irrelevant: { label: "Irrelevant", color: "bg-destructive/10 text-destructive border-destructive/20", icon: Mail },
};

const langLabels: Record<string, string> = { en: "English", da: "Danish", ro: "Romanian" };

function getAttachmentIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.includes("pdf")) return FileText;
  return File;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildEmailDocument(html: string) {
  const baseEnhancements = `<meta charset="utf-8"><base target="_blank" /><style>
    html, body { margin: 0; padding: 0; background: transparent; }
    body { overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; border-collapse: collapse; }
    iframe { max-width: 100%; }
  </style>`;

  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1>${baseEnhancements}`);
    }
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${baseEnhancements}</head>`);
  }

  return `<!DOCTYPE html><html><head>${baseEnhancements}</head><body>${html}</body></html>`;
}

/** Safely render HTML email body in a sandboxed iframe */
function HtmlEmailBody({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(buildEmailDocument(html));
    doc.close();

    const resize = () => {
      if (iframeRef.current && doc.body) {
        iframeRef.current.style.height = Math.max(220, doc.documentElement.scrollHeight + 16) + "px";
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    if (doc.body) resizeObserver.observe(doc.body);
    if (doc.documentElement) resizeObserver.observe(doc.documentElement);
    setTimeout(resize, 80);

    return () => resizeObserver.disconnect();
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      className="w-full border-0 min-h-[220px]"
      style={{ background: "transparent" }}
      title="Email content"
    />
  );
}

function AttachmentItem({ att, storageBaseUrl }: { att: EmailAttachment; storageBaseUrl: string }) {
  const fetchAttachment = useFetchAttachment();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const Icon = getAttachmentIcon(att.mime_type);
  const downloadUrl = att.storage_path ? `${storageBaseUrl}/${att.storage_path}` : null;
  const isImage = att.mime_type?.startsWith("image/");
  const isPdf = att.mime_type?.includes("pdf");
  const canPreview = isImage || isPdf;
  const isFetching = fetchAttachment.isPending;

  const handleFetch = async () => {
    const result = await fetchAttachment.mutateAsync(att.id);
    if (result?.url && canPreview) setPreviewUrl(result.url);
  };

  const handlePreview = () => {
    if (downloadUrl) setPreviewUrl(downloadUrl);
    else handleFetch();
  };

  return (
    <>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{att.filename || "Unnamed"}</p>
          <p className="text-xs text-muted-foreground">
            {att.mime_type} · {formatFileSize(att.size || 0)}
            {att.parse_status === "stored" && <span className="text-green-500 ml-2">● Stored</span>}
            {att.parse_status === "pending" && <span className="text-yellow-500 ml-2">● Not downloaded</span>}
            {att.parse_status === "failed" && <span className="text-destructive ml-2">● Failed</span>}
          </p>
          {att.extracted_summary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{att.extracted_summary}</p>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          {canPreview && (
            <Button variant="outline" size="sm" onClick={handlePreview} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
              <span className="ml-1 hidden sm:inline">Preview</span>
            </Button>
          )}
          {downloadUrl ? (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Download className="h-3 w-3" /><span className="ml-1 hidden sm:inline">Open</span>
              </Button>
            </a>
          ) : (
            <Button variant="outline" size="sm" onClick={handleFetch} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              <span className="ml-1 hidden sm:inline">Fetch</span>
            </Button>
          )}
        </div>
      </div>

      {/* Quick preview overlay */}
      {previewUrl && (
        <div className="relative mt-2 rounded-lg border border-border overflow-hidden bg-background">
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur-sm"
            onClick={() => setPreviewUrl(null)}
          >
            <X className="h-4 w-4" />
          </Button>
          {isImage ? (
            <img src={previewUrl} alt={att.filename || "Attachment"} className="max-h-[500px] w-auto mx-auto" />
          ) : isPdf ? (
            <iframe src={previewUrl} className="w-full h-[600px] border-0" title={att.filename || "PDF preview"} />
          ) : null}
        </div>
      )}
    </>
  );
}

function EmailDetail({ email, onBack }: { email: Email; onBack: () => void }) {
  const config = classificationConfig[email.classification || ""];
  const { data: bodyData, isLoading: bodyLoading } = useFetchEmailBody(email.id);
  const { data: attachments } = useEmailAttachments(email.id);
  const reparseEmail = useReparseEmail();

  const bodyHtml = bodyData?.body_html || (email as any).body_html;
  const bodyText = bodyData?.body_text || email.body_text;
  const hasContent = bodyHtml || (bodyText && bodyText.length > 10);

  const storageBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-attachments`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Inbox
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => reparseEmail.mutate(email.id)}
          disabled={reparseEmail.isPending}
          className="ml-auto text-xs"
        >
          <RotateCcw className={`h-3 w-3 mr-1 ${reparseEmail.isPending ? "animate-spin" : ""}`} />
          Re-parse
        </Button>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-card border-border overflow-hidden">
          {/* Header */}
          <div className="border-b border-border p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl font-bold text-foreground leading-tight">
                {email.subject || "(no subject)"}
              </h1>
              <div className="flex gap-2 shrink-0">
                {config && <Badge variant="outline" className={config.color}>{config.label}</Badge>}
                {!email.processed && <Badge variant="outline" className="border-muted text-muted-foreground">Pending</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <span className="font-medium">{email.sender || "Unknown"}</span>
              </div>
              <span className="text-muted-foreground ml-auto text-xs">
                {email.received_at ? format(new Date(email.received_at), "EEEE, MMMM d, yyyy 'at' HH:mm") : ""}
              </span>
            </div>
            <div className="flex items-center gap-3 pt-1 flex-wrap">
              {email.company && (
                <Badge variant="outline" className="border-accent/30 text-accent text-xs">
                  <Building2 className="h-3 w-3 mr-1" />{email.company}
                </Badge>
              )}
              {(email as any).language && (email as any).language !== "unknown" && (
                <Badge variant="outline" className="border-muted text-muted-foreground text-xs">
                  <Globe className="h-3 w-3 mr-1" />{langLabels[(email as any).language] || (email as any).language}
                </Badge>
              )}
              {email.confidence != null && (
                <span className="text-xs text-muted-foreground">AI confidence: {Math.round((email.confidence || 0) * 100)}%</span>
              )}
              {email.has_attachments && (
                <Badge variant="outline" className="border-primary/30 text-primary text-xs">
                  <Paperclip className="h-3 w-3 mr-1" /> Attachments
                </Badge>
              )}
            </div>
          </div>

          {/* AI Summary */}
          {email.summary && (
            <div className="border-b border-border px-5 py-3 bg-accent/5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">AI Summary</div>
              <p className="text-sm text-foreground">{email.summary}</p>
            </div>
          )}

          {/* Email Body */}
          <CardContent className="p-5">
            {bodyLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin opacity-50" />
                <p>Parsing email from server...</p>
              </div>
            ) : bodyHtml ? (
              <HtmlEmailBody html={bodyHtml} />
            ) : hasContent ? (
              <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                {bodyText}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Mail className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Email body could not be retrieved</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => reparseEmail.mutate(email.id)}
                  disabled={reparseEmail.isPending}
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Try re-parsing
                </Button>
              </div>
            )}
          </CardContent>

          {/* Attachments */}
          {attachments && attachments.length > 0 && (
            <div className="border-t border-border px-5 py-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                <Paperclip className="h-3 w-3 inline mr-1" /> {attachments.length} Attachment{attachments.length > 1 ? "s" : ""}
              </div>
              <div className="space-y-2">
                {attachments.filter(a => !a.is_inline).map(att => (
                  <AttachmentItem key={att.id} att={att} storageBaseUrl={storageBaseUrl} />
                ))}
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

export default function EmailInbox() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const { data: emails, isLoading } = useEmails();
  const syncAndClassify = useSyncAndClassify();

  const filteredEmails = useMemo(() => {
    let list = emails || [];
    if (filter !== "all") list = list.filter((e) => e.classification === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.subject?.toLowerCase().includes(q) ||
          e.sender?.toLowerCase().includes(q) ||
          e.summary?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [emails, filter, search]);

  if (selectedEmail) {
    return <EmailDetail email={selectedEmail} onBack={() => setSelectedEmail(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Email Inbox</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every email is either an <strong className="text-primary">Invoice</strong> or a <strong className="text-accent">Task</strong>
          </p>
        </div>
        <Button
          onClick={() => syncAndClassify.mutate(undefined)}
          disabled={syncAndClassify.isPending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncAndClassify.isPending ? "animate-spin" : ""}`} />
          {syncAndClassify.isPending ? "Syncing..." : "Sync Emails"}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search emails..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[{ key: "all", label: "All" }, { key: "invoice", label: "Invoices" }, { key: "task", label: "Tasks" }].map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.key)}
              className={filter === f.key ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading emails...</div>
      ) : filteredEmails.length === 0 ? (
        <Card className="glass-panel">
          <CardContent className="py-16 text-center">
            <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="font-semibold mb-1">No emails found</h3>
            <p className="text-sm text-muted-foreground">Click "Sync Emails" to fetch from your mailbox.</p>
          </CardContent>
        </Card>
      ) : (
        <AnimatePresence>
          <div className="space-y-2">
            {filteredEmails.map((email, i) => {
              const config = classificationConfig[email.classification || ""];
              const IconComp = config?.icon || Mail;
              return (
                <motion.div
                  key={email.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <Card
                    onClick={() => setSelectedEmail(email)}
                    className={`glass-panel cursor-pointer hover:border-primary/30 transition-all border-l-2 ${
                      email.classification === "invoice" ? "border-l-primary" :
                      email.classification === "task" ? "border-l-accent" : "border-l-muted"
                    }`}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                          email.classification === "invoice" ? "bg-primary/10" : "bg-accent/10"
                        }`}>
                          <IconComp className={`w-4 h-4 ${email.classification === "invoice" ? "text-primary" : "text-accent"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium truncate text-foreground">
                              {email.sender || "Unknown"}
                            </span>
                            {config && (
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
                                {config.label}
                              </Badge>
                            )}
                            {email.has_attachments && (
                              <Paperclip className="h-3 w-3 text-muted-foreground" />
                            )}
                            {!email.processed && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted text-muted-foreground">Pending</Badge>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground shrink-0">
                              {email.received_at ? format(new Date(email.received_at), "MMM d, HH:mm") : ""}
                            </span>
                          </div>
                          <p className="text-sm truncate font-medium text-foreground">{email.subject}</p>
                          {email.summary && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{email.summary}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
