import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain, FolderOpen, FileText, ListTodo, ClipboardList,
  AlertTriangle, RefreshCw, ArrowRight, ArrowUpRight,
  TrendingUp, Clock, Sparkles, ChevronRight,
  Mail, Receipt, CheckCircle2, AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEmails, useEmailTasks, useEmailInvoices, useSyncAndClassify } from "@/hooks/useEmailAgent";
import { motion } from "framer-motion";

const agentCards = [
  {
    id: "memory",
    name: "Email Memory",
    role: "Learns and remembers all email data",
    icon: Brain,
    color: "from-agent-purple/15 to-agent-purple/5",
    borderColor: "border-agent-purple/20 hover:border-agent-purple/40",
    iconColor: "text-agent-purple",
    badgeColor: "bg-agent-purple/10 text-agent-purple",
    path: "/email-memory",
    metricKey: "emails",
  },
  {
    id: "organizer",
    name: "Email Organizer",
    role: "Classifies and routes emails",
    icon: FolderOpen,
    color: "from-agent-teal/15 to-agent-teal/5",
    borderColor: "border-agent-teal/20 hover:border-agent-teal/40",
    iconColor: "text-agent-teal",
    badgeColor: "bg-agent-teal/10 text-agent-teal",
    path: "/agent/inbox",
    metricKey: "pending",
  },
  {
    id: "invoice",
    name: "Invoice Intelligence",
    role: "Extracts and structures invoice data",
    icon: FileText,
    color: "from-agent-amber/15 to-agent-amber/5",
    borderColor: "border-agent-amber/20 hover:border-agent-amber/40",
    iconColor: "text-agent-amber",
    badgeColor: "bg-agent-amber/10 text-agent-amber",
    path: "/agent/invoices",
    metricKey: "invoices",
  },
  {
    id: "action",
    name: "Action Center",
    role: "Manages tasks and reply drafts",
    icon: ListTodo,
    color: "from-agent-rose/15 to-agent-rose/5",
    borderColor: "border-agent-rose/20 hover:border-agent-rose/40",
    iconColor: "text-agent-rose",
    badgeColor: "bg-agent-rose/10 text-agent-rose",
    path: "/agent/tasks",
    metricKey: "tasks",
  },
  {
    id: "nontask",
    name: "Non-Email Tasks",
    role: "Manual and internal task management",
    icon: ClipboardList,
    color: "from-agent-blue/15 to-agent-blue/5",
    borderColor: "border-agent-blue/20 hover:border-agent-blue/40",
    iconColor: "text-agent-blue",
    badgeColor: "bg-agent-blue/10 text-agent-blue",
    path: "/tasks",
    metricKey: "manual",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: emails } = useEmails();
  const { data: tasks } = useEmailTasks();
  const { data: invoices } = useEmailInvoices();
  const syncAndClassify = useSyncAndClassify();

  const totalEmails = emails?.length || 0;
  const pendingEmails = emails?.filter(e => !e.processed).length || 0;
  const reviewEmails = emails?.filter(e => e.needs_review).length || 0;
  const invoiceCount = invoices?.length || 0;
  const totalTasks = tasks?.length || 0;
  const pendingTasks = tasks?.filter((t: any) => t.status === "to_do" || t.status === "urgent").length || 0;

  const getMetric = (key: string) => {
    switch (key) {
      case "emails": return { value: totalEmails, label: "emails stored" };
      case "pending": return { value: pendingEmails, label: "pending review" };
      case "invoices": return { value: invoiceCount, label: "invoices extracted" };
      case "tasks": return { value: totalTasks, label: "tasks active" };
      case "manual": return { value: 0, label: "manual tasks" };
      default: return { value: 0, label: "" };
    }
  };

  const kpiCards = [
    { label: "Unprocessed", value: pendingEmails, icon: Mail, trend: pendingEmails > 0 ? "needs attention" : "clear", color: pendingEmails > 0 ? "text-warning" : "text-success" },
    { label: "Invoices", value: invoiceCount, icon: Receipt, trend: "extracted", color: "text-agent-amber" },
    { label: "Active Tasks", value: pendingTasks, icon: CheckCircle2, trend: `of ${totalTasks} total`, color: "text-agent-rose" },
    { label: "Review Queue", value: reviewEmails, icon: AlertCircle, trend: reviewEmails > 0 ? "items waiting" : "clear", color: reviewEmails > 0 ? "text-destructive" : "text-success" },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-[11px] font-semibold text-primary uppercase tracking-[0.15em]">Executive Dashboard</span>
          </div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">AI Operations Center</h1>
          <p className="text-muted-foreground text-sm mt-1.5">5 agents monitoring your business operations</p>
        </div>
        <Button
          onClick={() => syncAndClassify.mutate(undefined)}
          disabled={syncAndClassify.isPending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 h-10 px-5"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncAndClassify.isPending ? "animate-spin" : ""}`} />
          {syncAndClassify.isPending ? "Syncing..." : "Sync All Agents"}
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className="premium-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center`}>
                <kpi.icon className={`h-4.5 w-4.5 ${kpi.color}`} />
              </div>
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            <div className="text-2xl font-bold font-heading tracking-tight">{kpi.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{kpi.label} · <span className={kpi.color}>{kpi.trend}</span></div>
          </motion.div>
        ))}
      </div>

      {/* Agent Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-semibold">AI Agents</h2>
          <span className="text-xs text-muted-foreground">5 agents active</span>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agentCards.map((agent, i) => {
            const metric = getMetric(agent.metricKey);
            return (
              <motion.button
                key={agent.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.4 }}
                onClick={() => navigate(agent.path)}
                className={`premium-card-hover p-5 text-left group bg-gradient-to-br ${agent.color} border ${agent.borderColor}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`h-10 w-10 rounded-xl bg-background/60 border border-border/30 flex items-center justify-center`}>
                    <agent.icon className={`h-5 w-5 ${agent.iconColor}`} />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="font-heading font-semibold text-[15px] mb-1">{agent.name}</h3>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{agent.role}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className={`${agent.badgeColor} border-0 text-[11px] font-semibold`}>
                    {metric.value} {metric.label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">Active</span>
                </div>
              </motion.button>
            );
          })}

          {/* Review Queue Card - special styling */}
          <motion.button
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            onClick={() => navigate("/agent/review")}
            className={`premium-card-hover p-5 text-left group ${reviewEmails > 0 ? "border-destructive/30 hover:border-destructive/50" : "border-border/30"}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`h-10 w-10 rounded-xl bg-background/60 border border-border/30 flex items-center justify-center`}>
                <AlertTriangle className={`h-5 w-5 ${reviewEmails > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h3 className="font-heading font-semibold text-[15px] mb-1">Review Queue</h3>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">Items needing human verification</p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className={`${reviewEmails > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"} border-0 text-[11px] font-semibold`}>
                {reviewEmails} pending review
              </Badge>
              {reviewEmails > 0 && <span className="text-[10px] text-destructive font-medium uppercase tracking-wider">Attention</span>}
            </div>
          </motion.button>
        </div>
      </div>

      {/* Bottom Panels */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="premium-card p-6">
          <h3 className="font-heading font-semibold text-sm mb-4 text-muted-foreground uppercase tracking-wider">Quick Actions</h3>
          <div className="space-y-1">
            {[
              { label: "Sync & classify all emails", desc: "Pull new emails and run AI classification", icon: RefreshCw, action: () => syncAndClassify.mutate(undefined) },
              { label: "View overdue invoices", desc: `${invoiceCount} invoices extracted`, icon: FileText, action: () => navigate("/agent/invoices") },
              { label: "Review uncertain items", desc: `${reviewEmails} items need verification`, icon: AlertTriangle, action: () => navigate("/agent/review") },
              { label: "Open action center", desc: `${pendingTasks} tasks pending`, icon: ListTodo, action: () => navigate("/agent/tasks") },
            ].map((action) => (
              <button
                key={action.label}
                onClick={action.action}
                className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-muted/40 transition-all text-left group"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/8 border border-primary/10 flex items-center justify-center shrink-0">
                  <action.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{action.label}</div>
                  <div className="text-[11px] text-muted-foreground">{action.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="premium-card p-6">
          <h3 className="font-heading font-semibold text-sm mb-4 text-muted-foreground uppercase tracking-wider">Recent Emails</h3>
          <div className="space-y-3">
            {(emails || []).slice(0, 6).map((email) => (
              <div key={email.id} className="flex items-start gap-3 text-sm group">
                <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${email.processed ? "bg-muted-foreground/20" : "bg-primary pulse-soft"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate text-[13px]">{email.sender || "Unknown"}</span>
                    {email.classification && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${
                        email.classification === "invoice" ? "bg-agent-amber/10 text-agent-amber" :
                        email.classification === "task" ? "bg-agent-rose/10 text-agent-rose" :
                        "bg-muted text-muted-foreground"
                      }`}>{email.classification}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{email.subject}</p>
                </div>
                <span className="text-[11px] text-muted-foreground/60 shrink-0 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {email.received_at ? new Date(email.received_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                </span>
              </div>
            ))}
            {(!emails || emails.length === 0) && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No emails yet. Click "Sync All Agents" to fetch emails.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
