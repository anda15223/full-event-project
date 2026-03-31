import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, CheckSquare, FileText, RefreshCw, ArrowRight, MessageCircle, Clock, AlertTriangle, Flame } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { emailStats, taskStats, invoiceStats, mockEmails, mockTasks } from "@/data/mockData";
import { motion } from "framer-motion";

const statCards = [
  { label: "Emails", value: emailStats.total, sub: `${emailStats.unread} unread`, icon: Mail, color: "text-primary", path: "/emails" },
  { label: "Tasks", value: taskStats.total, sub: `${taskStats.pending} pending`, icon: CheckSquare, color: "text-accent", path: "/tasks" },
  { label: "Invoices", value: invoiceStats.total, sub: `${invoiceStats.pending} pending`, icon: FileText, color: "text-primary", path: "/invoices" },
  { label: "WhatsApp", value: 4, sub: "2 unread", icon: MessageCircle, color: "text-accent", path: "/whatsapp" },
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Your AI-powered operations dashboard</p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <RefreshCw className="w-4 h-4 mr-2" /> Sync New
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card
              className="stat-card cursor-pointer hover:border-primary/40"
              onClick={() => navigate(stat.path)}
            >
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

      {/* Accounting summary */}
      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-3 mb-4">
            <Mail className="w-5 h-5 text-accent" />
            <h3 className="font-heading font-bold text-lg">Email-to-Task Accounting</h3>
            <Badge variant="outline" className="ml-auto text-xs bg-accent/10 text-accent border-accent/30">
              ✓ Balanced
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{emailStats.total}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Emails</div>
            </div>
            <div className="text-2xl font-bold text-muted-foreground">=</div>
            <div>
              <div className="text-2xl font-bold text-primary">{emailStats.invoices}</div>
              <div className="text-xs text-muted-foreground mt-1">Invoice Tasks</div>
            </div>
            <div className="text-2xl font-bold text-muted-foreground">+</div>
            <div>
              <div className="text-2xl font-bold text-accent">{emailStats.tasks}</div>
              <div className="text-xs text-muted-foreground mt-1">Regular Tasks</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions + recent */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="font-heading text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Extract Invoices", desc: `${invoiceStats.pending} pending extraction`, icon: FileText, path: "/invoices" },
              { label: "Priority Matrix", desc: "View Eisenhower grid", icon: Flame, path: "/priority" },
              { label: "View All Tasks", desc: `${taskStats.pending} tasks pending`, icon: CheckSquare, path: "/tasks" },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
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

        {/* Recent Activity */}
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="font-heading text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockEmails.slice(0, 4).map((email) => (
              <div key={email.id} className="flex items-start gap-3 text-sm">
                <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${email.isRead ? "bg-muted-foreground/30" : "bg-primary"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{email.fromName}</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                      email.classification === "invoice"
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-accent/10 text-accent border-accent/20"
                    }`}>
                      {email.classification === "invoice" ? "Invoice" : "Task"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{email.subject}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  <Clock className="inline h-3 w-3 mr-1" />
                  {new Date(email.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
