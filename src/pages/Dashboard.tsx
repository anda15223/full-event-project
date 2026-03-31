import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain, FolderOpen, FileText, ListTodo, ClipboardList,
  AlertTriangle, RefreshCw, ArrowRight,
  Mail, Receipt, CheckCircle2, AlertCircle,
  Clock, ChevronRight, Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEmails, useEmailTasks, useEmailInvoices, useSyncAndClassify } from "@/hooks/useEmailAgent";
import { motion } from "framer-motion";

const agents = [
  { id: "memory", name: "Email Memory", role: "Learns & remembers all email data", icon: Brain, color: "agent-blue", path: "/email-memory", key: "emails" },
  { id: "organizer", name: "Email Organizer", role: "Classifies and routes emails", icon: FolderOpen, color: "agent-purple", path: "/agent/inbox", key: "pending" },
  { id: "invoice", name: "Invoice Intelligence", role: "Extracts invoice data", icon: FileText, color: "agent-green", path: "/agent/invoices", key: "invoices" },
  { id: "action", name: "Action Center", role: "Manages tasks & deadlines", icon: ListTodo, color: "agent-orange", path: "/agent/tasks", key: "tasks" },
  { id: "nontask", name: "Non-Email Tasks", role: "Manual & internal tasks", icon: ClipboardList, color: "agent-gray", path: "/tasks", key: "manual" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: emails } = useEmails();
  const { data: tasks } = useEmailTasks();
  const { data: invoices } = useEmailInvoices();
  const sync = useSyncAndClassify();

  const totalEmails = emails?.length || 0;
  const unprocessed = emails?.filter(e => !e.processed).length || 0;
  const review = emails?.filter(e => e.needs_review).length || 0;
  const invoiceCount = invoices?.length || 0;
  const activeTasks = tasks?.filter((t: any) => t.status !== "done").length || 0;
  const urgentTasks = tasks?.filter((t: any) => t.priority === "urgent" || t.priority === "high").length || 0;

  const metric = (k: string) => {
    switch (k) {
      case "emails": return `${totalEmails} learned`;
      case "pending": return `${unprocessed} pending`;
      case "invoices": return `${invoiceCount} extracted`;
      case "tasks": return `${activeTasks} active`;
      case "manual": return "0 tasks";
      default: return "";
    }
  };

  const overdueInvoices = invoices?.filter(inv => inv.due_date && new Date(inv.due_date) < new Date()) || [];
  const urgentTaskList = tasks?.filter((t: any) => t.priority === "urgent" || t.priority === "high").slice(0, 4) || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ═══ HERO SECTION ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[hsl(var(--primary))] via-[hsl(var(--agent-purple))] to-[hsl(var(--accent))] p-8 md:p-10 text-white"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.12),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-widest opacity-80">AI Operations Dashboard</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold mb-2">Your business is under control.</h1>
          <p className="text-sm opacity-75 mb-6 max-w-lg">
            {totalEmails} emails · {invoiceCount} invoices · {activeTasks} active tasks · {review} need review
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => sync.mutate(undefined)}
              disabled={sync.isPending}
              className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white border-white/20 rounded-xl h-10 px-5 text-sm font-medium"
              variant="outline"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
              {sync.isPending ? "Syncing..." : "Sync Emails"}
            </Button>
            {review > 0 && (
              <Button
                onClick={() => navigate("/agent/review")}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white border-white/20 rounded-xl h-10 px-5 text-sm font-medium"
                variant="outline"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Review {review} Items
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ═══ METRIC CARDS ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Emails Today", value: unprocessed, total: totalEmails, icon: Mail, color: "agent-blue" },
          { label: "Invoices", value: invoiceCount, sub: `${overdueInvoices.length} overdue`, icon: Receipt, color: "agent-green" },
          { label: "Active Tasks", value: activeTasks, sub: `${urgentTasks} urgent`, icon: CheckCircle2, color: "agent-orange" },
          { label: "Need Review", value: review, icon: AlertCircle, color: review > 0 ? "destructive" : "agent-gray" },
        ].map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="bg-card rounded-2xl border border-border/40 p-5 shadow-sm"
          >
            <div className={`h-9 w-9 rounded-xl bg-${m.color}/10 flex items-center justify-center mb-3`}>
              <m.icon className={`h-4 w-4 text-${m.color}`} />
            </div>
            <div className="text-2xl font-heading font-bold text-foreground">{m.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{m.label}</div>
            {m.sub && <div className="text-[11px] text-muted-foreground/60 mt-1">{m.sub}</div>}
          </motion.div>
        ))}
      </div>

      {/* ═══ AGENT CARDS GRID ═══ */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-heading font-semibold text-foreground">AI Agents</h2>
          <span className="text-xs text-muted-foreground">5 agents active</span>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent, i) => (
            <motion.button
              key={agent.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              onClick={() => navigate(agent.path)}
              className={`bg-card rounded-2xl border border-border/40 p-5 text-left group hover:shadow-lg hover:shadow-${agent.color}/5 hover:border-${agent.color}/30 hover:-translate-y-0.5 transition-all duration-300`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`h-10 w-10 rounded-xl bg-${agent.color}/10 flex items-center justify-center`}>
                  <agent.icon className={`h-4.5 w-4.5 text-${agent.color}`} />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full bg-${agent.color}`} />
                  <span className="text-[10px] text-muted-foreground font-medium">Active</span>
                </div>
              </div>
              <h3 className="font-heading font-semibold text-sm text-foreground mb-1">{agent.name}</h3>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{agent.role}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{metric(agent.key)}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/50 group-hover:translate-x-0.5 transition-all" />
              </div>
            </motion.button>
          ))}

          {/* Review Queue card */}
          <motion.button
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onClick={() => navigate("/agent/review")}
            className={`bg-card rounded-2xl border p-5 text-left group transition-all duration-300 hover:-translate-y-0.5 ${
              review > 0
                ? "border-destructive/20 hover:border-destructive/40 hover:shadow-lg hover:shadow-destructive/5"
                : "border-border/40 hover:border-border/60 hover:shadow-lg"
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`h-10 w-10 rounded-xl ${review > 0 ? "bg-destructive/10" : "bg-secondary"} flex items-center justify-center`}>
                <AlertTriangle className={`h-4.5 w-4.5 ${review > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              </div>
              {review > 0 && <Badge variant="destructive" className="text-[10px] px-2 py-0.5">{review}</Badge>}
            </div>
            <h3 className="font-heading font-semibold text-sm text-foreground mb-1">Review Queue</h3>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">Items needing human verification</p>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{review} pending</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/50 group-hover:translate-x-0.5 transition-all" />
            </div>
          </motion.button>
        </div>
      </div>

      {/* ═══ TWO-COLUMN: RECENT ACTIVITY + ACTION NEEDED ═══ */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* LEFT — Recent Activity */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="bg-card rounded-2xl border border-border/40 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-heading font-semibold text-foreground">Recent Activity</h3>
            <button onClick={() => navigate("/agent/inbox")} className="text-[11px] text-primary font-medium hover:underline flex items-center gap-1">
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-0.5">
            {(emails || []).slice(0, 6).map(email => (
              <div key={email.id} className="flex items-start gap-3 py-2.5 px-2 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer">
                <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${email.processed ? "bg-border" : "bg-primary"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium truncate text-foreground">{email.sender || "Unknown"}</span>
                    {email.classification && (
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 border-0 ${
                        email.classification === "invoice" ? "bg-agent-green/10 text-agent-green" :
                        email.classification === "task" ? "bg-agent-orange/10 text-agent-orange" :
                        "bg-secondary"
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
              <div className="text-center py-10 text-muted-foreground text-sm">
                No emails yet. Click "Sync Emails" to start.
              </div>
            )}
          </div>
        </motion.div>

        {/* RIGHT — Action Needed */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="bg-card rounded-2xl border border-border/40 p-6 shadow-sm">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-5">Action Needed</h3>
          <div className="space-y-4">
            {/* Overdue invoices */}
            {overdueInvoices.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-destructive uppercase tracking-wider mb-2">Overdue Invoices</p>
                <div className="space-y-2">
                  {overdueInvoices.slice(0, 3).map(inv => (
                    <div key={inv.id} className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/10">
                      <Receipt className="h-4 w-4 text-destructive shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium text-foreground truncate block">{inv.supplier_name || "Unknown"}</span>
                        <span className="text-[11px] text-muted-foreground">{inv.amount} {inv.currency} · Due {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Urgent tasks */}
            {urgentTaskList.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-agent-orange uppercase tracking-wider mb-2">Urgent Tasks</p>
                <div className="space-y-2">
                  {urgentTaskList.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-agent-orange/5 border border-agent-orange/10">
                      <ListTodo className="h-4 w-4 text-agent-orange shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium text-foreground truncate block">{t.title}</span>
                        <span className="text-[11px] text-muted-foreground">{t.company || "General"} · {t.priority}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Review items */}
            {review > 0 && (
              <button onClick={() => navigate("/agent/review")} className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10 w-full hover:bg-primary/8 transition-colors">
                <AlertTriangle className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 text-left">
                  <span className="text-[13px] font-medium text-foreground block">{review} emails need review</span>
                  <span className="text-[11px] text-muted-foreground">AI confidence too low for auto-classification</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
              </button>
            )}

            {overdueInvoices.length === 0 && urgentTaskList.length === 0 && review === 0 && (
              <div className="text-center py-10">
                <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">All clear! No urgent items.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
