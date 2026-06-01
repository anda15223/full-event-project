import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KeyRound, ExternalLink, Eye, EyeOff, Copy, Check, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  festivalId: string;
}

export function AccreditationCard({ festivalId }: Props) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["festival-accreditation", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("accreditation_url, accreditation_username, accreditation_password, accreditation_notes")
        .eq("id", festivalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [editing, setEditing] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ url: "", username: "", password: "", notes: "" });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        url: data.accreditation_url ?? "",
        username: data.accreditation_username ?? "",
        password: data.accreditation_password ?? "",
        notes: data.accreditation_notes ?? "",
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("festivals")
        .update({
          accreditation_url: form.url || null,
          accreditation_username: form.username || null,
          accreditation_password: form.password || null,
          accreditation_notes: form.notes || null,
        })
        .eq("id", festivalId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Accreditation saved");
      qc.invalidateQueries({ queryKey: ["festival-accreditation", festivalId] });
      setEditing(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const copy = (value: string, key: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  const hasAny = data?.accreditation_url || data?.accreditation_username || data?.accreditation_password;

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 print:hidden">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          Accreditation portal
        </div>
        {!editing ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> {hasAny ? "Edit" : "Add"}
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); if (data) setForm({ url: data.accreditation_url ?? "", username: data.accreditation_username ?? "", password: data.accreditation_password ?? "", notes: data.accreditation_notes ?? "" }); }}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Portal URL</Label>
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://accreditation.example.com" />
          </div>
          <div>
            <Label className="text-xs">Username</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Deadline, contact, special instructions…" />
          </div>
        </div>
      ) : hasAny ? (
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          {data?.accreditation_url && (
            <div className="sm:col-span-2 flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground w-20 shrink-0">URL</span>
              <a href={data.accreditation_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex-1">
                {data.accreditation_url}
              </a>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(data.accreditation_url!, "url")}>
                {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                <a href={data.accreditation_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
              </Button>
            </div>
          )}
          {data?.accreditation_username && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Username</span>
              <span className="font-mono text-xs truncate flex-1">{data.accreditation_username}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(data.accreditation_username!, "user")}>
                {copied === "user" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
          {data?.accreditation_password && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Password</span>
              <span className="font-mono text-xs truncate flex-1">
                {showPw ? data.accreditation_password : "•".repeat(Math.min(12, data.accreditation_password.length))}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPw((s) => !s)}>
                {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(data.accreditation_password!, "pw")}>
                {copied === "pw" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
          {data?.accreditation_notes && (
            <div className="sm:col-span-2 text-xs text-muted-foreground whitespace-pre-wrap border-t pt-2 mt-1">
              {data.accreditation_notes}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No accreditation credentials saved yet. Click Add to store the portal link, username and password.</p>
      )}
    </div>
  );
}
