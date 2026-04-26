import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

/**
 * Shared BrainSuggestions component.
 *
 * Lifted byte-for-byte from IntroductionCard.tsx (Sprint 2.2). Displays brain
 * entries with at least a phone or email signal as promotable suggestions.
 * Helpers (`guessNameFromBrain`, `extractContact`, `normPhone`) are exported
 * so consuming cards can build their own prefill payloads.
 */

export type BrainEntry = {
  id: string;
  festival_id: string | null;
  display_name: string | null;
  key_name: string;
  content: string;
  structured_data: any;
  is_active: boolean | null;
  created_at: string;
};

export const PHONE_RE = /(\+?\d[\d\s\-().]{6,}\d)/;
export const EMAIL_RE = /([^\s<>"']+@[^\s<>"']+\.[^\s<>"']+)/;

export const PHONE_KEYS = ["phone", "phone_number", "phonenumber", "tel", "telephone", "mobile", "mobile_number", "cell"];
export const EMAIL_KEYS = ["email", "e-mail", "email_address", "emailaddress", "mail"];
export const NAME_KEYS = ["name", "contact_name", "full_name", "fullname", "contact", "person"];

/**
 * Walk a JSON tree, calling visit(key, value) for every leaf string value.
 * key is the (lowercased) leaf key; for array items the parent key is reused.
 */
export function walkLeaves(node: any, visit: (key: string, value: string) => void, parentKey = ""): void {
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

export function parseStructured(sd: any): any {
  if (sd == null) return null;
  if (typeof sd === "string") {
    try { return JSON.parse(sd); } catch { return sd; }
  }
  return sd;
}

export function findByKey(sd: any, keyList: string[]): string | undefined {
  let found: string | undefined;
  walkLeaves(sd, (k, v) => {
    if (found) return;
    if (keyList.includes(k) && v && v.trim()) found = v.trim();
  });
  return found;
}

export function findByPattern(sd: any, re: RegExp): string | undefined {
  let found: string | undefined;
  walkLeaves(sd, (_k, v) => {
    if (found) return;
    const m = v.match(re);
    if (m?.[1]) found = m[1].trim();
  });
  return found;
}

export function guessNameFromBrain(b: BrainEntry): string {
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

export function extractContact(b: BrainEntry): { phone?: string; email?: string } {
  const content = b.content ?? "";
  const sd = parseStructured(b.structured_data);

  const phone =
    findByKey(sd, PHONE_KEYS) ??
    content.match(PHONE_RE)?.[1] ??
    findByPattern(sd, PHONE_RE);

  const email =
    findByKey(sd, EMAIL_KEYS) ??
    content.match(EMAIL_RE)?.[1] ??
    findByPattern(sd, EMAIL_RE);

  return {
    phone: phone?.trim(),
    email: email?.trim().toLowerCase(),
  };
}

export function normPhone(p: string | null | undefined): string {
  return (p ?? "").replace(/[^\d+]/g, "");
}

interface Props {
  entries: BrainEntry[];
  /** Already-known phones (normalized via normPhone) — disables matching suggestions */
  existingPhones?: Set<string>;
  /** Already-known emails (lowercased, trimmed) — disables matching suggestions */
  existingEmails?: Set<string>;
  /** Called when user clicks "Promote" on a suggestion */
  onPromote: (entry: BrainEntry) => void;
  /** Optional override for the section title */
  title?: string;
  /** Optional override for the description line under the title */
  subtitle?: string;
}

export function BrainSuggestions({
  entries,
  existingPhones,
  existingEmails,
  onPromote,
  title = "Brain suggestions",
  subtitle = "Contacts the AI extracted from emails for this festival. Promote them to your people directory.",
}: Props) {
  const suggestions = useMemo(() => {
    const phones = existingPhones ?? new Set<string>();
    const emails = existingEmails ?? new Set<string>();
    return entries
      .slice()
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .map((b) => {
        const c = extractContact(b);
        if (!c.phone && !c.email) return null;
        const alreadyAdded =
          (c.phone && phones.has(normPhone(c.phone))) ||
          (c.email && emails.has(c.email));
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
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <Badge variant="secondary" className="text-[10px]">
          {suggestions.length}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">{subtitle}</p>
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

export default BrainSuggestions;
