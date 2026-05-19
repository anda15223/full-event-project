import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users, Upload, Loader2, CheckCircle2, PlusCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toIsoDate } from "@/lib/parseDate";
import {
  ParsedRoster, ParsedPerson, PlanRow, StationRow,
  mapConceptGroup, isNotAssigned, matchOrCreatePlan,
  resolveStation, computeShiftHours, buildDayDateMap,
} from "@/lib/staffImport";

interface Festival { id: string; slug: string; name: string; start_date: string; end_date: string; }
interface Concept { id: string; slug: string; name: string; }
interface ExistingStaffRow { id: string; full_name: string; }

interface ProposedStation {
  key: string; // conceptSlug|label
  label: string;
  conceptSlug: string | null;
  suggestedCode: string;
  approve: boolean;
}

export default function FestivalStaffV2() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();

  const festivalQ = useQuery({
    queryKey: ["fest-v2", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, slug, name, start_date, end_date")
        .eq("slug", slug!).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
    enabled: !!slug,
  });

  const conceptsQ = useQuery({
    queryKey: ["concepts-v2"],
    queryFn: async () => {
      const { data, error } = await supabase.from("concepts").select("id, slug, name");
      if (error) throw error;
      return (data ?? []) as Concept[];
    },
  });

  const stationsQ = useQuery({
    queryKey: ["stations-v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("station").select("id, concept_id, code, label");
      if (error) throw error;
      return (data ?? []) as StationRow[];
    },
  });

  const staffQ = useQuery({
    queryKey: ["staff-existing-v2"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, full_name");
      if (error) throw error;
      return (data ?? []) as ExistingStaffRow[];
    },
  });

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedRoster | null>(null);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [proposedStations, setProposedStations] = useState<ProposedStation[]>([]);
  const [reviewChoices, setReviewChoices] = useState<Record<number, { mode: "create_new" | "link"; staffId?: string }>>({});
  const [importing, setImporting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [importReport, setImportReport] = useState<string | null>(null);

  const handleParse = async () => {
    if (!file) { toast.error("Pick a PDF first"); return; }
    setParsing(true);
    setImportReport(null);
    try {
      const path = `${slug}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const up = await supabase.storage.from("parse-test-uploads").upload(path, file, { upsert: true });
      if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
      const signed = await supabase.storage.from("parse-test-uploads").createSignedUrl(path, 600);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Signed URL failed");

      const fest = festivalQ.data;
      const { data, error } = await supabase.functions.invoke("parse-document", {
        body: {
          fileUrl: signed.data.signedUrl,
          documentType: "staff_roster",
          context: fest ? {
            festival_name: fest.name,
            festival_start: fest.start_date,
            festival_end: fest.end_date,
          } : undefined,
        },
      });
      if (error) throw new Error(error.message);
      const res = data as { ok: boolean; parsed?: ParsedRoster; error?: string; message?: string };
      if (!res.ok || !res.parsed) throw new Error(res.message || res.error || "Parse failed");

      const roster = res.parsed;
      setParsed(roster);

      // Build plan
      const existing = staffQ.data ?? [];
      const p = matchOrCreatePlan(roster.people, existing);
      setPlan(p);

      // Default review choices
      const choices: Record<number, { mode: "create_new" | "link"; staffId?: string }> = {};
      p.forEach((row, i) => {
        if (row.status === "needs_review") choices[i] = { mode: "create_new" };
      });
      setReviewChoices(choices);

      // Compute proposed (new) stations
      const concepts = conceptsQ.data ?? [];
      const stations = stationsQ.data ?? [];
      const propMap = new Map<string, ProposedStation>();
      for (const person of roster.people) {
        const conceptSlug = mapConceptGroup(person.concept_group);
        const conceptId = concepts.find((c) => c.slug === conceptSlug)?.id ?? null;
        const r = resolveStation(person.station, conceptId, stations, conceptSlug);
        if (r.kind === "propose") {
          const key = `${r.conceptSlug ?? "_"}|${r.label.toLowerCase()}`;
          if (!propMap.has(key)) {
            propMap.set(key, {
              key,
              label: r.label,
              conceptSlug: r.conceptSlug,
              suggestedCode: r.suggestedCode,
              approve: true,
            });
          }
        }
      }
      setProposedStations([...propMap.values()]);
      setShowModal(true);
      toast.success(`Parsed ${roster.people.length} people`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const groupedPlan = useMemo(() => {
    const reuse: { row: PlanRow; idx: number }[] = [];
    const create: { row: PlanRow; idx: number }[] = [];
    const review: { row: PlanRow; idx: number }[] = [];
    plan.forEach((row, idx) => {
      if (row.status === "reuse") reuse.push({ row, idx });
      else if (row.status === "create_new") create.push({ row, idx });
      else review.push({ row, idx });
    });
    return { reuse, create, review };
  }, [plan]);

  const handleImport = async () => {
    if (!parsed || !festivalQ.data) return;
    setImporting(true);
    const fest = festivalQ.data;
    const concepts = conceptsQ.data ?? [];
    const errors: string[] = [];
    let counts = { stationsAdded: 0, staffCreated: 0, staffReused: 0, assignments: 0, shifts: 0, skills: 0 };

    try {
      // 1. Insert approved new stations
      const approvedNewStations = proposedStations.filter((p) => p.approve);
      const stationLookup: StationRow[] = [...(stationsQ.data ?? [])];
      for (const ps of approvedNewStations) {
        const conceptId = ps.conceptSlug
          ? concepts.find((c) => c.slug === ps.conceptSlug)?.id ?? null
          : null;
        const { data, error } = await supabase
          .from("station")
          .insert({ concept_id: conceptId, code: ps.suggestedCode, label: ps.label })
          .select("id, concept_id, code, label")
          .single();
        if (error) {
          // unique-violation: fetch existing
          const { data: existing } = await supabase
            .from("station").select("id, concept_id, code, label")
            .eq("code", ps.suggestedCode);
          const found = (existing ?? []).find((s) => s.concept_id === conceptId);
          if (found) stationLookup.push(found as StationRow);
          else errors.push(`Station "${ps.label}": ${error.message}`);
        } else if (data) {
          stationLookup.push(data as StationRow);
          counts.stationsAdded++;
        }
      }

      const dayDates = buildDayDateMap(fest.start_date, fest.end_date);

      // 2. Per person: resolve staff_id, upsert assignment, write shifts/skill
      for (let i = 0; i < plan.length; i++) {
        const row = plan[i];
        const p = row.parsed;
        try {
          let staffId: string | null = null;

          if (row.status === "reuse" && row.matchedStaffId) {
            staffId = row.matchedStaffId;
            counts.staffReused++;
          } else if (row.status === "needs_review") {
            const choice = reviewChoices[i];
            if (choice?.mode === "link" && choice.staffId) {
              staffId = choice.staffId;
              counts.staffReused++;
            } else {
              const { data, error } = await supabase.from("staff").insert({
                full_name: p.full_name,
                display_name: p.full_name,
                home_location: p.home_location,
                source: mapSource(p.source),
              }).select("id").single();
              if (error) throw new Error(`staff insert: ${error.message}`);
              staffId = data!.id;
              counts.staffCreated++;
            }
          } else {
            // create_new
            const { data, error } = await supabase.from("staff").insert({
              full_name: p.full_name,
              display_name: p.full_name,
              home_location: p.home_location,
              source: mapSource(p.source),
            }).select("id").single();
            if (error) throw new Error(`staff insert: ${error.message}`);
            staffId = data!.id;
            counts.staffCreated++;
          }

          if (!staffId) throw new Error("no staff id resolved");

          // Concept resolution
          const conceptSlug = mapConceptGroup(p.concept_group);
          const conceptId = conceptSlug
            ? concepts.find((c) => c.slug === conceptSlug)?.id ?? null
            : null;

          // 3. Upsert assignment by (festival_id, staff_id)
          const existingAssn = await supabase
            .from("festival_staff_assignment")
            .select("id")
            .eq("festival_id", fest.id)
            .eq("staff_id", staffId)
            .maybeSingle();

          const assnPayload = {
            festival_id: fest.id,
            staff_id: staffId,
            primary_concept_id: conceptId,
            works_thu: !!p.works?.thu,
            works_fri: !!p.works?.fri,
            works_sat: !!p.works?.sat,
            works_sun: !!p.works?.sun,
            needs_accom_thu: !!p.needs_accom?.thu,
            needs_accom_fri: !!p.needs_accom?.fri,
            needs_accom_sat: !!p.needs_accom?.sat,
            needs_accom_sun: !!p.needs_accom?.sun,
            confirmed: !!p.confirmed,
            notes: isNotAssigned(p.concept_group) ? "Not assigned in roster" : null,
          };

          let assignmentId: string;
          if (existingAssn.data?.id) {
            assignmentId = existingAssn.data.id;
            const { error } = await supabase
              .from("festival_staff_assignment")
              .update(assnPayload)
              .eq("id", assignmentId);
            if (error) throw new Error(`assignment update: ${error.message}`);
            // Replace shifts for idempotency
            await supabase.from("festival_staff_shift").delete().eq("assignment_id", assignmentId);
          } else {
            const { data, error } = await supabase
              .from("festival_staff_assignment")
              .insert(assnPayload).select("id").single();
            if (error) throw new Error(`assignment insert: ${error.message}`);
            assignmentId = data!.id;
          }
          counts.assignments++;

          // 4. Primary station resolution for shifts + skill
          const stationRes = resolveStation(p.station, conceptId, stationLookup, conceptSlug);
          const primaryStationId = stationRes.kind === "found" ? stationRes.stationId
            : (stationRes.kind === "propose"
                ? stationLookup.find((s) =>
                    s.code === slugifySafe(p.station ?? "") &&
                    s.concept_id === conceptId)?.id ?? null
                : null);

          // 5. Shifts
          for (const sh of p.shifts ?? []) {
            const shiftDateIso = toIsoDate(dayDates[sh.day]);
            if (!shiftDateIso) continue;
            const { hours, crossesMidnight } = computeShiftHours(sh.start, sh.end);
            const { error } = await supabase.from("festival_staff_shift").insert({
              assignment_id: assignmentId,
              shift_date: shiftDateIso,
              station_id: primaryStationId,
              start_time: sh.start,
              end_time: sh.end,
              crosses_midnight: crossesMidnight,
              computed_hours: hours,
              shift_label: sh.label,
            });
            if (error) {
              errors.push(`${p.full_name} shift ${sh.day}: ${error.message}`);
            } else {
              counts.shifts++;
            }
          }

          // 6. Skill upsert
          if (primaryStationId) {
            const { error } = await supabase
              .from("staff_station_skill")
              .upsert(
                { staff_id: staffId, station_id: primaryStationId, proficiency: "trained" },
                { onConflict: "staff_id,station_id" },
              );
            if (!error) counts.skills++;
          }
        } catch (e) {
          errors.push(`${p.full_name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const lines = [
        `Imported staff for ${fest.name}.`,
        `Stations added: ${counts.stationsAdded}`,
        `Staff created: ${counts.staffCreated} · reused: ${counts.staffReused}`,
        `Assignments: ${counts.assignments}`,
        `Shifts: ${counts.shifts}`,
        `Station skills: ${counts.skills}`,
      ];
      if (errors.length) {
        lines.push("", `Errors (${errors.length}):`);
        lines.push(...errors.map((e) => "  - " + e));
      }
      setImportReport(lines.join("\n"));
      toast.success(`Imported ${counts.assignments} assignments`);
      setShowModal(false);
      qc.invalidateQueries({ queryKey: ["staff-existing-v2"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const fest = festivalQ.data;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Link to={`/festivals/${slug}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to festival
      </Link>

      <header className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
          <Users className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold">Staff (new)</h1>
          <p className="text-sm text-muted-foreground">
            New staff system — parallel to the old one until verified
            {fest ? ` · ${fest.name}` : ""}
          </p>
        </div>
      </header>

      <section className="rounded-2xl border bg-card p-6 space-y-4">
        <div>
          <h2 className="font-heading text-lg font-semibold">Drop roster PDF</h2>
          <p className="text-sm text-muted-foreground">
            AI extracts the full team — concepts, stations, day flags and shifts. You confirm before anything is written.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Roster PDF</Label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border file:border-input file:bg-background file:text-foreground file:cursor-pointer"
          />
        </div>
        <Button onClick={handleParse} disabled={parsing || !file}>
          {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Parse roster
        </Button>
      </section>

      {importReport && (
        <section className="rounded-2xl border bg-card p-4">
          <h3 className="font-heading text-sm font-semibold mb-2">Import report</h3>
          <pre className="text-xs whitespace-pre-wrap font-mono">{importReport}</pre>
        </section>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {parsed?.people.length ?? 0} people parsed from roster
            </DialogTitle>
            {parsed && (
              <p className="text-sm text-muted-foreground">
                {parsed.summary?.confirmed ?? 0} confirmed · {parsed.summary?.need_accom ?? 0} need accom
              </p>
            )}
          </DialogHeader>

          <div className="space-y-5">
            {/* Reuse */}
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Will reuse existing ({groupedPlan.reuse.length})
              </h3>
              {groupedPlan.reuse.length === 0 ? (
                <p className="text-xs text-muted-foreground">None.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {groupedPlan.reuse.map(({ row, idx }) => (
                    <li key={idx} className="text-muted-foreground">
                      <span className="text-foreground">{row.parsed.full_name}</span> → matches existing staff record
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Create */}
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <PlusCircle className="h-4 w-4 text-sky-600" />
                Will create new ({groupedPlan.create.length})
              </h3>
              {groupedPlan.create.length === 0 ? (
                <p className="text-xs text-muted-foreground">None.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {groupedPlan.create.map(({ row, idx }) => (
                    <li key={idx}>
                      <span className="font-medium">{row.parsed.full_name}</span>
                      <span className="text-muted-foreground">
                        {" "}· {row.parsed.concept_group}
                        {row.parsed.station ? ` · ${row.parsed.station}` : ""}
                        {row.parsed.source ? ` · ${row.parsed.source}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Review */}
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Needs your review ({groupedPlan.review.length})
              </h3>
              {groupedPlan.review.length === 0 ? (
                <p className="text-xs text-muted-foreground">None — no ambiguous names.</p>
              ) : (
                <ul className="space-y-3">
                  {groupedPlan.review.map(({ row, idx }) => (
                    <li key={idx} className="rounded-md border p-3">
                      <div className="font-medium text-sm">{row.parsed.full_name}</div>
                      <div className="text-xs text-amber-700 mb-2">{row.ambiguityReason}</div>
                      <RadioGroup
                        value={reviewChoices[idx]?.mode === "link" ? `link:${reviewChoices[idx]?.staffId ?? ""}` : "create_new"}
                        onValueChange={(v) => {
                          if (v === "create_new") {
                            setReviewChoices((prev) => ({ ...prev, [idx]: { mode: "create_new" } }));
                          } else if (v.startsWith("link:")) {
                            setReviewChoices((prev) => ({ ...prev, [idx]: { mode: "link", staffId: v.slice(5) } }));
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value="create_new" id={`new-${idx}`} />
                          <Label htmlFor={`new-${idx}`} className="font-normal">Create as new person</Label>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <RadioGroupItem
                            value={reviewChoices[idx]?.mode === "link" && reviewChoices[idx]?.staffId
                              ? `link:${reviewChoices[idx]?.staffId}` : "link:"}
                            id={`link-${idx}`}
                          />
                          <Label htmlFor={`link-${idx}`} className="font-normal">Link to existing:</Label>
                          <Select
                            value={reviewChoices[idx]?.mode === "link" ? reviewChoices[idx]?.staffId ?? "" : ""}
                            onValueChange={(v) =>
                              setReviewChoices((prev) => ({ ...prev, [idx]: { mode: "link", staffId: v } }))
                            }
                          >
                            <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Choose existing staff…" /></SelectTrigger>
                            <SelectContent>
                              {(staffQ.data ?? []).map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </RadioGroup>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Proposed stations */}
            {proposedStations.length > 0 && (
              <section className="rounded-md bg-muted/40 p-3">
                <h4 className="text-sm font-semibold mb-2">New stations to add</h4>
                <ul className="space-y-1.5">
                  {proposedStations.map((ps) => (
                    <li key={ps.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={`stn-${ps.key}`}
                        checked={ps.approve}
                        onCheckedChange={(v) =>
                          setProposedStations((prev) =>
                            prev.map((p) => p.key === ps.key ? { ...p, approve: !!v } : p))
                        }
                      />
                      <Label htmlFor={`stn-${ps.key}`} className="font-normal">
                        <span className="font-medium">{ps.label}</span>
                        <span className="text-muted-foreground"> · {ps.conceptSlug ?? "no concept"}</span>
                      </Label>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={importing}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function mapSource(s: string | null | undefined): string | null {
  if (!s) return null;
  const k = s.trim().toLowerCase();
  if (k.startsWith("søb") || k.startsWith("sob")) return "soborg";
  if (k === "local") return "local";
  if (k === "unknown") return "unknown";
  return null;
}

function slugifySafe(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
