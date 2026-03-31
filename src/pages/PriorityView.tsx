import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, Calendar, Users, Archive, Zap, AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { mockTasks } from "@/data/mockData";

const quadrantConfig = {
  do_first: { title: "DO FIRST", subtitle: "Urgent & Important", icon: Flame, color: "text-destructive", bg: "border-destructive/30 bg-destructive/5" },
  schedule: { title: "SCHEDULE", subtitle: "Not Urgent & Important", icon: Calendar, color: "text-primary", bg: "border-primary/30 bg-primary/5" },
  delegate: { title: "DELEGATE", subtitle: "Urgent & Not Important", icon: Users, color: "text-blue-400", bg: "border-blue-500/30 bg-blue-500/5" },
  archive: { title: "ARCHIVE", subtitle: "Not Urgent & Not Important", icon: Archive, color: "text-muted-foreground", bg: "border-border bg-muted/5" },
};

function UrgencyBar({ score, label }: { score: number; label: string }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "bg-destructive" : score >= 6 ? "bg-primary" : score >= 4 ? "bg-blue-500" : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground w-7">{label}</span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono w-3 text-right text-foreground">{score}</span>
    </div>
  );
}

export default function PriorityView() {
  const activeTasks = mockTasks.filter(t => t.status === "pending" || t.status === "in_progress");

  const quadrants = useMemo(() => {
    const grouped: Record<string, typeof activeTasks> = { do_first: [], schedule: [], delegate: [], archive: [] };
    activeTasks.forEach(t => {
      if (grouped[t.quadrant]) grouped[t.quadrant].push(t);
    });
    return grouped;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
          <Flame className="h-6 w-6 text-primary" /> Priority Matrix
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Eisenhower grid — tasks auto-sorted by AI urgency and importance scores</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(Object.entries(quadrantConfig) as [keyof typeof quadrantConfig, typeof quadrantConfig[keyof typeof quadrantConfig]][]).map(([key, config]) => {
          const tasks = quadrants[key] || [];
          const QIcon = config.icon;

          return (
            <Card key={key} className={`glass-panel ${config.bg} min-h-[200px]`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <QIcon className={`h-5 w-5 ${config.color}`} />
                  <div>
                    <h3 className="font-heading font-bold text-sm">{config.title}</h3>
                    <p className="text-xs text-muted-foreground">{config.subtitle}</p>
                  </div>
                  <Badge variant="outline" className="ml-auto text-xs bg-muted text-muted-foreground border-border">
                    {tasks.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No tasks in this quadrant</p>
                  ) : (
                    tasks.map((task) => (
                      <div key={task.id} className={`p-3 rounded-lg border transition-all hover:border-primary/40 ${
                        task.isOverdue ? "border-destructive/50 bg-destructive/5" : "border-border bg-card/50"
                      }`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="text-sm font-medium leading-tight">{task.title}</h4>
                          <div className="flex items-center gap-1">
                            {task.isOverdue && <AlertTriangle className="h-3 w-3 text-destructive" />}
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono bg-muted text-muted-foreground border-border">
                              <Zap className="inline h-2.5 w-2.5 mr-0.5" />{Math.round(task.urgencyScore * 0.6 + task.importanceScore * 0.4)}/10
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <UrgencyBar score={task.urgencyScore} label="URG" />
                          <UrgencyBar score={task.importanceScore} label="IMP" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
