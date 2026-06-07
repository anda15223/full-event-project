import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Info, FileDown, Clock, Users, Sparkles, MessageCircleQuestion, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { FestivalHeader } from "@/components/festival/FestivalHeader";
import { FestivalHoursBlock } from "@/components/festival/FestivalHoursBlock";
import { FestivalContactsBlock } from "@/components/festival/FestivalContactsBlock";
import { LocationDocsBox } from "@/components/festival/LocationDocsBox";
import { FestivalInfoSummary } from "@/components/festival/FestivalInfoSummary";
import { FestivalInfoChat } from "@/components/festival/FestivalInfoChat";

function CollapsibleSection({
  storageKey,
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  storageKey: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch {}
    return defaultOpen;
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, open ? "1" : "0"); } catch {}
  }, [open, storageKey]);

  return (
    <section className="rounded-2xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition"
      >
        <Icon className="h-4 w-4 text-primary" />
        <span className="font-heading text-sm font-semibold flex-1">{title}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t">{children}</div>
        </div>
      </div>
    </section>
  );
}


export interface FestivalInfoCardProps {
  festival: {
    id: string;
    slug: string;
    name: string;
    location: string | null;
    date_start: string;
    date_end: string;
    lat: number | null;
    lng: number | null;
  };
  defaultOpen?: boolean;
}

export function FestivalInfoCard({ festival, defaultOpen = false }: FestivalInfoCardProps) {
  const storageKey = `festival-info-open:${festival.slug}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch {}
    return defaultOpen;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {}
  }, [open, storageKey]);

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card overflow-hidden transition",
        !open && "hover:bg-muted/50",
      )}
    >
      <div className="w-full flex items-center justify-between p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-3 text-left"
          aria-expanded={open}
        >
          <Info className="h-4 w-4 text-primary" />
          <span className="font-heading text-base font-semibold">Info</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Map, location docs, hours, contacts
          </span>
        </button>
        <div className="flex items-center gap-2">
          <Link
            to={`/festivals/${festival.slug}/info/export`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition"
          >
            <FileDown className="h-4 w-4" /> Export
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse" : "Expand"}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="p-6 border-t space-y-4">
            <CollapsibleSection storageKey={`fi-location:${festival.slug}`} title="Location & map" icon={MapPin}>
              <div className="p-4">
                <FestivalHeader
                  festival={festival}
                  compact
                  rightSlot={
                    <LocationDocsBox
                      festivalId={festival.id}
                      festivalSlug={festival.slug}
                    />
                  }
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection storageKey={`fi-hours:${festival.slug}`} title="Hours" icon={Clock}>
              <div className="p-2">
                <FestivalHoursBlock
                  festivalId={festival.id}
                  festivalSlug={festival.slug}
                  startDate={festival.date_start}
                  endDate={festival.date_end}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection storageKey={`fi-contacts:${festival.slug}`} title="Contacts" icon={Users}>
              <div className="p-2">
                <FestivalContactsBlock
                  festivalId={festival.id}
                  festivalSlug={festival.slug}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection storageKey={`fi-summary:${festival.slug}`} title="AI summary" icon={Sparkles}>
              <div className="p-2">
                <FestivalInfoSummary festivalId={festival.id} />
              </div>
            </CollapsibleSection>

            <CollapsibleSection storageKey={`fi-chat:${festival.slug}`} title="Ask the festival info" icon={MessageCircleQuestion} defaultOpen={false}>
              <div className="p-2">
                <FestivalInfoChat festivalId={festival.id} />
              </div>
            </CollapsibleSection>
          </div>

        </div>
      </div>
    </section>
  );
}

export default FestivalInfoCard;
