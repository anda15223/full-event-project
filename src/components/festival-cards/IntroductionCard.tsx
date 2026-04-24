import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
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
  is_driver: boolean;
  needs_accommodation: boolean;
  order_index: number;
  created_at: string;
};

type Festival = {
  id: string;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  organiser_name: string | null;
  organiser_phone: string | null;
  organiser_email: string | null;
};

type BrainEntry = {
  id: string;
  festival_id: string | null;
  display_name: string | null;
  key_name: string;
  content: string;
  structured_data: any;
  is_active: boolean | null;
  created_at: string;
};

type Prefill = {
  name?: string;
  phone?: string;
  email?: string;
  isCrew?: "yes" | "no";
} | null;

const PHONE_RE = /(\+?\d[\d\s\-().]{6,}\d)/;
const EMAIL_RE = /([^\s<>"']+@[^\s<>"']+\.[^\s<>"']+)/;

const PHONE_KEYS = ["phone", "phone_number", "phonenumber", "tel", "telephone", "mobile", "mobile_number", "cell"];
const EMAIL_KEYS = ["email", "e-mail", "email_address", "emailaddress", "mail"];
const NAME_KEYS = ["name", "contact_name", "full_name", "fullname", "contact", "person"];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

/**
 * Walk a JSON tree, calling visit(key, value) for every leaf string value.
 * key is the (lowercased) leaf key; for array items the parent key is reused.
 */
function walkLeaves(node: any, visit: (key: string, value: string) => void, parentKey = ""): void {
  if (node == null) return;
  if (typeof node === "string") {
    visit(parentKey.toLowerCase(), node);
    return;
  }
  if (typeof node === "number" || typeof node === "boolean") {
    visit(parentKey.toLowerCase(), String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkLeaves(item, visit, parentKey);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walkLeaves(v, visit, k);
  }
}

function parseStructured(sd: any): any {
  if (sd == null) return null;
  if (typeof sd === "string") {
    try { return JSON.parse(sd); } catch { return sd; }
  }
  return sd;
}

function findByKey(sd: any, keyList: string[]): string | undefined {
  let found: string | undefined;
  walkLeaves(sd, (k, v) => {
    if (found) return;
    if (keyList.includes(k) && v && v.trim()) found = v.trim();
  });
  return found;
}

function findByPattern(sd: any, re: RegExp): string | undefined {
  let found: string | undefined;
  walkLeaves(sd, (_k, v) => {
    if (found) return;
    const m = v.match(re);
    if (m?.[1]) found = m[1].trim();
  });
  return found;
}

function guessNameFromBrain(b: BrainEntry): string {
  if (b.display_name && b.display_name.trim()) return b.display_name.trim();

  const sd = parseStructured(b.structured_data);
  const sdName = findByKey(sd, NAME_KEYS);
  if (sdName) return sdName.slice(0, 80);

  const content = b.content ?? "";
  if (EMAIL_RE.test(content)) {
    const fromMatch = content.match(/(?:from|fra|de la)\s*[:\-]?\s*([^\n<]+?)\s*<[^>]+>/i);
    if (fromMatch?.[1]) return fromMatch[1].trim().slice(0, 80);
    const angleMatch = content.match(/^([^<\n]+?)\s*<[^>]+>/);
    if (angleMatch?.[1]) return angleMatch[1].trim().slice(0, 80);
  }

  const firstLine = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (firstLine) return firstLine.slice(0, 80);

  return b.key_name;
}

function extractContact(b: BrainEntry): { phone?: string; email?: string } {
  const content = b.content ?? "";
  const sd = parseStructured(b.structured_data);

  // PHONE: structured key → content regex → recursive structured pattern
  let phone =
    findByKey(sd, PHONE_KEYS) ??
    content.match(PHONE_RE)?.[1] ??
    findByPattern(sd, PHONE_RE);

  // EMAIL: structured key → content regex → recursive structured pattern
  let email =
    findByKey(sd, EMAIL_KEYS) ??
    content.match(EMAIL_RE)?.[1] ??
    findByPattern(sd, EMAIL_RE);

  return {
    phone: phone?.trim(),
    email: email?.trim().toLowerCase(),
  };
}

function normPhone(p: string | null | undefined): string {
  return (p ?? "").replace(/[^\d+]/g, "");
}

export function IntroductionCard({ festivalId }: Props) {
  const qc = useQueryClient();
  const [prefill, setPrefill] = useState<Prefill>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const { data: festival } = useQuery({
    queryKey: ["festival_intro", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals")
        .select(
          "id, name, location, start_date, end_date, organiser_name, organiser_phone, organiser_email",
        )
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
        .from("personal_festival_db")
        .select("*")
        .eq("festival_id", festivalId)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Person[];
    },
  });

  const { data: brainEntries = [] } = useQuery({
    queryKey: ["brain_entries_intro", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_entries")
        .select("id, festival_id, display_name, key_name, content, structured_data, is_active")
        .eq("festival_id", festivalId)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as BrainEntry[];
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

  const focusForm = () => {
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const handlePromote = (b: BrainEntry) => {
    const { phone, email } = extractContact(b);
    setPrefill({
      name: guessNameFromBrain(b),
      phone,
      email,
      isCrew: "no",
    });
    focusForm();
  };

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
            <Label className="text-[11px] text-muted-foreground">Location</Label>
            <EditableField
              value={festival?.location ?? ""}
              onChange={(v) => updateFestival({ location: v || null })}
              placeholder="Add location"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Start date</Label>
            <div className="px-2 py-1 text-sm">{fmtDate(festival?.start_date ?? null)}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">End date</Label>
            <div className="px-2 py-1 text-sm">{fmtDate(festival?.end_date ?? null)}</div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Organiser name</Label>
            <EditableField
              value={festival?.organiser_name ?? ""}
              onChange={(v) => updateFestival({ organiser_name: v || null })}
              placeholder="Add organiser name"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Organiser phone</Label>
            <EditableField
              value={festival?.organiser_phone ?? ""}
              onChange={(v) => updateFestival({ organiser_phone: v || null })}
              placeholder="Add organiser phone"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-[11px] text-muted-foreground">Organiser email</Label>
            <EditableField
              value={festival?.organiser_email ?? ""}
              onChange={(v) => updateFestival({ organiser_email: v || null })}
              placeholder="Add organiser email"
            />
          </div>
        </div>
      </Card>

      {/* Brain suggestions */}
      <BrainSuggestions
        entries={brainEntries}
        people={people}
        onPromote={handlePromote}
      />

      {/* Add person */}
      <div ref={formRef}>
        <AddPersonForm
          festivalId={festivalId}
          people={people}
          prefill={prefill}
          onConsumePrefill={() => setPrefill(null)}
        />
      </div>

      {/* People grouped */}
      <PeopleGroup
        title="Crew Members"
        icon={<Users className="h-3.5 w-3.5" />}
        people={crew}
        festivalId={festivalId}
        showCrewToggles
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

function BrainSuggestions({
  entries,
  people,
  onPromote,
}: {
  entries: BrainEntry[];
  people: Person[];
  onPromote: (b: BrainEntry) => void;
}) {
  const existingPhones = useMemo(
    () => new Set(people.map((p) => normPhone(p.phone)).filter(Boolean)),
    [people],
  );
  const existingEmails = useMemo(
    () => new Set(people.map((p) => (p.email ?? "").toLowerCase().trim()).filter(Boolean)),
    [people],
  );

  const suggestions = useMemo(() => {
    return entries
      .slice()
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .map((b) => {
        const c = extractContact(b);
        if (!c.phone && !c.email) return null;
        const alreadyAdded =
          (c.phone && existingPhones.has(normPhone(c.phone))) ||
          (c.email && existingEmails.has(c.email));
        return {
          entry: b,
          name: guessNameFromBrain(b),
          phone: c.phone,
          email: c.email,
          alreadyAdded: !!alreadyAdded,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [entries, existingPhones, existingEmails]);

  if (suggestions.length === 0) return null;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[14px] font-semibold">Brain suggestions</h3>
        <Badge variant="secondary" className="text-[10px]">
          {suggestions.length}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Contacts the AI extracted from emails for this festival. Promote them to your people directory.
      </p>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <div
            key={s.entry.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3 bg-background"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="text-[13px] font-medium truncate">{s.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {[s.phone, s.email].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Button
              size="sm"
              variant={s.alreadyAdded ? "outline" : "default"}
              className="h-8 shrink-0"
              disabled={s.alreadyAdded}
              onClick={() => onPromote(s.entry)}
            >
              {s.alreadyAdded ? "Already added" : "Promote to contact"}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AddPersonForm({
  festivalId,
  people,
  prefill,
  onConsumePrefill,
}: {
  festivalId: string;
  people: Person[];
  prefill: Prefill;
  onConsumePrefill: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isCrew, setIsCrew] = useState<"yes" | "no">("no");
  const [isDriver, setIsDriver] = useState(false);
  const [needsAccommodation, setNeedsAccommodation] = useState(false);
  const [saving, setSaving] = useState(false);
  const consumedRef = useRef<Prefill>(null);

  // Apply prefill once when it arrives
  if (prefill && consumedRef.current !== prefill) {
    consumedRef.current = prefill;
    if (prefill.name !== undefined) setName(prefill.name ?? "");
    if (prefill.phone !== undefined) setPhone(prefill.phone ?? "");
    if (prefill.email !== undefined) setEmail(prefill.email ?? "");
    if (prefill.isCrew !== undefined) setIsCrew(prefill.isCrew);
  }

  const reset = () => {
    setName("");
    setRole("");
    setPhone("");
    setEmail("");
    setNotes("");
    setIsCrew("no");
    setIsDriver(false);
    setNeedsAccommodation(false);
    consumedRef.current = null;
    onConsumePrefill();
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const crewFlag = isCrew === "yes";
    const sameBucket = people.filter((p) => p.is_crew === crewFlag);
    const nextOrder = sameBucket.length
      ? Math.max(...sameBucket.map((p) => p.order_index ?? 0)) + 1
      : 0;

    const { error } = await supabase.from("personal_festival_db").insert({
      festival_id: festivalId,
      name: name.trim(),
      role: role.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
      is_crew: crewFlag,
      is_driver: crewFlag ? isDriver : false,
      needs_accommodation: crewFlag ? needsAccommodation : false,
      order_index: nextOrder,
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
          <Label className="text-[11px] text-muted-foreground">Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
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

        {isCrew === "yes" && (
          <div className="col-span-2 flex flex-wrap items-center gap-4 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <label className="flex items-center gap-2 text-[12px] cursor-pointer">
              <Checkbox
                checked={isDriver}
                onCheckedChange={(v) => setIsDriver(v === true)}
              />
              <span>Driver</span>
            </label>
            <label className="flex items-center gap-2 text-[12px] cursor-pointer">
              <Checkbox
                checked={needsAccommodation}
                onCheckedChange={(v) => setNeedsAccommodation(v === true)}
              />
              <span>Needs accommodation</span>
            </label>
          </div>
        )}
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
  showCrewToggles = false,
}: {
  title: string;
  icon: React.ReactNode;
  people: Person[];
  festivalId: string;
  showCrewToggles?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(people.length > 0);

  const updatePerson = async (id: string, patch: Partial<Person>) => {
    const { error } = await supabase
      .from("personal_festival_db")
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
      .from("personal_festival_db")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Delete failed");
      return;
    }
    qc.invalidateQueries({ queryKey: ["personal_festival_db", festivalId] });
  };

  return (
    <Card className="p-5">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2">
              {icon}
              <h3 className="text-[14px] font-semibold">{title}</h3>
              <Badge variant="secondary" className="text-[10px]">
                {people.length}
              </Badge>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-3">
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
                      <Label className="text-[11px] text-muted-foreground">Notes</Label>
                      <EditableField
                        value={p.notes ?? ""}
                        onChange={(v) => updatePerson(p.id, { notes: v || null })}
                        placeholder="Add notes"
                      />
                    </div>

                    {showCrewToggles && p.is_crew && (
                      <div className="col-span-2 flex flex-wrap items-center gap-4 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                        <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                          <Checkbox
                            checked={p.is_driver}
                            onCheckedChange={(v) =>
                              updatePerson(p.id, { is_driver: v === true })
                            }
                          />
                          <span>Driver</span>
                        </label>
                        <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                          <Checkbox
                            checked={p.needs_accommodation}
                            onCheckedChange={(v) =>
                              updatePerson(p.id, { needs_accommodation: v === true })
                            }
                          />
                          <span>Needs accommodation</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default IntroductionCard;
