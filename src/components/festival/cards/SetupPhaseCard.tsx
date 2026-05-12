import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  PackageOpen, Truck, Wrench, Star, Hammer, Undo2, Calendar, Plus, X, Trash2,
} from "lucide-react";
import {
  computePhaseStatus, inferPhaseType, PHASE_TYPE_ACCENT, PHASE_TYPE_LABEL,
  SETUP_STATUS_PILL, type PhaseTypeKey,
} from "@/lib/setupStatus";

const sb = supabase as any;

export interface SetupPhaseRow {
  id: string;
  festival_id: string;
  work_type: string;
  description: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  location: string | null;
  crew_lead: string | null;
  crew_assigned: string[] | null;
  vehicles_assigned: string[] | null;
  tasks: string[] | null;
  status: string | null;
  notes: string | null;
  display_order: number | null;
}

export interface VehicleOption { id: string; vehicle_type: string }

const PHASE_ICON: Record<PhaseTypeKey, React.ComponentType<{ className?: string }>> = {
  load: PackageOpen, drive: Truck, setup: Wrench, opening: Star,
  teardown: Hammer, return: Undo2, other: Calendar,
};

const PHASE_OPTIONS: PhaseTypeKey[] = ["load", "drive", "setup", "opening", "teardown", "return", "other"];

interface Props {
  festivalId: string;
  festivalSlug: string;
  phase: SetupPhaseRow;
  vehicles: VehicleOption[];
}

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SetupPhaseCard({ festivalId, festivalSlug, phase, vehicles }: Props) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["setup-page", festivalSlug] });

  const phaseType = inferPhaseType(phase.work_type, phase.description);
  const Icon = PHASE_ICON[phaseType];
  const status = computePhaseStatus(phase);

  const [title, setTitle] = useState(phase.description ?? "");
  const [location, setLocation] = useState(phase.location ?? "");
  const [notes, setNotes] = useState(phase.notes ?? "");
  const [newCrew, setNewCrew] = useState("");
  const [newTask, setNewTask] = useState("");

  const crew = phase.crew_assigned ?? [];
  const vehiclesAssigned = phase.vehicles_assigned ?? [];
  const tasks = phase.tasks ?? [];
  const taskDone = useMemo(() => {
    const arr: boolean[] = [];
    tasks.forEach((t) => arr.push(t.startsWith("[x] ")));
    return arr;
  }, [tasks]);

  const update = useMutation({
    mutationFn: async (patch: Partial<SetupPhaseRow>) => {
      const { error } = await sb.from("festival_setup").update(patch).eq("id", phase.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("festival_setup").delete().eq("id", phase.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Phase removed"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const addCrew = () => {
    const name = newCrew.trim();
    if (!name) return;
    update.mutate({ crew_assigned: [...crew, name] });
    setNewCrew("");
  };
  const removeCrew = (i: number) => update.mutate({ crew_assigned: crew.filter((_, idx) => idx !== i) });

  const assignVehicle = (vid: string) => {
    if (vehiclesAssigned.includes(vid)) return;
    update.mutate({ vehicles_assigned: [...vehiclesAssigned, vid] });
  };
  const removeVehicle = (vid: string) =>
    update.mutate({ vehicles_assigned: vehiclesAssigned.filter((v) => v !== vid) });

  const addTask = () => {
    const t = newTask.trim();
    if (!t) return;
    update.mutate({ tasks: [...tasks, t] });
    setNewTask("");
  };
  const toggleTask = (i: number) => {
    const next = tasks.map((t, idx) => {
      if (idx !== i) return t;
      return t.startsWith("[x] ") ? t.slice(4) : `[x] ${t}`;
    });
    update.mutate({ tasks: next });
  };
  const updateTask = (i: number, value: string) => {
    const next = tasks.map((t, idx) => idx === i ? (taskDone[i] ? `[x] ${value}` : value) : t);
    update.mutate({ tasks: next });
  };
  const removeTask = (i: number) => update.mutate({ tasks: tasks.filter((_, idx) => idx !== i) });

  const duration = (() => {
    if (!phase.scheduled_start_at || !phase.scheduled_end_at) return null;
    const ms = new Date(phase.scheduled_end_at).getTime() - new Date(phase.scheduled_start_at).getTime();
    if (ms <= 0) return null;
    const h = Math.round(ms / 3600000);
    return h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h}h`;
  })();

  const vehicleLookup = useMemo(() => {
    const m = new Map<string, string>();
    vehicles.forEach((v) => m.set(v.id, v.vehicle_type));
    return m;
  }, [vehicles]);

  return (
    <div className="rounded-2xl border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", PHASE_TYPE_ACCENT[phaseType])}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== phase.description && update.mutate({ description: title })}
              className="text-lg font-bold border-0 px-0 h-auto bg-transparent focus-visible:ring-0 shadow-none"
              placeholder="Phase title…"
            />
            <Select value={phaseType} onValueChange={(v) => update.mutate({ work_type: v })}>
              <SelectTrigger className="h-6 px-1 text-[11px] border-0 bg-transparent w-auto text-muted-foreground capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHASE_OPTIONS.map((p) => <SelectItem key={p} value={p}>{PHASE_TYPE_LABEL[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Select value={(phase.status ?? "planned").toLowerCase()} onValueChange={(v) => update.mutate({ status: v })}>
          <SelectTrigger className={cn("h-7 px-3 rounded-full text-xs font-medium border w-auto gap-1", SETUP_STATUS_PILL[status.status])}>
            <SelectValue>{status.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">When</div>
          <Input
            type="datetime-local"
            value={toLocalDateTimeInput(phase.scheduled_start_at)}
            onChange={(e) => {
              const v = e.target.value;
              update.mutate({ scheduled_start_at: v ? new Date(v).toISOString() : null });
            }}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Where</div>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onBlur={() => (location ?? "") !== (phase.location ?? "") && update.mutate({ location: location || null })}
            placeholder="Location…"
            className="h-8 text-xs"
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Duration</div>
          <div className="h-8 px-2 flex items-center text-xs text-muted-foreground border rounded-md bg-muted/30">
            {duration ?? "—"}
          </div>
        </div>
      </div>

      {/* Crew */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Crew ({crew.length})</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {crew.map((name, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-xs">
              {name}
              <button onClick={() => removeCrew(i)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <Input
              value={newCrew}
              onChange={(e) => setNewCrew(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCrew(); } }}
              placeholder="Name…"
              className="h-7 w-32 text-xs"
            />
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={addCrew}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Vehicles */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Vehicles ({vehiclesAssigned.length})</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {vehiclesAssigned.map((vid) => (
            <span key={vid} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs border border-sky-500/30">
              <Truck className="h-3 w-3" />
              {vehicleLookup.get(vid) ?? "Unknown"}
              <button onClick={() => removeVehicle(vid)} className="opacity-70 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {vehicles.length > 0 && (
            <Select value="" onValueChange={(v) => v && assignVehicle(v)}>
              <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue placeholder="+ Assign" /></SelectTrigger>
              <SelectContent>
                {vehicles.filter((v) => !vehiclesAssigned.includes(v.id)).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.vehicle_type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Tasks */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Tasks ({tasks.length})</div>
        <div className="space-y-1.5">
          {tasks.map((t, i) => {
            const done = taskDone[i];
            const text = done ? t.slice(4) : t;
            return (
              <div key={i} className="flex items-center gap-2 group">
                <Checkbox checked={done} onCheckedChange={() => toggleTask(i)} />
                <Input
                  defaultValue={text}
                  onBlur={(e) => { if (e.target.value !== text) updateTask(i, e.target.value); }}
                  className={cn("h-7 text-xs flex-1 border-0 bg-transparent shadow-none focus-visible:ring-1 px-1", done && "line-through text-muted-foreground")}
                />
                <button onClick={() => removeTask(i)} className="opacity-0 group-hover:opacity-60 hover:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
              placeholder="+ Add task"
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => (notes ?? "") !== (phase.notes ?? "") && update.mutate({ notes: notes || null })}
        placeholder="Notes…"
        rows={2}
        className="text-xs resize-none"
      />

      {/* Footer */}
      <div className="flex justify-end pt-1">
        <Button
          variant="ghost" size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => { if (confirm("Delete this phase?")) remove.mutate(); }}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
        </Button>
      </div>
    </div>
  );
}
