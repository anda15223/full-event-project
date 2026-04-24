import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { CardUploadZone, EditableField } from "./shared";

interface Props {
  festivalId: string;
}

type Person = {
  id: string;
  festival_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_crew: boolean;
};

type Festival = {
  id: string;
  name: string;
  location: string | null;
  organiser_phone: string | null;
};

export function IntroductionCard({ festivalId }: Props) {
  const qc = useQueryClient();

  const { data: festival } = useQuery({
    queryKey: ["festival_intro", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select("id, name, location, organiser_phone")
        .eq("id", festivalId)
        .maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["personal_festival_db", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_festival_db" as any)
        .select("*")
        .eq("festival_id", festivalId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Person[];
    },
  });

  const updateFestival = async (patch: Partial<Festival>) => {
    const { error } = await supabase
      .from("festivals")
      .update(patch)
      .eq("id", festivalId);
    if (error) {
      toast.error("Save failed");
      return;
    }
    qc.invalidateQueries({ queryKey: ["festival_intro", festivalId] });
  };

  const crew = people.filter((p) => p.is_crew);
  const contacts = people.filter((p) => !p.is_crew);

  return (
    <div className="space-y-5">
      {/* Festival basics */}
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="text-[14px] font-semibold">Festival</h3>
          <p className="text-[11px] text-muted-foreground">
            Core details from the festival record.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Name</Label>
            <div className="px-2 py-1 text-sm font-medium">
              {festival?.name ?? "—"}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Location
            </Label>
            <EditableField
              value={festival?.location ?? ""}
              onChange={(v) => updateFestival({ location: v || null })}
              placeholder="Add location"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Festival contact phone
            </Label>
            <EditableField
              value={festival?.organiser_phone ?? ""}
              onChange={(v) => updateFestival({ organiser_phone: v || null })}
              placeholder="Add festival phone"
            />
          </div>
        </div>
      </Card>

      {/* Add person */}
      <AddPersonForm festivalId={festivalId} />

      {/* People grouped */}
      <PeopleGroup
        title="Crew Members"
        icon={<Users className="h-3.5 w-3.5" />}
        people={crew}
        festivalId={festivalId}
      />
      <PeopleGroup
        title="Festival Contacts"
        icon={<UserRound className="h-3.5 w-3.5" />}
        people={contacts}
        festivalId={festivalId}
      />

      {/* Uploads */}
      <CardUploadZone
        festivalId={festivalId}
        cardName="introduction"
        title="Introduction documents"
        subtitle="Briefs, contracts, intros — anything that frames this festival."
      />
    </div>
  );
}

function AddPersonForm({ festivalId }: { festivalId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isCrew, setIsCrew] = useState<"yes" | "no">("no");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setRole("");
    setPhone("");
    setEmail("");
    setIsCrew("no");
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("personal_festival_db" as any).insert({
      festival_id: festivalId,
      name: name.trim(),
      role: role.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      is_crew: isCrew === "yes",
    });
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success("Person added");
    reset();
    qc.invalidateQueries({ queryKey: ["personal_festival_db", festivalId] });
  };

  return (
    <Card className="p-5 space-y-3">
      <div>
        <h3 className="text-[14px] font-semibold">Add person</h3>
        <p className="text-[11px] text-muted-foreground">
          Crew member or festival contact — saved to the festival people directory.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-[13px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Role</Label>
          <Input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Organiser, Stage manager, Cook"
            className="h-8 text-[13px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Phone</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-8 text-[13px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-8 text-[13px]"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Is this person part of the crew?
          </Label>
          <Select value={isCrew} onValueChange={(v) => setIsCrew(v as "yes" | "no")}>
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes — crew member</SelectItem>
              <SelectItem value="no">No — festival contact</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={saving} className="h-8">
          <Plus className="h-3.5 w-3.5 mr-1" />
          {saving ? "Saving…" : "Add person"}
        </Button>
      </div>
    </Card>
  );
}

function PeopleGroup({
  title,
  icon,
  people,
  festivalId,
}: {
  title: string;
  icon: React.ReactNode;
  people: Person[];
  festivalId: string;
}) {
  const qc = useQueryClient();

  const updatePerson = async (id: string, patch: Partial<Person>) => {
    const { error } = await supabase
      .from("personal_festival_db" as any)
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error("Save failed");
      return;
    }
    qc.invalidateQueries({ queryKey: ["personal_festival_db", festivalId] });
  };

  const deletePerson = async (id: string) => {
    const { error } = await supabase
      .from("personal_festival_db" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Delete failed");
      return;
    }
    qc.invalidateQueries({ queryKey: ["personal_festival_db", festivalId] });
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <span className="text-[11px] text-muted-foreground">
          ({people.length})
        </span>
      </div>

      {people.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
          <p className="text-[12px] text-muted-foreground">None yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {people.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-border/60 p-3 space-y-2 bg-background"
            >
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-muted-foreground">
                  {p.is_crew ? "Crew" : "Contact"}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => deletePerson(p.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Name</Label>
                  <EditableField
                    value={p.name}
                    onChange={(v) => updatePerson(p.id, { name: v })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Role</Label>
                  <EditableField
                    value={p.role ?? ""}
                    onChange={(v) => updatePerson(p.id, { role: v || null })}
                    placeholder="Add role"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Phone</Label>
                  <EditableField
                    value={p.phone ?? ""}
                    onChange={(v) => updatePerson(p.id, { phone: v || null })}
                    placeholder="Add phone"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Email</Label>
                  <EditableField
                    value={p.email ?? ""}
                    onChange={(v) => updatePerson(p.id, { email: v || null })}
                    placeholder="Add email"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Crew member?
                  </Label>
                  <Select
                    value={p.is_crew ? "yes" : "no"}
                    onValueChange={(v) =>
                      updatePerson(p.id, { is_crew: v === "yes" })
                    }
                  >
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes — crew member</SelectItem>
                      <SelectItem value="no">No — festival contact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default IntroductionCard;
