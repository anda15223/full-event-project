import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Brain, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  emailId: string;
  emailSubject: string | null;
  emailSender: string | null;
  emailBody: string | null;
  attachmentsText: string | null;
}

export function useFestivalsForTagging() {
  return useQuery({
    queryKey: ["festivals_for_tagging"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, name, year")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEmailBrainEntry(emailId: string) {
  return useQuery({
    queryKey: ["brain_entry_for_email", emailId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("id, festival_id")
        .eq("source", "email")
        .contains("structured_data", { email_id: emailId })
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });
}

export function EmailBrainSaver({
  emailId, emailSubject, emailSender, emailBody, attachmentsText,
}: Props) {
  const qc = useQueryClient();
  const { data: festivals = [] } = useFestivalsForTagging();
  const { data: existing, isLoading } = useEmailBrainEntry(emailId);
  const [festivalId, setFestivalId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking brain…
      </div>
    );
  }

  if (existing) {
    const f = festivals.find((x) => x.id === existing.festival_id);
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
        <Check className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">Saved to Brain</span>
        {f && (
          <span className="text-muted-foreground">
            · {f.name} {f.year}
          </span>
        )}
      </div>
    );
  }

  const handleSave = async () => {
    if (!festivalId) return;
    setSaving(true);
    const festival = festivals.find((f) => f.id === festivalId);
    const content = [
      emailSubject && `Subject: ${emailSubject}`,
      emailSender && `From: ${emailSender}`,
      emailBody && `\n${emailBody}`,
      attachmentsText && `\n\n--- Attachments ---\n${attachmentsText}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { error } = await supabase.from("brain_entries").insert({
      key_name: `email:${emailId}`,
      display_name: emailSubject || "Email",
      content: content || "(empty email)",
      source: "email",
      category: "email",
      scope: "festival",
      festival_id: festivalId,
      structured_data: {
        email_id: emailId,
        sender: emailSender,
        subject: emailSubject,
      },
      tags: ["email", festival?.name].filter(Boolean) as string[],
    });

    setSaving(false);
    if (error) {
      toast.error("Could not save to Brain", { description: error.message });
      return;
    }
    toast.success(`Saved to ${festival?.name ?? "Brain"}`);
    qc.invalidateQueries({ queryKey: ["brain_entry_for_email", emailId] });
    qc.invalidateQueries({ queryKey: ["emails_with_brain"] });
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={festivalId} onValueChange={setFestivalId}>
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue placeholder="Tag to festival…" />
        </SelectTrigger>
        <SelectContent>
          {festivals.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No festivals
            </div>
          ) : (
            festivals.map((f) => (
              <SelectItem key={f.id} value={f.id} className="text-xs">
                {f.name} {f.year}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        onClick={handleSave}
        disabled={!festivalId || saving}
        className="h-8"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Brain className="h-3.5 w-3.5 mr-1.5" />
        )}
        Save to Brain
      </Button>
    </div>
  );
}

/** Hook: returns Set of email IDs that already have a brain_entry. */
export function useEmailsSavedToBrain() {
  return useQuery({
    queryKey: ["emails_with_brain"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("structured_data")
        .eq("source", "email");
      if (error) throw error;
      const ids = new Set<string>();
      for (const row of data ?? []) {
        const sd = row.structured_data as { email_id?: string } | null;
        if (sd?.email_id) ids.add(sd.email_id);
      }
      return ids;
    },
  });
}
