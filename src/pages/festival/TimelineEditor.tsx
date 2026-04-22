import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SmartCard } from "@/components/festival/SmartCard";
import { useFestival, useActionItems } from "@/hooks/useFestival";

const STATUS_OPTS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
];

const PRIORITY_COLORS: Record<string, string> = {
  hard_deadline: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-warning/10 text-warning border-warning/20",
  normal: "bg-secondary text-muted-foreground border-border",
  low: "bg-secondary/50 text-muted-foreground border-border",
};

export default function TimelineEditor() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const { data: festival } = useFestival(slug);
  const { data: items = [] } = useActionItems(festival?.id);

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("festival_action_items").update({ status }).eq("id", id);
    if (error) { toast.error("Save failed"); return; }
    qc.invalidateQueries({ queryKey: ["festival_action_items", festival.id] });
  };

  const groups: Record<string, typeof items> = {};
  items.forEach(i => {
    const k = i.deadline || "no-deadline";
    (groups[k] ||= []).push(i);
  });
  const dates = Object.keys(groups).sort((a, b) => {
    if (a === "no-deadline") return 1;
    if (b === "no-deadline") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Setup Timeline & Action items</h1>
        <p className="text-sm text-muted-foreground mt-1">{items.length} action items grouped by deadline</p>
      </div>

      <SmartCard
        cardKey="setup_timeline"
        festivalId={festival.id}
        title="Setup timeline documents"
        subtitle="Upload setup schedules, build/strike timelines, supplier delivery plans. AI groups them into phases."
        emptyStateWarning={{
          label: "No setup timeline yet",
          description: "Upload a build schedule or grab the standard phases from Brain.",
        }}
      />

      <div className="space-y-4">
        {dates.map(d => (
          <Card key={d} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-[13px]">
                {d === "no-deadline" ? "No deadline" : new Date(d).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
              </h3>
              <span className="text-[11px] text-muted-foreground">{groups[d].length}</span>
            </div>
            <div className="space-y-2">
              {groups[d].map(i => (
                <div key={i.id} className="flex items-start gap-3 py-2 border-b border-border/20 last:border-0">
                  <Badge variant="outline" className={`text-[10px] uppercase ${PRIORITY_COLORS[i.priority] || PRIORITY_COLORS.normal}`}>
                    {i.priority.replace("_", " ")}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-snug">{i.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      {i.section_key && <span>{i.section_key}</span>}
                      {i.owner && <span>· {i.owner}</span>}
                      {i.notes && <span className="italic">· {i.notes}</span>}
                    </div>
                  </div>
                  <Select value={i.status} onValueChange={(v) => updateStatus(i.id, v)}>
                    <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      {STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value} className="text-[12px]">{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
