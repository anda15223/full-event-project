import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, UserPlus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
  festivalId: string;
  isDraft: boolean;
  workDates: string[];
  onAdded?: () => void;
}

interface Employee {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  home_location: string | null;
  default_role: string | null;
}

export function AddStaffMenu({ festivalId, isDraft, workDates, onAdded }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", home_location: "" });

  const employeesQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, phone, email, home_location, default_role")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  // Existing employee_ids already attached to the list currently being edited.
  // Draft and live staff lists are separate, so a draft row must not block
  // adding the same employee back to the live list after deletion (and vice versa).
  const existingQ = useQuery({
    queryKey: ["festival-staff-employee-ids", festivalId, isDraft],
    enabled: !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_staff")
        .select("employee_id")
        .eq("festival_id", festivalId)
        .eq("is_draft", isDraft);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.employee_id).filter(Boolean));
    },
  });

  const filtered = useMemo(() => {
    const taken = existingQ.data ?? new Set();
    const term = search.trim().toLowerCase();
    return (employeesQ.data ?? [])
      .filter((e) => !taken.has(e.id))
      .filter((e) =>
        !term ||
        e.name.toLowerCase().includes(term) ||
        (e.phone ?? "").toLowerCase().includes(term) ||
        (e.email ?? "").toLowerCase().includes(term),
      )
      .slice(0, 50);
  }, [employeesQ.data, existingQ.data, search]);

  const attachExisting = useMutation({
    mutationFn: async (emp: Employee) => {
      const { error } = await supabase.from("festival_staff").insert({
        festival_id: festivalId,
        employee_id: emp.id,
        name: emp.name,
        home_location: emp.home_location ?? "",
        confirmed: false,
        role: emp.default_role ?? "crew",
        staff_source: "unknown",
        work_dates: workDates,
        accom_dates: [],
        is_draft: isDraft,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added from directory");
      setOpen(false);
      setSearch("");
      qc.invalidateQueries({ queryKey: ["festival-staff-page", festivalId] });
      qc.invalidateQueries({ queryKey: ["festival-staff-employee-ids", festivalId, isDraft] });
      onAdded?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Add failed"),
  });

  const createNew = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("Name is required");
      const { data: emp, error: empErr } = await supabase
        .from("employees")
        .insert({
          name,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          home_location: form.home_location.trim() || null,
        })
        .select("id, name, home_location, default_role")
        .single();
      if (empErr) throw empErr;

      const { error: staffErr } = await supabase.from("festival_staff").insert({
        festival_id: festivalId,
        employee_id: emp.id,
        name: emp.name,
        home_location: emp.home_location ?? "",
        confirmed: false,
        role: emp.default_role ?? "crew",
        staff_source: "unknown",
        work_dates: workDates,
        accom_dates: [],
        is_draft: isDraft,
      });
      if (staffErr) throw staffErr;
    },
    onSuccess: () => {
      toast.success("Employee added");
      setCreateOpen(false);
      setOpen(false);
      setForm({ name: "", phone: "", email: "", home_location: "" });
      qc.invalidateQueries({ queryKey: ["employees-directory"] });
      qc.invalidateQueries({ queryKey: ["festival-staff-page", festivalId] });
      qc.invalidateQueries({ queryKey: ["festival-staff-employee-ids", festivalId, isDraft] });
      onAdded?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Create failed"),
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" disabled={!festivalId}>
            <Plus className="h-4 w-4 mr-1" /> Add person
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search directory…"
                className="h-8 pl-7 text-sm"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {employeesQ.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                {search ? "No matches." : "No employees in directory yet."}
              </div>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => attachExisting.mutate(e)}
                  disabled={attachExisting.isPending}
                  className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0"
                >
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[e.home_location, e.phone, e.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => { setCreateOpen(true); setOpen(false); }}
            >
              <UserPlus className="h-4 w-4 mr-1" /> Create new employee
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={(o) => !createNew.isPending && setCreateOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Phone</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Home location</label>
              <Input value={form.home_location} onChange={(e) => setForm({ ...form, home_location: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={createNew.isPending}>Cancel</Button>
            <Button onClick={() => createNew.mutate()} disabled={createNew.isPending || !form.name.trim()}>
              {createNew.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Add to festival
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
