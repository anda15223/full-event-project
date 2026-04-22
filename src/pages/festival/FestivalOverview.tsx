import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileDown, Settings } from "lucide-react";
import {
  useFestival, useSections, useAllQuestions, useAnswers,
  useConcepts, useStaff, useShifts, useActionItems, useVehicles,
  useAccommodation, useTrolleys
} from "@/hooks/useFestival";

export default function FestivalOverview() {
  const { slug } = useParams<{ slug: string }>();
  const { data: festival } = useFestival(slug);
  const { data: sections = [] } = useSections();
  const { data: questions = [] } = useAllQuestions();
  const { data: answers = [] } = useAnswers(festival?.id);
  const { data: concepts = [] } = useConcepts(festival?.id);
  const { data: staff = [] } = useStaff(festival?.id);
  const { data: shifts = [] } = useShifts(festival?.id);
  const { data: actionItems = [] } = useActionItems(festival?.id);
  const { data: vehicles = [] } = useVehicles(festival?.id);
  const { data: accom = [] } = useAccommodation(festival?.id);
  const trolleysQ = useTrolleys(festival?.id);

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const answeredQids = new Set(answers.map(a => a.question_id));

  const completion = (sec: any) => {
    const qs = questions.filter(q => q.section_id === sec.id);
    const total = qs.length;
    const done = qs.filter(q => answeredQids.has(q.id)).length;
    // Sub-editor backed sections: show counts
    if (sec.key === "concepts") return { done: concepts.length, total: 4, label: `${concepts.length} concepts` };
    if (sec.key === "staffing") return { done: staff.length, total: 41, label: `${staff.length} staff · ${shifts.length} shifts` };
    if (sec.key === "setup_timeline") return { done: actionItems.length, total: 35, label: `${actionItems.length} action items` };
    if (sec.key === "transportation") return { done: vehicles.length + accom.length, total: 10, label: `${vehicles.length} vehicles · ${accom.length} bookings` };
    if (sec.key === "bc_trolleys") return { done: trolleysQ.data?.trolleys.length || 0, total: 8, label: `${trolleysQ.data?.trolleys.length || 0} trolleys` };
    return { done, total, label: total ? `${done} / ${total}` : "—" };
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/festivals"><ArrowLeft className="h-4 w-4 mr-1" />All festivals</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{festival.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(festival.start_date).toLocaleDateString()} – {new Date(festival.end_date).toLocaleDateString()}
            {festival.location ? ` · ${festival.location}` : ""}
          </p>
          {festival.organiser_name && (
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Organiser: {festival.organiser_name} {festival.organiser_phone ? `· ${festival.organiser_phone}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/sections"><Settings className="h-4 w-4 mr-1.5" />Admin</Link>
          </Button>
          <Button asChild size="sm">
            <Link to={`/festivals/${slug}/report`}><FileDown className="h-4 w-4 mr-1.5" />Report</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sections.map(sec => {
          const c = completion(sec);
          const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
          const subRoute = sec.sub_editor_route?.replace(":slug", slug!);
          const target = subRoute || `/festivals/${slug}/section/${sec.key}`;
          return (
            <Link key={sec.id} to={target}>
              <Card className="p-4 hover:shadow-md transition-shadow h-full">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-muted-foreground font-mono">#{sec.order_index}</span>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{sec.category}</Badge>
                    </div>
                    <h3 className="font-medium text-[14px] leading-tight">{sec.title}</h3>
                  </div>
                </div>
                {sec.description && (
                  <p className="text-[11px] text-muted-foreground mb-3 line-clamp-1">{sec.description}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[11px] text-muted-foreground">{c.label}</span>
                  <span className={`text-[11px] font-medium ${pct === 100 ? "text-success" : pct > 0 ? "text-primary" : "text-muted-foreground"}`}>
                    {pct}%
                  </span>
                </div>
                <div className="h-1 bg-secondary rounded-full mt-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all ${pct === 100 ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
