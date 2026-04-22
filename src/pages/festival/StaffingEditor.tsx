import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { useFestival, useStaff, useShifts, useConcepts } from "@/hooks/useFestival";

function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

export default function StaffingEditor() {
  const { slug } = useParams<{ slug: string }>();
  const { data: festival } = useFestival(slug);
  const { data: concepts = [] } = useConcepts(festival?.id);
  const { data: staff = [] } = useStaff(festival?.id);
  const { data: shifts = [] } = useShifts(festival?.id);

  if (!festival) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const totalPersonHours = shifts.reduce((s, sh) =>
    s + sh.people_count * hoursBetween(sh.start_time, sh.end_time), 0);

  const soborg = staff.filter(s => s.source === "søborg").length;
  const local = staff.filter(s => s.source === "local").length;
  const managers = staff.filter(s => s.is_manager).length;
  const setupCrew = staff.filter(s => s.is_setup_crew).length;

  return (
    <div className="space-y-6 max-w-6xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staffing & Vagtplaner</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {staff.length} people · {shifts.length} shifts · {totalPersonHours.toFixed(1)} person-hours
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Søborg</p>
          <p className="text-xl font-bold">{soborg}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Local</p>
          <p className="text-xl font-bold">{local}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Managers</p>
          <p className="text-xl font-bold">{managers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Setup crew</p>
          <p className="text-xl font-bold">{setupCrew}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold text-[14px] mb-3">Vagtplan by concept</h2>
        <div className="space-y-5">
          {concepts.map(c => {
            const cShifts = shifts.filter(s => s.concept_id === c.id);
            const ph = cShifts.reduce((s, sh) => s + sh.people_count * hoursBetween(sh.start_time, sh.end_time), 0);
            const days = Array.from(new Set(cShifts.map(s => s.day))).sort();
            return (
              <div key={c.id} className="border-t border-border/40 pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-[13px]">{c.name}</h3>
                  <span className="text-[11px] text-muted-foreground">{ph.toFixed(1)} person-hours</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/40">
                        <th className="text-left py-1.5 pr-3 font-medium">Day</th>
                        <th className="text-left py-1.5 pr-3 font-medium">Shift</th>
                        <th className="text-left py-1.5 pr-3 font-medium">Time</th>
                        <th className="text-right py-1.5 pr-3 font-medium">People</th>
                        <th className="text-left py-1.5 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map(d => cShifts.filter(s => s.day === d).map(s => (
                        <tr key={s.id} className="border-b border-border/20 last:border-0">
                          <td className="py-1.5 pr-3 text-muted-foreground">{new Date(s.day).toLocaleDateString(undefined, { weekday: "short", day: "2-digit" })}</td>
                          <td className="py-1.5 pr-3"><Badge variant="outline" className="text-[10px]">{s.shift_name}</Badge></td>
                          <td className="py-1.5 pr-3 font-mono text-[11px]">{s.start_time}–{s.end_time}</td>
                          <td className="py-1.5 pr-3 text-right font-medium">{s.people_count}</td>
                          <td className="py-1.5 text-[11px] text-muted-foreground">{s.notes}</td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-[14px] mb-3">Staff list</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {staff.map(s => (
            <div key={s.id} className="flex items-center justify-between text-[12px] py-1 px-2 rounded hover:bg-secondary/40">
              <span>{s.name || <span className="text-muted-foreground italic">{s.external_key}</span>}</span>
              <div className="flex items-center gap-1.5">
                {s.is_manager && <Badge variant="outline" className="text-[10px]">manager</Badge>}
                {s.is_setup_crew && <Badge variant="outline" className="text-[10px]">setup</Badge>}
                <Badge variant="outline" className="text-[10px]">{s.source}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
