import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Tent, User, Target, Building2, HelpCircle, ScrollText, Calendar } from "lucide-react";

interface Item {
  id: string;
  type: "festival" | "contact" | "action" | "org" | "question" | "rule" | "timeline";
  label: string;
  sub?: string;
  to: string;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { data: festivals = [] } = useQuery({
    queryKey: ["palette-festivals"], enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("festivals").select("id, name, slug, start_date").order("start_date");
      return data ?? [];
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["palette-contacts"], enabled: open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("festival_contacts_aggregated")
        .select("dedup_key, canonical_name, organization, email, festival_slugs");
      return data ?? [];
    },
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["palette-actions"], enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("festival_action_items")
        .select("id, title, festival_id, status").in("status", ["open", "in_progress", "blocked"]).limit(150);
      return data ?? [];
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["palette-questions"], enabled: open,
    queryFn: async () => {
      const { data } = await (supabase as any).from("festival_open_questions")
        .select("id, question, festival_id, status").eq("status", "open").limit(150);
      return data ?? [];
    },
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["palette-rules"], enabled: open,
    queryFn: async () => {
      const { data } = await (supabase as any).from("cross_festival_rules")
        .select("id, rule_name, severity, category, active").eq("active", true).limit(200);
      return data ?? [];
    },
  });

  const { data: timelineEvents = [] } = useQuery({
    queryKey: ["palette-timeline"], enabled: open,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await (supabase as any).from("festival_timeline_event")
        .select("id, title, festival_id, event_date, status").gte("event_date", today).neq("status","done").limit(200);
      return data ?? [];
    },
  });

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const f of festivals as any[]) {
      list.push({ id: f.id, type: "festival", label: f.name, sub: f.start_date, to: `/festivals/${f.slug}` });
    }
    for (const c of contacts as any[]) {
      const slugs: string[] = c.festival_slugs ?? [];
      const to = slugs.length > 0
        ? `/festivals/${slugs[0]}/contacts`
        : `/contacts?contact=${encodeURIComponent(c.dedup_key)}`;
      list.push({
        id: c.dedup_key, type: "contact",
        label: c.canonical_name,
        sub: [c.organization, c.email].filter(Boolean).join(" · "),
        to,
      });
    }
    const fById = new Map((festivals as any[]).map(f => [f.id, f]));
    for (const a of actions as any[]) {
      const f = fById.get(a.festival_id);
      list.push({
        id: a.id, type: "action", label: a.title,
        sub: f ? f.name : undefined,
        to: f ? `/festivals/${f.slug}/actions?item=${a.id}` : "/actions",
      });
    }
    for (const q of questions as any[]) {
      const f = fById.get(q.festival_id);
      list.push({
        id: q.id, type: "question", label: q.question,
        sub: f ? f.name : undefined,
        to: f ? `/festivals/${f.slug}/questions?q=${q.id}` : "/questions",
      });
    }
    for (const r of rules as any[]) {
      list.push({
        id: r.id, type: "rule", label: r.rule_name,
        sub: [r.severity, r.category].filter(Boolean).join(" · "),
        to: `/rules?q=${encodeURIComponent(r.rule_name)}`,
      });
    }
    for (const t of timelineEvents as any[]) {
      const f = fById.get(t.festival_id);
      list.push({
        id: t.id, type: "timeline", label: t.title,
        sub: [f?.name, t.event_date].filter(Boolean).join(" · "),
        to: f ? `/festivals/${f.slug}/timeline?event=${t.id}` : "/timeline",
      });
    }
    return list;
  }, [festivals, contacts, actions, questions, rules, timelineEvents]);

  const grouped = useMemo(() => ({
    festivals: items.filter(i => i.type === "festival"),
    contacts: items.filter(i => i.type === "contact"),
    actions: items.filter(i => i.type === "action"),
    questions: items.filter(i => i.type === "question"),
    rules: items.filter(i => i.type === "rule"),
    timeline: items.filter(i => i.type === "timeline"),
  }), [items]);

  const go = (to: string) => { setOpen(false); navigate(to); };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search festivals, contacts, action items… (⌘K)" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {grouped.festivals.length > 0 && (
          <CommandGroup heading="Festivals">
            {grouped.festivals.map(i => (
              <CommandItem key={"f:" + i.id} value={`festival ${i.label} ${i.sub ?? ""}`} onSelect={() => go(i.to)}>
                <Tent className="h-4 w-4 mr-2 text-primary" />
                <span>{i.label}</span>
                {i.sub && <span className="ml-auto text-xs text-muted-foreground">{i.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {grouped.contacts.length > 0 && (
          <CommandGroup heading="Contacts">
            {grouped.contacts.map(i => (
              <CommandItem key={"c:" + i.id} value={`contact ${i.label} ${i.sub ?? ""}`} onSelect={() => go(i.to)}>
                <User className="h-4 w-4 mr-2 text-emerald-600" />
                <span>{i.label}</span>
                {i.sub && <span className="ml-auto text-xs text-muted-foreground truncate max-w-[50%]">{i.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {grouped.actions.length > 0 && (
          <CommandGroup heading="Action items">
            {grouped.actions.map(i => (
              <CommandItem key={"a:" + i.id} value={`action ${i.label} ${i.sub ?? ""}`} onSelect={() => go(i.to)}>
                <Target className="h-4 w-4 mr-2 text-orange-600" />
                <span className="truncate">{i.label}</span>
                {i.sub && <span className="ml-auto text-xs text-muted-foreground">{i.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {grouped.questions.length > 0 && (
          <CommandGroup heading="Open questions">
            {grouped.questions.map(i => (
              <CommandItem key={"q:" + i.id} value={`question ${i.label} ${i.sub ?? ""}`} onSelect={() => go(i.to)}>
                <HelpCircle className="h-4 w-4 mr-2 text-amber-600" />
                <span className="truncate">{i.label}</span>
                {i.sub && <span className="ml-auto text-xs text-muted-foreground">{i.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {grouped.rules.length > 0 && (
          <CommandGroup heading="Rules">
            {grouped.rules.map(i => (
              <CommandItem key={"r:" + i.id} value={`rule ${i.label} ${i.sub ?? ""}`} onSelect={() => go(i.to)}>
                <ScrollText className="h-4 w-4 mr-2 text-red-600" />
                <span className="truncate">{i.label}</span>
                {i.sub && <span className="ml-auto text-xs text-muted-foreground">{i.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {grouped.timeline.length > 0 && (
          <CommandGroup heading="Timeline events">
            {grouped.timeline.map(i => (
              <CommandItem key={"t:" + i.id} value={`timeline ${i.label} ${i.sub ?? ""}`} onSelect={() => go(i.to)}>
                <Calendar className="h-4 w-4 mr-2 text-blue-600" />
                <span className="truncate">{i.label}</span>
                {i.sub && <span className="ml-auto text-xs text-muted-foreground">{i.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
