import { NavLink } from "@/components/NavLink";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarInset, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Brain, FolderOpen, FileText,
  ListTodo, ClipboardList, AlertTriangle, Settings,
  PanelLeft, Zap, Globe, Wrench, BookOpen, TrendingDown,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import ChatPanel from "@/components/ChatPanel";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Brain, label: "Email Memory", path: "/email-memory", color: "bg-agent-blue" },
  { icon: FolderOpen, label: "Organized Inbox", path: "/agent/inbox", color: "bg-agent-purple" },
  { icon: FileText, label: "Invoice Intelligence", path: "/agent/invoices", color: "bg-agent-green" },
  { icon: ListTodo, label: "Action Center", path: "/agent/tasks", color: "bg-agent-orange" },
  { icon: Wrench, label: "Operations", path: "/agent/operations", color: "bg-agent-purple" },
  { icon: Globe, label: "Romania", path: "/agent/romania", color: "bg-agent-blue" },
  { icon: ClipboardList, label: "Non-Email Tasks", path: "/tasks", color: "bg-agent-gray" },
  { icon: BookOpen, label: "Ledger", path: "/ledger", color: "bg-agent-green" },
  { icon: TrendingDown, label: "Cashflow", path: "/cashflow", color: "bg-agent-orange" },
  { icon: AlertTriangle, label: "Review Queue", path: "/agent/review" },
];

function SidebarNav() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

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
              <span className="font-heading font-bold tracking-tight text-foreground text-[15px]">AI Ops</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 gap-0">
        {!collapsed && <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.14em] mb-2 mt-3 px-3">Agents</p>}
        <SidebarMenu>
          {navItems.map(item => {
            const active = pathname === item.path || (item.path !== "/dashboard" && pathname.startsWith(item.path));
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
                    </div>
                    {!collapsed && <span>{item.label}</span>}
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
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <SidebarNav />
        <SidebarInset>
          <header className="h-12 flex items-center border-b border-border/30 bg-white/80 backdrop-blur-xl px-6 sticky top-0 z-40">
            <SidebarTrigger className="mr-4 md:hidden" />
            <div className="flex items-center gap-2 ml-auto">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-[11px] text-muted-foreground">All systems online</span>
            </div>
          </header>
          <main className="flex-1 p-6 md:p-8 overflow-auto min-h-[calc(100vh-3rem)]">
            {children}
          </main>
        </SidebarInset>
        <ChatPanel />
      </div>
    </SidebarProvider>
  );
}
