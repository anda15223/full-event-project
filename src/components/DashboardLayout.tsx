import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Brain, FolderOpen, FileText,
  ListTodo, ClipboardList, AlertTriangle, Settings,
  PanelLeft, Sparkles, Home,
} from "lucide-react";
import { useLocation } from "react-router-dom";

const agentNav = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Brain, label: "Email Memory", path: "/email-memory" },
  { icon: FolderOpen, label: "Organized Inbox", path: "/agent/inbox" },
  { icon: FileText, label: "Invoice Intelligence", path: "/agent/invoices" },
  { icon: ListTodo, label: "Action Center", path: "/agent/tasks" },
  { icon: ClipboardList, label: "Non-Email Tasks", path: "/tasks" },
  { icon: AlertTriangle, label: "Review Queue", path: "/agent/review" },
];

const utilityNav = [
  { icon: Settings, label: "Settings", path: "/settings" },
];

function SidebarNav() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="h-16 justify-center">
        <div className="flex items-center gap-3 px-2 w-full">
          <button
            onClick={toggleSidebar}
            className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors shrink-0"
          >
            <PanelLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          {!isCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <span className="font-heading font-semibold tracking-tight truncate text-foreground text-sm">
                AI Operations
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2">
        {/* Agent Navigation */}
        {!isCollapsed && (
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-2 mt-2 px-3">
            Agents
          </p>
        )}
        <SidebarMenu>
          {agentNav.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== "/dashboard" && location.pathname.startsWith(item.path));
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                  <NavLink
                    to={item.path}
                    className="h-9 transition-all font-normal text-[13px] rounded-lg"
                    activeClassName="bg-primary/10 text-primary font-medium"
                  >
                    <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    {!isCollapsed && <span>{item.label}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        {/* Utility */}
        <div className="mt-auto pt-4 border-t border-border/40">
          {!isCollapsed && (
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-2 px-3">
              System
            </p>
          )}
          <SidebarMenu>
            {utilityNav.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                    <NavLink
                      to={item.path}
                      className="h-9 transition-all font-normal text-[13px] rounded-lg"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      {!isCollapsed && <span>{item.label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Back to Home">
                <NavLink to="/" className="h-9 transition-all font-normal text-[13px] rounded-lg" activeClassName="">
                  <Home className="h-4 w-4 text-muted-foreground" />
                  {!isCollapsed && <span>Back to Home</span>}
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
      <div className="min-h-screen flex w-full">
        <SidebarNav />
        <SidebarInset>
          <header className="h-12 flex items-center border-b border-border/30 bg-background/80 backdrop-blur-xl px-4 sticky top-0 z-40">
            <SidebarTrigger className="mr-4 md:hidden" />
            <div className="flex items-center gap-2 ml-auto">
              <div className="h-1.5 w-1.5 rounded-full bg-success pulse-soft" />
              <span className="text-[11px] font-medium text-muted-foreground">All agents online</span>
            </div>
          </header>
          <main className="flex-1 p-5 md:p-8 overflow-auto gradient-mesh min-h-[calc(100vh-3rem)]">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
