import { useEffect, useState } from "react";
import { Download, Check, X, Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useDraftMode } from "@/hooks/useDraftMode";

type Festival = { id: string; name: string; year: number };

interface Props {
  /** Logical card name (for label only). */
  cardLabel: string;
  /** Tables to clone for this card. Must match the edge function allowlist. */
  tables: string[];
  currentFestivalId: string;
  /** Called after a successful commit (promotes drafts → live). */
  onCommitted?: () => void;
  /** Optional extra import step run AFTER the standard clone-card-data import.
   *  Returns a short summary string to append to the toast (e.g. "+12 build-out rows"). */
  extraImport?: (sourceFestivalId: string, currentFestivalId: string) => Promise<string | void>;
}

export function ImportFromPreviousCard({
  cardLabel,
  tables,
  currentFestivalId,
  onCommitted,
  extraImport,
}: Props) {

  const { toast } = useToast();
  const { draftMode, setDraftMode } = useDraftMode();
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [draftCount, setDraftCount] = useState<number>(0);
  const [busy, setBusy] = useState<null | "import" | "commit" | "discard">(null);

  useEffect(() => {
    if (!currentFestivalId) return;
    supabase
      .from("festivals")
      .select("id,name,year")
      .neq("id", currentFestivalId)
      .order("start_date", { ascending: false })
      .then(({ data }) => setFestivals((data as Festival[]) ?? []));
    refreshCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFestivalId]);

  async function call(action: "import" | "commit" | "discard" | "count") {
    if (!currentFestivalId) {
      return {} as Record<string, Record<string, number>>;
    }
    if (!tables || tables.length === 0) {
      if (action === "count") return { counts: {} } as Record<string, Record<string, number>>;
      if (action === "import") return { imported: {} } as Record<string, Record<string, number>>;
      if (action === "commit") return { promoted: {} } as Record<string, Record<string, number>>;
      return { removed: {} } as Record<string, Record<string, number>>;
    }
    const { data, error } = await supabase.functions.invoke("clone-card-data", {
      body: {
        action,
        tables,
        sourceFestivalId: sourceId || undefined,
        targetFestivalId: currentFestivalId,
      },
    });
    if (error) throw new Error(error.message);
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data as Record<string, Record<string, number>>;
  }

  async function refreshCount() {
    try {
      const res = await call("count");
      const total = Object.values(res.counts ?? {}).reduce((a, b) => a + b, 0);
      setDraftCount(total);
    } catch {
      /* noop */
    }
  }

  async function handleImport() {
    if (!sourceId) return;
    setBusy("import");
    try {
      const res = await call("import");
      const total = Object.values(res.imported ?? {}).reduce((a, b) => a + b, 0);
      setDraftCount(total);
      if (total > 0) setDraftMode(true);
      let extraMsg: string | void;
      if (extraImport) {
        try {
          extraMsg = await extraImport(sourceId, currentFestivalId);
        } catch (ee) {
          toast({ title: "Extra import failed", description: (ee as Error).message, variant: "destructive" });
        }
      }
      const pieces = [
        total > 0 ? `${total} draft row${total === 1 ? "" : "s"} staged` : "",
        extraMsg ?? "",
      ].filter(Boolean);
      toast({
        title: total > 0 ? "Draft imported" : extraMsg ? "Import complete" : "Nothing to import",
        description: total > 0
          ? `${pieces.join(" · ")}. You're now in Preview mode — edit or delete rows, then click "Set up for this event".`
          : pieces.length
            ? `${pieces.join(" · ")}.`
            : "No reusable rows were found for this card.",
      });
      onCommitted?.();
    } catch (e) {
      toast({ title: "Import failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }


  async function handleCommit() {
    setBusy("commit");
    try {
      const res = await call("commit");
      const total = Object.values(res.promoted ?? {}).reduce((a, b) => a + b, 0);
      setDraftCount(0);
      setDraftMode(false);
      toast({ title: "Set up for this event", description: `${total} rows are now live.` });
      onCommitted?.();
    } catch (e) {
      toast({ title: "Commit failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function handleDiscard() {
    setBusy("discard");
    try {
      await call("discard");
      setDraftCount(0);
      setDraftMode(false);
      toast({ title: "Draft discarded" });
      onCommitted?.();
    } catch (e) {
      toast({ title: "Discard failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={
        "rounded-xl border p-3 text-sm space-y-2 " +
        (draftMode
          ? "border-amber-300 bg-amber-50/60"
          : "border-dashed bg-muted/30")
      }
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Download className="h-3.5 w-3.5" />
        <span className="font-medium">Import {cardLabel} from another festival</span>
        {draftMode && (
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Preview mode · editing drafts
          </span>
        )}
      </div>

      {draftMode && (
        <p className="text-xs text-amber-800">
          The list below shows imported draft rows. Edit or delete what you
          don't need, then click <strong>Set up for this event</strong> to make
          them live. Click <strong>Exit preview</strong> to keep them as drafts
          and continue later.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={sourceId} onValueChange={setSourceId}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder="Pick festival…" />
          </SelectTrigger>
          <SelectContent>
            {festivals.map((f) => (
              <SelectItem key={f.id} value={f.id} className="text-xs">
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={!sourceId || busy !== null}
          onClick={handleImport}
        >
          {busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import as draft"}
        </Button>

        {draftCount > 0 && !draftMode && (
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            onClick={() => setDraftMode(true)}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Preview & edit {draftCount} draft{draftCount === 1 ? "" : "s"}
          </Button>
        )}
        {draftMode && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => setDraftMode(false)}
          >
            <EyeOff className="h-3.5 w-3.5 mr-1" />
            Exit preview
          </Button>
        )}
      </div>

      {draftCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-dashed">
          <span className="text-xs text-muted-foreground">
            {draftCount} draft row{draftCount === 1 ? "" : "s"} ready
          </span>
          <Button
            size="sm"
            className="h-8"
            disabled={busy !== null}
            onClick={handleCommit}
          >
            {busy === "commit" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Check className="h-3.5 w-3.5 mr-1" />
                Set up for this event
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={busy !== null}
            onClick={handleDiscard}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}

// Per-card table mapping — keep in sync with the edge function allowlist.
export const CARD_TABLES: Record<string, string[]> = {
  accommodation: ["festival_accommodation"],
  contacts: ["festival_contacts"],
  contracts: ["festival_contracts"],
  cooling: ["festival_cooling", "festival_cooling_unit"],
  equipment: ["festival_equipment", "festival_equipment_transport"],
  facade: ["festival_facade_status"],
  hours: ["festival_hours", "festival_concept_hours", "festival_service_hours"],
  prices: ["festival_concept_prices"],
  safety: ["festival_safety", "festival_safety_zone"],
  setup: [],
  // Staff import only copies people (and their vehicle assignments).
  // Scheduling positions / shifts are festival-specific and must be imported
  // separately from the Scheduling tab to avoid pulling in concepts that
  // aren't active at the target festival.
  staff: ["festival_staff", "festival_staff_vehicles"],
  transport: ["festival_transport"],
  scheduling: ["festival_schedule_position", "festival_shifts"],
  timeline: ["festival_timeline_event", "festival_deadlines"],
  actions: ["festival_action_items"],
  questions: ["festival_open_questions"],
  concepts: ["festival_concept_assignments"],
  location: ["festival_location_documents"],
  daka: ["festival_daka"],
  trolley: ["festival_trolley_items"],
  ingredients: ["festival_ingredient_manual"],
};
