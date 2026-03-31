import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain, FolderOpen, FileText, ListTodo, ClipboardList,
  AlertTriangle, RefreshCw, ArrowUpRight,
  TrendingUp, Clock, Sparkles, ChevronRight,
  Mail, Receipt, CheckCircle2, AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEmails, useEmailTasks, useEmailInvoices, useSyncAndClassify } from "@/hooks/useEmailAgent";
import { motion } from "framer-motion";

const agentCards = [
  {
    id: "memory", name: "Email Memory", role: "Learns and remembers all email data",
    icon: Brain, gradient: "from-agent-blue/10 to-agent-blue/5",
    border: "hover:border-agent-blue/30", iconBg: "bg-agent-blue/10", iconColor: "text-agent-blue",
    badgeClass: "bg-agent-blue/10 text-agent-blue", path: "/email-memory", metricKey: "emails",
  },
  {
    id: "organizer", name: "Email Organizer", role: "Classifies and routes all emails",
    icon: FolderOpen, gradient: "from-agent-purple/10 to-agent-purple/5",
    border: "hover:border-agent-purple/30", iconBg: "bg-agent-purple/10", iconColor: "text-agent-purple",
    badgeClass: "bg-agent-purple/10 text-agent-purple", path: "/agent/inbox", metricKey: "pending",
  },
  {
    id: "invoice", name: "Invoice Intelligence", role: "Extracts and structures invoice data",
    icon: FileText, gradient: "from-agent-green/10 to-agent-green/5",
    border: "hover:border-agent-green/30", iconBg: "bg-agent-green/10", iconColor: "text-agent-green",
    badgeClass: "bg-agent-green/10 text-agent-green", path: "/agent/invoices", metricKey: "invoices",
  },
  {
    id: "action", name: "Action Center", role: "Manages tasks, deadlines and replies",
    icon: ListTodo, gradient: "from-agent-orange/10 to-agent-orange/5",
    border: "hover:border-agent-orange/30", iconBg: "bg-agent-orange/10", iconColor: "text-agent-orange",
    badgeClass: "bg-agent-orange/10 text-agent-orange", path: "/agent/tasks", metricKey: "tasks",
  },
  {
    id: "nontask", name: "Non-Email Tasks", role: "Manual and internal task management",
    icon: ClipboardList, gradient: "from-agent-gray/10 to-agent-gray/5",
    border: "hover:border-agent-gray/30", iconBg: "bg-secondary", iconColor: "text-agent-gray",
    badgeClass: "bg-secondary text-agent-gray", path: "/tasks", metricKey: "manual",
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
      case "emails": return { value: totalEmails, label: "emails" };
      case "pending": return { value: pendingEmails, label: "pending" };
      case "invoices": return { value: invoiceCount, label: "invoices" };
      case "tasks": return { value: totalTasks, label: "tasks" };
      case "manual": return { value: 0, label: "tasks" };
      default: return { value: 0, label: "" };
    }
  };

  const kpiCards = [
    { label: "Unprocessed", value: pendingEmails, icon: Mail, status: pendingEmails > 0 ? "warning" : "success", color: pendingEmails > 0 ? "text-warning" : "text-success" },
    { label: "Invoices", value: invoiceCount, icon: Receipt, status: "info", color: "text-agent-green" },
    { label: "Active Tasks", value: pendingTasks, icon: CheckCircle2, status: "info", color: "text-agent-orange" },
    { label: "Review Queue", value: reviewEmails, icon: AlertCircle, status: reviewEmails > 0 ? "attention" : "success", color: reviewEmails > 0 ? "text-destructive" : "text-success" },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-[11px] font-semibold text-primary uppercase tracking-[0.15em]">Executive Dashboard</span>
          </div>
          <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">AI Operations Center</h1>
          <p className="text-muted-foreground text-sm mt-1.5">5 agents monitoring your business operations</p>
        </div>
        <Button
          onClick={() => syncAndClassify.mutate(undefined)}
          disabled={syncAndClassify.isPending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/15 h-10 px-5"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncAndClassify.isPending ? "animate-spin" : ""}`} />
          {syncAndClassify.isPending ? "Syncing..." : "Sync All Agents"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.35 }}
            className="premium-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center">
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/30" />
            </div>
            <div className="text-2xl font-bold font-heading tracking-tight text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Agent Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-semibold text-foreground">AI Agents</h2>
          <span className="text-xs text-muted-foreground">5 agents active</span>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agentCards.map((agent, i) => {
            const metric = getMetric(agent.metricKey);
            return (
              <motion.button
                key={agent.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.05, duration: 0.35 }}
                onClick={() => navigate(agent.path)}
                className={`premium-card-hover p-5 text-left group bg-gradient-to-br ${agent.gradient} border ${agent.border}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`h-10 w-10 rounded-xl ${agent.iconBg} flex items-center justify-center`}>
                    <agent.icon className={`h-5 w-5 ${agent.iconColor}`} />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                </div>
                <h3 className="font-heading font-semibold text-[15px] mb-1 text-foreground">{agent.name}</h3>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{agent.role}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className={`${agent.badgeClass} border-0 text-[11px] font-semibold`}>
                    {metric.value} {metric.label}
                  </Badge>
                  <span className="text-[10px] text-success font-medium uppercase tracking-wider flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-success" />
                    Active
                  </span>
                </div>
              </motion.button>
            );
          })}

          {/* Review Queue */}
          <motion.button
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.35 }}
            onClick={() => navigate("/agent/review")}
            className={`premium-card-hover p-5 text-left group ${reviewEmails > 0 ? "border-destructive/20 hover:border-destructive/40" : ""}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`h-10 w-10 rounded-xl ${reviewEmails > 0 ? "bg-destructive/10" : "bg-secondary"} flex items-center justify-center`}>
                <AlertTriangle className={`h-5 w-5 ${reviewEmails > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
            </div>
            <h3 className="font-heading font-semibold text-[15px] mb-1 text-foreground">Review Queue</h3>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">Items needing human verification</p>
            <Badge variant="secondary" className={`${reviewEmails > 0 ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"} border-0 text-[11px] font-semibold`}>
              {reviewEmails} pending
            </Badge>
          </motion.button>
        </div>
      </div>

      {/* Bottom Panels */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="premium-card p-6">
          <h3 className="font-heading font-semibold text-xs mb-4 text-muted-foreground uppercase tracking-[0.12em]">Quick Actions</h3>
          <div className="space-y-1">
            {[
              { label: "Sync & classify all emails", desc: "Pull new emails and run AI", icon: RefreshCw, action: () => syncAndClassify.mutate(undefined) },
              { label: "View invoices", desc: `${invoiceCount} invoices extracted`, icon: FileText, action: () => navigate("/agent/invoices") },
              { label: "Review uncertain items", desc: `${reviewEmails} items need review`, icon: AlertTriangle, action: () => navigate("/agent/review") },
              { label: "Open action center", desc: `${pendingTasks} tasks pending`, icon: ListTodo, action: () => navigate("/agent/tasks") },
            ].map((a) => (
              <button key={a.label} onClick={a.action} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-secondary/60 transition-all text-left group">
                <div className="h-9 w-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                  <a.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{a.label}</div>
                  <div className="text-[11px] text-muted-foreground">{a.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
              </button>
            ))}
          </div>
        </div>

        <div className="premium-card p-6">
          <h3 className="font-heading font-semibold text-xs mb-4 text-muted-foreground uppercase tracking-[0.12em]">Recent Emails</h3>
          <div className="space-y-3">
            {(emails || []).slice(0, 6).map((email) => (
              <div key={email.id} className="flex items-start gap-3 text-sm">
                <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${email.processed ? "bg-border" : "bg-primary pulse-soft"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate text-[13px] text-foreground">{email.sender || "Unknown"}</span>
                    {email.classification && (
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 border-0 ${
                        email.classification === "invoice" ? "bg-agent-green/10 text-agent-green" :
                        email.classification === "task" ? "bg-agent-orange/10 text-agent-orange" :
                        "bg-secondary text-muted-foreground"
                      }`}>{email.classification}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{email.subject}</p>
                </div>
                <span className="text-[11px] text-muted-foreground/50 shrink-0 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {email.received_at ? new Date(email.received_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                </span>
              </div>
            ))}
            {(!emails || emails.length === 0) && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No emails yet. Click "Sync All Agents" to start.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
