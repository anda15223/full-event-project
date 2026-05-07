import { Link } from "react-router-dom";
import { Tent } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Festival Operations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Schema reset complete. Start by creating your first festival.
        </p>
      </div>
      <Link
        to="/festivals"
        className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition"
      >
        <Tent className="h-4 w-4" /> Open Festivals
      </Link>
    </div>
  );
}
