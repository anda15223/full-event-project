import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Plus, Phone, Mail, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Category = "festival" | "setup" | "concept";

interface Contact {
  id: string;
  festival_id: string;
  full_name: string;
  role: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  role_category: Category | null;
}

interface Props {
  festivalId: string;
  festivalSlug: string;
}

const COLUMNS: { key: Category; title: string; subtitle: string; stripe: string }[] = [
  { key: "festival", title: "Festival", subtitle: "Festival organizers and authorities", stripe: "bg-blue-500" },
  { key: "setup", title: "Setup team", subtitle: "Fidibus / Feed The Booths", stripe: "bg-orange-500" },
  { key: "concept", title: "Concept team", subtitle: "Full Event Project", stripe: "bg-green-500" },
];

interface FormState {
  full_name: string;
  role: string;
  phone: string;
  email: string;
  organization: string;
  role_category: Category;
}

const emptyForm = (cat: Category): FormState => ({
  full_name: "", role: "", phone: "", email: "", organization: "", role_category: cat,
});

export function FestivalContactsBlock({ festivalId, festivalSlug }: Props) {
  const qc = useQueryClient();
  const queryKey = ["festival-contacts", festivalSlug];

  const { data: contacts, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contacts")
        .select("id, festival_id, full_name, role, organization, email, phone, role_category")
        .eq("festival_id", festivalId)
        .eq("is_draft", false)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Contact[];
    },
  });

  const grouped = useMemo(() => {
    const buckets: Record<string, Contact[]> = { festival: [], setup: [], concept: [], uncategorized: [] };
    for (const c of contacts ?? []) {
      if (c.role_category && buckets[c.role_category]) buckets[c.role_category].push(c);
      else buckets.uncategorized.push(c);
    }
    return buckets;
  }, [contacts]);

  const [editing, setEditing] = useState<Contact | null>(null);
  const [adding, setAdding] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const saveMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Contact> }) => {
      const { error } = await supabase.from("festival_contacts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Saved" });
    },
    onError: (e) => toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: async (form: FormState) => {
      const { error } = await supabase.from("festival_contacts").insert({
        festival_id: festivalId,
        full_name: form.full_name,
        role: form.role || null,
        phone: form.phone || null,
        email: form.email || null,
        organization: form.organization || null,
        role_category: form.role_category,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Contact added" });
      setAdding(null);
    },
    onError: (e) => toast({ title: "Add failed", description: (e as Error).message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Contact deleted" });
      setDeleting(null);
    },
    onError: (e) => toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <section className="rounded-2xl border bg-card p-6 my-8">
      <div className="mb-4">
        <h3 className="font-heading text-lg font-semibold">Contacts</h3>
        <p className="text-sm text-muted-foreground">Festival organizers, setup team, and concept team.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {COLUMNS.map((col) => (
              <div key={col.key} className="flex flex-col">
                <div className={`${col.stripe} h-1 rounded mb-3`} />
                <div className="mb-1 flex items-center justify-between">
                  <h4 className="font-semibold text-sm">
                    {col.title}{" "}
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {grouped[col.key].length}
                    </span>
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{col.subtitle}</p>
                <div className="flex-1">
                  {grouped[col.key].map((c) => (
                    <ContactCard
                      key={c.id}
                      contact={c}
                      onEdit={() => setEditing(c)}
                      onDelete={() => setDeleting(c)}
                    />
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setAdding(col.key)}>
                  <Plus className="h-4 w-4" /> Add contact
                </Button>
              </div>
            ))}
          </div>

          {grouped.uncategorized.length > 0 && (
            <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4">
              <div className="mb-3 text-sm font-medium text-amber-900">
                Uncategorized contacts ({grouped.uncategorized.length})
              </div>
              <div className="space-y-2">
                {grouped.uncategorized.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border bg-card p-2">
                    <div className="text-sm">
                      <span className="font-medium">{c.full_name}</span>
                      {c.role && <span className="ml-2 text-muted-foreground italic">{c.role}</span>}
                    </div>
                    <Select
                      onValueChange={(val) =>
                        saveMutation.mutate({ id: c.id, patch: { role_category: val as Category } })
                      }
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue placeholder="Assign category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="festival">Festival</SelectItem>
                        <SelectItem value="setup">Setup team</SelectItem>
                        <SelectItem value="concept">Concept team</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit modal */}
      {editing && (
        <ContactDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          title="Edit contact"
          initial={{
            full_name: editing.full_name ?? "",
            role: editing.role ?? "",
            phone: editing.phone ?? "",
            email: editing.email ?? "",
            organization: editing.organization ?? "",
            role_category: (editing.role_category ?? "festival") as Category,
          }}
          onSubmit={(form) => {
            saveMutation.mutate(
              { id: editing.id, patch: { ...form } as Partial<Contact> },
              { onSuccess: () => setEditing(null) },
            );
          }}
          submitting={saveMutation.isPending}
        />
      )}

      {/* Add modal */}
      {adding && (
        <ContactDialog
          open={!!adding}
          onOpenChange={(o) => !o && setAdding(null)}
          title="Add contact"
          initial={emptyForm(adding)}
          onSubmit={(form) => addMutation.mutate(form)}
          submitting={addMutation.isPending}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleting?.full_name} from this festival's contacts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMutation.mutate(deleting.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ContactCard({
  contact, onEdit, onDelete,
}: { contact: Contact; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="group relative rounded-lg border p-3 mb-2 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{contact.full_name}</div>
          {contact.role && <div className="text-xs italic text-muted-foreground truncate">{contact.role}</div>}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={onEdit} className="p-1 rounded hover:bg-muted" aria-label="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-destructive" aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary">
            <Phone className="h-3 w-3" /> {contact.phone}
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary truncate">
            <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{contact.email}</span>
          </a>
        )}
        {contact.organization && (
          <div className="text-xs text-muted-foreground truncate">{contact.organization}</div>
        )}
      </div>
    </div>
  );
}

function ContactDialog({
  open, onOpenChange, title, initial, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial: FormState;
  onSubmit: (form: FormState) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const upd = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={form.full_name} onChange={upd("full_name")} />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={form.role} onChange={upd("role")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={upd("phone")} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={upd("email")} />
            </div>
          </div>
          <div>
            <Label>Organization</Label>
            <Input value={form.organization} onChange={upd("organization")} />
          </div>
          <div>
            <Label>Category</Label>
            <Select
              value={form.role_category}
              onValueChange={(v) => setForm((f) => ({ ...f, role_category: v as Category }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="festival">Festival</SelectItem>
                <SelectItem value="setup">Setup team</SelectItem>
                <SelectItem value="concept">Concept team</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit(form)} disabled={!form.full_name || submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
