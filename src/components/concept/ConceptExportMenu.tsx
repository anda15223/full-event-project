import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, ChevronDown } from "lucide-react";
import { CONCEPT_SLUGS, CONCEPT_EMOJI, CONCEPT_LABELS } from "./types";

interface Props {
  basePath: string;
}

export function ConceptExportMenu({ basePath }: Props) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4" />
          Export PDF
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigate(basePath)}>
          📄 Full overview
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {CONCEPT_SLUGS.map((slug) => (
          <DropdownMenuItem
            key={slug}
            onClick={() => navigate(`${basePath}?concept=${slug}`)}
          >
            {CONCEPT_EMOJI[slug]} {CONCEPT_LABELS[slug]} only
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
