import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface FestivalHoursBlockProps {
  festivalId: string;
  festivalSlug: string;
  startDate: string;
  endDate: string;
}

interface HoursRow {
  id: string;
  festival_id: string;
  day_date: string;
  festival_open: string | null;
  festival_close: string | null;
  prep_open: string | null;
  prep_close: string | null;
  notes: string | null;
}

type TimeField = "festival_open" | "festival_close" | "prep_open" | "prep_close";

const DEFAULTS = {
  festival_open: "12:00",
  festival_close: "02:00",
  prep_open: "09:00",
  prep_close: "12:00",
};

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return new Intl.DateTimeFormat("en-DK", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function toHHMM(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function TimeCell({
  row,
  field,
  onSave,
}: {
  row: HoursRow;
  field: TimeField;
  onSave: (id: string, patch: Partial<HoursRow>) => Promise<void>;
}) {
  const [value, setValue] = useState(toHHMM(row[field]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const initial = useRef(toHHMM(row[field]));

  useEffect(() => {
    setValue(toHHMM(row[field]));
    initial.current = toHHMM(row[field]);
  }, [row, field]);

  const commit = async () => {
    if (value === initial.current) return;
    setSaving(true);
    setError(false);
    try {
      await onSave(row.id, { [field]: value || null } as Partial<HoursRow>);
      initial.current = value;
    } catch (e) {
      setError(true);
      toast({ title: "Save failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      type="time"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      disabled={saving}
      className={`h-8 w-24 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
        error ? "border-destructive" : "border-input"
      } ${saving ? "opacity-60" : ""}`}
    />
  );
}

function NotesCell({
  row,
  onSave,
}: {
  row: HoursRow;
  onSave: (id: string, patch: Partial<HoursRow>) => Promise<void>;
}) {
  const [value, setValue] = useState(row.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const initial = useRef(row.notes ?? "");

  useEffect(() => {
    setValue(row.notes ?? "");
    initial.current = row.notes ?? "";
  }, [row]);

  const commit = async () => {
    if (value === initial.current) return;
    setSaving(true);
    setError(false);
    try {
      await onSave(row.id, { notes: value || null });
      initial.current = value;
    } catch (e) {
      setError(true);
      toast({ title: "Save failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      type="text"
      value={value}
      placeholder="e.g. earlier opening for press day"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      disabled={saving}
      className={`h-8 w-full rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
        error ? "border-destructive" : "border-input"
      } ${saving ? "opacity-60" : ""}`}
    />
  );
}

export function FestivalHoursBlock({ festivalId, festivalSlug, startDate, endDate }: FestivalHoursBlockProps) {
  const qc = useQueryClient();
  const queryKey = ["festival-hours", festivalSlug];

  const { data: rows, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_hours" as any)
        .select("*")
        .eq("festival_id", festivalId)
        .order("day_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as HoursRow[];
    },
  });

  const expectedDays = useMemo(() => eachDay(startDate, endDate), [startDate, endDate]);
  const presentDays = useMemo(() => new Set((rows ?? []).map((r) => r.day_date)), [rows]);
  const missingDays = useMemo(() => expectedDays.filter((d) => !presentDays.has(d)), [expectedDays, presentDays]);

  const generateMutation = useMutation({
    mutationFn: async (days: string[]) => {
      const payload = days.map((day_date) => ({
        festival_id: festivalId,
        day_date,
        festival_open: DEFAULTS.festival_open,
        festival_close: DEFAULTS.festival_close,
        prep_open: DEFAULTS.prep_open,
        prep_close: DEFAULTS.prep_close,
      }));
      const { error } = await supabase.from("festival_hours" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Hours generated" });
    },
    onError: (e) => toast({ title: "Generate failed", description: (e as Error).message, variant: "destructive" }),
  });

  const saveRow = async (id: string, patch: Partial<HoursRow>) => {
    // optimistic
    qc.setQueryData<HoursRow[]>(queryKey, (prev) =>
      (prev ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    const { error } = await supabase.from("festival_hours" as any).update(patch).eq("id", id);
    if (error) {
      qc.invalidateQueries({ queryKey });
      throw error;
    }
  };

  const formatRange = () => {
    const s = formatDayLabel(startDate);
    const e = formatDayLabel(endDate);
    return `${s} – ${e}`;
  };

  const isJelling = festivalSlug?.toLowerCase().includes("jelling");
  const secondaryLabel = isJelling ? "Camping" : "Prep";

  return (
    <section className="rounded-2xl border bg-card p-6 my-8">
      <div className="mb-4">
        <h3 className="font-heading text-lg font-semibold">Hours</h3>
        <p className="text-sm text-muted-foreground">
          Festival hours + your {secondaryLabel.toLowerCase()} hours, per day.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="flex items-center justify-between rounded-md border border-dashed p-4">
          <span className="text-sm text-muted-foreground">No hours set yet for {formatRange()}.</span>
          <Button
            size="sm"
            onClick={() => generateMutation.mutate(expectedDays)}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? "Generating…" : `+ Generate hours for ${formatRange()}`}
          </Button>
        </div>
      ) : (
        <>
          {missingDays.length > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <span className="text-amber-900">
                Days missing: {missingDays.map(formatDayLabel).join(", ")}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateMutation.mutate(missingDays)}
                disabled={generateMutation.isPending}
              >
                Add missing days
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Festival Open</th>
                  <th className="py-2 pr-3 font-medium">Festival Close</th>
                  <th className="py-2 pr-3 font-medium">{secondaryLabel} Open</th>
                  <th className="py-2 pr-3 font-medium">{secondaryLabel} Close</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">{formatDayLabel(row.day_date)}</td>
                    <td className="py-2 pr-3"><TimeCell row={row} field="festival_open" onSave={saveRow} /></td>
                    <td className="py-2 pr-3"><TimeCell row={row} field="festival_close" onSave={saveRow} /></td>
                    <td className="py-2 pr-3"><TimeCell row={row} field="prep_open" onSave={saveRow} /></td>
                    <td className="py-2 pr-3"><TimeCell row={row} field="prep_close" onSave={saveRow} /></td>
                    <td className="py-2 min-w-[200px]"><NotesCell row={row} onSave={saveRow} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
