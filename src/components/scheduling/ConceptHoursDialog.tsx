import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { festivalDays } from "@/lib/scheduling";

export interface ExistingHoursRow {
  id: string;
  open_time: string;
  close_time: string;
  notes: string | null;
}

interface Props {
  festivalId: string;
  festivalStartDate: string;
  festivalEndDate: string;
  conceptId: string;
  conceptName: string;
  existingHoursByDate: Map<string, ExistingHoursRow>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface DayRowState {
  date: string;
  label: string;
  open: string;
  close: string;
  existingId: string | null;
  error: string | null;
}

function trimToHHMM(t: string): string {
  return (t ?? "").slice(0, 5);
}

export default function ConceptHoursDialog({
  festivalId,
  festivalStartDate,
  festivalEndDate,
  conceptId,
  conceptName,
  existingHoursByDate,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const days = useMemo(
    () => festivalDays(festivalStartDate, festivalEndDate),
    [festivalStartDate, festivalEndDate],
  );
  const [rows, setRows] = useState<DayRowState[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(
      days.map((d) => {
        const ex = existingHoursByDate.get(d.date);
        return {
          date: d.date,
          label: d.label,
          open: ex ? trimToHHMM(ex.open_time) : "",
          close: ex ? trimToHHMM(ex.close_time) : "",
          existingId: ex?.id ?? null,
          error: null,
        };
      }),
    );
  }, [open, days, existingHoursByDate]);

  const updateRow = (idx: number, patch: Partial<DayRowState>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, error: null } : r)));
  };

  const clearRow = (idx: number) => {
    updateRow(idx, { open: "", close: "" });
  };

  const copyFirstToEmpty = () => {
    const source = rows.find((r) => r.open && r.close);
    if (!source) {
      toast.error("Fill in at least one day first");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        !r.open && !r.close ? { ...r, open: source.open, close: source.close, error: null } : r,
      ),
    );
  };

  const validate = (): boolean => {
    let ok = true;
    const next = rows.map((r) => {
      const hasOpen = !!r.open;
      const hasClose = !!r.close;
      if (hasOpen !== hasClose) {
        ok = false;
        return { ...r, error: "Both open and close required, or leave both blank" };
      }
      if (hasOpen && hasClose && r.open === r.close) {
        ok = false;
        return { ...r, error: "Open and close cannot be the same time" };
      }
      return { ...r, error: null };
    });
    setRows(next);
    return ok;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const toInsert: any[] = [];
      const toUpdate: { id: string; open_time: string; close_time: string }[] = [];
      const toDelete: string[] = [];

      for (const r of rows) {
        const filled = !!r.open && !!r.close;
        if (filled && r.existingId) {
          toUpdate.push({ id: r.existingId, open_time: r.open, close_time: r.close });
        } else if (filled && !r.existingId) {
          toInsert.push({
            festival_id: festivalId,
            concept_id: conceptId,
            operating_date: r.date,
            open_time: r.open,
            close_time: r.close,
          });
        } else if (!filled && r.existingId) {
          toDelete.push(r.existingId);
        }
      }

      if (toDelete.length) {
        const { error } = await supabase
          .from("festival_concept_hours")
          .delete()
          .in("id", toDelete);
        if (error) throw error;
      }
      for (const u of toUpdate) {
        const { error } = await supabase
          .from("festival_concept_hours")
          .update({ open_time: u.open_time, close_time: u.close_time })
          .eq("id", u.id);
        if (error) throw error;
      }
      if (toInsert.length) {
        const { error } = await supabase.from("festival_concept_hours").insert(toInsert);
        if (error) throw error;
      }

      toast.success("Hours saved");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save hours");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Opening hours — {conceptName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {rows.map((r, idx) => (
            <div key={r.date} className="space-y-1">
              <div className="grid grid-cols-[6rem_1fr_1fr_2rem] items-center gap-2">
                <div className="text-sm font-medium">{r.label}</div>
                <Input
                  type="time"
                  value={r.open}
                  onChange={(e) => updateRow(idx, { open: e.target.value })}
                  step={60}
                  placeholder="Open"
                  aria-label={`${r.label} open`}
                />
                <Input
                  type="time"
                  value={r.close}
                  onChange={(e) => updateRow(idx, { close: e.target.value })}
                  step={60}
                  placeholder="Close"
                  aria-label={`${r.label} close`}
                />
                {(r.open || r.close) ? (
                  <button
                    type="button"
                    onClick={() => clearRow(idx)}
                    className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-accent"
                    aria-label={`Clear ${r.label}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <div />
                )}
              </div>
              {r.error && (
                <p className="text-xs text-destructive pl-[6.5rem]">{r.error}</p>
              )}
            </div>
          ))}
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyFirstToEmpty}
              disabled={saving}
            >
              Copy first day to all empty days
            </Button>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
