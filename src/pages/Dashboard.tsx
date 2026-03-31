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
    icon: Brain, iconColor: "text-agent-blue", accentBg: "bg-agent-blue/8",
    borderAccent: "hover:border-agent-blue/25", path: "/email-memory", metricKey: "emails",
  },
  {
    id: "organizer", name: "Email Organizer", role: "Classifies and routes all emails",
    icon: FolderOpen, iconColor: "text-agent-purple", accentBg: "bg-agent-purple/8",
    borderAccent: "hover:border-agent-purple/25", path: "/agent/inbox", metricKey: "pending",
  },
  {
    id: "invoice", name: "Invoice Intelligence", role: "Extracts and structures invoice data",
    icon: FileText, iconColor: "text-agent-green", accentBg: "bg-agent-green/8",
    borderAccent: "hover:border-agent-green/25", path: "/agent/invoices", metricKey: "invoices",
  },
  {
    id: "action", name: "Action Center", role: "Manages tasks, deadlines and replies",
    icon: ListTodo, iconColor: "text-agent-orange", accentBg: "bg-agent-orange/8",
    borderAccent: "hover:border-agent-orange/25", path: "/agent/tasks", metricKey: "tasks",
  },
  {
    id: "nontask", name: "Non-Email Tasks", role: "Manual and internal task management",
    icon: ClipboardList, iconColor: "text-agent-gray", accentBg: "bg-secondary",
    borderAccent: "hover:border-agent-gray/25", path: "/tasks", metricKey: "manual",
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
      case "emails": return { value: totalEmails, label: "emails learned" };
      case "pending": return { value: pendingEmails, label: "pending" };
      case "invoices": return { value: invoiceCount, label: "extracted" };
      case "tasks": return { value: totalTasks, label: "tracked" };
      case "manual": return { value: 0, label: "tasks" };
      default: return { value: 0, label: "" };
    }
  };

  const kpiCards = [
    { label: "Unprocessed", value: pendingEmails, icon: Mail, color: pendingEmails > 0 ? "text-warning" : "text-success" },
    { label: "Invoices", value: invoiceCount, icon: Receipt, color: "text-agent-green" },
    { label: "Active Tasks", value: pendingTasks, icon: CheckCircle2, color: "text-agent-orange" },
    { label: "Review Queue", value: reviewEmails, icon: AlertCircle, color: reviewEmails > 0 ? "text-destructive" : "text-success" },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="page-header !mb-0">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="section-label text-primary">Executive Dashboard</span>
          </div>
          <h1 className="page-title text-3xl">AI Operations Center</h1>
          <p className="page-subtitle">5 agents monitoring your business operations</p>
        </div>
        <Button
          onClick={() => syncAndClassify.mutate(undefined)}
          disabled={syncAndClassify.isPending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/10 h-10 px-5 rounded-xl"
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
            transition={{ delay: i * 0.06, duration: 0.4, ease: "easeOut" }}
            className="premium-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-secondary/80 flex items-center justify-center">
                <kpi.icon className={`h-4.5 w-4.5 ${kpi.color}`} />
              </div>
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/20" />
            </div>
            <div className="metric-value">{kpi.value}</div>
            <div className="metric-label">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Agent Cards */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-heading font-semibold text-foreground">AI Agents</h2>
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
                transition={{ delay: 0.15 + i * 0.06, duration: 0.4, ease: "easeOut" }}
                onClick={() => navigate(agent.path)}
                className={`premium-card-hover p-6 text-left group ${agent.borderAccent}`}
              >
                <div className="flex items-start justify-between mb-5">
                  <div className={`h-11 w-11 rounded-xl ${agent.accentBg} flex items-center justify-center`}>
                    <agent.icon className={`h-5 w-5 ${agent.iconColor}`} />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors" />
                </div>
                <h3 className="font-heading font-semibold text-[15px] mb-1.5 text-foreground">{agent.name}</h3>
                <p className="text-xs text-muted-foreground mb-5 leading-relaxed">{agent.role}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {metric.value} <span className="text-xs font-normal text-muted-foreground">{metric.label}</span>
                  </span>
                  <span className="text-[10px] text-success font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-success" />
                    Active
                  </span>
                </div>
              </motion.button>
            );
          })}

          {/* Review Queue */}
          <motion.button
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.4, ease: "easeOut" }}
            onClick={() => navigate("/agent/review")}
            className={`premium-card-hover p-6 text-left group ${reviewEmails > 0 ? "border-destructive/20 hover:border-destructive/30" : ""}`}
          >
            <div className="flex items-start justify-between mb-5">
              <div className={`h-11 w-11 rounded-xl ${reviewEmails > 0 ? "bg-destructive/8" : "bg-secondary/80"} flex items-center justify-center`}>
                <AlertTriangle className={`h-5 w-5 ${reviewEmails > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors" />
            </div>
            <h3 className="font-heading font-semibold text-[15px] mb-1.5 text-foreground">Review Queue</h3>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">Items needing human verification</p>
            <span className={`text-sm font-semibold ${reviewEmails > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {reviewEmails} <span className="text-xs font-normal">pending</span>
            </span>
          </motion.button>
        </div>
      </div>

      {/* Bottom Panels */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="premium-card p-6">
          <h3 className="section-label mb-5">Quick Actions</h3>
          <div className="space-y-1">
            {[
              { label: "Sync & classify all emails", desc: "Pull new emails and run AI", icon: RefreshCw, action: () => syncAndClassify.mutate(undefined) },
              { label: "View invoices", desc: `${invoiceCount} invoices extracted`, icon: FileText, action: () => navigate("/agent/invoices") },
              { label: "Review uncertain items", desc: `${reviewEmails} items need review`, icon: AlertTriangle, action: () => navigate("/agent/review") },
              { label: "Open action center", desc: `${pendingTasks} tasks pending`, icon: ListTodo, action: () => navigate("/agent/tasks") },
            ].map((a) => (
              <button key={a.label} onClick={a.action} className="flex items-center gap-3.5 w-full p-3 rounded-xl hover:bg-secondary/60 transition-all text-left group">
                <div className="h-10 w-10 rounded-xl bg-primary/6 flex items-center justify-center shrink-0">
                  <a.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{a.label}</div>
                  <div className="text-[11px] text-muted-foreground">{a.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
              </button>
            ))}
          </div>
        </div>

        <div className="premium-card p-6">
          <h3 className="section-label mb-5">Recent Emails</h3>
          <div className="space-y-1">
            {(emails || []).slice(0, 6).map((email) => (
              <div key={email.id} className="flex items-start gap-3 py-2.5 px-2 rounded-xl hover:bg-secondary/40 transition-colors">
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
                <span className="text-[11px] text-muted-foreground/40 shrink-0 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {email.received_at ? new Date(email.received_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                </span>
              </div>
            ))}
            {(!emails || emails.length === 0) && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No emails yet. Click "Sync All Agents" to start.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
