import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FileDown, Settings, AlertTriangle, MapPin, Calendar, Phone,
  Users, Zap, Snowflake, Truck, Hammer, ShieldCheck, ClipboardList,
  ChefHat, Package, FileText, Flame, Building2,
} from "lucide-react";
import {
  useFestival, useSections, useAllQuestions, useAnswers,
  useConcepts, useStaff, useShifts, useActionItems, useVehicles,
  useAccommodation, useTrolleys
} from "@/hooks/useFestival";

// Map section keys → icon
const sectionIcon: Record<string, any> = {
  intro: FileText,
  concepts: ChefHat,
  equipment_list: Package,
  facade: Building2,
  cooling_storage: Snowflake,
  power: Zap,
  staffing: Users,
  cooking_equipment: Flame,
  safety_compliance: ShieldCheck,
  setup_timeline: Hammer,
  transportation: Truck,
  bc_trolleys: ClipboardList,
  groceries: Package,
  recipes: ChefHat,
};

const categoryColor: Record<string, string> = {
  planning: "bg-blue-500/10 text-blue-700 border-blue-200",
  logistics: "bg-amber-500/10 text-amber-700 border-amber-200",
  operations: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  safety: "bg-rose-500/10 text-rose-700 border-rose-200",
};

function formatDate(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }
  catch { return d; }
}

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

  // Helpers
  const ans = (key: string): any => {
    const q = questions.find(x => x.key === key);
    if (!q) return null;
    const a = answers.find(x => x.question_id === q.id);
    return a ? a.value : null;
  };
  const ansStr = (key: string, fallback = "—"): string => {
    const v = ans(key);
    if (v === null || v === undefined || v === "") return fallback;
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
  };

  const totalHours = ansStr("total_person_hours", "—");
  const totalHeadcount = ansStr("total_headcount", String(staff.length));
  const soborg = ansStr("soborg_count", "—");
  const local = ansStr("local_count", "—");
  const managers = ansStr("manager_count", "—");
  const setupCrew = ansStr("setup_crew_count", "—");

  // Per-section preview lines
  const previewFor = (sec: any): { lines: string[]; primary?: string } => {
    switch (sec.key) {
      case "intro": {
        return {
          primary: ansStr("festival_organiser_contact_name", festival.organiser_name || "—"),
          lines: [
            ansStr("festival_organiser_contact_phone", festival.organiser_phone || ""),
            ansStr("festival_organiser_contact_email", ""),
          ].filter(Boolean),
        };
      }
      case "concepts": {
        return {
          primary: `${concepts.length} concepts · ${concepts.filter(c => c.zone === "INSIDE").length} INSIDE · ${concepts.filter(c => c.zone === "CAMPING").length} CAMPING`,
          lines: concepts.slice(0, 4).map(c => `${c.name} · ${c.zone}`),
        };
      }
      case "equipment_list": {
        return {
          primary: `${ansStr("countertops_per_concept", "—")} countertops/stall · ${ansStr("daka_containers_per_concept", "—")} DAKA/stall`,
          lines: [
            `Stilladsbar: ${ansStr("stilladsbar_inside")} INSIDE · ${ansStr("stilladsbar_camping")} CAMPING`,
            `Folding tables: ${ansStr("folding_tables_inside")} INSIDE · ${ansStr("folding_tables_camping")} CAMPING`,
          ],
        };
      }
      case "facade": {
        const statuses = [
          ["Fish", ansStr("facade_status_fish", "—")],
          ["Gyros", ansStr("facade_status_gyros", "—")],
          ["Crêperie", ansStr("facade_status_creperie", "—")],
          ["Chicks", ansStr("facade_status_chicks", "—")],
        ];
        const ready = statuses.filter(([, s]) => s === "print_ready").length;
        return {
          primary: `${ready}/4 print-ready`,
          lines: [
            `Print deadline: ${formatDate(ansStr("facade_print_deadline", ""))}`,
            ...statuses.filter(([, s]) => s !== "print_ready").map(([n, s]) => `${n}: ${s.replace(/_/g, " ")}`),
          ],
        };
      }
      case "cooling_storage": {
        return {
          primary: `${ansStr("container_count", "—")} × ${ansStr("container_size", "—")} (Godik #${ansStr("container_booking_number", "—")})`,
          lines: [
            `Delivery ${formatDate(ansStr("delivery_date", ""))} · Pickup ${formatDate(ansStr("pickup_date", ""))}`,
            `${ansStr("total_cost_incl_vat_dkk", "—")} DKK due ${formatDate(ansStr("payment_due", ""))}`,
          ],
        };
      }
      case "power": {
        const totalAmps = concepts.reduce((sum, c: any) => {
          const extras = (c.power_extras as any[]) || [];
          let amps = 16; // baseline
          extras.forEach(e => {
            const m = String(e.amperage || "").match(/(\d+)/);
            const a = m ? parseInt(m[1]) : 0;
            amps += a * (e.count || 1);
          });
          return sum + amps;
        }, 0);
        return {
          primary: `~${totalAmps}A across ${concepts.length} stalls`,
          lines: [
            `Baseline: ${ansStr("contracted_baseline_total", "—")}`,
            `Gas: ${ansStr("gas_supplier", ansStr("gas_needed", "—"))}`,
          ],
        };
      }
      case "staffing": {
        return {
          primary: `${totalHeadcount} people · ${totalHours} person-hours`,
          lines: [
            `${soborg} Søborg · ${local} local · ${managers} managers · ${setupCrew} setup`,
            `${shifts.length} shifts · Sat peak: ${ansStr("saturday_peak_extension", "—").replace(/_/g, " ")}`,
          ],
        };
      }
      case "cooking_equipment": {
        return {
          primary: `${concepts.filter(c => c.gas_required).length}/${concepts.length} need gas`,
          lines: [
            `Fish: ${ansStr("fish_fryer_strategy", "—").replace(/_/g, " ")}`,
            `Pancake plates: ${ansStr("pancake_plate_count", "—")}`,
          ],
        };
      }
      case "safety_compliance": {
        return {
          primary: `${ansStr("fire_extinguishers_count", "—")} extinguishers · ${ansStr("fire_blankets_count", "—")} blankets`,
          lines: [
            `${ansStr("first_aid_kits_count", "—")} first-aid kits · ${ansStr("fire_extinguisher_type", "—")}`,
            `Hard deadline: ${formatDate(ansStr("gas_brand_inspection_datetime", "").slice(0,10))} 09:00 — Gas + brand`,
          ],
        };
      }
      case "setup_timeline": {
        const open = actionItems.filter(a => a.status !== "done").length;
        const overdue = actionItems.filter(a => a.deadline && new Date(a.deadline) < new Date() && a.status !== "done").length;
        return {
          primary: `${actionItems.length} actions · ${open} open${overdue ? ` · ${overdue} overdue` : ""}`,
          lines: [
            `Setup ${formatDate(ansStr("setup_crew_arrival_date", ""))} → Breakdown ${formatDate(ansStr("breakdown_date", ""))}`,
            `Goods delivery ${formatDate(ansStr("goods_delivery_date", ""))} before 10:00`,
          ],
        };
      }
      case "transportation": {
        const beds = ansStr("total_bed_nights", String(accom.reduce((s: number, a: any) => s + (a.people_count || 0), 0)));
        return {
          primary: `${vehicles.length || ansStr("total_vehicles", "—")} vehicles · ${accom.length} bookings`,
          lines: [
            ansStr("vehicle_fleet_summary", ""),
            `${beds} bed-nights · Cabin ${ansStr("cabin_vejle_booking_range", "—")}`,
          ].filter(Boolean),
        };
      }
      case "bc_trolleys": {
        const t = trolleysQ.data?.trolleys || [];
        return {
          primary: `${t.length || ansStr("total_trolleys", "—")} trolleys · ${ansStr("trolleys_per_concept", "—")} per concept`,
          lines: [
            `Categories: ${ansStr("categories", "—")}`,
            `Content list: ${ansStr("content_list_uploaded", "—").replace(/_/g, " ")}`,
          ],
        };
      }
      default: {
        const qs = questions.filter(q => q.section_id === sec.id);
        const answeredQids = new Set(answers.map(a => a.question_id));
        const done = qs.filter(q => answeredQids.has(q.id)).length;
        return {
          primary: qs.length ? `${done} / ${qs.length} fields filled` : "No fields yet",
          lines: sec.description ? [sec.description] : [],
        };
      }
    }
  };

  // Hero summary lines (PDF front page)
  const conceptNames = concepts.map(c => c.name.split(" (")[0]).join(" · ");
  const hardDeadline = ansStr("gas_brand_inspection_datetime", "");

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/festivals"><ArrowLeft className="h-4 w-4 mr-1" />All festivals</Link>
        </Button>
      </div>

      {/* Hero summary */}
      <Card className="p-6 border-2 bg-gradient-to-br from-primary/5 via-background to-background">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5 flex-1 min-w-[260px]">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Operations Plan v4 · The Fish Project</Badge>
            <h1 className="text-2xl font-bold tracking-tight">{festival.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{formatDate(festival.start_date)} – {formatDate(festival.end_date)} 2026</span>
              {festival.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{festival.location}</span>}
              {festival.organiser_phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{festival.organiser_name?.split(" (")[0]} · {festival.organiser_phone}</span>}
            </div>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <div className="rounded-md border p-3 bg-card">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Concepts</div>
            <div className="text-lg font-semibold mt-0.5">{concepts.length}</div>
            <div className="text-[11px] text-muted-foreground line-clamp-2">{conceptNames}</div>
          </div>
          <div className="rounded-md border p-3 bg-card">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Workforce</div>
            <div className="text-lg font-semibold mt-0.5">{totalHeadcount} people</div>
            <div className="text-[11px] text-muted-foreground">{soborg} Søborg + {local} local + {managers} mgrs</div>
          </div>
          <div className="rounded-md border p-3 bg-card">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Person-hours</div>
            <div className="text-lg font-semibold mt-0.5">{totalHours}</div>
            <div className="text-[11px] text-muted-foreground">{shifts.length} shifts scheduled</div>
          </div>
          <div className="rounded-md border p-3 bg-card">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Action items</div>
            <div className="text-lg font-semibold mt-0.5">{actionItems.length}</div>
            <div className="text-[11px] text-muted-foreground">{actionItems.filter(a => a.status !== "done").length} open</div>
          </div>
        </div>

        {hardDeadline && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold">HARD DEADLINE</span> — All stalls fully set up with el + gas connected by{" "}
              <span className="font-mono">{formatDate(hardDeadline.slice(0,10))} 09:00</span> (gas & brand inspection). If not → approval at The Fish Project's own expense.
            </div>
          </div>
        )}
      </Card>

      {/* Section cards by Part */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sections.map(sec => {
          const Icon = sectionIcon[sec.key] || FileText;
          const subRoute = sec.sub_editor_route?.replace(":slug", slug!);
          const target = subRoute || `/festivals/${slug}/section/${sec.key}`;
          const preview = previewFor(sec);
          const catCls = categoryColor[sec.category] || "bg-secondary text-secondary-foreground border-border";
          return (
            <Link key={sec.id} to={target} className="group">
              <Card className="p-4 hover:shadow-md hover:border-primary/40 transition-all h-full flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-foreground/70" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground font-mono">#{sec.order_index}</span>
                        <Badge variant="outline" className={`text-[9px] uppercase tracking-wide px-1.5 py-0 h-4 ${catCls}`}>{sec.category}</Badge>
                      </div>
                      <h3 className="font-medium text-[14px] leading-tight mt-0.5 truncate">{sec.title}</h3>
                    </div>
                  </div>
                </div>

                {preview.primary && (
                  <div className="text-[13px] font-semibold text-foreground mb-1.5 leading-snug">
                    {preview.primary}
                  </div>
                )}
                <div className="space-y-0.5 mt-auto">
                  {preview.lines.map((line, i) => (
                    <div key={i} className="text-[11px] text-muted-foreground leading-snug line-clamp-1">
                      {line}
                    </div>
                  ))}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
