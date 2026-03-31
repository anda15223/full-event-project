import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckSquare, Plus, Mail, Flame, Calendar, Users, Archive,
  AlertTriangle, Zap, FileText, BookOpen, GraduationCap, Lightbulb, MessageSquare, User,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { mockTasks } from "@/data/mockData";

const categoryColorMap: Record<string, string> = {
  task: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  invoice: "bg-primary/10 text-primary border-primary/30",
  read_lecture: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  read_learn: "bg-accent/10 text-accent border-accent/30",
  might_be_interesting: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
};

const categoryLabelMap: Record<string, string> = {
  task: "Task", invoice: "Invoice", read_lecture: "Lecture", read_learn: "Learn", might_be_interesting: "Interesting",
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "bg-destructive/10 text-destructive border-destructive/20" },
  high: { label: "High", color: "bg-primary/10 text-primary border-primary/20" },
  medium: { label: "Medium", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  low: { label: "Low", color: "bg-muted text-muted-foreground border-border" },
};

const quadrantConfig: Record<string, { icon: typeof Flame; color: string; label: string }> = {
  do_first: { icon: Flame, color: "text-destructive", label: "Do First" },
  schedule: { icon: Calendar, color: "text-primary", label: "Schedule" },
  delegate: { icon: Users, color: "text-blue-400", label: "Delegate" },
  archive: { icon: Archive, color: "text-muted-foreground", label: "Archive" },
};

const sourceIcons: Record<string, typeof Mail> = {
  email: Mail, whatsapp: MessageSquare, manual: User,
};

function UrgencyBar({ score, label }: { score: number; label: string }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "bg-destructive" : score >= 6 ? "bg-primary" : score >= 4 ? "bg-blue-500" : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground w-8">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-foreground font-mono w-4 text-right">{score}</span>
    </div>
  );
}

export default function TaskBoard() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("active");

  const filteredTasks = useMemo(() => {
    if (statusFilter === "active") return mockTasks.filter(t => t.status === "pending" || t.status === "in_progress");
    if (statusFilter === "invoices") return mockTasks.filter(t => t.category === "invoice" && (t.status === "pending" || t.status === "in_progress"));
    if (statusFilter === "completed") return mockTasks.filter(t => t.status === "completed");
    if (statusFilter === "dismissed") return mockTasks.filter(t => t.status === "dismissed");
    return mockTasks;
  }, [statusFilter]);

  const filters = [
    { key: "active", label: "Active" },
    { key: "all", label: "All" },
    { key: "invoices", label: "Invoices" },
    { key: "completed", label: "Completed" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Task Board</h1>
          <p className="text-muted-foreground text-sm mt-1">Tasks sorted by AI priority scoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-primary border-primary/30 hover:bg-primary/10" onClick={() => navigate("/priority")}>
            <Flame className="w-3.5 h-3.5 mr-1.5" /> Priority Matrix
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" /> New Task
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {filters.map(f => (
          <Button
            key={f.key}
            variant={statusFilter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(f.key)}
            className={statusFilter === f.key ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filteredTasks.map((task) => {
          const catColor = categoryColorMap[task.category] || "";
          const catLabel = categoryLabelMap[task.category] || task.category;
          const pConfig = priorityConfig[task.priority];
          const qConfig = quadrantConfig[task.quadrant];
          const QIcon = qConfig.icon;
          const SourceIcon = sourceIcons[task.source] || User;

          return (
            <Card key={task.id} className={`glass-panel hover:border-primary/40 transition-all ${task.isOverdue ? "border-destructive/50 bg-destructive/5" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-medium leading-tight">{task.title}</h4>
                    {task.isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${pConfig.color}`}>
                      {pConfig.label}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1 mb-3">
                  <UrgencyBar score={task.urgencyScore} label="URG" />
                  <UrgencyBar score={task.importanceScore} label="IMP" />
                </div>

                {task.suggestedAction && (
                  <p className="text-xs text-primary/80 mb-3 line-clamp-1">
                    <Zap className="inline h-3 w-3 mr-1" />{task.suggestedAction}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${catColor}`}>
                      {catLabel}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border-border">
                      <QIcon className={`inline h-2.5 w-2.5 mr-0.5 ${qConfig.color}`} />{qConfig.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <SourceIcon className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono bg-muted text-muted-foreground border-border">
                      <Zap className="inline h-2.5 w-2.5 mr-0.5" />{Math.round(task.urgencyScore * 0.6 + task.importanceScore * 0.4)}/10
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
