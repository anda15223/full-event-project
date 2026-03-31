import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, AlertTriangle, HelpCircle, Info, ArrowUpRight } from "lucide-react";
import { useState, useMemo } from "react";
import { mockWhatsAppMessages } from "@/data/mockData";

const classificationConfig: Record<string, { label: string; color: string; icon: typeof AlertTriangle }> = {
  problem: { label: "Problem", color: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
  question: { label: "Question", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: HelpCircle },
  update: { label: "Update", color: "bg-accent/10 text-accent border-accent/20", icon: Info },
  request: { label: "Request", color: "bg-primary/10 text-primary border-primary/20", icon: ArrowUpRight },
};

export default function WhatsAppInbox() {
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return mockWhatsAppMessages;
    return mockWhatsAppMessages.filter(m => m.classification === filter);
  }, [filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">WhatsApp Inbox</h1>
        <p className="text-muted-foreground mt-1">Messages from your employees</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          className={filter === "all" ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}
        >
          All ({mockWhatsAppMessages.length})
        </Button>
        {Object.entries(classificationConfig).map(([key, config]) => {
          const count = mockWhatsAppMessages.filter(m => m.classification === key).length;
          return (
            <Button
              key={key}
              variant={filter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(key)}
              className={filter === key ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}
            >
              {config.label} ({count})
            </Button>
          );
        })}
      </div>

      <div className="space-y-3">
        {filtered.map((msg) => {
          const config = classificationConfig[msg.classification];
          const Icon = config.icon;
          return (
            <Card key={msg.id} className="glass-panel hover:border-primary/30 transition-colors cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{msg.senderName}</span>
                      <span className="text-xs text-muted-foreground">{msg.senderPhone}</span>
                      <Badge variant="outline" className={`text-xs ${config.color}`}>
                        <Icon className="h-3 w-3 mr-1" />{config.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{msg.aiSummary}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(msg.receivedAt).toLocaleString()}
                    </p>
                  </div>
                  {!msg.isProcessed && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
