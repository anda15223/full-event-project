import * as React from "react";
import { FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConceptIsActive } from "@/hooks/useConceptIsActive";

export type CardStatus = "green" | "amber" | "red" | "neutral";

interface FestivalCardProps {
  title: string;
  status: CardStatus;
  conceptSlug?: string;
  festivalSlug: string;
  statusLabel?: string;
  children: React.ReactNode;
  className?: string;
}

const STATUS_STYLES: Record<CardStatus, { wrap: string; dot: string; defaultLabel: string }> = {
  green: {
    wrap: "bg-green-500/15 text-green-700 dark:text-green-400",
    dot: "bg-green-500",
    defaultLabel: "Ready",
  },
  amber: {
    wrap: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    defaultLabel: "Attention",
  },
  red: {
    wrap: "bg-red-500/15 text-red-700 dark:text-red-400",
    dot: "bg-red-500",
    defaultLabel: "Action needed",
  },
  neutral: {
    wrap: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400",
    dot: "bg-zinc-500",
    defaultLabel: "—",
  },
};

function StatusBadge({ status, label }: { status: CardStatus; label?: string }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-medium flex gap-2 items-center", s.wrap)}>
      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
      {label ?? s.defaultLabel}
    </span>
  );
}

function FestivalCardRoot({
  title,
  status,
  conceptSlug,
  festivalSlug,
  statusLabel,
  children,
  className,
}: FestivalCardProps) {
  const { isActive } = useConceptIsActive(conceptSlug, festivalSlug);
  const disabled = conceptSlug !== undefined && !isActive;

  return (
    <div className={cn("rounded-2xl border bg-card shadow-sm overflow-hidden", className)}>
      <div className="flex justify-between items-center p-4 border-b">
        <h3 className="text-lg font-semibold">{title}</h3>
        <StatusBadge status={status} label={statusLabel} />
      </div>
      <div className="p-4 space-y-4">
        {disabled && (
          <Alert>
            <AlertDescription>Hidden — concept disabled at this festival</AlertDescription>
          </Alert>
        )}
        <div className={cn("space-y-4", disabled && "opacity-40 grayscale pointer-events-none")}>
          {children}
        </div>
      </div>
    </div>
  );
}

function UploadZone({
  accept,
  onUpload,
  label = "Drop file or click to upload",
  children,
}: {
  accept?: string;
  onUpload?: (file: File) => void;
  label?: string;
  children?: React.ReactNode;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full border border-dashed p-6 rounded-xl text-center text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && onUpload) onUpload(f);
        }}
      />
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium uppercase text-muted-foreground">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ParsedFields({ children }: { children: React.ReactNode }) {
  return <Section title="Parsed from upload">{children}</Section>;
}

function ManualFields({ children }: { children: React.ReactNode }) {
  return <Section title="Manual entry">{children}</Section>;
}

function ExportButton({ onClick, label = "Export report" }: { onClick: () => void; label?: string }) {
  return (
    <div className="flex justify-end">
      <Button variant="outline" size="sm" onClick={onClick}>
        <FileDown className="h-4 w-4 mr-2" />
        {label}
      </Button>
    </div>
  );
}

export const FestivalCard = Object.assign(FestivalCardRoot, {
  UploadZone,
  Section,
  ParsedFields,
  ManualFields,
  ExportButton,
});
