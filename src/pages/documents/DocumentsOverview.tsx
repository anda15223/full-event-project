import { useState } from "react";
import { Link } from "react-router-dom";
import { useDocuments } from "@/hooks/useDocuments";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import DocumentList from "@/components/documents/DocumentList";
import { FileText, Tent, FileSignature, Users, Truck, Building2, MoreHorizontal, Search } from "lucide-react";

const TILES = [
  { key: "invoice", label: "Invoices", icon: FileText, path: "/documents/invoices", color: "bg-blue-100 text-blue-700" },
  { key: "festival", label: "Festivals", icon: Tent, path: "/documents/festivals", color: "bg-purple-100 text-purple-700" },
  { key: "contract", label: "Contracts", icon: FileSignature, path: "/documents/contracts", color: "bg-green-100 text-green-700" },
  { key: "hr", label: "HR", icon: Users, path: "/documents/hr", color: "bg-orange-100 text-orange-700" },
  { key: "supplier", label: "Suppliers", icon: Truck, path: "/documents/suppliers", color: "bg-amber-100 text-amber-700" },
  { key: "authority", label: "Authority", icon: Building2, path: "/documents/authority", color: "bg-red-100 text-red-700" },
  { key: "other", label: "Other", icon: MoreHorizontal, path: "/documents/other", color: "bg-gray-100 text-gray-700" },
];

export default function DocumentsOverview() {
  const [search, setSearch] = useState("");
  const { documents, counts, reload } = useDocuments({ search: search || undefined });
  const recent = documents.slice(0, 20);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every attachment from your inbox and sent folder, automatically categorized.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents, subjects, senders..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.key} to={t.path}>
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${t.color} mb-3`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p className="text-xl font-bold">{counts[t.key] || 0}</p>
              </Card>
            </Link>
          );
        })}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3">Recent documents</h2>
        <DocumentList documents={recent} onChanged={reload} />
      </div>
    </div>
  );
}
