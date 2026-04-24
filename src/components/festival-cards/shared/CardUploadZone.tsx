import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Brain, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SmartCard } from "@/components/festival/SmartCard";

interface Props {
  festivalId: string;
  /** Card name — used as SmartCard `cardKey` AND as the brain_entries category. */
  cardName: string;
  /** Title shown above the upload zone. */
  title?: string;
  subtitle?: string;
  /** When true (default), shows the "Save card to Brain" button. */
  onSaveToBrain?: boolean;
}

/**
 * Card-scoped upload zone. Thin wrapper around <SmartCard /> that adds a
 * "Save to Brain" action which persists the aggregated card content to brain_entries.
 *
 * SmartCard handles: drag/drop, PDF/Word/Excel/image extraction (Claude via
 * smart-card-extract edge function), preview, and storage.
 */
export function CardUploadZone({
  festivalId,
  cardName,
  title,
  subtitle,
  onSaveToBrain = true,
}: Props) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  // Find the SmartCard row so we can read its files for the brain save.
  const { data: smartCard } = useQuery({
    queryKey: ["smart_card_for_upload", festivalId, cardName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("smart_cards")
        .select("id")
        .eq("festival_id", festivalId)
        .eq("card_key", cardName)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!festivalId && !!cardName,
  });

  // Check whether this card has already been saved to brain.
  const { data: existingBrain } = useQuery({
    queryKey: ["brain_entry_for_card", festivalId, cardName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("id")
        .eq("festival_id", festivalId)
        .eq("category", cardName)
        .eq("source", "upload")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!festivalId && !!cardName,
  });

  const handleSaveToBrain = async () => {
    if (!smartCard?.id) {
      toast.error("Upload at least one file first");
      return;
    }
    setSaving(true);
    try {
      const { data: files, error: fErr } = await supabase
        .from("smart_files")
        .select("filename, ai_summary, extracted_text")
        .eq("card_id", smartCard.id);
      if (fErr) throw fErr;

      const content = (files ?? [])
        .map((f) => {
          const body = f.ai_summary || f.extracted_text || "";
          return `--- ${f.filename ?? "file"} ---\n${body}`;
        })
        .join("\n\n");

      if (!content.trim()) {
        toast.error("No extracted content to save yet");
        return;
      }

      const { error } = await supabase.from("brain_entries").insert({
        key_name: `card:${cardName}:${festivalId}`,
        display_name: title || cardName,
        content,
        source: "upload",
        category: cardName,
        scope: "festival",
        festival_id: festivalId,
        structured_data: { card_name: cardName, file_count: files?.length ?? 0 },
        tags: ["card", cardName],
      });
      if (error) throw error;

      toast.success("Saved card content to Brain");
      qc.invalidateQueries({ queryKey: ["brain_entry_for_card", festivalId, cardName] });
    } catch (e: any) {
      toast.error(`Save failed: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {onSaveToBrain && (
        <div className="flex justify-end">
          {existingBrain ? (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
              <Check className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">Card saved to Brain</span>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={handleSaveToBrain} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Brain className="h-3.5 w-3.5 mr-1.5" />}
              Save card to Brain
            </Button>
          )}
        </div>
      )}

      <SmartCard
        cardKey={cardName}
        festivalId={festivalId}
        title={title || cardName}
        subtitle={subtitle}
      />
    </div>
  );
}

export default CardUploadZone;
