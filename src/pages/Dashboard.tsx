import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, CheckSquare, FileText, RefreshCw, ArrowRight, MessageCircle, Clock, Flame } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEmails, useEmailTasks, useEmailInvoices, useSyncAndClassify } from "@/hooks/useEmailAgent";
import { motion } from "framer-motion";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: emails } = useEmails();
  const { data: tasks } = useEmailTasks();
  const { data: invoices } = useEmailInvoices();
  const syncAndClassify = useSyncAndClassify();

  const totalEmails = emails?.length || 0;
  const pendingEmails = emails?.filter(e => !e.processed).length || 0;
  const invoiceCount = emails?.filter(e => e.classification === "invoice").length || 0;
  const taskCount = emails?.filter(e => e.classification === "task").length || 0;
  const totalTasks = tasks?.length || 0;
  const pendingTasks = tasks?.filter((t: any) => t.status === "to_do" || t.status === "urgent").length || 0;
  const totalInvoices = invoices?.length || 0;

  const statCards = [
    { label: "Emails", value: totalEmails, sub: `${pendingEmails} pending`, icon: Mail, color: "text-primary", path: "/emails" },
    { label: "Tasks", value: totalTasks, sub: `${pendingTasks} pending`, icon: CheckSquare, color: "text-accent", path: "/agent/tasks" },
    { label: "Invoices", value: totalInvoices, sub: `${invoiceCount} from emails`, icon: FileText, color: "text-primary", path: "/agent/invoices" },
    { label: "WhatsApp", value: 4, sub: "2 unread", icon: MessageCircle, color: "text-accent", path: "/whatsapp" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Your AI-powered operations dashboard</p>
        </div>
        <Button
          onClick={() => syncAndClassify.mutate()}
          disabled={syncAndClassify.isPending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncAndClassify.isPending ? "animate-spin" : ""}`} />
          {syncAndClassify.isPending ? "Syncing..." : "Sync Emails"}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="stat-card cursor-pointer hover:border-primary/40" onClick={() => navigate(stat.path)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold font-heading">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label} · {stat.sub}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-3 mb-4">
            <Mail className="w-5 h-5 text-accent" />
            <h3 className="font-heading font-bold text-lg">Email Classification Summary</h3>
            {pendingEmails === 0 && totalEmails > 0 && (
              <Badge variant="outline" className="ml-auto text-xs bg-accent/10 text-accent border-accent/30">✓ All Processed</Badge>
            )}
            {pendingEmails > 0 && (
              <Badge variant="outline" className="ml-auto text-xs bg-primary/10 text-primary border-primary/30">{pendingEmails} pending</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            <div><div className="text-2xl font-bold">{totalEmails}</div><div className="text-xs text-muted-foreground mt-1">Total Emails</div></div>
            <div className="text-2xl font-bold text-muted-foreground">=</div>
            <div><div className="text-2xl font-bold text-primary">{invoiceCount}</div><div className="text-xs text-muted-foreground mt-1">Invoices</div></div>
            <div className="text-2xl font-bold text-muted-foreground">+</div>
            <div><div className="text-2xl font-bold text-accent">{taskCount}</div><div className="text-xs text-muted-foreground mt-1">Tasks</div></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="glass-panel">
          <CardHeader><CardTitle className="font-heading text-base">Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Agent Inbox", desc: `${pendingEmails} emails pending classification`, icon: Mail, path: "/agent/inbox" },
              { label: "Agent Invoices", desc: `${totalInvoices} invoices extracted`, icon: FileText, path: "/agent/invoices" },
              { label: "Agent Tasks", desc: `${totalTasks} tasks extracted`, icon: CheckSquare, path: "/agent/tasks" },
              { label: "Priority Matrix", desc: "View Eisenhower grid", icon: Flame, path: "/priority" },
            ].map((action) => (
              <button key={action.label} onClick={() => navigate(action.path)} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/50 transition-colors text-left">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <action.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{action.label}</div>
                  <div className="text-xs text-muted-foreground">{action.desc}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader><CardTitle className="font-heading text-base">Recent Emails</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(emails || []).slice(0, 5).map((email) => (
              <div key={email.id} className="flex items-start gap-3 text-sm">
                <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${email.processed ? "bg-muted-foreground/30" : "bg-primary"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{email.sender || "Unknown"}</span>
                    {email.classification && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                        email.classification === "invoice" ? "bg-primary/10 text-primary border-primary/20" : "bg-accent/10 text-accent border-accent/20"
                      }`}>{email.classification}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{email.subject}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  <Clock className="inline h-3 w-3 mr-1" />
                  {email.received_at ? new Date(email.received_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
