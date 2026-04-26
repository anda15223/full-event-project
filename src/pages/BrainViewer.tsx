import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Brain, Mail, FileText, Pencil, Plus, Search, Tent, Trash2, Upload, User, Sparkles, Loader2,
} from "lucide-react";
import { format } from "date-fns";

const BRAIN_CATEGORIES = [
  "contract",
  "electricity_plan",
  "safety_plan",
  "email",
  "supplier_quote",
  "festival_rules",
  "note",
  "other",
] as const;

type BrainEntry = {
  id: string;
  festival_id: string | null;
  category: string | null;
  source: string | null;
  content: string;
  display_name: string | null;
  key_name: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  structured_data: any;
};

type Festival = { id: string; name: string; year: number; start_date: string };

const fileToDataUrl = (input: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(input);
  });

const sourceIcon = (source: string | null) => {
  switch (source) {
    case "email": return Mail;
    case "manual": return User;
    case "document": return FileText;
    default: return Brain;
  }
};

export default function BrainViewer() {
  const qc = useQueryClient();
  const [festivalId, setFestivalId] = useState<string | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<BrainEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: festivals = [] } = useQuery({
    queryKey: ["brain-festivals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, name, year, start_date")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as Festival[];
    },
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["brain-entries", festivalId],
    queryFn: async () => {
      let q = supabase.from("brain_entries").select("*").order("updated_at", { ascending: false }).limit(500);
      if (festivalId !== "all") q = q.eq("festival_id", festivalId);
      const { data, error } = await q;
      if (error) throw error;
      return data as BrainEntry[];
    },
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => e.category && set.add(e.category));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (category !== "all" && e.category !== category) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${e.content} ${e.display_name ?? ""} ${e.key_name} ${(e.tags ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [entries, category, search]);

  const updateMut = useMutation({
    mutationFn: async (payload: Partial<BrainEntry> & { id: string }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("brain_entries").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brain-entries"] });
      toast.success("Entry updated");
      setEditing(false);
      setSelected(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brain_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brain-entries"] });
      toast.success("Entry deleted");
      setSelected(null);
    },
    onError: (e: any) => toast.error(`Delete failed: ${e.message}`),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("brain_entries").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      qc.invalidateQueries({ queryKey: ["brain-entries"] });
      toast.success(`Deleted ${ids.length} ${ids.length === 1 ? "entry" : "entries"}`);
      setSelectedIds(new Set());
    },
    onError: (e: any) => toast.error(`Bulk delete failed: ${e.message}`),
  });

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selectedIds.has(e.id));
  const someFilteredSelected = filtered.some(e => selectedIds.has(e.id));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filtered.forEach(e => next.delete(e.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach(e => next.add(e.id));
      return next;
    });
  };

  const addMut = useMutation({
    mutationFn: async (payload: { content: string; category: string; display_name: string; festival_id: string | null }) => {
      const { error } = await supabase.from("brain_entries").insert({
        key_name: `manual:${Date.now()}`,
        content: payload.content,
        category: payload.category || "note",
        display_name: payload.display_name || null,
        festival_id: payload.festival_id,
        source: "manual",
        scope: payload.festival_id ? "festival" : "global",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brain-entries"] });
      toast.success("Entry added");
      setAdding(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex gap-6 h-[calc(100vh-7rem)]">
      {/* Festivals sidebar */}
      <Card className="w-64 shrink-0 p-3 overflow-y-auto">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">Festivals</h2>
        <button
          onClick={() => setFestivalId("all")}
          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
            festivalId === "all" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
          }`}
        >
          <Brain className="h-3.5 w-3.5 inline mr-2" />
          All entries
        </button>
        <div className="mt-1 space-y-0.5">
          {festivals.map(f => (
            <button
              key={f.id}
              onClick={() => setFestivalId(f.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                festivalId === f.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
              }`}
            >
              <Tent className="h-3.5 w-3.5 inline mr-2" />
              {f.name}
              <span className="text-xs text-muted-foreground ml-1">{f.year}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <UploadToBrainPanel
          festivals={festivals}
          defaultFestivalId={festivalId === "all" ? null : festivalId}
          onSaved={() => qc.invalidateQueries({ queryKey: ["brain-entries"] })}
        />
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search entries…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add entry
          </Button>
        </div>

        {(filtered.length > 0 || selectedIds.size > 0) && (
          <div className="flex items-center gap-3 mb-2 px-1">
            <Checkbox
              checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all"
            />
            <span className="text-xs text-muted-foreground">
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : `Select all (${filtered.length})`}
            </span>
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto h-7"
                disabled={bulkDeleteMut.isPending}
                onClick={() => {
                  if (confirm(`Delete ${selectedIds.size} brain ${selectedIds.size === 1 ? "entry" : "entries"}? This cannot be undone.`)) {
                    bulkDeleteMut.mutate(Array.from(selectedIds));
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete selected
              </Button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {isLoading && <div className="text-sm text-muted-foreground p-4">Loading…</div>}
          {!isLoading && filtered.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">No brain entries.</Card>
          )}
          {filtered.map(e => {
            const Icon = sourceIcon(e.source);
            const isChecked = selectedIds.has(e.id);
            return (
              <Card
                key={e.id}
                onClick={() => { setSelected(e); setEditing(false); }}
                className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="pt-1"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleId(e.id)}
                      aria-label="Select entry"
                    />
                  </div>
                  <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {e.category && <Badge variant="secondary" className="text-xs">{e.category}</Badge>}
                      {e.display_name && <span className="text-sm font-medium truncate">{e.display_name}</span>}
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {format(new Date(e.updated_at), "MMM d, yyyy")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{e.content}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* View / edit modal */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.display_name || selected.key_name}
                  {selected.category && <Badge variant="secondary">{selected.category}</Badge>}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Source: {selected.source ?? "unknown"} · Updated {format(new Date(selected.updated_at), "PPp")}
                </p>
              </DialogHeader>

              {editing ? (
                <div className="space-y-3">
                  <div>
                    <Label>Display name</Label>
                    <Input
                      defaultValue={selected.display_name ?? ""}
                      onChange={e => (selected.display_name = e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Input
                      defaultValue={selected.category ?? ""}
                      onChange={e => (selected.category = e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Content</Label>
                    <Textarea
                      rows={10}
                      defaultValue={selected.content}
                      onChange={e => (selected.content = e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-sm bg-muted/30 rounded-md p-4 border">
                  {selected.content}
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Delete this brain entry?")) deleteMut.mutate(selected.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
                <div className="flex-1" />
                {editing ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => updateMut.mutate({
                        id: selected.id,
                        content: selected.content,
                        category: selected.category,
                        display_name: selected.display_name,
                      })}
                      disabled={updateMut.isPending}
                    >
                      Save
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add modal */}
      <AddEntryDialog
        open={adding}
        onClose={() => setAdding(false)}
        festivals={festivals}
        defaultFestivalId={festivalId === "all" ? null : festivalId}
        onSubmit={(payload) => addMut.mutate(payload)}
        pending={addMut.isPending}
      />
    </div>
  );
}

function AddEntryDialog({
  open, onClose, festivals, defaultFestivalId, onSubmit, pending,
}: {
  open: boolean;
  onClose: () => void;
  festivals: Festival[];
  defaultFestivalId: string | null;
  onSubmit: (p: { content: string; category: string; display_name: string; festival_id: string | null }) => void;
  pending: boolean;
}) {
  const [content, setContent] = useState("");
  const [cat, setCat] = useState("note");
  const [name, setName] = useState("");
  const [fid, setFid] = useState<string>(defaultFestivalId ?? "global");

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add brain entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Festival</Label>
            <Select value={fid} onValueChange={setFid}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (no festival)</SelectItem>
                {festivals.map(f => <SelectItem key={f.id} value={f.id}>{f.name} {f.year}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Display name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Site contact" />
          </div>
          <div>
            <Label>Category</Label>
            <Input value={cat} onChange={e => setCat(e.target.value)} placeholder="contact, contract, menu, electric…" />
          </div>
          <div>
            <Label>Content</Label>
            <Textarea rows={6} value={content} onChange={e => setContent(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!content.trim() || pending}
            onClick={() => {
              onSubmit({
                content: content.trim(),
                category: cat.trim(),
                display_name: name.trim(),
                festival_id: fid === "global" ? null : fid,
              });
              setContent(""); setName(""); setCat("note");
            }}
          >
            Add entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadToBrainPanel({
  festivals,
  defaultFestivalId,
  onSaved,
}: {
  festivals: Festival[];
  defaultFestivalId: string | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fid, setFid] = useState<string>(defaultFestivalId ?? "global");
  const [category, setCategory] = useState<string>("contract");
  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{
    summary: string;
    content: string;
    storage_path?: string;
    filename?: string;
  } | null>(null);

  const reset = () => {
    setPastedText("");
    setFile(null);
    setPreview(null);
  };

  const extract = async () => {
    if (!pastedText.trim() && !file) {
      toast.error("Paste some text or choose a file");
      return;
    }
    setExtracting(true);
    try {
      let storage_path: string | undefined;
      let mime_type: string | undefined;
      let filename: string | undefined;
      let file_data_url: string | undefined;

      if (file) {
        if (file.size === 0) {
          throw new Error("This file is empty. Please re-save it as a JPG/PNG/PDF and upload it again.");
        }
        const folder = fid === "global" ? "global" : fid;
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        storage_path = `brain/${folder}/${category}/${Date.now()}_${safeName}`;
        file_data_url = await fileToDataUrl(file);
        const { error: upErr } = await supabase.storage
          .from("festival-photos")
          .upload(storage_path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
        if (upErr) throw upErr;
        mime_type = file.type;
        filename = file.name;
      }

      const { data, error } = await supabase.functions.invoke("brain-extract", {
        body: {
          storage_path,
          file_data_url,
          mime_type,
          filename,
          category,
          pasted_text: pastedText || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      setPreview({
        summary: (data as any).summary ?? "",
        content: (data as any).content ?? "",
        storage_path,
        filename,
      });
      toast.success("Extracted — review and save");
    } catch (e: any) {
      toast.error(e.message || "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const fest = festivals.find((f) => f.id === fid);
      const { error } = await supabase.from("brain_entries").insert({
        key_name: `upload:${category}:${Date.now()}`,
        content: preview.content,
        display_name:
          preview.filename ||
          preview.summary?.slice(0, 80) ||
          `${category} upload`,
        category,
        source: "upload",
        festival_id: fid === "global" ? null : fid,
        scope: fid === "global" ? "global" : "festival",
        structured_data: {
          summary: preview.summary,
          storage_path: preview.storage_path ?? null,
          filename: preview.filename ?? null,
          festival_name: fest?.name ?? null,
        },
      });
      if (error) throw error;
      toast.success("Saved to Brain");
      onSaved();
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-4 p-4 bg-primary/5 border-primary/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Upload to Brain</span>
          <span className="text-xs text-muted-foreground">
            Contracts, plans, emails, quotes, notes
          </span>
        </div>
        <Plus
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            open ? "rotate-45" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Festival</Label>
              <Select value={fid} onValueChange={setFid}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (no festival)</SelectItem>
                  {festivals.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} {f.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRAIN_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">File (PDF, image, Word, Excel, txt)</Label>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.doc,.docx,.xls,.xlsx,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground mt-1">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">…or paste text / email body</Label>
            <Textarea
              rows={4}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste contract text, email body, supplier quote, notes…"
            />
          </div>

          {!preview ? (
            <Button onClick={extract} disabled={extracting} size="sm">
              {extracting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Extracting…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Extract with AI</>
              )}
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border bg-background p-3">
              <div>
                <Label className="text-xs">Summary</Label>
                <Input
                  value={preview.summary}
                  onChange={(e) =>
                    setPreview({ ...preview, summary: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Content (editable)</Label>
                <Textarea
                  rows={10}
                  value={preview.content}
                  onChange={(e) =>
                    setPreview({ ...preview, content: e.target.value })
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={save} disabled={saving} size="sm">
                  {saving ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                  ) : (
                    "Save to Brain"
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={reset}>
                  Discard
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
