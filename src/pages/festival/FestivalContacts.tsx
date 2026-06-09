import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateRange } from "@/lib/dateFormat";
import {
  Plus, Mail, Phone, Pencil, Trash2, Star, Building2, Copy, FileDown, ArrowLeft, Users,
} from "lucide-react";
import { ImportFromPreviousCard, CARD_TABLES } from "@/components/festival/ImportFromPreviousCard";
import { useDraftMode } from "@/hooks/useDraftMode";
import { FestivalBackBar } from "@/components/festival/FestivalBackBar";

type Category = "festival" | "setup" | "concept" | "uncategorized";

interface Contact {
  id: string;
  festival_id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  is_primary: boolean;
  contact_type: string | null;
  role_category: Category | null;
  notes: string | null;
  last_contact_date: string | null;
}

interface Festival { id: string; name: string; slug: string; start_date: string; end_date: string; }

const CATEGORY_LABEL: Record<Category, string> = {
  festival: "Festival",
  setup: "Setup team",
  concept: "Concept team",
  uncategorized: "Uncategorized",
};
const CATEGORY_DOT: Record<Category, string> = {
  festival: "bg-blue-500",
  setup: "bg-orange-500",
  concept: "bg-green-500",
  uncategorized: "bg-muted-foreground",
};
const CATEGORY_AVATAR: Record<Category, string> = {
  festival: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  setup: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  concept: "bg-green-500/15 text-green-700 dark:text-green-300",
  uncategorized: "bg-muted text-muted-foreground",
};


function initials(name: string) {
  return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
}

function dedupKey(c: { email: string | null; full_name: string; organization: string | null }) {
  if (c.email && c.email.trim()) return "e:" + c.email.trim().toLowerCase();
  return "n:" + c.full_name.trim().toLowerCase() + "|" + (c.organization ?? "").trim().toLowerCase();
}

export default function FestivalContacts() {
  const { draftMode } = useDraftMode();
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: festival } = useQuery({
    queryKey: ["festival-by-slug", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals").select("id, name, slug, start_date, end_date")
        .eq("slug", slug!).maybeSingle();
      if (error) throw error;
      return data as Festival | null;
    },
    enabled: !!slug,
  });

  const festivalId = festival?.id ?? null;

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["festival-contacts-all", festivalId, draftMode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contacts")
        .select("id, festival_id, full_name, role, email, phone, organization, is_primary, contact_type, notes, last_contact_date")
        .eq("festival_id", festivalId!)
        .eq("is_draft", draftMode)
        .order("is_primary", { ascending: false })
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
    enabled: !!festivalId,
  });

  const { data: aggregated = [] } = useQuery({
    queryKey: ["festival-contacts-aggregated"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("festival_contacts_aggregated").select("*");
      if (error) throw error;
      return data as any[];
    },
  });

  const aggMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of aggregated) m.set(a.dedup_key, a);
    return m;
  }, [aggregated]);

  // Realtime
  useEffect(() => {
    if (!festivalId) return;
    const ch = supabase.channel(`contacts-${festivalId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_contacts", filter: `festival_id=eq.${festivalId}` },
        () => qc.invalidateQueries({ queryKey: ["festival-contacts-all", festivalId, draftMode] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [festivalId, qc]);

  const grouped = useMemo(() => {
    const primaries = contacts.filter(c => c.is_primary);
    const byCategory: Record<Category, Contact[]> = {
      festival: [], setup: [], concept: [], uncategorized: [],
    };
    for (const c of contacts) {
      if (c.is_primary) continue;
      const cat: Category = (c.role_category as Category) || "uncategorized";
      byCategory[cat in byCategory ? cat : "uncategorized"].push(c);
    }
    return { primaries, byCategory };
  }, [contacts]);


  const [editing, setEditing] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [crossFestKey, setCrossFestKey] = useState<string | null>(null);

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["festival-contacts-all", festivalId, draftMode] });
      qc.invalidateQueries({ queryKey: ["festival-contacts-aggregated"] });
      toast.success("Contact deleted");
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  if (!festival) {
    return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;
  }

  const totalCount = contacts.length;

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-6">
      <FestivalBackBar />
      <ImportFromPreviousCard
        cardLabel="contacts"
        tables={CARD_TABLES.contacts}
        currentFestivalId={festivalId ?? ""}
        onCommitted={() => window.location.reload()}
      />
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to={`/festivals/${slug}`} className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to festival
          </Link>
          <h1 className="font-heading text-3xl font-bold tracking-tight mt-1">{festival.name} — Contacts</h1>
          <div className="text-sm text-muted-foreground">
            {formatDateRange(festival.start_date, festival.end_date)} · {totalCount} {totalCount === 1 ? "contact" : "contacts"}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/festivals/${slug}/contacts/export`} target="_blank">
              <FileDown className="h-4 w-4 mr-1" /> PDF
            </Link>
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add contact
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : totalCount === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center space-y-3">
          <Users className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">No contacts at this festival yet. Add the festival organizer to start.</p>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add contact
          </Button>
        </div>
      ) : (
        <Accordion type="multiple" defaultValue={["primary", "festival", "setup", "concept", "uncategorized"]} className="space-y-3">
          {grouped.primaries.length > 0 && (
            <Section
              value="primary"
              title="Primary contacts"
              dot="bg-yellow-500"
              count={grouped.primaries.length}
              icon={<Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />}
            >
              {grouped.primaries.map(c => (
                <ContactCard
                  key={c.id} c={c} large
                  agg={aggMap.get(dedupKey(c))}
                  currentSlug={slug!}
                  onEdit={() => setEditing(c)}
                  onDelete={() => setDeleteId(c.id)}
                  onShowCross={() => setCrossFestKey(dedupKey(c))}
                />
              ))}
            </Section>
          )}
          {(["festival", "setup", "concept", "uncategorized"] as Category[]).map(t => {
            const items = grouped.byCategory[t];
            if (items.length === 0) return null;
            return (
              <Section key={t} value={t} title={CATEGORY_LABEL[t]} dot={CATEGORY_DOT[t]} count={items.length}>
                {items.map(c => (
                  <ContactCard
                    key={c.id} c={c}
                    agg={aggMap.get(dedupKey(c))}
                    currentSlug={slug!}
                    onEdit={() => setEditing(c)}
                    onDelete={() => setDeleteId(c.id)}
                    onShowCross={() => setCrossFestKey(dedupKey(c))}
                  />
                ))}
              </Section>
            );
          })}
        </Accordion>
      )}

      {/* Edit/Create drawer */}
      <ContactDrawer
        open={creating || !!editing}
        onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}
        contact={editing}
        festivalId={festivalId}
        aggMap={aggMap}
        aggregated={aggregated}
        existingDedupKeys={new Set(contacts.map(dedupKey))}
        existingPrimaryByType={grouped}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["festival-contacts-all", festivalId, draftMode] });
          qc.invalidateQueries({ queryKey: ["festival-contacts-aggregated"] });
          setCreating(false); setEditing(null);
        }}
      />

      {/* Cross-festival drawer */}
      <CrossFestivalDrawer
        open={!!crossFestKey}
        onOpenChange={(o) => { if (!o) setCrossFestKey(null); }}
        agg={crossFestKey ? aggMap.get(crossFestKey) : null}
        currentSlug={slug!}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contact?</AlertDialogTitle>
            <AlertDialogDescription>Removes the contact from this festival only.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteContact.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Section accordion ----------

function Section({
  value, title, dot, count, icon, children,
}: { value: string; title: string; dot: string; count: number; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <AccordionItem value={value} className="rounded-lg border bg-card px-4">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3">
          <span className={cn("h-2.5 w-2.5 rounded-full", dot)} />
          <span className="font-heading font-semibold">{title}</span>
          <Badge variant="secondary" className="ml-1">{count}</Badge>
          {icon}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3 pt-1 pb-2">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ---------- Contact card ----------

function ContactCard({
  c, agg, currentSlug, large = false, onEdit, onDelete, onShowCross,
}: {
  c: Contact; agg?: any; currentSlug: string; large?: boolean;
  onEdit: () => void; onDelete: () => void; onShowCross: () => void;
}) {
  const otherCount = agg ? Math.max(0, (agg.festival_count ?? 1) - 1) : 0;
  const [notesOpen, setNotesOpen] = useState(false);

  const copy = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt).then(() => toast.success(`${label} copied`));
  };

  return (
    <div className={cn("rounded-md border bg-background p-3 flex gap-3", large && "border-yellow-500/40 bg-yellow-50/30 dark:bg-yellow-500/5")}>
      <div className={cn(
        "shrink-0 rounded-full font-semibold flex items-center justify-center",
        large ? "h-12 w-12 text-base" : "h-10 w-10 text-sm",
        CATEGORY_AVATAR[(c.role_category as Category) || "uncategorized"],
      )}>

        {initials(c.full_name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className={cn("font-semibold", large ? "text-base" : "text-sm")}>{c.full_name}</div>
          {c.is_primary && <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />}
          {otherCount > 0 && (
            <button
              onClick={onShowCross}
              className="text-[10px] uppercase tracking-wide rounded-full border px-2 py-0.5 hover:bg-muted"
            >
              Appears at {otherCount} other {otherCount === 1 ? "festival" : "festivals"}
            </button>
          )}
        </div>
        {c.role && <div className="text-xs text-muted-foreground">{c.role}</div>}
        {c.organization && (
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5">
            <Building2 className="h-3 w-3" /> {c.organization}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {c.email && (
            <span className="inline-flex items-center gap-1">
              <a href={`mailto:${c.email}`} className="text-primary hover:underline inline-flex items-center gap-1">
                <Mail className="h-3 w-3" /> {c.email}
              </a>
              <button onClick={() => copy(c.email!, "Email")} className="text-muted-foreground hover:text-foreground">
                <Copy className="h-3 w-3" />
              </button>
            </span>
          )}
          {c.phone && (
            <span className="inline-flex items-center gap-1">
              <a href={`tel:${c.phone}`} className="text-primary hover:underline inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {c.phone}
              </a>
              <button onClick={() => copy(c.phone!, "Phone")} className="text-muted-foreground hover:text-foreground">
                <Copy className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
        {c.last_contact_date && (
          <div className="text-[11px] text-muted-foreground mt-1">
            Last contact: {new Date(c.last_contact_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        )}
        {c.notes && (
          <div
            className={cn("text-xs italic text-muted-foreground mt-1.5 cursor-pointer", !notesOpen && "line-clamp-3")}
            onClick={() => setNotesOpen(o => !o)}
            title={notesOpen ? "Click to collapse" : "Click to expand"}
          >
            {c.notes}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete} title="Delete">
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// ---------- Edit/create drawer ----------

function ContactDrawer({
  open, onOpenChange, contact, festivalId, aggMap, aggregated, existingDedupKeys, existingPrimaryByType, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contact: Contact | null;
  festivalId: string | null;
  aggMap: Map<string, any>;
  aggregated: any[];
  existingDedupKeys: Set<string>;
  existingPrimaryByType: { primaries: Contact[]; byType: Record<ContactType, Contact[]> };
  onSaved: () => void;
}) {
  const isEdit = !!contact;
  const [mode, setMode] = useState<"new" | "pick">("new");
  const [pickSearch, setPickSearch] = useState("");
  const [form, setForm] = useState({
    full_name: "", role: "", email: "", phone: "", organization: "",
    contact_type: "festival_organizer" as ContactType,
    is_primary: false, notes: "", last_contact_date: "",
    update_across_all: false,
  });

  useEffect(() => {
    if (!open) return;
    setMode(contact ? "new" : "new");
    setPickSearch("");
    if (contact) {
      setForm({
        full_name: contact.full_name, role: contact.role || "",
        email: contact.email || "", phone: contact.phone || "",
        organization: contact.organization || "",
        contact_type: contact.contact_type, is_primary: contact.is_primary,
        notes: contact.notes || "",
        last_contact_date: contact.last_contact_date || "",
        update_across_all: false,
      });
    } else {
      setForm({
        full_name: "", role: "", email: "", phone: "", organization: "",
        contact_type: "festival_organizer", is_primary: false, notes: "",
        last_contact_date: "", update_across_all: false,
      });
    }
  }, [open, contact]);

  // Filter aggregated contacts that aren't already on this festival
  const pickCandidates = useMemo(() => {
    if (isEdit) return [];
    const q = pickSearch.trim().toLowerCase();
    return (aggregated ?? [])
      .filter((a: any) => !existingDedupKeys.has(a.dedup_key))
      .filter((a: any) => {
        if (!q) return true;
        return (
          (a.canonical_name || "").toLowerCase().includes(q) ||
          (a.email || "").toLowerCase().includes(q) ||
          (a.organization || "").toLowerCase().includes(q) ||
          (a.role || "").toLowerCase().includes(q)
        );
      })
      .sort((a: any, b: any) => (b.festival_count ?? 0) - (a.festival_count ?? 0))
      .slice(0, 50);
  }, [aggregated, pickSearch, existingDedupKeys, isEdit]);

  const choosePick = (a: any) => {
    setForm({
      full_name: a.canonical_name || "",
      role: a.role || "",
      email: a.email || "",
      phone: a.phone || "",
      organization: a.organization || "",
      contact_type: (a.contact_type as ContactType) || "festival_organizer",
      is_primary: false,
      notes: "",
      last_contact_date: "",
      update_across_all: false,
    });
    setMode("new");
  };

  const agg = useMemo(() => {
    const k = dedupKey({ email: form.email || null, full_name: form.full_name, organization: form.organization || null });
    return aggMap.get(k);
  }, [form.email, form.full_name, form.organization, aggMap]);

  const otherCount = agg ? Math.max(0, (agg.festival_count ?? 1) - (isEdit ? 1 : 0)) : 0;

  const duplicatePrimaryWarn = useMemo(() => {
    if (!form.is_primary) return false;
    const existingPrimary = existingPrimaryByType.primaries.find(
      p => p.contact_type === form.contact_type && p.id !== contact?.id
    );
    return !!existingPrimary;
  }, [form.is_primary, form.contact_type, existingPrimaryByType, contact]);

  const save = useMutation({
    mutationFn: async () => {
      if (!festivalId) throw new Error("No festival");
      const payload: any = {
        festival_id: festivalId,
        full_name: form.full_name,
        role: form.role || "",
        email: form.email || null,
        phone: form.phone || null,
        organization: form.organization || null,
        contact_type: form.contact_type,
        is_primary: form.is_primary,
        notes: form.notes || null,
        last_contact_date: form.last_contact_date || null,
      };
      if (isEdit && contact) {
        const { error } = await supabase.from("festival_contacts").update(payload).eq("id", contact.id);
        if (error) throw error;

        // Cross-festival update of contact details
        if (form.update_across_all && agg?.festival_ids?.length > 1) {
          const otherIds = (agg.festival_ids as string[]).filter(fid => fid !== festivalId);
          // Match all rows for this person at other festivals via dedup logic
          const { data: matches, error: e2 } = await supabase
            .from("festival_contacts")
            .select("id, email, full_name, organization, festival_id")
            .in("festival_id", otherIds);
          if (e2) throw e2;
          const targetKey = dedupKey({ email: contact.email, full_name: contact.full_name, organization: contact.organization });
          const ids = (matches ?? []).filter(m => dedupKey(m as any) === targetKey).map(m => m.id);
          if (ids.length > 0) {
            const { error: e3 } = await supabase
              .from("festival_contacts")
              .update({
                email: form.email || null,
                phone: form.phone || null,
                organization: form.organization || null,
                notes: form.notes || null,
              })
              .in("id", ids);
            if (e3) throw e3;
          }
        }
      } else {
        const { error } = await supabase.from("festival_contacts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Contact updated" : "Contact added");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit contact" : "Add contact"}</SheetTitle>
        </SheetHeader>
        {!isEdit && (
          <div className="mt-3 inline-flex rounded-md border p-0.5 bg-muted/40">
            <button
              type="button"
              onClick={() => setMode("new")}
              className={cn(
                "px-3 py-1 text-xs rounded-sm transition-colors",
                mode === "new" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Create new
            </button>
            <button
              type="button"
              onClick={() => setMode("pick")}
              className={cn(
                "px-3 py-1 text-xs rounded-sm transition-colors",
                mode === "pick" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              From contact book
            </button>
          </div>
        )}
        {!isEdit && mode === "pick" ? (
          <div className="space-y-3 py-4">
            <Input
              autoFocus
              value={pickSearch}
              onChange={(e) => setPickSearch(e.target.value)}
              placeholder="Search name, email, organization, role…"
            />
            {pickCandidates.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                {aggregated.length === 0
                  ? "No contacts in the contact book yet."
                  : "No matching contacts (people already on this festival are hidden)."}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
                {pickCandidates.map((a: any) => (
                  <button
                    key={a.dedup_key}
                    type="button"
                    onClick={() => choosePick(a)}
                    className="w-full text-left rounded-md border bg-background p-2.5 hover:bg-muted/50 transition-colors flex items-start gap-2.5"
                  >
                    <div className={cn(
                      "shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold",
                      TYPE_AVATAR[(a.contact_type as ContactType) || "festival_organizer"],
                    )}>
                      {initials(a.canonical_name || "?")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">{a.canonical_name}</span>
                        {a.festival_count > 1 && (
                          <span className="text-[10px] uppercase tracking-wide rounded-full border px-1.5 py-0.5 text-muted-foreground">
                            {a.festival_count} festivals
                          </span>
                        )}
                      </div>
                      {(a.role || a.organization) && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {[a.role, a.organization].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {a.email && (
                        <div className="text-[11px] text-muted-foreground truncate">{a.email}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Pick a contact to copy their details into this festival — you can adjust before saving.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-4">
          <div>
            <Label>Name *</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. F&B Director" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Organization</Label>
            <Input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
          </div>
          <div>
            <Label>Contact type</Label>
            <Select value={form.contact_type} onValueChange={(v) => setForm({ ...form, contact_type: v as ContactType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABEL) as ContactType[]).map(t => (
                  <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Last contact date</Label>
            <Input type="date" value={form.last_contact_date} onChange={(e) => setForm({ ...form, last_contact_date: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_primary} onCheckedChange={(c) => setForm({ ...form, is_primary: !!c })} />
            Primary contact
          </label>
          {duplicatePrimaryWarn && (
            <p className="text-xs text-amber-600">⚠️ Another primary contact already exists for {TYPE_LABEL[form.contact_type]}.</p>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {isEdit && otherCount > 0 && (
            <label className="flex items-start gap-2 text-sm rounded-md border p-2 bg-muted/30">
              <Checkbox checked={form.update_across_all} onCheckedChange={(c) => setForm({ ...form, update_across_all: !!c })} className="mt-0.5" />
              <span>
                Update email / phone / organization / notes for this person across all {otherCount + 1} festivals where they appear.
              </span>
            </label>
          )}
          </div>
        )}
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!form.full_name || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Cross-festival drawer ----------

function CrossFestivalDrawer({
  open, onOpenChange, agg, currentSlug,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; agg: any | null; currentSlug: string;
}) {
  const { data: festivals = [] } = useQuery({
    queryKey: ["festivals-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals").select("id, name, slug, start_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useMemo(() => {
    if (!agg?.festival_ids) return [];
    return (festivals as any[])
      .filter(f => agg.festival_ids.includes(f.id))
      .map(f => ({
        ...f,
        days: Math.ceil((new Date(f.start_date).getTime() - Date.now()) / 86400000),
      }))
      .sort((a, b) => a.days - b.days);
  }, [agg, festivals]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{agg?.canonical_name ?? "Contact"}</SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Appears at {agg?.festival_count ?? 0} festivals:
          </p>
          {items.map(f => (
            <Link
              key={f.id}
              to={`/festivals/${f.slug}/contacts`}
              onClick={() => onOpenChange(false)}
              className={cn(
                "flex items-center justify-between rounded-md border p-2 hover:bg-muted",
                f.slug === currentSlug && "bg-primary/5 border-primary/40",
              )}
            >
              <span className="text-sm font-medium">{f.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {f.days < 0 ? `${Math.abs(f.days)}d ago` : f.days === 0 ? "Today" : `in ${f.days}d`}
              </span>
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
