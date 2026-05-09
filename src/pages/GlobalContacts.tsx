import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Search, Mail, Phone, Copy, Star, Building2, Users, AlertTriangle, Trophy, RefreshCw,
} from "lucide-react";

type ContactType = "festival_organizer" | "operator" | "internal" | "supplier";

interface AggContact {
  dedup_key: string;
  canonical_name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  role: string | null;
  contact_type: ContactType;
  festival_count: number;
  festival_slugs: string[] | null;
  festival_names: string[] | null;
  festival_ids: string[] | null;
  is_primary_at_any: boolean;
  notes_combined: string | null;
}

interface RawRow {
  id: string; festival_id: string; full_name: string;
  email: string | null; phone: string | null; organization: string | null;
  is_primary: boolean; contact_type: ContactType; role: string;
}

interface FestivalLite { id: string; name: string; slug: string; start_date: string; }

const TYPE_LABEL: Record<ContactType, string> = {
  festival_organizer: "Organizers",
  operator: "Operators",
  internal: "Internal",
  supplier: "Suppliers",
};
const TYPE_AVATAR: Record<ContactType, string> = {
  festival_organizer: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  operator: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  internal: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  supplier: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

function initials(n: string) {
  return n.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
}
function dedupKey(c: { email: string | null; full_name: string; organization: string | null }) {
  if (c.email && c.email.trim()) return "e:" + c.email.trim().toLowerCase();
  return "n:" + c.full_name.trim().toLowerCase() + "|" + (c.organization ?? "").trim().toLowerCase();
}
function countdownClass(days: number) {
  if (days < 0) return "bg-muted text-muted-foreground";
  if (days <= 14) return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (days <= 45) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
}

export default function GlobalContacts() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const view = (searchParams.get("view") === "org" ? "org" : "person") as "person" | "org";
  const typeFilter = (searchParams.get("type") || "all") as ContactType | "all";
  const festivalFilter = searchParams.get("festival") || "";
  const orgFilter = searchParams.get("org") || "";
  const crossOnly = searchParams.get("cross_only") === "true";
  const search = searchParams.get("q") || "";
  const highlightId = searchParams.get("contact");
  const [sortBy, setSortBy] = useState<"festivals" | "alpha" | "type">("festivals");

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!v) next.delete(k); else next.set(k, v);
    setSearchParams(next, { replace: true });
  };

  const { data: aggregated = [], isLoading } = useQuery({
    queryKey: ["contacts-aggregated"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("festival_contacts_aggregated").select("*");
      if (error) throw error;
      return data as AggContact[];
    },
  });

  const { data: rawRows = [] } = useQuery({
    queryKey: ["contacts-raw"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_contacts")
        .select("id, festival_id, full_name, email, phone, organization, is_primary, contact_type, role");
      if (error) throw error;
      return (data ?? []) as RawRow[];
    },
  });

  const { data: festivals = [] } = useQuery({
    queryKey: ["festivals-min-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festivals").select("id, name, slug, start_date").order("start_date");
      if (error) throw error;
      return (data ?? []) as FestivalLite[];
    },
  });

  // Realtime — recompute on contact changes
  useEffect(() => {
    const ch = supabase.channel("contacts-master")
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_contacts" }, () => {
        qc.invalidateQueries({ queryKey: ["contacts-aggregated"] });
        qc.invalidateQueries({ queryKey: ["contacts-raw"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const festById = useMemo(() => {
    const m = new Map<string, FestivalLite>();
    festivals.forEach(f => m.set(f.id, f));
    return m;
  }, [festivals]);

  // Detect inconsistent data: same dedup_key with differing emails / phones across rows
  const inconsistent = useMemo(() => {
    const byKey = new Map<string, Set<string>>();
    const byKeyPhone = new Map<string, Set<string>>();
    for (const r of rawRows) {
      const k = dedupKey({ email: r.email, full_name: r.full_name, organization: r.organization });
      if (r.email) {
        if (!byKey.has(k)) byKey.set(k, new Set());
        byKey.get(k)!.add(r.email.trim().toLowerCase());
      }
      if (r.phone) {
        if (!byKeyPhone.has(k)) byKeyPhone.set(k, new Set());
        byKeyPhone.get(k)!.add(r.phone.replace(/\s+/g, ""));
      }
    }
    const set = new Set<string>();
    byKey.forEach((v, k) => { if (v.size > 1) set.add(k); });
    byKeyPhone.forEach((v, k) => { if (v.size > 1) set.add(k); });
    return set;
  }, [rawRows]);

  const filtered = useMemo(() => {
    let list = [...aggregated];
    if (typeFilter !== "all") list = list.filter(a => a.contact_type === typeFilter);
    if (festivalFilter) list = list.filter(a => (a.festival_slugs ?? []).includes(festivalFilter));
    if (orgFilter) list = list.filter(a => (a.organization ?? "").toLowerCase() === orgFilter.toLowerCase());
    if (crossOnly) list = list.filter(a => a.festival_count > 1);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.canonical_name.toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q) ||
        (a.organization ?? "").toLowerCase().includes(q) ||
        (a.role ?? "").toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      if (sortBy === "alpha") return a.canonical_name.localeCompare(b.canonical_name);
      if (sortBy === "type") return a.contact_type.localeCompare(b.contact_type) || a.canonical_name.localeCompare(b.canonical_name);
      return (b.festival_count - a.festival_count) || a.canonical_name.localeCompare(b.canonical_name);
    });
    return list;
  }, [aggregated, typeFilter, festivalFilter, orgFilter, crossOnly, search, sortBy]);

  const totalUnique = aggregated.length;
  const crossCount = aggregated.filter(a => a.festival_count > 1).length;
  const topConnected = [...aggregated].sort((a, b) => b.festival_count - a.festival_count).slice(0, 3);
  const orgCounts = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of aggregated) {
      const org = a.organization || "—";
      if (!m.has(org)) m.set(org, new Set());
      (a.festival_slugs ?? []).forEach(s => m.get(org)!.add(s));
    }
    return [...m.entries()].map(([org, set]) => ({ org, festivals: set.size }))
      .sort((a, b) => b.festivals - a.festivals);
  }, [aggregated]);
  const topOrgs = orgCounts.filter(o => o.festivals > 1).slice(0, 3);

  // By organization grouping
  const byOrg = useMemo(() => {
    const m = new Map<string, AggContact[]>();
    for (const c of filtered) {
      const org = c.organization || "(no organization)";
      if (!m.has(org)) m.set(org, []);
      m.get(org)!.push(c);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const [reconcileKey, setReconcileKey] = useState<string | null>(null);

  return (
    <div className="container max-w-6xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Contacts</h1>
          <div className="text-sm text-muted-foreground">
            {totalUnique} unique people · {crossCount} appear at multiple festivals
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setParam("view", v === "org" ? "org" : null)}>
            <TabsList>
              <TabsTrigger value="person">By Person</TabsTrigger>
              <TabsTrigger value="org">By Organization</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Cross-festival highlights */}
      {!isLoading && (topConnected.length > 0 || topOrgs.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5 mb-2">
              <Trophy className="h-3.5 w-3.5" /> Most-connected contacts
            </div>
            <div className="space-y-1.5">
              {topConnected.map(c => (
                <button
                  key={c.dedup_key}
                  onClick={() => setParam("q", c.canonical_name)}
                  className="w-full flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1"
                >
                  <span className="font-medium">{c.canonical_name}</span>
                  <span className="text-xs text-muted-foreground">{c.festival_count} festivals</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5 mb-2">
              <Building2 className="h-3.5 w-3.5" /> Major operators
            </div>
            <div className="space-y-1.5">
              {topOrgs.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">No orgs span multiple festivals yet.</p>
              ) : topOrgs.map(o => (
                <button
                  key={o.org}
                  onClick={() => { setParam("org", o.org); setParam("view", "org"); }}
                  className="w-full flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1"
                >
                  <span className="font-medium">{o.org}</span>
                  <span className="text-xs text-muted-foreground">{o.festivals} festivals</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter strip */}
      <div className="rounded-lg border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "festival_organizer", "operator", "internal", "supplier"] as const).map(t => (
            <button
              key={t}
              onClick={() => setParam("type", t === "all" ? null : t)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                (typeFilter === t || (t === "all" && typeFilter === "all"))
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted",
              )}
            >
              {t === "all" ? "All types" : TYPE_LABEL[t]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={crossOnly}
                onChange={(e) => setParam("cross_only", e.target.checked ? "true" : null)}
              />
              Cross-festival only
            </label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="festivals">Most festivals first</SelectItem>
                <SelectItem value="alpha">Alphabetical</SelectItem>
                <SelectItem value="type">By type</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-60">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setParam("q", e.target.value || null)}
              placeholder="Search name / email / org / role"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Select value={festivalFilter || "__all"} onValueChange={(v) => setParam("festival", v === "__all" ? null : v)}>
            <SelectTrigger className="h-8 text-xs w-56"><SelectValue placeholder="All festivals" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All festivals</SelectItem>
              {festivals.map(f => (
                <SelectItem key={f.id} value={f.slug}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(typeFilter !== "all" || festivalFilter || orgFilter || crossOnly || search) && (
            <Button size="sm" variant="ghost" onClick={() => setSearchParams({}, { replace: true })}>Clear</Button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
          No contacts match the current filters.
        </div>
      ) : view === "person" ? (
        <div className="grid md:grid-cols-2 gap-3">
          {filtered.map(c => (
            <PersonCard
              key={c.dedup_key}
              c={c}
              festById={festById}
              isInconsistent={inconsistent.has(c.dedup_key)}
              highlight={highlightId === c.dedup_key}
              onReconcile={() => setReconcileKey(c.dedup_key)}
            />
          ))}
        </div>
      ) : (
        <Accordion type="multiple" defaultValue={byOrg.map(([o]) => o)} className="space-y-2">
          {byOrg.map(([org, items]) => (
            <AccordionItem key={org} value={org} className="rounded-lg border bg-card px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-heading font-semibold">{org}</span>
                  <Badge variant="secondary">{items.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid md:grid-cols-2 gap-3 pt-2 pb-2">
                  {items.map(c => (
                    <PersonCard
                      key={c.dedup_key}
                      c={c}
                      festById={festById}
                      isInconsistent={inconsistent.has(c.dedup_key)}
                      onReconcile={() => setReconcileKey(c.dedup_key)}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Reconcile drawer */}
      <ReconcileDrawer
        open={!!reconcileKey}
        onOpenChange={(o) => { if (!o) setReconcileKey(null); }}
        dedupKey={reconcileKey}
        rawRows={rawRows}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["contacts-raw"] });
          qc.invalidateQueries({ queryKey: ["contacts-aggregated"] });
          setReconcileKey(null);
        }}
      />
    </div>
  );
}

// ---------- Person card ----------

function PersonCard({
  c, festById, isInconsistent, highlight, onReconcile,
}: {
  c: AggContact;
  festById: Map<string, FestivalLite>;
  isInconsistent: boolean;
  highlight?: boolean;
  onReconcile: () => void;
}) {
  const today = Date.now();
  const fests = (c.festival_ids ?? [])
    .map(id => festById.get(id))
    .filter(Boolean)
    .map(f => ({
      ...(f as FestivalLite),
      days: Math.ceil((new Date((f as FestivalLite).start_date).getTime() - today) / 86400000),
    }))
    .sort((a, b) => a.days - b.days);

  const missingInfo = !c.email && !c.phone;

  const copy = (txt: string, label: string) =>
    navigator.clipboard.writeText(txt).then(() => toast.success(`${label} copied`));

  return (
    <div className={cn(
      "rounded-md border bg-background p-3 flex gap-3",
      highlight && "ring-2 ring-primary",
    )}>
      <div className={cn("shrink-0 h-11 w-11 rounded-full font-semibold text-sm flex items-center justify-center", TYPE_AVATAR[c.contact_type])}>
        {initials(c.canonical_name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-semibold text-sm">{c.canonical_name}</div>
          {c.is_primary_at_any && <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />}
          <Badge variant="outline" className="text-[10px] uppercase">{TYPE_LABEL[c.contact_type]}</Badge>
          {missingInfo && (
            <span title="Missing email and phone" className="text-[10px] inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" /> Missing info
            </span>
          )}
          {isInconsistent && (
            <button
              onClick={onReconcile}
              title="Different email/phone across festivals"
              className="text-[10px] inline-flex items-center gap-1 text-orange-700 dark:text-orange-300 hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> Inconsistent — Reconcile
            </button>
          )}
        </div>
        {c.role && <div className="text-xs text-muted-foreground">{c.role}</div>}
        {c.organization && (
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5">
            <Building2 className="h-3 w-3" /> {c.organization}
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {c.email && (
            <span className="inline-flex items-center gap-1">
              <a href={`mailto:${c.email}`} className="text-primary hover:underline inline-flex items-center gap-1">
                <Mail className="h-3 w-3" /> {c.email}
              </a>
              <button onClick={() => copy(c.email!, "Email")} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
            </span>
          )}
          {c.phone && (
            <span className="inline-flex items-center gap-1">
              <a href={`tel:${c.phone}`} className="text-primary hover:underline inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {c.phone}
              </a>
              <button onClick={() => copy(c.phone!, "Phone")} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {fests.map(f => (
            <Link
              key={f.id}
              to={`/festivals/${f.slug}/contacts`}
              className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium hover:opacity-80", countdownClass(f.days))}
              title={f.name}
            >
              {f.name} {f.days < 0 ? `${Math.abs(f.days)}d ago` : f.days === 0 ? "today" : `T-${f.days}`}
            </Link>
          ))}
        </div>
        {c.notes_combined && (
          <div className="text-[11px] italic text-muted-foreground mt-2 line-clamp-3 whitespace-pre-line">
            {c.notes_combined}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Reconcile drawer ----------

function ReconcileDrawer({
  open, onOpenChange, dedupKey: key, rawRows, onDone,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  dedupKey: string | null;
  rawRows: RawRow[];
  onDone: () => void;
}) {
  const matches = useMemo(() => {
    if (!key) return [];
    return rawRows.filter(r =>
      dedupKey({ email: r.email, full_name: r.full_name, organization: r.organization }) === key
    );
  }, [key, rawRows]);

  const emails = useMemo(() => [...new Set(matches.map(m => m.email).filter(Boolean) as string[])], [matches]);
  const phones = useMemo(() => [...new Set(matches.map(m => m.phone).filter(Boolean) as string[])], [matches]);

  const [chosenEmail, setChosenEmail] = useState<string>("");
  const [chosenPhone, setChosenPhone] = useState<string>("");

  useEffect(() => {
    setChosenEmail(emails[0] ?? "");
    setChosenPhone(phones[0] ?? "");
  }, [emails, phones]);

  const reconcile = useMutation({
    mutationFn: async () => {
      if (matches.length === 0) return;
      const ids = matches.map(m => m.id);
      const payload: any = {};
      if (chosenEmail) payload.email = chosenEmail;
      if (chosenPhone) payload.phone = chosenPhone;
      if (Object.keys(payload).length === 0) return;
      const { error } = await supabase.from("festival_contacts").update(payload).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Reconciled across all festivals"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader><SheetTitle>Reconcile contact info</SheetTitle></SheetHeader>
        <div className="py-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Pick the canonical email and phone. The choice will be applied to all {matches.length} festival rows for this person.
          </p>
          <div>
            <div className="text-xs font-semibold mb-1">Email</div>
            {emails.length === 0 ? <p className="text-xs text-muted-foreground">No emails on file.</p> : emails.map(e => (
              <label key={e} className="flex items-center gap-2 text-sm py-1">
                <input type="radio" name="email" checked={chosenEmail === e} onChange={() => setChosenEmail(e)} />
                {e}
              </label>
            ))}
          </div>
          <div>
            <div className="text-xs font-semibold mb-1">Phone</div>
            {phones.length === 0 ? <p className="text-xs text-muted-foreground">No phones on file.</p> : phones.map(p => (
              <label key={p} className="flex items-center gap-2 text-sm py-1">
                <input type="radio" name="phone" checked={chosenPhone === p} onChange={() => setChosenPhone(p)} />
                {p}
              </label>
            ))}
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>
            {reconcile.isPending ? "Saving…" : "Apply to all festivals"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
