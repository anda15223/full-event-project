import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";

type FieldType = "text" | "number" | "date";

interface Props {
  value: string | number | null | undefined;
  onChange: (next: string) => void | Promise<void>;
  type?: FieldType;
  placeholder?: string;
  className?: string;
  /** Show a small pencil affordance on hover. Default true. */
  showEditAffordance?: boolean;
  /** Disable editing. */
  readOnly?: boolean;
}

/**
 * Inline editable field. Click to edit, Enter to commit, Esc to cancel.
 * Red border when value is empty (missing-value indicator).
 */
export function EditableField({
  value,
  onChange,
  type = "text",
  placeholder = "—",
  className,
  showEditAffordance = true,
  readOnly,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value == null ? "" : String(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const isEmpty = value == null || String(value).trim() === "";

  const commit = async () => {
    setEditing(false);
    if (draft !== (value == null ? "" : String(value))) {
      await onChange(draft);
    }
  };

  const cancel = () => {
    setDraft(value == null ? "" : String(value));
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        className={cn("h-8 text-sm", className)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => !readOnly && setEditing(true)}
      className={cn(
        "group inline-flex items-center gap-1.5 min-h-8 w-full text-left px-2 py-1 rounded-md border text-sm transition-colors",
        "hover:bg-muted/40",
        isEmpty
          ? "border-destructive/60 text-destructive/80"
          : "border-transparent text-foreground",
        readOnly && "cursor-default hover:bg-transparent",
        className,
      )}
      title={readOnly ? undefined : "Click to edit"}
    >
      <span className="flex-1 truncate">
        {isEmpty ? placeholder : String(value)}
      </span>
      {showEditAffordance && !readOnly && (
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 shrink-0" />
      )}
    </button>
  );
}

export default EditableField;
