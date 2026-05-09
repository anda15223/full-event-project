import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AttentionItem, formatDueDate, priorityChipClasses } from "@/lib/attention";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

const CARD_HASH: Record<string, string> = {
  "Card #1 Introduction": "card-1",
  "Card #3 Equipment Setup": "card-3",
  "Card #4 Cooling": "card-4",
  "Card #7 Staff Transport & Accommodation": "card-7",
  "Card #12 Setup Timeline": "card-12",
  "Action Items": "card-action-items",
};

export function AttentionItemCard({ item }: { item: AttentionItem }) {
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();
  const due = formatDueDate(item.due_date);

  const handleDone = async () => {
    setDone(true);
    try {
      const { data, error } = await (supabase as any).rpc("mark_attention_done", {
        p_source_table: item.source_table,
        p_source_id: item.source_id,
      });
      if (error) throw error;
      if (typeof data === "string" && data.startsWith("ERROR:")) {
        throw new Error(data);
      }
      toast.success(typeof data === "string" ? data : "Marked done");
      qc.invalidateQueries({ queryKey: ["attention-items"] });
      qc.invalidateQueries({ queryKey: ["attention-summary"] });
      qc.invalidateQueries({ queryKey: ["attention-global"] });
    } catch (e: any) {
      setDone(false);
      toast.error(e?.message ?? "Failed to mark done");
    }
  };

  if (done) return null;

  const cardHash = CARD_HASH[item.source_card_label] ?? "";
  const cardLink =
    item.source_table === "festival_action_items"
      ? `/festivals/${item.festival_slug}/actions?item=${item.source_id}`
      : item.source_table === "transport_legs" || item.source_table === "festival_transport"
      ? `/festivals/${item.festival_slug}/transport?leg=${item.source_id}`
      : `/festivals/${item.festival_slug}${cardHash ? `#${cardHash}` : ""}`;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          to={cardLink}
          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          {item.source_card_label}
        </Link>
        <span className={cn("text-[10px] font-semibold uppercase px-2 py-0.5 rounded border", priorityChipClasses(item.priority))}>
          {item.priority ?? "normal"}
        </span>
      </div>
      <h4 className="mt-2 font-semibold text-sm leading-snug text-foreground">{item.title}</h4>
      {item.description && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "mt-1 text-xs text-muted-foreground text-left whitespace-pre-wrap w-full",
            !expanded && "line-clamp-2",
          )}
        >
          {item.description}
          <span className="inline-flex items-center text-primary ml-1">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        </button>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-xs">
          <span className={cn("font-medium tabular-nums", due.overdue && "text-destructive")}>{due.text}</span>
          {item.owner_name && <span className="text-muted-foreground">· {item.owner_name}</span>}
        </div>
        {item.source_table === "festival_staff" ? (
          <span
            title="Assign passenger via transport card to clear"
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-border text-muted-foreground cursor-not-allowed opacity-60"
          >
            <Check className="h-3 w-3" /> Assign via transport
          </span>
        ) : (
          <button
            onClick={handleDone}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300 transition"
          >
            <Check className="h-3 w-3" /> Mark Done
          </button>
        )}
      </div>
    </div>
  );
}
