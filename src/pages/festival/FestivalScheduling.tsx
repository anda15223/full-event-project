import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDateRange } from "@/lib/dateFormat";
import { copyTextToClipboard } from "@/lib/clipboard";
import { festivalDays, positionLabel, formatTimeHHMM, formatHoursMinutes } from "@/lib/scheduling";
import PositionManager from "@/components/scheduling/PositionManager";
import SchedulingGrid from "@/components/scheduling/SchedulingGrid";

async function exportScheduleByDayByConcept(festival: { id: string; name: string; start_date: string; end_date: string }) {
  const [posRes, shiftsRes, conceptsRes] = await Promise.all([
    supabase
      .from("festival_schedule_position")
      .select("id, concept_id, station_id, position_number, display_name, display_order, station:station_id(label), concepts:concept_id(id, name, short_name)")
      .eq("festival_id", festival.id),
    supabase
      .from("festival_schedule_shift")
      .select("id, schedule_position_id, festival_staff_id, shift_date, start_time, end_time, computed_hours, staff:festival_staff_id(name)")
      .order("start_time"),
    supabase.from("concepts").select("id, name, short_name, display_order").order("display_order"),
  ]);
  if (posRes.error) throw posRes.error;
  if (shiftsRes.error) throw shiftsRes.error;
  if (conceptsRes.error) throw conceptsRes.error;

  const positions = (posRes.data ?? []) as any[];
  const posIds = new Set(positions.map((p) => p.id));
  const shifts = ((shiftsRes.data ?? []) as any[]).filter((s) => posIds.has(s.schedule_position_id));
  const concepts = (conceptsRes.data ?? []) as any[];

  // total hours per staff across the whole festival
  const totalsByStaff = new Map<string, number>();
  for (const s of shifts) {
    if (!s.festival_staff_id) continue;
    totalsByStaff.set(s.festival_staff_id, (totalsByStaff.get(s.festival_staff_id) ?? 0) + (Number(s.computed_hours) || 0));
  }

  // sibling counts for station labels
  const sib = new Map<string, number>();
  for (const p of positions) {
    if (p.display_name && String(p.display_name).trim()) continue;
    const k = `${p.concept_id}:${p.station_id}`;
    sib.set(k, (sib.get(k) ?? 0) + 1);
  }
  const posInfo = new Map<string, { label: string; concept_id: string; order: number }>();
  for (const p of positions) {
    const lbl = positionLabel(p.station?.label ?? "Unknown", p.position_number, sib.get(`${p.concept_id}:${p.station_id}`) ?? 1, p.display_name);
    posInfo.set(p.id, { label: lbl, concept_id: p.concept_id, order: p.display_order ?? 0 });
  }

  const days = festivalDays(festival.start_date, festival.end_date);

  // group: date -> concept_id -> position_id -> shifts[]
  const byDate = new Map<string, Map<string, Map<string, any[]>>>();
  for (const s of shifts) {
    const info = posInfo.get(s.schedule_position_id);
    if (!info) continue;
    let dMap = byDate.get(s.shift_date);
    if (!dMap) { dMap = new Map(); byDate.set(s.shift_date, dMap); }
    let cMap = dMap.get(info.concept_id);
    if (!cMap) { cMap = new Map(); dMap.set(info.concept_id, cMap); }
    const list = cMap.get(s.schedule_position_id) ?? [];
    list.push(s);
    cMap.set(s.schedule_position_id, list);
  }

  const conceptName = new Map(concepts.map((c) => [c.id, c.name as string]));
  const conceptOrder = new Map(concepts.map((c) => [c.id, c.display_order ?? 9999]));

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let html = `<div style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111;width:794px;box-sizing:border-box;background:#fff;">
    <h1 style="margin:0 0 4px 0;font-size:20px;">${esc(festival.name)} — Schedule</h1>
    <div style="font-size:11px;color:#555;margin-bottom:16px;">${esc(formatDateRange(festival.start_date, festival.end_date))}</div>`;

  for (const d of days) {
    const dayMap = byDate.get(d.date);
    if (!dayMap || dayMap.size === 0) continue;
    html += `<h2 style="font-size:15px;margin:18px 0 6px;border-bottom:1px solid #333;padding-bottom:4px;">${esc(d.label)} · ${esc(d.date)}</h2>`;
    const conceptIds = Array.from(dayMap.keys()).sort(
      (a, b) => (conceptOrder.get(a)! - conceptOrder.get(b)!) || (conceptName.get(a) ?? "").localeCompare(conceptName.get(b) ?? "")
    );
    for (const cid of conceptIds) {
      const cMap = dayMap.get(cid)!;
      html += `<h3 style="font-size:13px;margin:10px 0 4px;color:#222;">${esc(conceptName.get(cid) ?? "—")}</h3>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px;">
        <thead><tr style="background:#f3f4f6;">
          <th style="text-align:left;padding:4px 6px;border:1px solid #d1d5db;width:30%;">Position</th>
          <th style="text-align:left;padding:4px 6px;border:1px solid #d1d5db;width:25%;">Name</th>
          <th style="text-align:left;padding:4px 6px;border:1px solid #d1d5db;width:25%;">Time</th>
          <th style="text-align:right;padding:4px 6px;border:1px solid #d1d5db;width:20%;">Hours</th>
        </tr></thead><tbody>`;
      const posIdsSorted = Array.from(cMap.keys()).sort((a, b) => {
        const ia = posInfo.get(a)!; const ib = posInfo.get(b)!;
        return (ia.order - ib.order) || ia.label.localeCompare(ib.label);
      });
      for (const pid of posIdsSorted) {
        const list = cMap.get(pid)!.slice().sort((a: any, b: any) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
        const label = posInfo.get(pid)!.label;
        list.forEach((s: any, idx: number) => {
          html += `<tr>
            <td style="padding:4px 6px;border:1px solid #e5e7eb;">${idx === 0 ? esc(label) : ""}</td>
            <td style="padding:4px 6px;border:1px solid #e5e7eb;">${esc(s.staff?.name ?? "—")}</td>
            <td style="padding:4px 6px;border:1px solid #e5e7eb;">${esc(formatTimeHHMM(s.start_time))}–${esc(formatTimeHHMM(s.end_time))}</td>
            <td style="padding:4px 6px;border:1px solid #e5e7eb;text-align:right;">${esc(formatHoursMinutes(Number(s.computed_hours) || 0))}</td>
          </tr>`;
        });
      }
      html += `</tbody></table>`;
    }
  }
  html += `</div>`;

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  try {
    const canvas = await html2canvas(wrapper.firstElementChild as HTMLElement, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      heightLeft -= pageH;
    }
    const safe = festival.name.replace(/[^a-z0-9-_]+/gi, "_");
    pdf.save(`${safe}_schedule.pdf`);
  } finally {
    document.body.removeChild(wrapper);
  }
}

export default function FestivalScheduling() {
  const { slug = "" } = useParams();
  const [tab, setTab] = useState("positions");

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, slug, name, start_date, end_date")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (festivalQ.isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-64 mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const festival = festivalQ.data;
  if (!festival) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          Festival not found.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="space-y-2">
        <Link
          to={`/festivals/${slug}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to {festival.name}
        </Link>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h1 className="font-heading text-2xl font-semibold">Scheduling</h1>
          <div className="text-sm text-muted-foreground">
            {festival.name} · {formatDateRange(festival.start_date, festival.end_date)}
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="grid">Grid</TabsTrigger>
          </TabsList>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                const { data: positions, error: pErr } = await supabase
                  .from("festival_schedule_position")
                  .select("id, concept_id")
                  .eq("festival_id", festival.id);
                if (pErr) throw pErr;
                const posIds = (positions ?? []).map((p) => p.id);
                if (posIds.length === 0) {
                  toast("No staff with shifts to export yet");
                  return;
                }
                const posToConcept = new Map(
                  (positions ?? []).map((p) => [p.id, p.concept_id]),
                );
                const { data: shifts, error: sErr } = await supabase
                  .from("festival_schedule_shift")
                  .select("festival_staff_id, schedule_position_id, shift_date, start_time")
                  .in("schedule_position_id", posIds)
                  .order("shift_date", { ascending: true })
                  .order("start_time", { ascending: true });
                if (sErr) throw sErr;
                const firstByStaff = new Map<string, { concept_id: string | null }>();
                for (const s of shifts ?? []) {
                  if (!firstByStaff.has(s.festival_staff_id)) {
                    firstByStaff.set(s.festival_staff_id, {
                      concept_id: posToConcept.get(s.schedule_position_id) ?? null,
                    });
                  }
                }
                const staffIds = Array.from(firstByStaff.keys());
                if (staffIds.length === 0) {
                  toast("No staff with shifts to export yet");
                  return;
                }
                const conceptIds = Array.from(
                  new Set(
                    Array.from(firstByStaff.values())
                      .map((v) => v.concept_id)
                      .filter((x): x is string => !!x),
                  ),
                );
                const [{ data: staff, error: stErr }, { data: concepts, error: cErr }] =
                  await Promise.all([
                    supabase.from("festival_staff").select("id, name").in("id", staffIds),
                    conceptIds.length
                      ? supabase.from("concepts").select("id, name").in("id", conceptIds)
                      : Promise.resolve({ data: [], error: null } as any),
                  ]);
                if (stErr) throw stErr;
                if (cErr) throw cErr;
                const conceptName = new Map(
                  (concepts ?? []).map((c: any) => [c.id, c.name]),
                );
                const rows = (staff ?? [])
                  .map((p: any) => {
                    const cid = firstByStaff.get(p.id)?.concept_id;
                    const cn = (cid && conceptName.get(cid)) || "(no concept)";
                    return { name: p.name ?? "", concept: cn };
                  })
                  .sort((a, b) => a.name.localeCompare(b.name));
                const text = rows.map((r) => `${r.name}, ${r.concept}`).join("\n");
                const ok = await copyTextToClipboard(text);
                if (!ok) {
                  toast.error("Couldn't copy to clipboard — try selecting the text manually");
                  return;
                }
                toast.success(`Copied ${rows.length} ${rows.length === 1 ? "person" : "people"} to clipboard`);
              } catch (e) {
                console.error(e);
                toast.error("Couldn't copy to clipboard");
              }
            }}
          >
            <Copy className="h-4 w-4" />
            Copy staff list
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                await exportScheduleByDayByConcept(festival);
              } catch (e) {
                console.error(e);
                toast.error("Couldn't export schedule");
              }
            }}
          >
            <Download className="h-4 w-4" />
            Export schedule PDF
          </Button>
        </div>
        <TabsContent value="positions" className="mt-6">
          <PositionManager festivalId={festival.id} />
        </TabsContent>
        <TabsContent value="grid" className="mt-6">
          <SchedulingGrid
            festivalId={festival.id}
            onGoToPositions={() => setTab("positions")}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
