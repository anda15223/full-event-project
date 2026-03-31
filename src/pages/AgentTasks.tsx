import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckSquare, Building2, AlertCircle, Clock, ArrowUp, ArrowDown,
  Minus, ListTodo,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmailTasks, useCompanies, useUpdateTask } from "@/hooks/useEmailAgent";

const priorityConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  urgent: { icon: <AlertCircle className="h-4 w-4" />, color: "text-destructive" },
  high: { icon: <ArrowUp className="h-4 w-4" />, color: "text-warning" },
  normal: { icon: <Minus className="h-4 w-4" />, color: "text-agent-blue" },
  low: { icon: <ArrowDown className="h-4 w-4" />, color: "text-muted-foreground" },
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: "Urgent", color: "text-destructive", bg: "bg-destructive/8 border-destructive/15" },
  to_do: { label: "To Do", color: "text-agent-blue", bg: "bg-agent-blue/8 border-agent-blue/15" },
  waiting: { label: "Waiting", color: "text-warning", bg: "bg-warning/8 border-warning/15" },
  done: { label: "Done", color: "text-success", bg: "bg-success/8 border-success/15" },
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
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="page-header">
        <div className="flex items-center gap-2 mb-2">
          <ListTodo className="h-4 w-4 text-agent-orange" />
          <span className="section-label text-agent-orange">Action Center Agent</span>
        </div>
        <h1 className="page-title">Action Center</h1>
        <p className="page-subtitle">Tasks automatically extracted from classified emails</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-48 bg-card border-border/40 rounded-xl">
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
          <SelectTrigger className="w-36 bg-card border-border/40 rounded-xl">
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
          <SelectTrigger className="w-36 bg-card border-border/40 rounded-xl">
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

      {/* Kanban columns */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading tasks...</div>
      ) : (tasks || []).length === 0 ? (
        <div className="text-center py-16">
          <CheckSquare className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No tasks extracted yet</p>
          <p className="text-xs text-muted-foreground mt-1">Classify emails to generate tasks</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {(["urgent", "to_do", "waiting", "done"] as const).map((status) => {
            const config = statusConfig[status];
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2.5 px-1">
                  <div className={`px-3 py-1 rounded-lg text-xs font-semibold border ${config.bg} ${config.color}`}>
                    {config.label}
                  </div>
                  <span className="text-xs text-muted-foreground">{tasksByStatus[status].length}</span>
                </div>
                <div className="space-y-2.5 min-h-[100px]">
                  {tasksByStatus[status].map((task) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="premium-card p-4 hover:shadow-[0_4px_16px_-6px_rgba(0,0,0,0.06)] transition-all"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={priorityConfig[task.priority || "normal"]?.color}>
                          {priorityConfig[task.priority || "normal"]?.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{task.title}</p>
                          {task.company && (
                            <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {task.company}
                            </p>
                          )}
                          {task.due_date && (
                            <p className="text-[10px] text-warning mt-0.5 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Due: {new Date(task.due_date).toLocaleDateString()}
                            </p>
                          )}
                          {task.notes && (
                            <p className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2">{task.notes}</p>
                          )}
                        </div>
                      </div>
                      <Select
                        value={task.status || "to_do"}
                        onValueChange={(val) => updateTask.mutate({ id: task.id, updates: { status: val } })}
                      >
                        <SelectTrigger className="h-7 text-[10px] mt-3 bg-secondary/50 border-0 rounded-lg">
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
            );
          })}
        </div>
      )}
    </div>
  );
}
