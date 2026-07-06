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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeft, Search, Plus, Trash2, Loader2 } from "lucide-react";


const LOCATION_OPTIONS = [
  { value: "soborg", label: "Copenhagen" },
  { value: "aarhus", label: "Aarhus" },
  { value: "local", label: "Local" },
  { value: "fidibus", label: "Fidibus" },
  { value: "unknown", label: "Unknown" },
];

type Employee = {
  id: string;
  employee_code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  home_location: string | null;
  date_of_birth: string | null;
};

export default function EmployeesAll() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("__all__");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", date_of_birth: "", email: "", phone: "", home_location: "unknown" });


  const employeesQ = useQuery({
    queryKey: ["employees-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,employee_code,name,email,phone,home_location,date_of_birth")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const usageQ = useQuery({
    queryKey: ["employees-usage-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_staff")
        .select("employee_id")
        .not("employee_id", "is", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        if (r.employee_id) counts[r.employee_id] = (counts[r.employee_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Partial<Employee> }) => {
      const { error } = await supabase.from("employees").update(changes).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees-master"] }),
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const createOne = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("Name is required");
      if (!form.date_of_birth) throw new Error("Date of birth is required (unique key with name)");
      const { error } = await supabase.from("employees").insert({
        name,
        date_of_birth: form.date_of_birth,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        home_location: form.home_location || "unknown",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees-master"] });
      toast.success("Employee created");
      setCreateOpen(false);
      setForm({ name: "", date_of_birth: "", email: "", phone: "", home_location: "unknown" });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "Create failed");
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        toast.error("An employee with this name and date of birth already exists.");
      } else {
        toast.error(msg);
      }
    },
  });


  const removeOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees-master"] });
      toast.success("Employee deleted");
    },
    onError: (e: any) =>
      toast.error(e?.message ?? "Delete failed — this person may still be assigned to a festival."),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employeesQ.data ?? [])
      .filter((r) => locationFilter === "__all__" || (r.home_location ?? "unknown") === locationFilter)
      .filter((r) => {
        if (!q) return true;
        return (
          (r.name ?? "").toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          (r.employee_code ?? "").toLowerCase().includes(q)
        );
      });
  }, [employeesQ.data, search, locationFilter]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/festivals"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
          <h1 className="font-heading text-2xl font-semibold">All employees</h1>
          <Badge variant="secondary">{employeesQ.data?.length ?? 0}</Badge>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New employee
        </Button>

      </div>

      <p className="text-xs text-muted-foreground">
        This is the master people list. Each person appears once — <b>name + date of birth</b> must be unique.
        Festival assignments link back here so a person is never duplicated on import.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9 w-[240px]"
            placeholder="Search name, email, code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All locations</SelectItem>
            {LOCATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">
          Showing {rows.length} of {employeesQ.data?.length ?? 0}
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Date of birth</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-center">Festivals</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <EditableRow
                key={r.id}
                row={r}
                usageCount={usageQ.data?.[r.id] ?? 0}
                onSave={(changes) => patch.mutate({ id: r.id, changes })}
                onDelete={() => {
                  if (confirm(`Delete ${r.name}? This unlinks them from all festival assignments.`)) {
                    removeOne.mutate(r.id);
                  }
                }}
              />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  No employees match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => !createOne.isPending && setCreateOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New employee</DialogTitle>
            <DialogDescription>
              Name + date of birth are the unique key — the same person can never be created twice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Full name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                placeholder="e.g. Jane Doe"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Date of birth *</label>
              <Input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Phone</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Home location</label>
              <Select value={form.home_location} onValueChange={(v) => setForm({ ...form, home_location: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={createOne.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => createOne.mutate()}
              disabled={createOne.isPending || !form.name.trim() || !form.date_of_birth}
            >
              {createOne.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function EditableRow({
  row, usageCount, onSave, onDelete,
}: {
  row: Employee;
  usageCount: number;
  onSave: (changes: Partial<Employee>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(row.name ?? "");
  const [email, setEmail] = useState(row.email ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const [dob, setDob] = useState(row.date_of_birth ?? "");

  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {row.employee_code ?? "—"}
      </TableCell>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name !== (row.name ?? "")) onSave({ name }); }}
          className="h-8 min-w-[180px]"
        />
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          onBlur={() => {
            const v = dob || null;
            if (v !== (row.date_of_birth ?? null)) onSave({ date_of_birth: v });
          }}
          className="h-8 w-[150px]"
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
          className="h-8 min-w-[180px]"
        />
      </TableCell>
      <TableCell>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => {
            const v = phone.trim();
            if (v !== (row.phone ?? "")) onSave({ phone: v || null });
          }}
          className="h-8 w-[140px]"
        />
      </TableCell>
      <TableCell>
        <Select
          value={row.home_location ?? "unknown"}
          onValueChange={(v) => onSave({ home_location: v })}
        >
          <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LOCATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={usageCount > 0 ? "secondary" : "outline"}>{usageCount}</Badge>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
