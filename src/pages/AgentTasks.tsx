import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckSquare, Building2, AlertCircle, Clock, ArrowUp, ArrowDown,
  Minus, ListTodo, Plus, Zap, CheckCircle, Mail, CalendarClock,
  AlertTriangle, ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmailTasks, useCompanies, useUpdateTask } from "@/hooks/useEmailAgent";

const priorityConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  urgent: { icon: <AlertCircle className="h-4 w-4" />, color: "text-destructive", label: "Urgent" },
  high: { icon: <ArrowUp className="h-4 w-4" />, color: "text-warning", label: "High" },
  normal: { icon: <Minus className="h-4 w-4" />, color: "text-agent-blue", label: "Normal" },
  low: { icon: <ArrowDown className="h-4 w-4" />, color: "text-muted-foreground", label: "Low" },
};

export default function AgentTasks() {
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({ done: true });

  const { data: companies } = useCompanies();
  const { data: tasks, isLoading } = useEmailTasks({
    company: filterCompany !== "all" ? filterCompany : undefined,
    priority: filterPriority !== "all" ? filterPriority : undefined,
  });
  const updateTask = useUpdateTask();

  const allTasks = tasks || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const metrics = useMemo(() => {
    const urgent = allTasks.filter(t => t.status === "urgent" || t.priority === "urgent").length;
    const dueToday = allTasks.filter(t => {
      if (!t.due_date || t.status === "done") return false;
      const d = new Date(t.due_date);
      return d.toDateString() === today.toDateString();
    }).length;
    const overdue = allTasks.filter(t => {
      if (!t.due_date || t.status === "done") return false;
      return new Date(t.due_date) < today;
    }).length;
    return { total: allTasks.length, urgent, dueToday, overdue };
  }, [allTasks]);

  // Smart sections
  const sections = useMemo(() => {
    const urgentTasks = allTasks.filter(t => t.status === "urgent" || t.priority === "urgent");
    const overdueTasks = allTasks.filter(t => {
      if (!t.due_date || t.status === "done" || t.status === "urgent") return false;
      return new Date(t.due_date) < today;
    }).filter(t => !urgentTasks.some(u => u.id === t.id));
    const dueSoon = allTasks.filter(t => {
      if (!t.due_date || t.status === "done") return false;
      const d = new Date(t.due_date);
      return d >= today && d <= threeDaysFromNow;
    }).filter(t => !urgentTasks.some(u => u.id === t.id));
    const inProgress = allTasks.filter(t => t.status === "to_do" || t.status === "waiting")
      .filter(t => !urgentTasks.some(u => u.id === t.id))
      .filter(t => !dueSoon.some(u => u.id === t.id))
      .filter(t => !overdueTasks.some(u => u.id === t.id));
    const done = allTasks.filter(t => t.status === "done");
    return [
      { key: "urgent", label: "🔴 Urgent & Critical", tasks: urgentTasks, color: "border-destructive/30 bg-destructive/4" },
      { key: "overdue", label: "⚠️ Overdue", tasks: overdueTasks, color: "border-warning/30 bg-warning/4" },
      { key: "due_soon", label: "🟡 Due Soon (3 days)", tasks: dueSoon, color: "border-agent-orange/20 bg-agent-orange/4" },
      { key: "in_progress", label: "🔵 In Progress", tasks: inProgress, color: "border-agent-blue/20 bg-agent-blue/4" },
      { key: "done", label: "✅ Completed", tasks: done, color: "border-success/20 bg-success/4" },
    ];
  }, [allTasks]);

  // AI suggestions
  const suggestions = useMemo(() => {
    const items: string[] = [];
    if (metrics.overdue > 0) items.push(`${metrics.overdue} task${metrics.overdue > 1 ? "s" : ""} overdue — take action now`);
    if (metrics.urgent > 0) items.push(`${metrics.urgent} urgent task${metrics.urgent > 1 ? "s" : ""} need immediate attention`);
    if (metrics.dueToday > 0) items.push(`${metrics.dueToday} task${metrics.dueToday > 1 ? "s" : ""} due today`);
    const waitingCount = allTasks.filter(t => t.status === "waiting").length;
    if (waitingCount > 0) items.push(`${waitingCount} task${waitingCount > 1 ? "s" : ""} waiting for response`);
    return items;
  }, [allTasks, metrics]);

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-agent-orange/10 via-warning/5 to-transparent border border-agent-orange/15 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ListTodo className="h-5 w-5 text-agent-orange" />
              <span className="text-xs font-semibold tracking-wider uppercase text-agent-orange">Action Center</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tight text-foreground">
              AI-Managed Tasks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tasks automatically extracted from emails and operations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl border-border/40 gap-2">
              <CheckSquare className="h-4 w-4" /> Review Tasks
            </Button>
            <Button className="rounded-xl bg-agent-orange hover:bg-agent-orange/90 text-white gap-2">
              <Plus className="h-4 w-4" /> Create Task
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Tasks", value: metrics.total, icon: ListTodo, color: "text-foreground", bg: "bg-secondary/60" },
          { label: "Urgent", value: metrics.urgent, icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/6" },
          { label: "Due Today", value: metrics.dueToday, icon: CalendarClock, color: "text-agent-orange", bg: "bg-agent-orange/6" },
          { label: "Overdue", value: metrics.overdue, icon: AlertTriangle, color: "text-warning", bg: "bg-warning/6" },
        ].map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="premium-card p-5"
          >
            <div className={`h-10 w-10 rounded-xl ${m.bg} flex items-center justify-center mb-3`}>
              <m.icon className={`h-5 w-5 ${m.color}`} />
            </div>
            <div className={`text-3xl font-bold font-heading tracking-tight ${m.color}`}>{m.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
          </motion.div>
        ))}
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="premium-card p-5 border-agent-orange/15">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-agent-orange" />
            <span className="text-xs font-semibold tracking-wider uppercase text-agent-orange">AI Suggestions</span>
          </div>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-foreground/80">
                <div className="h-1.5 w-1.5 rounded-full bg-agent-orange shrink-0" />
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-48 bg-card border-border/40 rounded-xl">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
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

      {/* Smart Sections */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading tasks...</div>
      ) : allTasks.length === 0 ? (
        <div className="premium-card p-12 text-center">
          <CheckCircle className="h-16 w-16 text-success/30 mx-auto mb-4" />
          <h3 className="text-lg font-heading font-semibold text-foreground mb-1">You're fully in control</h3>
          <p className="text-sm text-muted-foreground mb-4">No pending tasks. Great job!</p>
          <Button className="rounded-xl bg-agent-orange hover:bg-agent-orange/90 text-white gap-2">
            <Plus className="h-4 w-4" /> Create Task
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.filter(s => s.tasks.length > 0).map((section) => {
            const isCollapsed = collapsedSections[section.key];
            return (
              <div key={section.key} className={`rounded-2xl border ${section.color} overflow-hidden`}>
                <button
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">{section.label}</span>
                    <Badge variant="secondary" className="text-[10px] px-2 py-0 border-0">{section.tasks.length}</Badge>
                  </div>
                  <motion.div animate={{ rotate: isCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {section.tasks.map(task => {
                          const pConf = priorityConfig[task.priority || "normal"];
                          const isOverdue = task.due_date && new Date(task.due_date) < today && task.status !== "done";
                          return (
                            <motion.div
                              key={task.id}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="premium-card p-5 hover:shadow-md transition-all"
                            >
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-semibold text-foreground leading-snug">{task.title}</h4>
                                  {task.company && (
                                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                                      <Building2 className="h-3 w-3" /> {task.company}
                                    </p>
                                  )}
                                </div>
                                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 shrink-0 ${pConf.color} border-current/20`}>
                                  {pConf.label}
                                </Badge>
                              </div>

                              {task.due_date && (
                                <div className={`flex items-center gap-1.5 text-xs mb-2 ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                  <Clock className="h-3 w-3" />
                                  {isOverdue ? "Overdue: " : "Due: "}
                                  {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </div>
                              )}

                              {task.notes && (
                                <p className="text-xs text-muted-foreground/80 line-clamp-2 mb-3">{task.notes}</p>
                              )}

                              {/* Actions */}
                              <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-[11px] text-success hover:text-success hover:bg-success/10 rounded-lg px-2.5"
                                  onClick={() => updateTask.mutate({ id: task.id, updates: { status: "done" } })}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" /> Done
                                </Button>
                                {task.email_id && (
                                  <Button variant="ghost" size="sm" className="h-7 text-[11px] text-agent-blue hover:text-agent-blue hover:bg-agent-blue/10 rounded-lg px-2.5">
                                    <Mail className="h-3 w-3 mr-1" /> Email
                                  </Button>
                                )}
                                <div className="ml-auto">
                                  <Select
                                    value={task.status || "to_do"}
                                    onValueChange={(val) => updateTask.mutate({ id: task.id, updates: { status: val } })}
                                  >
                                    <SelectTrigger className="h-7 text-[10px] bg-secondary/50 border-0 rounded-lg w-24">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="urgent">Urgent</SelectItem>
                                      <SelectItem value="to_do">To Do</SelectItem>
                                      <SelectItem value="waiting">Waiting</SelectItem>
                                      <SelectItem value="done">Done</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
