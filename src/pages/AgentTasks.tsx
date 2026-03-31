import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckSquare, Filter, Building2, AlertCircle, Clock, ArrowUp, ArrowDown,
  Minus, ChevronDown, ChevronRight, Mail,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmailTasks, useCompanies, useUpdateTask } from "@/hooks/useEmailAgent";

const priorityConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  urgent: { icon: <AlertCircle className="h-4 w-4" />, color: "text-destructive" },
  high: { icon: <ArrowUp className="h-4 w-4" />, color: "text-primary" },
  normal: { icon: <Minus className="h-4 w-4" />, color: "text-accent" },
  low: { icon: <ArrowDown className="h-4 w-4" />, color: "text-muted-foreground" },
};

const statusColors: Record<string, string> = {
  urgent: "bg-destructive/20 text-destructive border-destructive/30",
  to_do: "bg-primary/20 text-primary border-primary/30",
  waiting: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  done: "bg-chart-5/20 text-chart-5 border-chart-5/30",
};

export default function AgentTasks() {
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const { data: companies } = useCompanies();
  const { data: tasks, isLoading } = useEmailTasks({
    company: filterCompany !== "all" ? filterCompany : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
    priority: filterPriority !== "all" ? filterPriority : undefined,
  });
  const updateTask = useUpdateTask();

  const tasksByStatus = {
    urgent: (tasks || []).filter((t) => t.status === "urgent"),
    to_do: (tasks || []).filter((t) => t.status === "to_do"),
    waiting: (tasks || []).filter((t) => t.status === "waiting"),
    done: (tasks || []).filter((t) => t.status === "done"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <CheckSquare className="h-6 w-6 text-accent" />
          Extracted Tasks
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tasks automatically extracted from classified emails
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-48 bg-card border-border">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies?.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="to_do">To Do</SelectItem>
            <SelectItem value="waiting">Waiting</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36 bg-card border-border">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Kanban-style columns */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading tasks...</div>
      ) : (tasks || []).length === 0 ? (
        <div className="text-center py-12">
          <CheckSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No tasks extracted yet</p>
          <p className="text-xs text-muted-foreground mt-1">Classify emails to generate tasks</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {(["urgent", "to_do", "waiting", "done"] as const).map((status) => (
            <div key={status} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Badge variant="outline" className={statusColors[status]}>
                  {status.replace("_", " ")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {tasksByStatus[status].length}
                </span>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {tasksByStatus[status].map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start gap-2">
                      <span className={priorityConfig[task.priority || "normal"]?.color}>
                        {priorityConfig[task.priority || "normal"]?.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{task.title}</p>
                        {task.company && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            <Building2 className="h-3 w-3 inline mr-1" />
                            {task.company}
                          </p>
                        )}
                        {task.due_date && (
                          <p className="text-[10px] text-primary mt-0.5">
                            <Clock className="h-3 w-3 inline mr-1" />
                            Due: {new Date(task.due_date).toLocaleDateString()}
                          </p>
                        )}
                        {task.notes && (
                          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                            {task.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Status change */}
                    <Select
                      value={task.status || "to_do"}
                      onValueChange={(val) =>
                        updateTask.mutate({ id: task.id, updates: { status: val } })
                      }
                    >
                      <SelectTrigger className="h-7 text-[10px] mt-2 bg-secondary border-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="to_do">To Do</SelectItem>
                        <SelectItem value="waiting">Waiting</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
