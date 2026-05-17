import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Check, X } from "lucide-react";
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/festivals/${slug}`}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <h1 className="font-heading text-2xl font-semibold">Staff</h1>
        </div>
        <Button size="sm" onClick={() => addStaff.mutate()} disabled={!festivalId}>
          <Plus className="h-4 w-4 mr-1" /> Add person
        </Button>
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
              <TableHead className="text-center">Accom.</TableHead>
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

      <p className="text-xs text-muted-foreground">
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
      <TableCell className="text-center">
        <Checkbox
          checked={!!staff.needs_accommodation}
          onCheckedChange={(c) => onPatch({ needs_accommodation: !!c })}
        />
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
