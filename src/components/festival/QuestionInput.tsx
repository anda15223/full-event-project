import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

type Question = {
  id: string;
  key: string;
  prompt: string;
  kind: string;
  options: any;
  help_text: string | null;
  required: boolean;
};

type Option = { label: string; value: string };

interface Props {
  question: Question;
  currentValue: any;
  onChange: (v: any) => void;
}

export function QuestionInput({ question, currentValue, onChange }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [local, setLocal] = useState<string>(
    currentValue == null ? "" : String(currentValue)
  );

  useEffect(() => {
    if (currentValue == null) setLocal("");
    else if (typeof currentValue === "string") setLocal(currentValue);
    else setLocal(String(currentValue));
  }, [currentValue, question.id]);

  const debouncedSave = (v: any) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(v), 500);
  };

  const opts: Option[] = Array.isArray(question.options) ? question.options : [];

  const labelEl = (
    <Label className="text-[13px] font-medium">
      {question.prompt}
      {question.required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );
  const helpEl = question.help_text ? (
    <p className="text-[11px] text-muted-foreground mt-1">{question.help_text}</p>
  ) : null;

  if (question.kind === "single_select") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Select
          value={typeof currentValue === "string" ? currentValue : ""}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent className="bg-popover">
            {opts.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {helpEl}
      </div>
    );
  }

  if (question.kind === "multi_select") {
    const arr: string[] = Array.isArray(currentValue) ? currentValue : [];
    const toggle = (val: string) => {
      const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
      onChange(next);
    };
    return (
      <div className="space-y-1.5">
        {labelEl}
        <div className="flex flex-wrap gap-1.5">
          {opts.map(o => {
            const checked = arr.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => toggle(o.value)}
                className={`text-[12px] px-2.5 py-1 rounded-lg border transition ${
                  checked
                    ? "bg-primary/10 border-primary/30 text-primary font-medium"
                    : "bg-background border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Checkbox checked={checked} className="hidden" />
                {o.label}
              </button>
            );
          })}
        </div>
        {helpEl}
      </div>
    );
  }

  if (question.kind === "date") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Input
          type="date"
          value={local}
          className="h-9 text-[13px]"
          onChange={(e) => { setLocal(e.target.value); debouncedSave(e.target.value || null); }}
        />
        {helpEl}
      </div>
    );
  }

  if (question.kind === "datetime") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Input
          type="datetime-local"
          value={local}
          className="h-9 text-[13px]"
          onChange={(e) => { setLocal(e.target.value); debouncedSave(e.target.value || null); }}
        />
        {helpEl}
      </div>
    );
  }

  if (question.kind === "number") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Input
          type="number"
          step="any"
          value={local}
          className="h-9 text-[13px]"
          onChange={(e) => {
            setLocal(e.target.value);
            const n = e.target.value === "" ? null : Number(e.target.value);
            debouncedSave(n);
          }}
        />
        {helpEl}
      </div>
    );
  }

  // text (default)
  const isLong = (local || "").length > 80;
  return (
    <div className="space-y-1.5">
      {labelEl}
      {isLong ? (
        <Textarea
          value={local}
          rows={3}
          className="text-[13px]"
          onChange={(e) => { setLocal(e.target.value); debouncedSave(e.target.value); }}
        />
      ) : (
        <Input
          value={local}
          className="h-9 text-[13px]"
          onChange={(e) => { setLocal(e.target.value); debouncedSave(e.target.value); }}
        />
      )}
      {helpEl}
    </div>
  );
}
