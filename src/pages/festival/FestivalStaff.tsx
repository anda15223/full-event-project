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
  staff_source: string;
  role: string;
  notes: string | null;
};

type Concept = { id: string; name: string };

const SOURCE_OPTIONS = [
  { value: "soborg", label: "Søborg" },
  { value: "local", label: "Local" },
  { value: "fidibus", label: "Fidibus" },
  { value: "unknown", label: "Unknown" },
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

  const rows = staffQ.data ?? [];
  const confirmedCount = rows.filter((s) => s.confirmed).length;
  const unconfirmedCount = rows.length - confirmedCount;

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

      <div className="flex gap-3 text-sm text-muted-foreground">
        <span>Total: <strong className="text-foreground">{rows.length}</strong></span>
        <span className="text-emerald-600">✓ Confirmed: <strong>{confirmedCount}</strong></span>
        <span className="text-amber-600">? Unconfirmed: <strong>{unconfirmedCount}</strong></span>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="min-w-[180px]">Name</TableHead>
              <TableHead className="min-w-[140px]">Location</TableHead>
              <TableHead className="min-w-[140px]">Concept</TableHead>
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
                <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                  No staff yet. Click "Add person" to start.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        This list is shared across Transport, Setup and other festival sections.
      </p>
    </div>
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
          value={staff.concept_id ?? "__none__"}
          onValueChange={(v) => onPatch({ concept_id: v === "__none__" ? null : v })}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {concepts.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
