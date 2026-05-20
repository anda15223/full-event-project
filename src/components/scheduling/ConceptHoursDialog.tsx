import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ExistingHours {
  id: string;
  open_time: string;
  close_time: string;
  notes: string | null;
}

interface Props {
  festivalId: string;
  conceptId: string;
  conceptName: string;
  existingHours?: ExistingHours | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function trimToHHMM(t: string): string {
  return (t ?? "").slice(0, 5);
}

export default function ConceptHoursDialog({
  festivalId,
  conceptId,
  conceptName,
  existingHours,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("22:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (existingHours) {
      setOpenTime(trimToHHMM(existingHours.open_time));
      setCloseTime(trimToHHMM(existingHours.close_time));
      setNotes(existingHours.notes ?? "");
    } else {
      setOpenTime("10:00");
      setCloseTime("22:00");
      setNotes("");
    }
    setError(null);
  }, [open, existingHours]);

  const validate = (): boolean => {
    if (!openTime || !closeTime) {
      setError("Both open and close times are required");
      return false;
    }
    if (openTime === closeTime) {
      setError("Open and close cannot be the same time");
      return false;
    }
    setError(null);
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (existingHours) {
        const { error: err } = await supabase
          .from("festival_concept_hours")
          .update({
            open_time: openTime,
            close_time: closeTime,
            notes: notes.trim() || null,
          })
          .eq("id", existingHours.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from("festival_concept_hours")
          .upsert(
            {
              festival_id: festivalId,
              concept_id: conceptId,
              open_time: openTime,
              close_time: closeTime,
              notes: notes.trim() || null,
            },
            { onConflict: "festival_id,concept_id" },
          );
        if (err) throw err;
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

  const handleRemove = async () => {
    if (!existingHours) return;
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from("festival_concept_hours")
        .delete()
        .eq("id", existingHours.id);
      if (err) throw err;
      toast.success("Hours removed");
      onSaved();
      setConfirmRemove(false);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove hours");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Opening hours — {conceptName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="open-time">Open</Label>
                <Input
                  id="open-time"
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  step={60}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="close-time">Close</Label>
                <Input
                  id="close-time"
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  step={60}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter className="sm:justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              {existingHours && (
                <Button
                  variant="outline"
                  onClick={() => setConfirmRemove(true)}
                  disabled={saving}
                >
                  Remove
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove opening hours?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove opening hours for {conceptName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={saving}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
