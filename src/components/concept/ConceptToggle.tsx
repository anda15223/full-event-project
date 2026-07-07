import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ConceptToggleProps {
  festivalSlug: string;
  /** Specific festival_contracts.id — scopes the toggle to ONE stall (safe with duplicate stalls). */
  contractId: string;
  isActive: boolean;
  size?: "sm" | "md";
}

export function ConceptToggle({ festivalSlug, contractId, isActive, size = "md" }: ConceptToggleProps) {
  const qc = useQueryClient();

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from("festival_contracts")
        .update({ is_active: next })
        .eq("id", contractId);
      if (error) throw error;
      return next;
    },
    onSuccess: () => {
      const keys = [
        ["festival-contracts-grid"],
        ["festival", festivalSlug],
        ["binder", festivalSlug],
        ["soborg", festivalSlug],
        ["soborg-loading", festivalSlug],
        ["power", festivalSlug],
        ["power-page", festivalSlug],
        ["facade", festivalSlug],
        ["facade-page", festivalSlug],
        ["topskilt", festivalSlug],
        ["cooling", festivalSlug],
        ["contracts", festivalSlug],
        ["dashboard"],
        ["attention-items"],
        ["concept-grid", festivalSlug],
        ["disabled-concepts", festivalSlug],
      ];
      keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
    onError: (e: any) => toast.error(e?.message ?? "Toggle failed"),
  });

  const pending = toggle.isPending;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center ${pending ? "opacity-60" : ""}`}>
            <Switch
              checked={isActive}
              disabled={pending}
              onCheckedChange={(checked) => toggle.mutate(checked)}
              className={`${size === "sm" ? "scale-90" : ""} data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-zinc-300 dark:data-[state=unchecked]:bg-zinc-700`}
              aria-label={isActive ? "Stall active" : "Stall hidden"}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {isActive
            ? "Stall active — included in all reports"
            : "Stall hidden — excluded from all reports for this festival"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
