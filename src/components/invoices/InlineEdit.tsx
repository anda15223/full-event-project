import { useState, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";

interface Props {
  value: string;
  field: string;
  invoiceId: string;
  supplierName: string;
  onSave: (args: { invoiceId: string; field: string; value: string; oldValue: string; supplierName: string }) => void;
  className?: string;
}

export default function InlineEdit({ value, field, invoiceId, supplierName, onSave, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = () => {
    setEditing(false);
    if (text !== value && text.trim()) {
      onSave({ invoiceId, field, value: text.trim(), oldValue: value, supplierName });
    } else {
      setText(value);
    }
  };

  if (editing) {
    return (
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setText(value); setEditing(false); } }}
        className="bg-transparent border-b border-primary/40 outline-none text-foreground px-0 py-0"
        style={{ fontSize: "inherit", fontWeight: "inherit" }}
      />
    );
  }

  return (
    <span
      className={`cursor-pointer group inline-flex items-center gap-1 hover:opacity-70 transition-opacity ${className || ""}`}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {value}
      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
    </span>
  );
}
