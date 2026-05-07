import { useParams, Link } from "react-router-dom";
import { AttentionSummaryWidget } from "@/components/attention/AttentionSummaryWidget";

export default function FestivalOverview() {
  const { slug = "" } = useParams();
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to="/festivals" className="text-xs text-muted-foreground hover:underline">← Festivals</Link>

      <AttentionSummaryWidget festivalSlug={slug} />

      <div id="card-1">
        <h1 className="text-2xl font-heading font-bold text-foreground">{slug}</h1>
        <p className="text-sm text-muted-foreground">
          Festival detail view — to be rebuilt on the new schema (concepts, forecasts, shifts, deadlines, etc.).
        </p>
      </div>
    </div>
  );
}
