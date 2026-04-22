import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Contact = {
  id: string;
  festival_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  order_index: number;
};

interface Props {
  festivalId: string;
}

function useContacts(festivalId: string) {
  return useQuery({
    queryKey: ["festival_contacts", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contacts")
        .select("*")
        .eq("festival_id", festivalId)
        .order("order_index");
      if (error) throw error;
      return data as Contact[];
    },
  });
}

function ContactRow({
  contact,
  onChange,
  onDelete,
}: {
  contact: Contact;
  onChange: (patch: Partial<Contact>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(contact);

  useEffect(() => setLocal(contact), [contact.id]);

  const debouncedSave = (patch: Partial<Contact>) => {
    setLocal((p) => ({ ...p, ...patch }));
    const t = setTimeout(() => onChange(patch), 400);
    return () => clearTimeout(t);
  };

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2 bg-background">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <UserRound className="h-3.5 w-3.5" />
          Contact
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Name</Label>
          <Input
            value={local.name}
            className="h-8 text-[13px]"
            onChange={(e) => debouncedSave({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Role</Label>
          <Input
            value={local.role ?? ""}
            placeholder="e.g. Organiser, Stage manager"
            className="h-8 text-[13px]"
            onChange={(e) => debouncedSave({ role: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Phone</Label>
          <Input
            value={local.phone ?? ""}
            className="h-8 text-[13px]"
            onChange={(e) => debouncedSave({ phone: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Email</Label>
          <Input
            type="email"
            value={local.email ?? ""}
            className="h-8 text-[13px]"
            onChange={(e) => debouncedSave({ email: e.target.value })}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-[11px] text-muted-foreground">Notes</Label>
          <Input
            value={local.notes ?? ""}
            className="h-8 text-[13px]"
            onChange={(e) => debouncedSave({ notes: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

export function ContactsManager({ festivalId }: Props) {
  const qc = useQueryClient();
  const { data: contacts = [], isLoading } = useContacts(festivalId);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["festival_contacts", festivalId] });

  const addPerson = async () => {
    const nextOrder = contacts.length
      ? Math.max(...contacts.map((c) => c.order_index)) + 1
      : 0;
    const { error } = await supabase.from("festival_contacts").insert({
      festival_id: festivalId,
      name: "",
      role: null,
      phone: null,
      email: null,
      notes: null,
      order_index: nextOrder,
    });
    if (error) {
      toast.error("Could not add person");
      return;
    }
    invalidate();
  };

  const updateContact = async (id: string, patch: Partial<Contact>) => {
    const { error } = await supabase
      .from("festival_contacts")
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error("Save failed");
      return;
    }
    invalidate();
  };

  const deleteContact = async (id: string) => {
    const { error } = await supabase
      .from("festival_contacts")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Delete failed");
      return;
    }
    invalidate();
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold">People</h3>
          <p className="text-[11px] text-muted-foreground">
            Organisers, key contacts and stakeholders for this festival.
          </p>
        </div>
        <Button size="sm" onClick={addPerson} className="h-8">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add person
        </Button>
      </div>

      {isLoading ? (
        <p className="text-[12px] text-muted-foreground">Loading…</p>
      ) : contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
          <p className="text-[12px] text-muted-foreground">
            No people added yet. Click <strong>Add person</strong> to start.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              onChange={(patch) => updateContact(c.id, patch)}
              onDelete={() => deleteContact(c.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
