import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useConceptIsActive } from "@/hooks/useConceptIsActive";
import { useConceptToggle } from "@/hooks/useConceptToggle";

interface ConceptToggleProps {
  festivalSlug: string;
  conceptSlug: string;
  size?: "sm" | "md";
}

export function ConceptToggle({ festivalSlug, conceptSlug, size = "md" }: ConceptToggleProps) {
  const { isActive, isLoading } = useConceptIsActive(conceptSlug, festivalSlug);
  const toggle = useConceptToggle();

  const pending = toggle.isPending || isLoading;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center ${pending ? "opacity-60" : ""}`}>
            <Switch
              checked={isActive}
              disabled={isLoading}
              onCheckedChange={(checked) =>
                toggle.mutate({ festivalSlug, conceptSlug, isActive: checked })
              }
              className={`${size === "sm" ? "scale-90" : ""} data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-zinc-300 dark:data-[state=unchecked]:bg-zinc-700`}
              aria-label={isActive ? "Concept active" : "Concept hidden"}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {isActive
            ? "Concept active — included in all reports"
            : "Concept hidden — excluded from all reports for this festival"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
