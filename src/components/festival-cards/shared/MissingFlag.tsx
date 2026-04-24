import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Priority = "urgent" | "high" | "normal" | "low";

interface Props {
  isMissing: boolean;
  /** Human label, used as the task title. */
  label: string;
  /** Festival id this missing item belongs to. */
  festivalId: string;
  /** Originating card, e.g. "cooking_equipment". */
  cardOrigin: string;
  /** Default priority for the created task. Defaults to 'high'. */
  defaultPriority?: Priority;
  /** Called after the task is created. */
  onDeadlineSet?: (taskId: string) => void;
  className?: string;
}

/**
 * Red badge shown when a card item is missing. Click "Set deadline" to create
 * a row in tasks_deadlines with priority + due date.
 */
export function MissingFlag({
  isMissing, label, festivalId, cardOrigin,
  defaultPriority = "high", onDeadlineSet, className,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deadline, setDeadline] = useState<string>("");
  const [priority, setPriority] = useState<Priority>(defaultPriority);

  const createTask = useMutation({
    mutationFn: async () => {
      if (!label?.trim()) throw new Error("Missing label");
      if (!festivalId) throw new Error("Missing festival id");
      const { data, error } = await supabase
        .from("tasks_deadlines")
        .insert({
          festival_id: festivalId,
          task: label.trim(),
          deadline: deadline || null,
          priority,
          status: "pending",
          card_origin: cardOrigin,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["tasks_deadlines", festivalId] });
      toast.success("Deadline added to tasks");
      setOpen(false);
      setDeadline("");
      onDeadlineSet?.(id);
    },
    onError: (e: any) => toast.error(e.message ?? "Could not create task"),
  });

  if (!isMissing) return null;

  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <Badge variant="destructive" className="gap-1 text-xs">
        <AlertTriangle className="h-3 w-3" />
        Missing: {label}
      </Badge>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 text-xs">
            <CalendarPlus className="h-3 w-3 mr-1" /> Set deadline
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div className="text-sm font-medium">Add deadline for "{label}"</div>
          <div className="space-y-1.5">
            <Label className="text-xs">Deadline</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => createTask.mutate()}
              disabled={createTask.isPending}
            >
              {createTask.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Add task
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default MissingFlag;
