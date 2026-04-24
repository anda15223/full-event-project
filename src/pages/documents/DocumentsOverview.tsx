import { useState } from "react";
import { Link } from "react-router-dom";
import { useDocuments } from "@/hooks/useDocuments";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import DocumentList from "@/components/documents/DocumentList";
import { FileText, Tent, FileSignature, Users, Truck, Building2, MoreHorizontal, Search, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [backfilling, setBackfilling] = useState(false);
  const { documents, counts, reload } = useDocuments({ search: search || undefined });
  const recent = documents.slice(0, 20);

  const runBackfill = async () => {
    setBackfilling(true);
    let offset = 0;
    let totalIngested = 0;
    let totalScanned = 0;
    try {
      // Loop through pages until no next_offset
      // Each batch = 100 emails
      // Safety cap: 50 iterations = 5000 emails
      for (let i = 0; i < 200; i++) {
        const { data, error } = await supabase.functions.invoke("backfill-documents", {
          body: { limit: 50, offset },
        });
        if (error) throw error;
        totalIngested += (data as any)?.ingested ?? 0;
        totalScanned += (data as any)?.emails_scanned ?? 0;
        const next = (data as any)?.next_offset;
        if (next == null) break;
        offset = next;
      }
      toast.success(`Backfill queued: ${totalIngested} documents from ${totalScanned} emails. Processing in background — refresh in a few minutes.`);
      reload();
    } catch (e: any) {
      toast.error(`Backfill failed: ${e.message ?? e}`);
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every attachment from your inbox and sent folder, automatically categorized.
          </p>
        </div>
        <Button onClick={runBackfill} disabled={backfilling} variant="outline">
          {backfilling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {backfilling ? "Backfilling..." : "Backfill existing emails"}
        </Button>
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
