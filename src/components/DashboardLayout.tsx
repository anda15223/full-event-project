import { NavLink } from "@/components/NavLink";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarInset, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Tent,
  Settings, PanelLeft, Zap, LogOut, AlertTriangle, Target, Contact, HelpCircle, ScrollText, Calendar, FileSignature, Home,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AttentionSummary } from "@/lib/attention";
import CommandPalette from "@/components/CommandPalette";

const navItems: { icon: typeof LayoutDashboard; label: string; path: string; color?: string }[] = [
  { icon: Home, label: "Today", path: "/" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard-legacy" },
  { icon: Tent, label: "Festivals", path: "/festivals", color: "bg-primary" },
  { icon: Target, label: "Actions", path: "/actions" },
  { icon: AlertTriangle, label: "Attention", path: "/attention" },
  { icon: Contact, label: "Contacts", path: "/contacts" },
  { icon: HelpCircle, label: "Questions", path: "/questions" },
  { icon: ScrollText, label: "Rules", path: "/rules" },
  { icon: Calendar, label: "Timeline", path: "/timeline" },
  { icon: FileSignature, label: "Contracts", path: "/contracts-overview" },
];

function SidebarNav() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  const { data: attentionTotal = 0 } = useQuery({
    queryKey: ["attention-global-total"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_attention_summary").select("total_count");
      if (error) return 0;
      return ((data ?? []) as AttentionSummary[]).reduce((s, r) => s + (r.total_count ?? 0), 0);
    },
    refetchOnWindowFocus: true,
  });

  const { data: questionsBadge = 0 } = useQuery({
    queryKey: ["questions-sidebar-badge"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await (supabase as any).from("festival_open_questions")
        .select("id, deadline, priority, status")
        .eq("status", "open");
      return ((data ?? []) as any[]).filter((q) => {
        if (q.priority === "critical") return true;
        if (q.deadline && q.deadline < today) return true;
        return false;
      }).length;
    },
    refetchOnWindowFocus: true,
  });

  const { data: actionsBadge = 0 } = useQuery({
    queryKey: ["actions-sidebar-badge"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("festival_action_items")
        .select("id, due_date, priority, status, snoozed_until")
        .in("status", ["open", "in_progress"]);
      return ((data ?? []) as any[]).filter((i) => {
        if (i.snoozed_until && i.snoozed_until > today) return false;
        if (i.priority === "critical") return true;
        if (i.due_date && i.due_date < today) return true;
        return false;
      }).length;
    },
    refetchOnWindowFocus: true,
  });

  const { data: rulesBadge = 0 } = useQuery({
    queryKey: ["rules-sidebar-badge"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("cross_festival_rules")
        .select("id, severity, active").eq("active", true).eq("severity", "critical");
      return (data ?? []).length;
    },
    refetchOnWindowFocus: true,
  });

  const { data: timelineBadge = 0 } = useQuery({
    queryKey: ["timeline-sidebar-badge"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const d = new Date(); d.setDate(d.getDate() + 7);
      const next7 = d.toISOString().slice(0, 10);
      const { data } = await (supabase as any).from("festival_timeline_event")
        .select("id, event_date, status").gte("event_date", today).lte("event_date", next7).neq("status", "done");
      return (data ?? []).length;
    },
    refetchOnWindowFocus: true,
  });

  const { data: contractsBadge = 0 } = useQuery({
    queryKey: ["contracts-sidebar-badge"],
    queryFn: async () => {
      const today = new Date();
      const { data } = await supabase.from("festival_contracts")
        .select("id, contract_status, sent_to_counterparty_at");
      return ((data ?? []) as any[]).filter((c) => {
        if (c.contract_status === "stalled") return true;
        if (c.contract_status === "pending_signature" && c.sent_to_counterparty_at) {
          const sent = new Date(c.sent_to_counterparty_at);
          const days = Math.round((today.getTime() - sent.getTime()) / 86400000);
          return days > 14;
        }
        return false;
      }).length;
    },
    refetchOnWindowFocus: true,
  });

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50 bg-white">
      <SidebarHeader className="h-16 justify-center px-3">
        <div className="flex items-center gap-3 w-full">
          <button onClick={toggleSidebar} className="h-8 w-8 flex items-center justify-center hover:bg-secondary rounded-xl transition-colors shrink-0">
            <PanelLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-heading font-bold tracking-tight text-foreground text-[15px]">AI Suite</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 gap-0">
        {!collapsed && <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.14em] mb-2 mt-3 px-3">Agents</p>}
        <SidebarMenu>
          {navItems.map(item => {
            const active = item.path === "/" ? pathname === "/" : (pathname === item.path || pathname.startsWith(item.path + "/"));
            const showAttentionDot = item.path === "/attention" && attentionTotal > 0;
            const showActionsBadge = item.path === "/actions" && actionsBadge > 0;
            const showQuestionsBadge = item.path === "/questions" && questionsBadge > 0;
            const showRulesBadge = item.path === "/rules" && rulesBadge > 0;
            const showTimelineBadge = item.path === "/timeline" && timelineBadge > 0;
            const showContractsBadge = item.path === "/contracts-overview" && contractsBadge > 0;
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <NavLink
                    to={item.path}
                    className="h-9 rounded-xl text-[13px] font-normal transition-all"
                    activeClassName="bg-primary/8 text-primary font-medium"
                  >
                    <div className="relative">
                      <item.icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      {item.color && <div className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${item.color} border-2 border-white`} />}
                      {showAttentionDot && <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive border-2 border-white" />}
                      {showActionsBadge && <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500 border-2 border-white" />}
                      {showQuestionsBadge && <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500 border-2 border-white" />}
                      {showRulesBadge && <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 border-2 border-white" />}
                      {showTimelineBadge && <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500 border-2 border-white" />}
                      {showContractsBadge && <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 border-2 border-white" />}
                    </div>
                    {!collapsed && (
                      <span className="flex-1 flex items-center justify-between">
                        <span>{item.label}</span>
                        {item.path === "/attention" && attentionTotal > 0 && (
                          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
                            {attentionTotal}
                          </span>
                        )}
                        {item.path === "/actions" && actionsBadge > 0 && (
                          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-700 dark:text-orange-300">
                            {actionsBadge}
                          </span>
                        )}
                        {item.path === "/questions" && questionsBadge > 0 && (
                          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
                            {questionsBadge}
                          </span>
                        )}
                        {item.path === "/rules" && rulesBadge > 0 && (
                          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-300">
                            {rulesBadge}
                          </span>
                        )}
                        {item.path === "/timeline" && timelineBadge > 0 && (
                          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300">
                            {timelineBadge}
                          </span>
                        )}
                        {item.path === "/contracts-overview" && contractsBadge > 0 && (
                          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-300">
                            {contractsBadge}
                          </span>
                        )}
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        <div className="mt-auto pt-4 border-t border-border/40">
          {!collapsed && <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.14em] mb-2 px-3">System</p>}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/settings")} tooltip="Settings">
                <NavLink to="/settings" className="h-9 rounded-xl text-[13px] font-normal transition-all" activeClassName="bg-primary/8 text-primary font-medium">
                  <Settings className={`h-4 w-4 ${pathname.startsWith("/settings") ? "text-primary" : "text-muted-foreground"}`} />
                  {!collapsed && <span>Settings</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  return (
    <SidebarProvider>
      <CommandPalette />
      <div className="min-h-screen flex w-full bg-background">
        <SidebarNav />
        <SidebarInset>
          <header className="h-12 flex items-center border-b border-border/30 bg-white/80 backdrop-blur-xl px-6 sticky top-0 z-40">
            <SidebarTrigger className="mr-4 md:hidden" />
            <div className="flex items-center gap-3 ml-auto">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-success" />
                <span className="text-[11px] text-muted-foreground">All systems online</span>
              </div>
              {user && (
                <>
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">{user.email}</span>
                  <Button size="sm" variant="ghost" onClick={signOut} className="h-7 px-2">
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </header>
          <main className="flex-1 p-6 md:p-8 overflow-auto min-h-[calc(100vh-3rem)]">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
