import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Check, X, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ImportFromPreviousCard, CARD_TABLES } from "@/components/festival/ImportFromPreviousCard";

type Staff = {
  id: string;
  festival_id: string;
  name: string | null;
  home_location: string | null;
  confirmed: boolean | null;
  needs_accommodation: boolean | null;
  concept_id: string | null;
  works_thursday: boolean | null;
  works_friday: boolean | null;
  works_saturday: boolean | null;
  works_sunday: boolean | null;
  accom_thursday: boolean | null;
  accom_friday: boolean | null;
  accom_saturday: boolean | null;
  accom_sunday: boolean | null;
  staff_source: string;
  role: string;
  station: string | null;
  notes: string | null;
};

const ACCOM_DAYS = [
  { key: "accom_thursday", label: "Thu" },
  { key: "accom_friday", label: "Fri" },
  { key: "accom_saturday", label: "Sat" },
  { key: "accom_sunday", label: "Sun" },
] as const;

type Concept = { id: string; name: string };

const SOURCE_OPTIONS = [
  { value: "soborg", label: "Søborg" },
  { value: "local", label: "Local" },
  { value: "fidibus", label: "Fidibus" },
  { value: "unknown", label: "Unknown" },
];

const STATION_OPTIONS = [
  { value: "cash_register", label: "Cash register" },
  { value: "assembly", label: "Assembly" },
  { value: "fryer", label: "Fryer" },
  { value: "oven", label: "Oven" },
  { value: "pita_wrapper", label: "Pita wrapper" },
  { value: "pita_griddle", label: "Pita griddle" },
  { value: "burger", label: "Burger" },
  { value: "burger_bun_grill", label: "Burger bun grill" },
  { value: "crepes", label: "Crepes" },
];
const STATION_LABEL: Record<string, string> = Object.fromEntries(
  STATION_OPTIONS.map((s) => [s.value, s.label])
);

// Required station slots per concept (matched by lowercased concept name substring)
const CONCEPT_STATION_PLAN: { match: (name: string) => boolean; slots: { station: string; count: number }[] }[] = [
  {
    match: (n) => n.includes("gyros"),
    slots: [
      { station: "cash_register", count: 2 },
      { station: "pita_wrapper", count: 2 },
      { station: "assembly", count: 3 },
      { station: "fryer", count: 1 },
      { station: "oven", count: 1 },
      { station: "pita_griddle", count: 1 },
    ],
  },
  {
    match: (n) => n.includes("fish"),
    slots: [
      { station: "cash_register", count: 2 },
      { station: "assembly", count: 1 },
      { station: "fryer", count: 1 },
    ],
  },
  {
    match: (n) => n.includes("chick") || n.includes("buns"),
    slots: [
      { station: "cash_register", count: 2 },
      { station: "fryer", count: 2 },
      { station: "assembly", count: 2 },
      { station: "burger", count: 3 },
      { station: "burger_bun_grill", count: 1 },
    ],
  },
  {
    match: (n) => n.includes("crepe"),
    slots: [{ station: "crepes", count: 4 }],
  },
];


export default function FestivalStaff() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();

  const festivalQ = useQuery({
    queryKey: ["festival-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, name, slug")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const festivalId = festivalQ.data?.id;

  const staffQ = useQuery({
    queryKey: ["festival-staff-page", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_staff")
        .select("*")
        .eq("festival_id", festivalId!)
        .eq("is_draft", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Staff[];
    },
  });

  const conceptsQ = useQuery({
    queryKey: ["festival-concepts-for-staff", festivalId],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contracts")
        .select("concept_id, concepts:concept_id(id, name)")
        .eq("festival_id", festivalId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.concepts)
        .filter(Boolean) as Concept[];
    },
  });
  const concepts = conceptsQ.data ?? [];

  const updateStaff = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Staff> }) => {
      const { error } = await supabase.from("festival_staff").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival-staff-page", festivalId] }),
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const addStaff = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("festival_staff").insert({
        festival_id: festivalId!,
        name: "",
        home_location: "",
        confirmed: false,
        role: "crew",
        staff_source: "unknown",
        works_thursday: true,
        works_friday: true,
        works_saturday: true,
        works_sunday: true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival-staff-page", festivalId] }),
    onError: (e: any) => toast.error(e.message ?? "Insert failed"),
  });

  const deleteStaff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["festival-staff-page", festivalId] }),
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const allRows = staffQ.data ?? [];
  const confirmedCount = allRows.filter((s) => s.confirmed).length;
  const unconfirmedCount = allRows.length - confirmedCount;
  const unassignedCount = allRows.filter((s) => !s.concept_id && s.role !== "management").length;

  const [filter, setFilter] = useState<"all" | "unconfirmed" | "unassigned">("all");
  const [cityFilter, setCityFilter] = useState<string>("__all__");
  const [accomFilter, setAccomFilter] = useState<"any" | "yes" | "no">("any");

  const cityOptions = Array.from(
    new Set([
      "Aarhus",
      ...allRows.map((s) => (s.home_location ?? "").trim()).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const rows = allRows
    .filter((s) =>
      filter === "unconfirmed"
        ? !s.confirmed
        : filter === "unassigned"
        ? !s.concept_id && s.role !== "management"
        : true
    )
    .filter((s) => (cityFilter === "__all__" ? true : (s.home_location ?? "") === cityFilter))
    .filter((s) =>
      accomFilter === "any"
        ? true
        : accomFilter === "yes"
        ? !!s.needs_accommodation
        : !s.needs_accommodation
    );

  // Empty-slot calculation across concept plans
  const emptySlots: { conceptName: string; stationLabel: string; missing: number }[] = [];
  concepts.forEach((c) => {
    const plan = CONCEPT_STATION_PLAN.find((p) => p.match(c.name.toLowerCase()));
    if (!plan) return;
    const conceptPeople = allRows.filter((s) => s.concept_id === c.id && s.role !== "management");
    plan.slots.forEach((slot) => {
      const filled = conceptPeople.filter((p) => p.station === slot.station).length;
      const missing = slot.count - Math.min(filled, slot.count);
      if (missing > 0) {
        emptySlots.push({
          conceptName: c.name,
          stationLabel: STATION_LABEL[slot.station] ?? slot.station,
          missing,
        });
      }
    });
  });
  const totalEmpty = emptySlots.reduce((a, s) => a + s.missing, 0);

  return (
    <div className="container mx-auto max-w-7xl p-4 md:p-6 space-y-4">
      <ImportFromPreviousCard
        cardLabel="staff"
        tables={CARD_TABLES.staff}
        currentFestivalId={festivalId ?? ""}
        onCommitted={() => window.location.reload()}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/festivals/${slug}`}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <h1 className="font-heading text-2xl font-semibold">Staff</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/festivals/${slug}/staff/export`}>
              <FileDown className="h-4 w-4 mr-1" /> Export
            </Link>
          </Button>
          <Button size="sm" onClick={() => addStaff.mutate()} disabled={!festivalId}>
            <Plus className="h-4 w-4 mr-1" /> Add person
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All <span className="opacity-60">({allRows.length})</span>
        </FilterChip>
        <FilterChip active={filter === "unconfirmed"} onClick={() => setFilter("unconfirmed")}>
          Unconfirmed <span className="opacity-60">({unconfirmedCount})</span>
        </FilterChip>
        <FilterChip active={filter === "unassigned"} onClick={() => setFilter("unassigned")}>
          Not assigned <span className="opacity-60">({unassignedCount})</span>
        </FilterChip>

        <div className="h-5 w-px bg-border mx-1" />

        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All cities</SelectItem>
            {cityOptions.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FilterChip active={accomFilter === "any"} onClick={() => setAccomFilter("any")}>
          Any accom.
        </FilterChip>
        <FilterChip active={accomFilter === "yes"} onClick={() => setAccomFilter("yes")}>
          Needs accom.
        </FilterChip>
        <FilterChip active={accomFilter === "no"} onClick={() => setAccomFilter("no")}>
          No accom.
        </FilterChip>

        <span className="ml-auto text-muted-foreground">
          ✓ {confirmedCount} confirmed
        </span>
      </div>

      {totalEmpty > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-amber-900">
              Empty slots · {totalEmpty}
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {emptySlots.map((e, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 rounded bg-white border border-amber-200"
              >
                <strong>{e.conceptName}</strong> · {e.stationLabel} ×{e.missing}
              </span>
            ))}
          </div>
        </div>
      )}


      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="min-w-[180px]">Name</TableHead>
              <TableHead className="min-w-[140px]">Location</TableHead>
              <TableHead className="min-w-[140px]">Concept</TableHead>
              <TableHead className="min-w-[140px]">Station</TableHead>
              <TableHead className="text-center min-w-[150px]">Accom. (Thu/Fri/Sat/Sun)</TableHead>
              <TableHead className="min-w-[120px]">Source</TableHead>
              <TableHead className="text-center">Thu</TableHead>
              <TableHead className="text-center">Fri</TableHead>
              <TableHead className="text-center">Sat</TableHead>
              <TableHead className="text-center">Sun</TableHead>
              <TableHead className="text-center">Confirmed</TableHead>
              <TableHead className="min-w-[180px]">Notes</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s, i) => (
              <StaffRow
                key={s.id}
                staff={s}
                index={i + 1}
                concepts={concepts}
                onPatch={(patch) => updateStaff.mutate({ id: s.id, patch })}
                onDelete={() => {
                  if (confirm(`Delete ${s.name || "this person"}?`)) deleteStaff.mutate(s.id);
                }}
              />
            ))}
            {rows.length === 0 && !staffQ.isLoading && (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                  No staff yet. Click "Add person" to start.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="font-heading text-lg font-semibold mb-3">Crew by concept</h2>

        {(() => {
          const assignmentMap = new Map<string, { conceptName: string; stationLabel: string }>();
          allRows.forEach((p) => {
            if (p.role === "management") {
              assignmentMap.set(p.id, { conceptName: "Management", stationLabel: "" });
            } else if (p.concept_id && p.station) {
              const cName = concepts.find((c) => c.id === p.concept_id)?.name ?? "—";
              assignmentMap.set(p.id, {
                conceptName: cName,
                stationLabel: STATION_LABEL[p.station] ?? p.station,
              });
            }
          });

          const crewPool = allRows.filter((s) => s.role !== "management");

          const groups = [
            { id: "__mgmt__", name: "Management", people: allRows.filter((s) => s.role === "management") },
            ...concepts.map((c) => ({
              id: c.id,
              name: c.name,
              people: allRows.filter((s) => s.concept_id === c.id && s.role !== "management"),
            })),
            { id: "__none__", name: "Not assigned", people: allRows.filter((s) => !s.concept_id && s.role !== "management") },
          ];

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {groups.map((group) => {
                const isMgmt = group.id === "__mgmt__";
                const isNone = group.id === "__none__";
                const plan = !isMgmt && !isNone
                  ? CONCEPT_STATION_PLAN.find((p) => p.match(group.name.toLowerCase()))
                  : undefined;

                const totalSlots = plan?.slots.reduce((a, s) => a + s.count, 0) ?? 0;
                const filledTotal = plan
                  ? plan.slots.reduce((acc, slot) => {
                      const count = group.people.filter((p) => p.station === slot.station).length;
                      return acc + Math.min(count, slot.count);
                    }, 0)
                  : group.people.length;

                return (
                  <div key={group.id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b">
                      <h3 className="font-heading font-semibold text-base">{group.name}</h3>
                      {plan ? (
                        <span className="text-xs font-medium text-muted-foreground tabular-nums">
                          {filledTotal}/{totalSlots}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {group.people.length}
                        </span>
                      )}
                    </div>

                    {plan ? (
                      (() => {
                        const usedHere = new Set<string>();
                        return (
                          <div className="space-y-3">
                            {plan.slots.map((slot) => {
                              const occupants = group.people
                                .filter((p) => p.station === slot.station)
                                .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
                              return (
                                <div key={slot.station} className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                                      {STATION_LABEL[slot.station]}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">
                                      {Math.min(occupants.length, slot.count)}/{slot.count}
                                    </span>
                                  </div>
                                  <div className="space-y-1">
                                    {Array.from({ length: slot.count }).map((_, idx) => {
                                      const current = occupants[idx];
                                      if (current) usedHere.add(current.id);
                                      return (
                                        <SlotPicker
                                          key={`${slot.station}-${idx}`}
                                          current={current}
                                          crewPool={crewPool}
                                          assignmentMap={assignmentMap}
                                          onAssign={(personId) => {
                                            if (personId === "__empty__") {
                                              if (current) {
                                                updateStaff.mutate({
                                                  id: current.id,
                                                  patch: { station: null, concept_id: null },
                                                });
                                              }
                                              return;
                                            }
                                            updateStaff.mutate({
                                              id: personId,
                                              patch: {
                                                concept_id: group.id,
                                                station: slot.station,
                                                role: "crew",
                                              },
                                            });
                                          }}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {(() => {
                              const extras = group.people.filter((p) => !usedHere.has(p.id));
                              if (extras.length === 0) return null;
                              return (
                                <div className="pt-2 border-t">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">
                                    Extra · {extras.length}
                                  </div>
                                  <ul className="space-y-1">
                                    {extras.map((p) => (
                                      <li key={p.id} className="text-sm flex items-center justify-between gap-2">
                                        <span className="truncate">{p.name || <em className="text-muted-foreground">Unnamed</em>}</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted shrink-0">
                                          {p.station ? (STATION_LABEL[p.station] ?? p.station) : "no station"}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()
                    ) : group.people.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No one assigned</p>
                    ) : (
                      <ul className="space-y-1">
                        {group.people.map((p) => (
                          <li key={p.id} className="flex items-center justify-between text-sm gap-2">
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                                  p.confirmed ? "bg-emerald-500" : "bg-amber-400"
                                }`}
                              />
                              <span className="truncate">{p.name || <em className="text-muted-foreground">Unnamed</em>}</span>
                            </span>
                            {p.home_location && (
                              <span className="text-[10px] text-muted-foreground shrink-0">{p.home_location}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {festivalId && (
        <ShiftGroupsEditor
          festivalId={festivalId}
          concepts={concepts.filter((c) =>
            /fish|gyros/i.test(c.name)
          )}
        />
      )}

      {festivalId && (
        <ShiftScheduleCard
          festivalId={festivalId}
          concepts={concepts.filter((c) => /fish|gyros/i.test(c.name))}
        />
      )}

      <div>
        <h2 className="font-heading text-lg font-semibold mb-3">Crew by station</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            ...STATION_OPTIONS.map((s) => ({
              id: s.value,
              name: s.label,
              people: allRows.filter((p) => p.station === s.value),
            })),
            { id: "__none__", name: "No station", people: allRows.filter((p) => !p.station) },
          ].map((group) => (
            <div key={group.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm">{group.name}</h3>
                <span className="text-xs text-muted-foreground">{group.people.length}</span>
              </div>
              {group.people.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No one assigned</p>
              ) : (
                <ul className="space-y-1">
                  {group.people.map((p) => {
                    const conceptName =
                      p.role === "management"
                        ? "Management"
                        : concepts.find((c) => c.id === p.concept_id)?.name ?? "—";
                    return (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${
                              p.confirmed ? "bg-emerald-500" : "bg-amber-400"
                            }`}
                          />
                          <span>{p.name || <em className="text-muted-foreground">Unnamed</em>}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{conceptName}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ===================== REPORT ===================== */}
      <div className="rounded-xl border-2 border-primary/30 bg-card p-4 md:p-5 space-y-5 print:border-0 print:p-0">
        <div className="flex items-center justify-between gap-2 print:hidden">
          <h2 className="font-heading text-xl font-semibold">Staff report</h2>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            Print / PDF
          </Button>
        </div>

        {/* Per-concept fulfilment */}
        <section className="space-y-3">
          <h3 className="font-heading text-base font-semibold">Employees per concept · slots</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {concepts.map((c) => {
              const plan = CONCEPT_STATION_PLAN.find((p) => p.match(c.name.toLowerCase()));
              const people = allRows.filter((s) => s.concept_id === c.id && s.role !== "management");
              const totalPlanned = plan?.slots.reduce((a, s) => a + s.count, 0) ?? 0;
              const filledTotal = plan
                ? plan.slots.reduce((acc, slot) => {
                    const n = people.filter((p) => p.station === slot.station).length;
                    return acc + Math.min(n, slot.count);
                  }, 0)
                : people.length;
              const missing = Math.max(0, totalPlanned - filledTotal);
              return (
                <div key={c.id} className="rounded-lg border p-3 space-y-2 bg-background">
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <span className="font-semibold text-sm">{c.name}</span>
                    <span className={`text-xs font-medium tabular-nums ${
                      missing === 0 ? "text-emerald-700" : "text-amber-700"
                    }`}>
                      {filledTotal}/{totalPlanned || people.length}
                      {missing > 0 && ` · ${missing} missing`}
                    </span>
                  </div>
                  {plan ? (
                    <ul className="text-xs space-y-1">
                      {plan.slots.map((slot) => {
                        const occ = people.filter((p) => p.station === slot.station);
                        const ok = occ.length >= slot.count;
                        return (
                          <li key={slot.station} className="flex items-start justify-between gap-2">
                            <span className="text-muted-foreground shrink-0">
                              {STATION_LABEL[slot.station]} ({Math.min(occ.length, slot.count)}/{slot.count})
                            </span>
                            <span className={`text-right ${ok ? "" : "text-amber-700 font-medium"}`}>
                              {occ.length === 0
                                ? "— empty —"
                                : occ.map((p) => p.name || "Unnamed").join(", ")}
                              {!ok && ` · need ${slot.count - occ.length} more`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {people.length === 0 ? "No one assigned" : people.map((p) => p.name || "Unnamed").join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Not assigned */}
        {(() => {
          const unassigned = allRows.filter((s) => !s.concept_id && s.role !== "management");
          return (
            <section className="space-y-2">
              <h3 className="font-heading text-base font-semibold">
                Not assigned <span className="text-muted-foreground font-normal">· {unassigned.length}</span>
              </h3>
              {unassigned.length === 0 ? (
                <p className="text-xs text-emerald-700">Everyone is assigned ✓</p>
              ) : (
                <ul className="text-sm grid grid-cols-1 md:grid-cols-2 gap-x-4">
                  {unassigned.map((p) => (
                    <li key={p.id} className="flex justify-between border-b py-1">
                      <span>{p.name || <em className="text-muted-foreground">Unnamed</em>}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.home_location || "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })()}

        {/* Accommodation by day */}
        <section className="space-y-2">
          <h3 className="font-heading text-base font-semibold">Accommodation needs by day</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {ACCOM_DAYS.map((d) => {
              const people = allRows
                .filter((s) => !!s[d.key])
                .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
              return (
                <div key={d.key} className="rounded-lg border p-3 bg-background">
                  <div className="flex items-center justify-between border-b pb-1 mb-2">
                    <span className="font-semibold text-sm">{d.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {people.length} bed{people.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {people.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">—</p>
                  ) : (
                    <ul className="text-xs space-y-0.5">
                      {people.map((p) => (
                        <li key={p.id} className="flex justify-between gap-2">
                          <span className="truncate">{p.name || "Unnamed"}</span>
                          {p.home_location && (
                            <span className="text-muted-foreground shrink-0">{p.home_location}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Total bed-nights:{" "}
            <strong className="text-foreground">
              {ACCOM_DAYS.reduce((acc, d) => acc + allRows.filter((s) => !!s[d.key]).length, 0)}
            </strong>
          </p>
        </section>
      </div>

      <p className="text-xs text-muted-foreground print:hidden">
        This list is shared across Transport, Setup and other festival sections.
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full border text-xs transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted border-border text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StaffRow({
  staff,
  index,
  concepts,
  onPatch,
  onDelete,
}: {
  staff: Staff;
  index: number;
  concepts: Concept[];
  onPatch: (patch: Partial<Staff>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(staff.name ?? "");
  const [location, setLocation] = useState(staff.home_location ?? "");
  const [notes, setNotes] = useState(staff.notes ?? "");

  return (
    <TableRow>
      <TableCell className="text-muted-foreground text-xs">{index}</TableCell>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== (staff.name ?? "")) onPatch({ name });
          }}
          placeholder="Name"
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={() => {
            if (location !== (staff.home_location ?? "")) onPatch({ home_location: location });
          }}
          placeholder="e.g. Copenhaga"
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Select
          value={staff.role === "management" ? "__mgmt__" : (staff.concept_id ?? "__none__")}
          onValueChange={(v) => {
            if (v === "__mgmt__") onPatch({ role: "management", concept_id: null });
            else if (v === "__none__") onPatch({ role: "crew", concept_id: null });
            else onPatch({ role: "crew", concept_id: v });
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            <SelectItem value="__mgmt__">Management</SelectItem>
            {concepts.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={staff.station ?? "__none__"}
          onValueChange={(v) => onPatch({ station: v === "__none__" ? null : v })}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {STATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-1.5">
          {ACCOM_DAYS.map((d) => {
            const checked = !!staff[d.key];
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  const next = { [d.key]: !checked } as Partial<Staff>;
                  // keep summary boolean in sync
                  const anyOther = ACCOM_DAYS.some(
                    (x) => x.key !== d.key && !!staff[x.key]
                  );
                  next.needs_accommodation = !checked || anyOther;
                  onPatch(next);
                }}
                className={`text-[10px] px-1.5 py-0.5 rounded border tabular-nums transition ${
                  checked
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
                title={`Needs accommodation on ${d.label}`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </TableCell>
      <TableCell>
        <Select
          value={staff.staff_source}
          onValueChange={(v) => onPatch({ staff_source: v })}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      {(["works_thursday", "works_friday", "works_saturday", "works_sunday"] as const).map((k) => (
        <TableCell key={k} className="text-center">
          <Checkbox
            checked={!!staff[k]}
            onCheckedChange={(c) => onPatch({ [k]: !!c } as Partial<Staff>)}
          />
        </TableCell>
      ))}
      <TableCell className="text-center">
        <button
          onClick={() => onPatch({ confirmed: !staff.confirmed })}
          className={`inline-flex items-center justify-center h-7 w-7 rounded-full border ${
            staff.confirmed
              ? "bg-emerald-100 border-emerald-300 text-emerald-700"
              : "bg-amber-50 border-amber-200 text-amber-700"
          }`}
          title={staff.confirmed ? "Confirmed" : "Unconfirmed"}
        >
          {staff.confirmed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
      </TableCell>
      <TableCell>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (staff.notes ?? "")) onPatch({ notes: notes || null });
          }}
          placeholder="Notes"
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SlotPicker({
  current,
  crewPool,
  assignmentMap,
  onAssign,
}: {
  current?: Staff;
  crewPool: Staff[];
  assignmentMap: Map<string, { conceptName: string; stationLabel: string }>;
  onAssign: (personId: string) => void;
}) {
  const value = current?.id ?? "__empty__";
  const sorted = [...crewPool].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return (
    <Select value={value} onValueChange={onAssign}>
      <SelectTrigger
        className={`h-8 text-sm ${
          current ? "border-emerald-300 bg-emerald-50/50" : "border-dashed text-muted-foreground"
        }`}
      >
        <SelectValue placeholder="— Empty slot —">
          {current ? (
            <span className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  current.confirmed ? "bg-emerald-500" : "bg-amber-400"
                }`}
              />
              <span className="truncate">{current.name || "Unnamed"}</span>
            </span>
          ) : (
            <span className="italic">— Empty slot —</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="__empty__">
          <span className="italic text-muted-foreground">— Empty slot —</span>
        </SelectItem>
        {sorted.map((p) => {
          const assigned = assignmentMap.get(p.id);
          const isCurrent = current?.id === p.id;
          const isElsewhere = !!assigned && !isCurrent;
          return (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    p.confirmed ? "bg-emerald-500" : "bg-amber-400"
                  }`}
                />
                <span className={isElsewhere ? "text-destructive line-through" : ""}>
                  {p.name || "Unnamed"}
                </span>
                {isElsewhere && (
                  <span className="text-[10px] text-destructive ml-1">
                    ({assigned!.conceptName}{assigned!.stationLabel ? ` · ${assigned!.stationLabel}` : ""})
                  </span>
                )}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

// ============ Shift groups editor (Fish & Gyros) ============

type ShiftRow = {
  id: string;
  concept_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
};

const WORK_DAYS = ["2026-05-21", "2026-05-22", "2026-05-23"]; // Thu, Fri, Sat
const LATE_END = "02:00:00";
const EARLY_END = "23:00:00";

function ShiftGroupsEditor({
  festivalId,
  concepts,
}: {
  festivalId: string;
  concepts: Concept[];
}) {
  const qc = useQueryClient();
  const conceptIds = concepts.map((c) => c.id);

  const shiftsQ = useQuery({
    queryKey: ["shift-groups", festivalId, conceptIds.join(",")],
    enabled: conceptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_shifts")
        .select("id, concept_id, shift_date, start_time, end_time, notes")
        .eq("festival_id", festivalId)
        .in("concept_id", conceptIds)
        .in("shift_date", WORK_DAYS)
        .not("notes", "is", null);
      if (error) throw error;
      return (data ?? []) as ShiftRow[];
    },
  });

  const swap = useMutation({
    mutationFn: async ({
      conceptId,
      name,
      target,
    }: {
      conceptId: string;
      name: string;
      target: "late" | "early";
    }) => {
      const rows = (shiftsQ.data ?? []).filter(
        (r) => r.concept_id === conceptId && (r.notes ?? "").trim() === name
      );
      for (const r of rows) {
        const isThu = r.shift_date === "2026-05-21";
        const newStart = target === "late" ? "11:00:00" : isThu ? "11:00:00" : "10:00:00";
        const newEnd = target === "late" ? LATE_END : EARLY_END;
        const { error } = await supabase
          .from("festival_shifts")
          .update({
            start_time: newStart,
            end_time: newEnd,
            crosses_midnight: target === "late",
          })
          .eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-groups", festivalId] });
      toast.success("Shift updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Swap failed"),
  });

  if (concepts.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Shift groups · Thu–Sat</h2>
        <p className="text-xs text-muted-foreground">
          Swap people between late closers (until 02:00) and early out (until 23:00). Sunday is unchanged.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {concepts.map((c) => {
          const rows = (shiftsQ.data ?? []).filter((r) => r.concept_id === c.id);
          const byName = new Map<string, ShiftRow[]>();
          rows.forEach((r) => {
            const n = (r.notes ?? "").trim();
            if (!n) return;
            if (!byName.has(n)) byName.set(n, []);
            byName.get(n)!.push(r);
          });

          const late: string[] = [];
          const early: string[] = [];
          Array.from(byName.entries()).forEach(([name, rs]) => {
            const thu = rs.find((r) => r.shift_date === "2026-05-21") ?? rs[0];
            if ((thu?.end_time ?? "").startsWith("02")) late.push(name);
            else if ((thu?.end_time ?? "").startsWith("23")) early.push(name);
          });
          late.sort();
          early.sort();

          return (
            <div key={c.id} className="rounded-lg border bg-background p-3 space-y-3">
              <h3 className="font-semibold text-sm border-b pb-1">{c.name}</h3>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-foreground/80 mb-1.5">
                  Late closers · until 02:00 ({late.length})
                </div>
                {late.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">—</p>
                ) : (
                  <ul className="space-y-1">
                    {late.map((n) => (
                      <li key={n} className="flex items-center justify-between text-sm">
                        <span className="truncate">{n}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          disabled={swap.isPending}
                          onClick={() =>
                            swap.mutate({ conceptId: c.id, name: n, target: "early" })
                          }
                        >
                          → Early
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-foreground/80 mb-1.5">
                  Early out · until 23:00 ({early.length})
                </div>
                {early.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">—</p>
                ) : (
                  <ul className="space-y-1">
                    {early.map((n) => (
                      <li key={n} className="flex items-center justify-between text-sm">
                        <span className="truncate">{n}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          disabled={swap.isPending}
                          onClick={() =>
                            swap.mutate({ conceptId: c.id, name: n, target: "late" })
                          }
                        >
                          → Late
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ Shift schedule card (Thu–Sun grid per person) ============

const SCHEDULE_DAYS = [
  { date: "2026-05-21", label: "Thu 21" },
  { date: "2026-05-22", label: "Fri 22" },
  { date: "2026-05-23", label: "Sat 23" },
  { date: "2026-05-24", label: "Sun 24" },
] as const;

function fmt(t: string | null | undefined) {
  if (!t) return "—";
  return t.slice(0, 5);
}

function hoursBetween(start: string, end: string, crosses: boolean) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0 || crosses) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

function ShiftScheduleCard({
  festivalId,
  concepts,
}: {
  festivalId: string;
  concepts: Concept[];
}) {
  const conceptIds = concepts.map((c) => c.id);
  const dates = SCHEDULE_DAYS.map((d) => d.date);

  const shiftsQ = useQuery({
    queryKey: ["shift-schedule", festivalId, conceptIds.join(",")],
    enabled: conceptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_shifts")
        .select("id, concept_id, shift_date, start_time, end_time, crosses_midnight, notes")
        .eq("festival_id", festivalId)
        .in("concept_id", conceptIds)
        .in("shift_date", dates)
        .not("notes", "is", null);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (concepts.length === 0) return null;

  const rows = shiftsQ.data ?? [];

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-card p-4 md:p-5 space-y-5 print:border-0 print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <div>
          <h2 className="font-heading text-xl font-semibold">Shift schedule · Thu–Sun</h2>
          <p className="text-xs text-muted-foreground">
            Per-person hours for Fish & Chips and Gyros. Sunday closes 24:00.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          Print / PDF
        </Button>
      </div>

      <div className="space-y-6">
        {concepts.map((c) => {
          const conceptRows = rows.filter(
            (r) => r.concept_id === c.id && (r.notes ?? "").trim()
          );
          const byName = new Map<string, any[]>();
          conceptRows.forEach((r) => {
            const n = (r.notes ?? "").trim();
            if (!byName.has(n)) byName.set(n, []);
            byName.get(n)!.push(r);
          });

          const names = Array.from(byName.keys()).sort((a, b) => {
            // late closers (Thu end 02:00) first, then early
            const aLate = (byName.get(a)!.find((r) => r.shift_date === "2026-05-21")?.end_time ?? "").startsWith("02");
            const bLate = (byName.get(b)!.find((r) => r.shift_date === "2026-05-21")?.end_time ?? "").startsWith("02");
            if (aLate !== bLate) return aLate ? -1 : 1;
            return a.localeCompare(b);
          });

          let conceptTotal = 0;

          return (
            <div key={c.id} className="space-y-2">
              <h3 className="font-heading text-base font-semibold">{c.name}</h3>
              <div className="overflow-x-auto rounded-lg border bg-background">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      {SCHEDULE_DAYS.map((d) => (
                        <th key={d.date} className="text-center px-2 py-2 font-medium">
                          {d.label}
                        </th>
                      ))}
                      <th className="text-center px-3 py-2 font-medium tabular-nums">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {names.map((name) => {
                      const personRows = byName.get(name)!;
                      let personTotal = 0;
                      return (
                        <tr key={name} className="border-t">
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{name}</td>
                          {SCHEDULE_DAYS.map((d) => {
                            const r = personRows.find((x) => x.shift_date === d.date);
                            if (!r) {
                              return (
                                <td key={d.date} className="text-center px-2 py-2 text-muted-foreground">
                                  —
                                </td>
                              );
                            }
                            const h = hoursBetween(r.start_time, r.end_time, !!r.crosses_midnight);
                            personTotal += h;
                            const isLate = (r.end_time ?? "").startsWith("02");
                            return (
                              <td key={d.date} className="text-center px-2 py-2 tabular-nums">
                                <div className={isLate ? "text-foreground font-medium" : "text-foreground"}>
                                  {fmt(r.start_time)}–{fmt(r.end_time)}
                                </div>
                                <div className="text-[10px] text-muted-foreground">{h}h</div>
                              </td>
                            );
                          })}
                          <td className="text-center px-3 py-2 tabular-nums font-semibold">
                            {(conceptTotal += personTotal, personTotal)}h
                          </td>
                        </tr>
                      );
                    })}
                    {names.length === 0 && (
                      <tr>
                        <td colSpan={SCHEDULE_DAYS.length + 2} className="text-center text-muted-foreground py-6 text-xs">
                          No shifts yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {names.length > 0 && (
                    <tfoot className="bg-muted/30">
                      <tr className="border-t">
                        <td className="px-3 py-2 font-semibold text-xs uppercase tracking-wide">
                          {c.name} total
                        </td>
                        <td colSpan={SCHEDULE_DAYS.length} />
                        <td className="text-center px-3 py-2 tabular-nums font-bold">
                          {Math.round(conceptTotal * 10) / 10}h
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
