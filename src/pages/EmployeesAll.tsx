import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Search } from "lucide-react";

const SOURCE_OPTIONS = [
  { value: "soborg", label: "Copenhagen" },
  { value: "aarhus", label: "Aarhus" },
  { value: "local", label: "Local" },
  { value: "fidibus", label: "Fidibus" },
  { value: "unknown", label: "Unknown" },
];

type StaffRow = {
  id: string;
  festival_id: string;
  name: string | null;
  email: string | null;
  staff_source: string | null;
  is_draft: boolean;
};

type Festival = { id: string; name: string; slug: string };

export default function EmployeesAll() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [festivalFilter, setFestivalFilter] = useState<string>("__all__");
  const [sourceFilter, setSourceFilter] = useState<string>("__all__");

  const festivalsQ = useQuery({
    queryKey: ["all-festivals-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals").select("id,name,slug").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Festival[];
    },
  });

  const staffQ = useQuery({
    queryKey: ["all-employees-across-festivals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_staff")
        .select("id,festival_id,name,email,staff_source,is_draft")
        .eq("is_draft", false)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Partial<StaffRow> }) => {
      const { error } = await supabase.from("festival_staff").update(changes).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-employees-across-festivals"] }),
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const festivalById = useMemo(
    () => Object.fromEntries((festivalsQ.data ?? []).map((f) => [f.id, f])),
    [festivalsQ.data],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staffQ.data ?? [])
      .filter((r) => festivalFilter === "__all__" || r.festival_id === festivalFilter)
      .filter((r) => sourceFilter === "__all__" || (r.staff_source ?? "unknown") === sourceFilter)
      .filter((r) => {
        if (!q) return true;
        return (
          (r.name ?? "").toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q)
        );
      });
  }, [staffQ.data, search, festivalFilter, sourceFilter]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/festivals"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
          <h1 className="font-heading text-2xl font-semibold">All employees</h1>
          <Badge variant="secondary">{staffQ.data?.length ?? 0}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9 w-[240px]"
            placeholder="Search name, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sources</SelectItem>
            {SOURCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={festivalFilter} onValueChange={setFestivalFilter}>
          <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All festivals</SelectItem>
            {(festivalsQ.data ?? []).map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">
          Showing {rows.length} of {staffQ.data?.length ?? 0}
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Festival</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <EditableRow
                key={r.id}
                row={r}
                festival={festivalById[r.festival_id]}
                onSave={(changes) => patch.mutate({ id: r.id, changes })}
              />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                  No employees match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EditableRow({
  row, festival, onSave,
}: {
  row: StaffRow;
  festival?: Festival;
  onSave: (changes: Partial<StaffRow>) => void;
}) {
  const [name, setName] = useState(row.name ?? "");
  const [email, setEmail] = useState(row.email ?? "");

  return (
    <TableRow>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name !== (row.name ?? "")) onSave({ name }); }}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => {
            const v = email.trim();
            if (v !== (row.email ?? "")) onSave({ email: v || null });
          }}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Select
          value={row.staff_source ?? "unknown"}
          onValueChange={(v) => onSave({ staff_source: v })}
        >
          <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-xs">
        {festival ? (
          <Link to={`/festivals/${festival.slug}/staff`} className="text-primary hover:underline">
            {festival.name}
          </Link>
        ) : "—"}
      </TableCell>
    </TableRow>
  );
}
